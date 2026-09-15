#!/usr/bin/env node
// 图片尺寸守卫：扫描图片，找出最长边超过上限（默认 2000px）的位图并可自动缩放。
//
// 背景：发给多模态模型的 many-image 请求要求每张图任一边 ≤ 2000px，
// 否则整轮请求直接报错（At least one of the image dimensions exceed max
// allowed size for many-image requests: 2000 pixels）。全页截图（fullPage）
// 最容易超标。这个脚本用来提前拦截 / 自动修复。
//
// 用法:
//   node src/image-guard.js [目录或文件...] [--fix] [--max=2000] [--json] [--quiet]
//
// 参数:
//   目录或文件   要扫描的路径，可多个。不传则扫描整个工作区（排除 node_modules/.git/release/dist）。
//   --fix        对超标图片就地缩放到上限以内（保持宽高比，不放大）。默认只检查不改动。
//   --max=N      最长边像素上限，默认 2000。
//   --json       以 JSON 输出结果（适合脚本消费）。
//   --quiet      精简输出（钩子里用）。
//
// 退出码:
//   0  全部合规，或 --fix 已把所有超标图片修好
//   2  检查模式（无 --fix）下发现超标图片
//   1  运行出错（如缺少 sharp、图片损坏无法处理）
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { log, c } from "./util/log.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// 支持自动缩放的位图格式（矢量图 svg 无固定像素、动图 gif 缩放会破坏帧，故不处理）
const EXTS = new Set([".png", ".jpg", ".jpeg", ".webp", ".avif", ".tiff"]);
// 扫描目录时默认跳过这些目录名
const SKIP_DIRS = new Set(["node_modules", ".git", "release", "dist"]);

function parseArgs(argv) {
  const opts = { fix: false, max: 2000, json: false, quiet: false, paths: [] };
  for (const a of argv) {
    if (a === "--fix") opts.fix = true;
    else if (a === "--json") opts.json = true;
    else if (a === "--quiet") opts.quiet = true;
    else if (a === "--") continue;
    else if (a.startsWith("--max=")) {
      const n = Number(a.slice("--max=".length));
      if (Number.isFinite(n) && n > 0) opts.max = Math.floor(n);
    } else if (a.startsWith("--")) {
      // 未知 flag，忽略
    } else {
      opts.paths.push(a);
    }
  }
  return opts;
}

// 递归收集目录下所有支持的图片文件
function collectFromDir(dir, out) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return;
  }
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (SKIP_DIRS.has(e.name)) continue;
      collectFromDir(full, out);
    } else if (e.isFile()) {
      if (EXTS.has(path.extname(e.name).toLowerCase())) out.push(full);
    }
  }
}

// 把传入的路径（目录或文件）解析成待检查的图片文件列表
function resolveTargets(paths) {
  const out = [];
  for (const p of paths) {
    let st;
    try {
      st = fs.statSync(p);
    } catch {
      log.warn(`跳过不存在的路径：${p}`);
      continue;
    }
    if (st.isDirectory()) collectFromDir(p, out);
    else if (st.isFile() && EXTS.has(path.extname(p).toLowerCase())) out.push(p);
  }
  // 去重
  return [...new Set(out.map((f) => path.resolve(f)))];
}

async function loadSharp() {
  try {
    const mod = await import("sharp");
    return mod.default || mod;
  } catch {
    return null;
  }
}

function rel(f) {
  const r = path.relative(ROOT, f);
  return r.startsWith("..") ? f : r;
}

export async function run(argv) {
  const opts = parseArgs(argv);
  const sharp = await loadSharp();
  if (!sharp) {
    log.error("找不到 sharp 依赖，请先 npm install。");
    return { code: 1, opts };
  }

  const targets = opts.paths.length
    ? resolveTargets(opts.paths)
    : resolveTargets([ROOT]);

  const oversized = []; // { file, w, h, newW?, newH?, fixed? }
  let errored = false;

  for (const file of targets) {
    let meta;
    try {
      meta = await sharp(file, { failOn: "none" }).metadata();
    } catch (err) {
      log.warn(`无法读取尺寸，跳过：${rel(file)}（${err.message}）`);
      continue;
    }
    const w = meta.width || 0;
    const h = meta.height || 0;
    if (w <= opts.max && h <= opts.max) continue;

    const item = { file, w, h };
    if (opts.fix) {
      try {
        // fit=inside + withoutEnlargement：最长边缩到 ≤ max，保持宽高比，绝不放大。
        // 先读入内存再写回，避免读写同一文件冲突。
        const buf = await sharp(file, { failOn: "none" })
          .resize({ width: opts.max, height: opts.max, fit: "inside", withoutEnlargement: true })
          .toBuffer();
        fs.writeFileSync(file, buf);
        const after = await sharp(buf).metadata();
        item.newW = after.width;
        item.newH = after.height;
        item.fixed = true;
      } catch (err) {
        item.fixed = false;
        item.error = err.message;
        errored = true;
      }
    }
    oversized.push(item);
  }

  if (opts.json) {
    process.stdout.write(
      JSON.stringify(
        {
          max: opts.max,
          scanned: targets.length,
          oversized: oversized.map((o) => ({
            file: rel(o.file),
            width: o.w,
            height: o.h,
            fixed: o.fixed ?? false,
            newWidth: o.newW,
            newHeight: o.newH,
            error: o.error,
          })),
        },
        null,
        2
      ) + "\n"
    );
  } else {
    report(oversized, targets.length, opts);
  }

  if (errored) return { code: 1, opts, oversized };
  if (opts.fix) return { code: 0, opts, oversized };
  return { code: oversized.length ? 2 : 0, opts, oversized };
}

function report(oversized, scanned, opts) {
  if (opts.quiet) {
    // 钩子里用：只在有动作时输出一行行摘要
    for (const o of oversized) {
      if (o.fixed) log.raw(`  图片缩放 ${o.w}x${o.h} → ${o.newW}x${o.newH}  ${rel(o.file)}`);
      else if (o.error) log.raw(`  ${c.red}缩放失败${c.reset} ${rel(o.file)}：${o.error}`);
      else log.raw(`  ${c.red}超标${c.reset} ${o.w}x${o.h}  ${rel(o.file)}（上限 ${opts.max}）`);
    }
    return;
  }

  log.raw(`\n${c.bold}${c.magenta}◆ 图片尺寸守卫${c.reset}  上限 ${c.bold}${opts.max}px${c.reset}  扫描 ${scanned} 张`);
  if (oversized.length === 0) {
    log.raw(`\n  ${c.green}✓ 没有超标图片，全部 ≤ ${opts.max}px。${c.reset}\n`);
    return;
  }
  log.raw("");
  for (const o of oversized) {
    if (o.fixed) {
      log.raw(`  ${c.green}✓${c.reset} 已缩放 ${c.dim}${o.w}x${o.h}${c.reset} → ${c.bold}${o.newW}x${o.newH}${c.reset}  ${rel(o.file)}`);
    } else if (o.error) {
      log.raw(`  ${c.red}✗${c.reset} 缩放失败 ${rel(o.file)}：${o.error}`);
    } else {
      log.raw(`  ${c.red}✗${c.reset} 超标 ${c.bold}${o.w}x${o.h}${c.reset}  ${rel(o.file)}`);
    }
  }
  const fixedN = oversized.filter((o) => o.fixed).length;
  if (opts.fix) {
    log.raw(`\n  ${c.green}已缩放 ${fixedN}/${oversized.length} 张。${c.reset}\n`);
  } else {
    log.raw(`\n  ${c.yellow}发现 ${oversized.length} 张超标图片。${c.reset} 运行 ${c.bold}npm run fix:images${c.reset} 自动缩放。\n`);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  run(process.argv.slice(2))
    .then(({ code }) => process.exit(code))
    .catch((err) => {
      log.error(err.stack || err.message);
      process.exit(1);
    });
}

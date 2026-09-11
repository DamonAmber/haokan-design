#!/usr/bin/env node
// Haokan CLI —— 竖切编排：
// URL → 站点级采样 → 多视口截图+拼图封面 → 确定性抽 token + 本地 LLM 合成 profile → 打包 .stylepack
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { fileURLToPath } from "node:url";
import { log, c } from "./util/log.js";
import { LLMProvider, resolveConfig, maskToken } from "./llm/provider.js";
import { samplePages, normalizeUrl } from "./crawl/sampler.js";
import { launchBrowser, processPage } from "./crawl/capture.js";
import { denoise } from "./extract/denoise.js";
import { buildTokens } from "./extract/tokens.js";
import { buildCover } from "./cover/collage.js";
import { synthesizeProfile } from "./synthesize/profile.js";
import { buildPack } from "./pack/builder.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");

// 结构化进度事件（仅在被画廊/App 调用时通过环境变量开启，供图形化进度渲染）
const PROGRESS = !!process.env.HAOKAN_PROGRESS;
function emit(evt) {
  if (PROGRESS) process.stdout.write("@@HKP@@" + JSON.stringify(evt) + "\n");
}

function parseArgs(argv) {
  const args = { url: null, maxPages: 5, out: path.join(ROOT, "output") };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--max-pages" || a === "-n") args.maxPages = parseInt(argv[++i], 10) || 5;
    else if (a === "--out" || a === "-o") args.out = path.resolve(argv[++i]);
    else if (a === "--help" || a === "-h") args.help = true;
    else if (!a.startsWith("-") && !args.url) args.url = a;
  }
  return args;
}

function usage() {
  log.raw(`
${c.bold}Haokan${c.reset} —— 把好看的网页提炼成可复用的设计资产 (.stylepack)

用法:
  node src/cli.js <url> [选项]

选项:
  -n, --max-pages <N>   站点级采样的最大页面数 (默认 5)
  -o, --out <dir>       输出目录 (默认 ./output)
  -h, --help            显示帮助

示例:
  node src/cli.js https://linear.app
  node src/cli.js https://stripe.com --max-pages 6
`);
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.help || !args.url) {
    usage();
    process.exit(args.url ? 0 : 1);
  }
  const start = normalizeUrl(args.url);
  if (!start) {
    log.error(`无效 URL：${args.url}`);
    process.exit(1);
  }
  const source = new URL(start).hostname;

  log.raw(`\n${c.bold}${c.magenta}◆ Haokan${c.reset}  提炼设计资产：${c.bold}${source}${c.reset}`);

  // LLM 配置 + 真实模型探测
  const cfg = resolveConfig();
  const llm = new LLMProvider(cfg);
  log.step("检查本地模型配置");
  log.detail(`配置来源: ${cfg.source}`);
  log.detail(`端点: ${cfg.baseURL}  配置模型: ${cfg.defaultModel}  token: ${maskToken(cfg.authToken)}`);
  emit({ step: "config", status: "start", label: "连接本地模型", percent: 2 });
  const probe = await llm.probeModel();
  const modelInfo = { tier: probe.tier, configured: probe.configured, real: probe.real };
  if (probe.ok) {
    log.ok(`模型连通 · 配置 ${probe.configured} → 实际上游 ${c.bold}${probe.real || "未知"}${c.reset}`);
  } else {
    log.warn(`模型不可用：${probe.error}（将跳过设计语言合成，仅产出 token）`);
  }
  emit({ step: "config", status: "done", label: probe.ok ? "本地模型已连通" : "模型不可用（仅抽 token）", percent: 8, model: modelInfo });

  // 工作目录
  const workDir = path.join(ROOT, ".work", `${Date.now()}`);
  fs.mkdirSync(workDir, { recursive: true });
  fs.mkdirSync(args.out, { recursive: true });

  const { browser, context } = await launchBrowser();
  let pack;
  try {
    // 采样
    log.step("站点级采样：发现上下游相关页面");
    emit({ step: "sample", status: "start", label: "站点级采样", detail: source, percent: 12 });
    const urls = await samplePages(context, start, { maxPages: args.maxPages });
    urls.forEach((u, i) => log.detail(`${i === 0 ? "★" : " "} ${u}`));
    emit({ step: "sample", status: "done", label: `发现 ${urls.length} 个代表性页面`, detail: urls.join(" · "), percent: 22, pages: urls.length });

    // 逐页处理
    log.step(`处理 ${urls.length} 个页面（截图 + 计算样式抽取）`);
    emit({ step: "capture", status: "start", label: "截图与样式抽取", detail: `共 ${urls.length} 页`, percent: 25 });
    const pages = [];
    for (let i = 0; i < urls.length; i++) {
      log.detail(`(${i + 1}/${urls.length}) ${urls[i]}`);
      const r = await processPage(context, urls[i], { workDir, index: i });
      if (r.ok) log.ok(`${r.title || urls[i]}`);
      pages.push(r);
      emit({
        step: "capture",
        status: "progress",
        label: `截图与抽取 (${i + 1}/${urls.length})`,
        detail: r.title || urls[i],
        percent: 25 + Math.round(43 * ((i + 1) / urls.length)),
      });
    }
    const okPages = pages.filter((p) => p.ok);
    if (okPages.length === 0) throw new Error("所有页面处理失败，无法继续");

    // 去噪 + token
    log.step("确定性抽取：去噪并构建设计 token");
    const system = denoise(pages);
    const meta = { source, pages: okPages.map((p) => ({ url: p.url, title: p.title })) };
    const tokens = buildTokens(system, { source });
    const palette = system.colors.palette.map((p) => p.hex);
    log.ok(`色板 ${system.colors.palette.length} 色 · 字阶 ${system.typography.scale.length} 级 · 间距基准 ${system.spacing.base}px · 圆角 ${system.radius.style} · 阴影 ${system.shadows.usage}`);
    log.detail(`色板: ${system.colors.palette.map((p) => p.role + "=" + p.hex).join("  ")}`);
    emit({
      step: "extract",
      status: "done",
      label: `抽取 ${system.colors.palette.length} 色 · ${system.typography.scale.length} 级字阶`,
      detail: `${system.colors.mode} · ${system.density} · 圆角 ${system.radius.style}`,
      percent: 74,
      palette,
    });

    // 封面
    log.step("生成拼图封面");
    const coverPath = path.join(workDir, "cover.png");
    const coverShots = okPages.map((p) => p.desktopShot).filter(Boolean).slice(0, 3);
    const bgHex = system.colors.palette.find((p) => p.role === "background")?.hex || "#ffffff";
    const accentHex = system.colors.palette.find((p) => p.role === "primary")?.hex || "#3b82f6";
    await buildCover(coverShots, { outPath: coverPath, bgHex, accentHex, title: source });
    log.ok(`封面已合成（${coverShots.length} 张截图）`);
    emit({ step: "cover", status: "done", label: "拼图封面已合成", percent: 80 });

    // 设计语言合成
    log.step("合成设计语言规范（本地模型）");
    emit({ step: "synthesize", status: "start", label: "本地模型提炼设计语言…", percent: 82, model: modelInfo });
    let profile;
    if (probe.ok) {
      try {
        profile = await synthesizeProfile(llm, system, meta);
        log.ok(`风格定位：${profile.oneLiner || profile.aesthetic || "(已生成)"}`);
        if (profile.tags?.length) log.detail(`标签: ${profile.tags.join(" / ")}`);
      } catch (err) {
        log.warn(`合成失败：${err.message}（使用兜底 profile）`);
      }
    }
    if (!profile) {
      profile = {
        markdown: "## 风格定位\n\n本地模型不可用，未生成设计语言描述。以下 token 仍由确定性抽取得出，可直接使用。\n",
        tags: [],
        oneLiner: "",
        aesthetic: "",
      };
    }
    emit({
      step: "synthesize",
      status: "done",
      label: profile.oneLiner ? "设计语言已提炼" : "已生成 token（无设计语言）",
      detail: profile.oneLiner || "",
      percent: 94,
      model: modelInfo,
      tags: profile.tags || [],
    });

    // 打包
    log.step("打包为 .stylepack");
    pack = buildPack({ system, tokens, profile, meta, coverPath, pages, outputRoot: args.out });
    log.ok(`资产名：${pack.name}`);
    emit({ step: "pack", status: "done", label: "已打包 .stylepack", detail: pack.name, percent: 98 });
  } finally {
    await context.close().catch(() => {});
    await browser.close().catch(() => {});
  }

  if (pack) {
    log.raw(`\n${c.green}${c.bold}✔ 完成${c.reset}`);
    log.raw(`  ${c.bold}风格包${c.reset}   ${pack.packPath}`);
    log.raw(`  ${c.bold}可浏览目录${c.reset} ${pack.dir}`);
    log.raw(`  ${c.bold}预览${c.reset}     打开 → ${c.cyan}${pack.previewPath}${c.reset}`);
    log.raw(`\n  在浏览器打开预览：${c.dim}open "${pack.previewPath}"${c.reset}\n`);
    emit({ step: "done", status: "done", label: "完成", detail: pack.name, percent: 100, name: pack.name });
  }
}

main().catch((err) => {
  log.error(err.stack || err.message);
  emit({ step: "error", status: "error", label: "提炼失败", detail: err.message, percent: 100 });
  process.exit(1);
});

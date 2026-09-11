#!/usr/bin/env node
// 设计 lint CLI：用某个设计资产的 token 校验项目代码是否合规。
//   node src/lint.js <pack名|tokens.json|.stylepack> <项目路径> [--json] [--spacing]
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import AdmZip from "adm-zip";
import { log, c } from "./util/log.js";
import { lintProject } from "./lint/linter.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUTPUT_ROOT = process.env.HAOKAN_OUTPUT || path.join(ROOT, "output");

export function loadTokens(source) {
  if (source.endsWith(".stylepack")) {
    const zip = new AdmZip(source);
    const e = zip.getEntry("tokens.json");
    if (!e) throw new Error(".stylepack 内缺少 tokens.json");
    return JSON.parse(zip.readAsText(e));
  }
  if (source.endsWith(".json")) return JSON.parse(fs.readFileSync(source, "utf8"));
  // 目录或 pack 名
  const asDir = fs.existsSync(source) && fs.statSync(source).isDirectory() ? source : path.join(OUTPUT_ROOT, source);
  const tj = path.join(asDir, "tokens.json");
  if (!fs.existsSync(tj)) throw new Error(`找不到 tokens：${source}（试过 ${tj}）`);
  return JSON.parse(fs.readFileSync(tj, "utf8"));
}

function scoreColor(score) {
  if (score >= 85) return c.green;
  if (score >= 60) return c.yellow;
  return c.red;
}
const sevColor = { error: c.red, warn: c.yellow, info: c.gray };
const sevLabel = { error: "错误", warn: "警告", info: "提示" };

function printReport(rep, source) {
  log.raw(`\n${c.bold}${c.magenta}◆ 设计 lint${c.reset}  资产：${c.bold}${source}${c.reset}  目标：${rep.target}`);
  log.raw(`  扫描文件 ${rep.filesScanned} · 颜色检查点 ${rep.colorChecks}`);
  const sc = scoreColor(rep.score);
  log.raw(`\n  ${c.bold}合规分 ${sc}${rep.score}${c.reset}${c.bold}/100${c.reset}   ` +
    `${c.red}错误 ${rep.counts.error}${c.reset} · ${c.yellow}警告 ${rep.counts.warn}${c.reset} · ${c.gray}提示 ${rep.counts.info}${c.reset}`);

  if (rep.violations.length === 0) {
    log.raw(`\n  ${c.green}✓ 未发现越界，项目与该设计系统高度一致。${c.reset}\n`);
    return;
  }

  // 按文件分组显示（截断）
  const byFile = new Map();
  for (const v of rep.violations) {
    if (!byFile.has(v.file)) byFile.set(v.file, []);
    byFile.get(v.file).push(v);
  }
  log.raw("");
  let shown = 0;
  for (const [file, vs] of byFile) {
    if (shown >= 60) break;
    log.raw(`  ${c.bold}${file}${c.reset}`);
    for (const v of vs) {
      if (shown >= 60) break;
      const col = sevColor[v.severity] || c.reset;
      log.raw(`    ${col}${sevLabel[v.severity]}${c.reset} ${c.dim}L${v.line}${c.reset} [${v.type}] ${v.message}`);
      if (v.suggestion) log.raw(`         ${c.gray}↳ ${v.suggestion}${c.reset}`);
      shown++;
    }
  }
  if (rep.truncated || rep.counts.total > shown) {
    log.raw(`\n  ${c.dim}… 还有更多，仅显示前 ${shown} 条（总计 ${rep.counts.total}）${c.reset}`);
  }
  log.raw("");
}

function main() {
  const argv = process.argv.slice(2);
  const flags = new Set(argv.filter((a) => a.startsWith("--")));
  const pos = argv.filter((a) => !a.startsWith("--"));
  if (pos.length < 2) {
    log.raw(`\n用法: node src/lint.js <pack名|tokens.json|.stylepack> <项目路径> [--json] [--spacing]\n`);
    log.raw(`示例: node src/lint.js tailwindcss-com-20260909-165622 ./my-app\n`);
    process.exit(1);
  }
  const [source, target] = pos;
  if (!fs.existsSync(target)) {
    log.error(`目标路径不存在：${target}`);
    process.exit(1);
  }
  let tokens;
  try {
    tokens = loadTokens(source);
  } catch (err) {
    log.error(err.message);
    process.exit(1);
  }
  const rep = lintProject(tokens, path.resolve(target), { spacing: flags.has("--spacing") });
  if (flags.has("--json")) {
    process.stdout.write(JSON.stringify(rep, null, 2) + "\n");
  } else {
    printReport(rep, source);
  }
  process.exit(rep.counts.error > 0 ? 2 : 0);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || "")) {
  main();
}

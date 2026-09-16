#!/usr/bin/env node
// 一次性内容双语回填：把已有资产的中文 oneLiner/tags 翻译成英文，写入 manifest 的 oneLinerEn/tagsEn。
// 幂等：已具备英文字段的资产默认跳过（--force 可覆盖）。会同步更新 output/<name>/manifest.json
// 与对应的 <name>.stylepack 内的 manifest.json，保证下载/再导入一致。
//
// 用法：
//   node src/backfill-i18n.js            # 回填缺失英文的资产
//   node src/backfill-i18n.js --force    # 重译并覆盖已有英文
//   node src/backfill-i18n.js --dry      # 只打印将处理哪些，不调用模型、不落盘
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import AdmZip from "adm-zip";
import { log } from "./util/log.js";
import { LLMProvider, resolveConfig, maskToken } from "./llm/provider.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../..");
const OUTPUT_ROOT = process.env.HAOKAN_OUTPUT || path.join(ROOT, "output");

const argv = process.argv.slice(2);
const FORCE = argv.includes("--force");
const DRY = argv.includes("--dry");

function listPacks() {
  if (!fs.existsSync(OUTPUT_ROOT)) return [];
  const out = [];
  for (const entry of fs.readdirSync(OUTPUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(OUTPUT_ROOT, entry.name, "manifest.json");
    if (fs.existsSync(manifestPath)) out.push({ name: entry.name, manifestPath });
  }
  return out;
}

function needsBackfill(m) {
  const hasZh = (m.oneLiner && m.oneLiner.trim()) || (Array.isArray(m.tags) && m.tags.length);
  if (!hasZh) return false; // 没有中文内容可译（兜底 profile 生成的资产）
  if (FORCE) return true;
  const hasEn = (m.oneLinerEn && m.oneLinerEn.trim()) || (Array.isArray(m.tagsEn) && m.tagsEn.length);
  return !hasEn;
}

const SYS = `你是设计术语双语专家。把给定的中文设计"一句话风格定位(oneLiner)"和"风格标签(tags)"翻译成自然、地道、面向设计师的英文（简洁专业，不逐字直译，使用常见英文设计术语）。` +
  `只输出一个 JSON 对象，不要任何解释或代码块外文字：{"oneLinerEn": string, "tagsEn": string[]}。tagsEn 数量与含义须与中文 tags 一一对应。`;

function buildUser(m) {
  return (
    `aesthetic 关键词（英文，供语气参考）：${m.aesthetic || "(无)"}\n` +
    `中文 oneLiner：${m.oneLiner || "(无)"}\n` +
    `中文 tags：${(m.tags || []).join("、") || "(无)"}\n` +
    `请只输出 JSON。`
  );
}

function parseJson(text) {
  // 容错：优先解析 ```json 块，其次抓第一个 {...}
  const block = text.match(/```json\s*([\s\S]*?)```/);
  const raw = block ? block[1] : (text.match(/\{[\s\S]*\}/) || [null])[0];
  if (!raw) throw new Error("模型未返回可解析的 JSON");
  const j = JSON.parse(raw.trim());
  return {
    oneLinerEn: String(j.oneLinerEn || "").trim(),
    tagsEn: Array.isArray(j.tagsEn) ? j.tagsEn.map((s) => String(s).trim()).filter(Boolean) : [],
  };
}

function updateStylepack(name, manifest) {
  const packFile = path.join(OUTPUT_ROOT, `${name}.stylepack`);
  if (!fs.existsSync(packFile)) return false;
  try {
    const zip = new AdmZip(packFile);
    const entry = zip.getEntry("manifest.json");
    const buf = Buffer.from(JSON.stringify(manifest, null, 2), "utf8");
    if (entry) zip.updateFile(entry, buf);
    else zip.addFile("manifest.json", buf);
    zip.writeZip(packFile);
    return true;
  } catch (err) {
    log.warn(`  同步 .stylepack 失败（不影响画廊展示）：${err.message}`);
    return false;
  }
}

async function main() {
  const cfg = resolveConfig();
  const llm = new LLMProvider(cfg);
  log.step("内容双语回填（zh → en）");
  log.detail(`库目录: ${OUTPUT_ROOT}`);
  log.detail(`模型: ${cfg.defaultModel}  端点: ${cfg.baseURL}  token: ${maskToken(cfg.authToken)}`);
  if (DRY) log.detail("（--dry 预演：不调用模型、不写入）");

  const packs = listPacks();
  const todo = [];
  for (const p of packs) {
    let m;
    try {
      m = JSON.parse(fs.readFileSync(p.manifestPath, "utf8"));
    } catch {
      log.warn(`跳过（manifest 解析失败）：${p.name}`);
      continue;
    }
    if (needsBackfill(m)) todo.push({ ...p, m });
  }

  log.detail(`共 ${packs.length} 个资产，需回填 ${todo.length} 个${FORCE ? "（--force 覆盖）" : ""}`);
  if (!todo.length) {
    log.ok("没有需要回填的资产。");
    return;
  }
  if (DRY) {
    todo.forEach((t) => log.detail(`  · ${t.name}`));
    return;
  }

  let done = 0,
    fail = 0;
  const CONCURRENCY = Math.max(1, parseInt(process.env.HAOKAN_CONCURRENCY || "4", 10));

  async function work(t) {
    try {
      const text = await llm.complete(buildUser(t.m), {
        system: SYS,
        maxTokens: 1500,   // mimo 等推理模型会先消耗思考 token，上限过小会截断 JSON
        temperature: 0.3,
        timeoutMs: 90000,
      });
      const { oneLinerEn, tagsEn } = parseJson(text);
      if (!oneLinerEn && !tagsEn.length) throw new Error("模型返回为空");
      t.m.oneLinerEn = oneLinerEn;
      t.m.tagsEn = tagsEn;
      fs.writeFileSync(t.manifestPath, JSON.stringify(t.m, null, 2));
      const synced = updateStylepack(t.name, t.m);
      done += 1;
      log.ok(`${t.name}`);
      log.detail(`  EN: ${oneLinerEn}`);
      log.detail(`  tagsEn: ${tagsEn.join(" / ")}${synced ? "  （已同步 .stylepack）" : ""}`);
    } catch (err) {
      fail += 1;
      log.warn(`失败：${t.name} — ${err.message}`);
    }
  }

  // 并发池：同时最多 CONCURRENCY 个（缓解推理模型单次偏慢）
  log.detail(`并发：${CONCURRENCY}`);
  let idx = 0;
  async function runner() {
    while (idx < todo.length) {
      const t = todo[idx++];
      await work(t);
    }
  }
  await Promise.all(Array.from({ length: Math.min(CONCURRENCY, todo.length) }, runner));
  log.ok(`完成：成功 ${done} / 失败 ${fail} / 共 ${todo.length}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main().catch((err) => {
    log.warn(`回填中止：${err.message}`);
    process.exit(1);
  });
}

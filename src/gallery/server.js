#!/usr/bin/env node
// 设计资产库画廊：本地服务。统一浏览 output/ 下所有 .stylepack。
// 仅用 Node 内置模块 + adm-zip（导入用）。导出 startServer() 供 Electron 复用。
import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { spawn, exec } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import AdmZip from "adm-zip";
import { lintProject } from "../lint/linter.js";
import { LLMProvider } from "../llm/provider.js";

const ROOT = path.resolve(fileURLToPath(import.meta.url), "../../..");
const OUTPUT_ROOT = process.env.HAOKAN_OUTPUT || path.join(ROOT, "output");
const CLI = path.join(ROOT, "src", "cli.js");
const UI_HTML = path.join(ROOT, "src", "gallery", "index.html");
const LIBRARY_META = path.join(OUTPUT_ROOT, ".library.json");

// ---- 模型信息（配置/真实模型 + 视觉能力）：真实探测较慢，进程内缓存 5 分钟 ----
let _modelCache = null; // { at, data }
const MODEL_CACHE_TTL = 5 * 60 * 1000;
async function getModelInfo(force = false) {
  if (!force && _modelCache && Date.now() - _modelCache.at < MODEL_CACHE_TTL) {
    return { ...(_modelCache.data), cachedAt: _modelCache.at };
  }
  const data = await new LLMProvider().inspect({ vision: true, timeoutMs: 30000 });
  _modelCache = { at: Date.now(), data };
  return { ...data, cachedAt: _modelCache.at };
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".md": "text/markdown; charset=utf-8",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

// ---- 库元数据（收藏等）持久化 ----
function readMeta() {
  try {
    return JSON.parse(fs.readFileSync(LIBRARY_META, "utf8"));
  } catch {
    return { favorites: {} };
  }
}
function writeMeta(m) {
  fs.mkdirSync(OUTPUT_ROOT, { recursive: true });
  fs.writeFileSync(LIBRARY_META, JSON.stringify(m, null, 2));
}

// ---- 库扫描 ----
function scanLibrary() {
  const packs = [];
  if (!fs.existsSync(OUTPUT_ROOT)) return packs;
  const meta = readMeta();
  for (const entry of fs.readdirSync(OUTPUT_ROOT, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const manifestPath = path.join(OUTPUT_ROOT, entry.name, "manifest.json");
    if (!fs.existsSync(manifestPath)) continue;
    try {
      const m = JSON.parse(fs.readFileSync(manifestPath, "utf8"));
      const hasCover = fs.existsSync(path.join(OUTPUT_ROOT, entry.name, "covers", "cover.png"));
      const packFile = path.join(OUTPUT_ROOT, `${entry.name}.stylepack`);
      packs.push({
        name: entry.name,
        source: m.source,
        oneLiner: m.oneLiner || "",
        aesthetic: m.aesthetic || "",
        tags: m.tags || [],
        theme: m.theme,
        density: m.density,
        primaryColor: m.primaryColor || "#888",
        createdAt: m.createdAt,
        sourceUrls: m.sourceUrls || [],
        summary: m.summary || {},
        cover: hasCover ? `/packs/${encodeURIComponent(entry.name)}/covers/cover.png` : null,
        preview: `/packs/${encodeURIComponent(entry.name)}/preview.html`,
        tokens: `/packs/${encodeURIComponent(entry.name)}/tokens.json`,
        hasPackFile: fs.existsSync(packFile),
        favorite: !!meta.favorites?.[entry.name],
      });
    } catch {
      /* 跳过损坏的 manifest */
    }
  }
  // 收藏优先，其次按创建时间倒序
  packs.sort((a, b) => {
    if (a.favorite !== b.favorite) return a.favorite ? -1 : 1;
    return String(b.createdAt).localeCompare(String(a.createdAt));
  });
  return packs;
}

// ---- 工具 ----
function send(res, status, body, headers = {}) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  res.end(typeof body === "string" ? body : JSON.stringify(body));
}
function readBody(req) {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      try {
        resolve(data ? JSON.parse(data) : {});
      } catch {
        resolve({});
      }
    });
  });
}
function safeJoin(base, target) {
  const p = path.normalize(path.join(base, target));
  if (!p.startsWith(path.normalize(base))) return null; // 防路径穿越
  return p;
}
function expandHome(p) {
  return String(p || "").replace(/^~(?=$|\/)/, os.homedir());
}
function stripAnsi(s) {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

// ---- 静态文件 ----
function serveStatic(res, filePath) {
  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return send(res, 404, { error: "not found" });
  }
  const ext = path.extname(filePath).toLowerCase();
  res.writeHead(200, { "content-type": MIME[ext] || "application/octet-stream" });
  fs.createReadStream(filePath).pipe(res);
}

// ---- 提炼任务：并发队列（最多同时 N 个）+ SSE 实时进度 ----
const MAX_CONCURRENT = parseInt(process.env.HAOKAN_CONCURRENCY || "3", 10);
const jobs = new Map();
const queue = [];
let running = 0;

function hostOf(u) {
  try {
    return new URL(u).hostname;
  } catch {
    return u;
  }
}

function enqueueExtract(url, maxPages) {
  const jobId = String(Date.now()) + Math.random().toString(36).slice(2, 5);
  jobs.set(jobId, {
    jobId,
    url,
    source: hostOf(url),
    maxPages: maxPages || 5,
    status: "queued", // queued | running | done | error
    lines: [],
    clients: new Set(),
    lastEvt: null,
    name: null,
    error: null,
    createdAt: Date.now(),
  });
  queue.push(jobId);
  pump();
  return jobId;
}

function pump() {
  while (running < MAX_CONCURRENT && queue.length) {
    const id = queue.shift();
    const job = jobs.get(id);
    if (!job || job.status !== "queued") continue;
    runJob(job);
  }
}

function runJob(job) {
  running += 1;
  job.status = "running";
  const args = [CLI, job.url, "--max-pages", String(job.maxPages), "--out", OUTPUT_ROOT];
  const proc = spawn(process.execPath, args, {
    cwd: ROOT,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: "1", HAOKAN_PROGRESS: "1" },
  });
  const emit = (msg) => {
    job.lines.push(msg);
    for (const c of job.clients) c.write(`data: ${JSON.stringify(msg)}\n\n`);
  };
  const push = (chunk) => {
    const text = stripAnsi(chunk.toString());
    for (const line of text.split("\n")) {
      if (!line.trim()) continue;
      if (line.startsWith("@@HKP@@")) {
        try {
          const evt = JSON.parse(line.slice(7));
          job.lastEvt = evt;
          if (evt.step === "done" && evt.name) job.name = evt.name;
          if (evt.step === "error") job.error = evt.detail || evt.label || "提炼失败";
          emit({ type: "progress", evt });
        } catch {
          emit({ type: "log", line });
        }
      } else {
        emit({ type: "log", line });
      }
    }
  };
  proc.stdout.on("data", push);
  proc.stderr.on("data", push);
  proc.on("close", (code) => {
    running -= 1;
    job.status = code === 0 ? "done" : "error";
    if (code !== 0 && !job.error) job.error = "提炼失败";
    const evt = `event: done\ndata: ${JSON.stringify({ ok: code === 0, name: job.name })}\n\n`;
    for (const c of job.clients) {
      c.write(evt);
      c.end();
    }
    job.clients.clear();
    pump();
  });
}

function jobSummary(job) {
  const e = job.lastEvt || {};
  return {
    jobId: job.jobId,
    url: job.url,
    source: job.source,
    status: job.status,
    percent: e.percent || (job.status === "done" ? 100 : 0),
    step: e.step || "",
    label: e.label || (job.status === "queued" ? "排队中…" : ""),
    model: e.model || null,
    name: job.name,
    error: job.error,
    createdAt: job.createdAt,
  };
}

// ---- 导入 .stylepack ----
function importPack(srcPath) {
  if (!fs.existsSync(srcPath)) throw new Error(`文件不存在：${srcPath}`);
  const zip = new AdmZip(srcPath);
  const manifestEntry = zip.getEntry("manifest.json");
  if (!manifestEntry) throw new Error("不是有效的 .stylepack（缺少 manifest.json）");
  const manifest = JSON.parse(zip.readAsText(manifestEntry));
  const name = manifest.name || path.basename(srcPath, path.extname(srcPath));
  const destDir = path.join(OUTPUT_ROOT, name);
  fs.mkdirSync(destDir, { recursive: true });
  zip.extractAllTo(destDir, true);
  const destPack = path.join(OUTPUT_ROOT, `${name}.stylepack`);
  if (path.resolve(srcPath) !== path.resolve(destPack)) fs.copyFileSync(srcPath, destPack);
  return { name, source: manifest.source };
}

// ---- 应用到项目：把规则/变量/tokens 写入用户项目 ----
function slugSource(s) {
  return String(s || "pack").replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase().slice(0, 40) || "pack";
}
// 从 ai-rules.md 中截取"Token 速查"精简段（用于注入主文档的简短引用块，避免塞入整份规范）
function extractTokenRef(text) {
  const start = text.indexOf("## Token 速查");
  if (start < 0) return "";
  const rest = text.slice(start);
  const end = rest.indexOf("\n---");
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}

const BLOCK_RE = /<!-- HAOKAN:START[\s\S]*?<!-- HAOKAN:END -->/;

// 幂等地写入"受管标记块"：已存在则替换，不存在则追加；首次修改前备份原文件。
function upsertManagedBlock(full, block) {
  if (!fs.existsSync(full)) {
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, block + "\n");
    return { created: true, backup: null };
  }
  const orig = fs.readFileSync(full, "utf8");
  const hasBlock = BLOCK_RE.test(orig);
  let backup = null;
  if (!hasBlock) {
    backup = full + ".haokan.bak";
    if (!fs.existsSync(backup)) fs.writeFileSync(backup, orig); // 仅保留首次注入前的原始版本
  }
  const next = hasBlock ? orig.replace(BLOCK_RE, block) : orig.replace(/\s*$/, "") + "\n\n" + block + "\n";
  fs.writeFileSync(full, next);
  return { created: false, backup };
}

// 读取来源 + 完整规范文本 + 待注入的标记块（预览与实写共用，保证一致）
function buildInjectBlock(packDir) {
  let source = "pack";
  try {
    source = JSON.parse(fs.readFileSync(path.join(packDir, "manifest.json"), "utf8")).source || source;
  } catch {
    /* ignore */
  }
  const aiRulesText = fs.readFileSync(path.join(packDir, "rules", "ai-rules.md"), "utf8");
  const block =
    `<!-- HAOKAN:START source=${source} -->\n` +
    `## 设计规范（Haokan · ${source}）\n\n` +
    `本项目所有 UI 生成/修改需遵循以下设计 token，以及 \`haokan-design/ai-rules.md\` 中的完整规范；` +
    `不得自行发明颜色/间距/字体/圆角，避免"AI 味"（居中英雄区 + 紫色渐变 + 滥用 emoji + 通用卡片阴影）。\n\n` +
    `${extractTokenRef(aiRulesText)}\n\n` +
    `> 完整设计语言、动效配方与 Do/Don't 见 \`haokan-design/ai-rules.md\`\n` +
    `<!-- HAOKAN:END -->`;
  return { source, aiRulesText, block };
}

const APPLY_ASSETS = ["haokan-design/ai-rules.md", "haokan-design/tokens.json", "haokan-design/css-variables.css", "haokan-design/tailwind.config.js"];

// 预测将发生的写入（只读，不落盘）
function planApply(packDir, proj, target) {
  const { source, block } = buildInjectBlock(packDir);
  const fileOp = (rel) => {
    const full = path.join(proj, rel);
    if (!fs.existsSync(full)) return { path: rel, op: "create" };
    const has = BLOCK_RE.test(fs.readFileSync(full, "utf8"));
    return { path: rel, op: has ? "replace-block" : "append-block" };
  };
  switch (target) {
    case "cursor":
      return { block, actions: [fileOp(".cursorrules")], assets: APPLY_ASSETS };
    case "claude":
      return { block, actions: [fileOp("CLAUDE.md")], assets: APPLY_ASSETS };
    case "agents":
      return { block, actions: [fileOp("AGENTS.md")], assets: APPLY_ASSETS };
    case "kiro": {
      const rel = path.join(".kiro", "steering", `haokan-${slugSource(source)}.md`);
      const exists = fs.existsSync(path.join(proj, rel));
      return { block: null, fullSpec: true, actions: [{ path: rel, op: exists ? "overwrite" : "create" }], assets: [] };
    }
    case "tokens":
      return { block: null, actions: [{ path: "haokan-design/", op: "write-assets" }], assets: APPLY_ASSETS };
    default:
      throw new Error("未知的写入目标");
  }
}

function applyToProject(packDir, proj, target) {
  const { source, aiRulesText, block } = buildInjectBlock(packDir);
  const written = [];
  const notes = [];

  // 完整规范 + tokens 一律落在项目独立目录，主文档只引用它，互不污染
  const ensureAssets = () => {
    const outDir = path.join(proj, "haokan-design");
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, "ai-rules.md"), aiRulesText);
    fs.copyFileSync(path.join(packDir, "tokens.json"), path.join(outDir, "tokens.json"));
    for (const f of ["css-variables.css", "tailwind.config.js"]) {
      fs.copyFileSync(path.join(packDir, "rules", f), path.join(outDir, f));
    }
  };

  const injectInto = (rel) => {
    ensureAssets();
    const r = upsertManagedBlock(path.join(proj, rel), block);
    written.push(rel + (r.created ? "（新建）" : "（更新标记块，不重复堆积）"));
    if (r.backup) notes.push("已备份原文件 → " + path.relative(proj, r.backup));
  };

  switch (target) {
    case "cursor":
      injectInto(".cursorrules");
      break;
    case "claude":
      injectInto("CLAUDE.md");
      break;
    case "agents":
      injectInto("AGENTS.md");
      break;
    case "kiro": {
      // Kiro steering 本就是独立文件承载规则：写成专属文件，重复写入即覆盖，不碰其它文档
      const rel = path.join(".kiro", "steering", `haokan-${slugSource(source)}.md`);
      const full = path.join(proj, rel);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, aiRulesText);
      written.push(rel + "（专属 steering 文件）");
      break;
    }
    case "tokens":
      ensureAssets();
      written.push("haokan-design/{ai-rules.md, tokens.json, css-variables.css, tailwind.config.js}");
      break;
    default:
      throw new Error("未知的写入目标");
  }
  return { written, notes };
}

// ---- 删除 ----
function deletePacks(names) {
  const meta = readMeta();
  const removed = [];
  for (const name of names) {
    const dir = safeJoin(OUTPUT_ROOT, name);
    if (!dir || !fs.existsSync(dir)) continue;
    fs.rmSync(dir, { recursive: true, force: true });
    const pack = safeJoin(OUTPUT_ROOT, `${name}.stylepack`);
    if (pack && fs.existsSync(pack)) fs.rmSync(pack, { force: true });
    if (meta.favorites) delete meta.favorites[name];
    removed.push(name);
  }
  writeMeta(meta);
  return removed;
}

// ---- 路由处理 ----
async function handle(req, res, PORT) {
  const u = new URL(req.url, `http://localhost:${PORT}`);
  const pathname = decodeURIComponent(u.pathname);

  if (pathname === "/" && req.method === "GET") return serveStatic(res, UI_HTML);
  // 图标随 src/gallery 一起打包（build/ 目录不会进 App，勿从那里取，否则打包后 404）
  if (pathname === "/icon.svg" && req.method === "GET") return serveStatic(res, path.join(ROOT, "src", "gallery", "icon.svg"));
  if (pathname === "/icon.png" && req.method === "GET") return serveStatic(res, path.join(ROOT, "src", "gallery", "icon.png"));

  if (pathname === "/api/library" && req.method === "GET") {
    return send(res, 200, { packs: scanLibrary(), outputRoot: OUTPUT_ROOT });
  }

  // 当前模型信息 + 视觉能力（?refresh=1 强制重新探测）
  if (pathname === "/api/model" && req.method === "GET") {
    try {
      const info = await getModelInfo(u.searchParams.get("refresh") === "1");
      return send(res, 200, info);
    } catch (err) {
      return send(res, 200, { ok: false, error: err.message, vision: { supported: null, source: "unknown" } });
    }
  }

  if (pathname === "/api/extract" && req.method === "POST") {
    const body = await readBody(req);
    // 支持单个 url 或多个 urls（后台并发提炼）
    const list = Array.isArray(body.urls) ? body.urls : body.url ? [body.url] : [];
    const valid = list.map((u) => String(u).trim()).filter((u) => /^https?:\/\//.test(u));
    if (!valid.length) return send(res, 400, { error: "无效 URL" });
    const ids = valid.map((u) => enqueueExtract(u, body.maxPages));
    return send(res, 200, { jobIds: ids, jobId: ids[0] });
  }

  if (pathname === "/api/jobs" && req.method === "GET") {
    const list = [...jobs.values()].map(jobSummary).sort((a, b) => b.createdAt - a.createdAt);
    return send(res, 200, { jobs: list, concurrency: MAX_CONCURRENT, running });
  }

  if (pathname === "/api/jobs/dismiss" && req.method === "POST") {
    const body = await readBody(req);
    const job = jobs.get(body.jobId);
    if (job && (job.status === "done" || job.status === "error")) jobs.delete(body.jobId);
    return send(res, 200, { ok: true });
  }

  let m = pathname.match(/^\/api\/extract\/([^/]+)\/stream$/);
  if (m && req.method === "GET") {
    const job = jobs.get(m[1]);
    if (!job) return send(res, 404, { error: "job 不存在" });
    res.writeHead(200, { "content-type": "text/event-stream", "cache-control": "no-cache", connection: "keep-alive" });
    for (const msg of job.lines) res.write(`data: ${JSON.stringify(msg)}\n\n`);
    if (job.done) {
      res.write(`event: done\ndata: ${JSON.stringify({ ok: job.ok })}\n\n`);
      return res.end();
    }
    job.clients.add(res);
    req.on("close", () => job.clients.delete(res));
    return;
  }

  if (pathname === "/api/import" && req.method === "POST") {
    const body = await readBody(req);
    try {
      return send(res, 200, { ok: true, ...importPack(expandHome(body.path)) });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  if (pathname === "/api/delete" && req.method === "POST") {
    const body = await readBody(req);
    const names = Array.isArray(body.names) ? body.names : body.name ? [body.name] : [];
    return send(res, 200, { ok: true, removed: deletePacks(names) });
  }

  if (pathname === "/api/favorite" && req.method === "POST") {
    const body = await readBody(req);
    const meta = readMeta();
    meta.favorites = meta.favorites || {};
    if (body.value) meta.favorites[body.name] = true;
    else delete meta.favorites[body.name];
    writeMeta(meta);
    return send(res, 200, { ok: true });
  }

  if ((pathname === "/api/apply" || pathname === "/api/apply/preview") && req.method === "POST") {
    const body = await readBody(req);
    const dir = safeJoin(OUTPUT_ROOT, body.name || "");
    if (!dir || !fs.existsSync(dir)) return send(res, 404, { error: "资产不存在" });
    const proj = expandHome(body.path);
    if (!proj || !fs.existsSync(proj) || !fs.statSync(proj).isDirectory())
      return send(res, 400, { error: "项目路径不存在或不是目录" });
    try {
      if (pathname === "/api/apply/preview") {
        return send(res, 200, { ok: true, ...planApply(dir, proj, body.target) });
      }
      const r = applyToProject(dir, proj, body.target);
      return send(res, 200, { ok: true, written: r.written, notes: r.notes });
    } catch (err) {
      return send(res, 400, { error: err.message });
    }
  }

  if (pathname === "/api/lint" && req.method === "POST") {
    const body = await readBody(req);
    const tokPath = safeJoin(OUTPUT_ROOT, path.join(body.name || "", "tokens.json"));
    if (!tokPath || !fs.existsSync(tokPath)) return send(res, 404, { error: "找不到该资产的 tokens.json" });
    const projectPath = expandHome(body.path);
    if (!projectPath || !fs.existsSync(projectPath)) return send(res, 400, { error: "项目路径不存在" });
    try {
      const tokens = JSON.parse(fs.readFileSync(tokPath, "utf8"));
      const report = lintProject(tokens, path.resolve(projectPath), { spacing: !!body.spacing });
      return send(res, 200, report);
    } catch (err) {
      return send(res, 500, { error: err.message });
    }
  }

  m = pathname.match(/^\/download\/(.+)$/);
  if (m && req.method === "GET") {
    const file = safeJoin(OUTPUT_ROOT, `${m[1]}.stylepack`);
    if (!file || !fs.existsSync(file)) return send(res, 404, { error: "not found" });
    res.writeHead(200, {
      "content-type": "application/zip",
      "content-disposition": `attachment; filename="${path.basename(file)}"`,
    });
    return fs.createReadStream(file).pipe(res);
  }

  if (pathname === "/api/reveal" && req.method === "POST") {
    const body = await readBody(req);
    const dir = safeJoin(OUTPUT_ROOT, body.name || "");
    if (!dir || !fs.existsSync(dir)) return send(res, 404, { error: "not found" });
    const cmd = process.platform === "darwin" ? "open" : process.platform === "win32" ? "explorer" : "xdg-open";
    exec(`${cmd} "${dir}"`);
    return send(res, 200, { ok: true });
  }

  m = pathname.match(/^\/packs\/([^/]+)\/(.+)$/);
  if (m && req.method === "GET") {
    const dir = safeJoin(OUTPUT_ROOT, m[1]);
    if (!dir) return send(res, 403, { error: "forbidden" });
    const file = safeJoin(dir, m[2]);
    if (!file) return send(res, 403, { error: "forbidden" });
    return serveStatic(res, file);
  }

  send(res, 404, { error: "not found" });
}

// ---- 启动（可被 Electron 复用）----
export function startServer({ port = parseInt(process.env.PORT || "4173", 10), open = false } = {}) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) =>
      handle(req, res, port).catch((err) => {
        try {
          send(res, 500, { error: err.message });
        } catch {
          /* ignore */
        }
      })
    );
    server.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\n◆ haokan-design 设计资产库`);
      console.log(`  库目录: ${OUTPUT_ROOT}`);
      console.log(`  画廊已启动: ${url}\n`);
      if (open && process.platform === "darwin" && !process.env.NO_OPEN) exec(`open ${url}`);
      resolve({ server, url, port });
    });
  });
}

// 直接运行时自启
if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  startServer({ open: true });
}

// 设计 lint：用提炼出的设计 token 反查项目代码是否"守规矩"。
// 检查颜色(感知色差 ΔE)、圆角、字体是否落在 token 集内，并识别"AI 味"信号（如越界紫色渐变）。
// 这是消除 AI 味的闭环——生成后校验产出是否真的遵守了设计系统。
import fs from "node:fs";
import path from "node:path";
import { parseColor, rgbToHex, rgbToLab, deltaE, rgbToHsl } from "../util/color.js";

const CODE_EXT = new Set([
  ".css", ".scss", ".sass", ".less",
  ".html", ".htm", ".vue", ".svelte", ".astro",
  ".js", ".jsx", ".ts", ".tsx", ".mjs", ".cjs",
]);
const SKIP_DIR = new Set([
  "node_modules", ".git", "dist", "build", "out", ".next", ".nuxt",
  "coverage", "output", ".work", "vendor", ".cache", ".turbo",
]);
const GENERIC_FONTS = new Set([
  "sans-serif", "serif", "monospace", "system-ui", "-apple-system",
  "ui-sans-serif", "ui-serif", "ui-monospace", "cursive", "fantasy",
  "inherit", "initial", "unset", "blinkmacsystemfont",
]);
const COLOR_KEYWORDS = new Set(["transparent", "inherit", "currentcolor", "none", "initial", "unset"]);

// 从 DTCG tokens 解析允许集
function parseAllowed(tokens) {
  const colors = [];
  for (const [role, t] of Object.entries(tokens.color || {})) {
    const rgb = parseColor(t.$value);
    if (rgb) colors.push({ role, hex: t.$value, rgb, lab: rgbToLab(rgb) });
  }
  const radii = [];
  for (const [key, t] of Object.entries(tokens.radius || {})) {
    const n = parseFloat(t.$value);
    if (Number.isFinite(n)) radii.push({ key, px: n });
  }
  const fonts = [];
  for (const k of ["primary", "secondary"]) {
    const v = tokens.font?.[k]?.$value;
    if (v) fonts.push(v.toLowerCase().replace(/["']/g, "").trim());
  }
  const spacing = new Set();
  for (const t of Object.values(tokens.spacing || {})) {
    const n = parseFloat(t.$value);
    if (Number.isFinite(n)) spacing.add(n);
  }
  const durToMs = (v) => {
    const s = String(v || "").trim();
    if (s.endsWith("ms")) return parseFloat(s);
    if (s.endsWith("s")) return parseFloat(s) * 1000;
    return parseFloat(s) || 0;
  };
  const durations = new Set();
  for (const t of Object.values(tokens.duration || {})) {
    const ms = durToMs(t.$value);
    if (ms) durations.add(ms);
  }
  const easings = new Set();
  for (const t of Object.values(tokens.easing || {})) easings.add(String(t.$value).replace(/\s+/g, "").toLowerCase());
  return { colors, radii, fonts, spacing, durations, easings };
}

function walk(target, files = []) {
  const stat = fs.statSync(target);
  if (stat.isFile()) {
    if (CODE_EXT.has(path.extname(target).toLowerCase())) files.push(target);
    return files;
  }
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.name.startsWith(".") && entry.name !== ".") {
      if (SKIP_DIR.has(entry.name)) continue;
    }
    if (SKIP_DIR.has(entry.name)) continue;
    const full = path.join(target, entry.name);
    if (entry.isDirectory()) walk(full, files);
    else if (entry.isFile() && CODE_EXT.has(path.extname(entry.name).toLowerCase())) files.push(full);
    if (files.length > 3000) break;
  }
  return files;
}

const HEX_RE = /#([0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{4}|[0-9a-fA-F]{3})(?![0-9a-fA-F])/g;
const FUNC_COLOR_RE = /\b(?:rgba?|hsla?)\([^)]*\)/gi;

function nearestColor(rgb, allowed) {
  const lab = rgbToLab(rgb);
  let best = null;
  for (const a of allowed) {
    const d = deltaE(lab, a.lab);
    if (!best || d < best.d) best = { role: a.role, hex: a.hex, d };
  }
  return best;
}

export function lintProject(tokens, target, opts = {}) {
  const allowed = parseAllowed(tokens);
  const spacingCheck = !!opts.spacing;
  const files = walk(target);
  const root = fs.statSync(target).isFile() ? path.dirname(target) : target;

  const violations = [];
  const counts = { error: 0, warn: 0, info: 0 };
  const byType = {};
  const CAP = 800;
  let truncated = false;
  const add = (v) => {
    counts[v.severity]++;
    byType[v.type] = byType[v.type] || { error: 0, warn: 0, info: 0 };
    byType[v.type][v.severity]++;
    if (violations.length < CAP) violations.push(v);
    else truncated = true;
  };

  let colorChecks = 0;

  for (const file of files) {
    let text;
    try {
      if (fs.statSync(file).size > 1_000_000) continue;
      text = fs.readFileSync(file, "utf8");
    } catch {
      continue;
    }
    const rel = path.relative(root, file) || path.basename(file);
    const lines = text.split("\n");

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      const ln = i + 1;

      // —— 颜色 ——
      if (allowed.colors.length) {
        const found = [];
        let m;
        HEX_RE.lastIndex = 0;
        while ((m = HEX_RE.exec(line))) found.push({ raw: m[0], col: m.index + 1 });
        FUNC_COLOR_RE.lastIndex = 0;
        while ((m = FUNC_COLOR_RE.exec(line))) found.push({ raw: m[0], col: m.index + 1 });
        for (const f of found) {
          const low = f.raw.toLowerCase();
          if (COLOR_KEYWORDS.has(low)) continue;
          const rgb = parseColor(f.raw);
          if (!rgb) continue;
          if (rgb.a != null && rgb.a < 0.1) continue;
          colorChecks++;
          const near = nearestColor(rgb, allowed.colors);
          if (!near) continue;
          const hex = rgbToHex(rgb);
          if (near.d <= 3) continue; // 命中 token
          const severity = near.d > 12 ? "error" : "warn";
          add({
            type: "color",
            severity,
            file: rel,
            line: ln,
            col: f.col,
            value: hex,
            message:
              severity === "error"
                ? `颜色 ${hex} 不在色板中`
                : `颜色 ${hex} 接近但未精确使用 token`,
            suggestion: `改用 --color-${near.role} (${near.hex})，ΔE=${near.d.toFixed(1)}`,
          });
          // AI 味信号：越界紫色渐变
          if (/gradient/i.test(line)) {
            const { h, s } = rgbToHsl(rgb);
            if (h >= 255 && h <= 300 && s > 0.35) {
              add({
                type: "smell",
                severity: "info",
                file: rel,
                line: ln,
                col: f.col,
                value: hex,
                message: `疑似"AI 味"紫色渐变（${hex}），且该色不在设计系统内`,
                suggestion: `优先使用品牌主色，避免通用紫色渐变`,
              });
            }
          }
        }
      }

      // —— 圆角 ——
      if (allowed.radii.length && /border-radius|rounded-\[/.test(line)) {
        const seg = line;
        let m;
        const rre = /(\d+(?:\.\d+)?)px/g;
        while ((m = rre.exec(seg))) {
          const px = parseFloat(m[1]);
          if (px <= 0) continue;
          const hit = allowed.radii.some((r) => Math.abs(r.px - px) <= 1);
          if (!hit) {
            const nearest = allowed.radii.reduce((a, r) => (Math.abs(r.px - px) < Math.abs(a.px - px) ? r : a));
            add({
              type: "radius",
              severity: "warn",
              file: rel,
              line: ln,
              col: (m.index || 0) + 1,
              value: `${px}px`,
              message: `圆角 ${px}px 不在圆角阶内`,
              suggestion: `改用 ${nearest.px}px (--radius-${nearest.key})`,
            });
          }
        }
      }

      // —— 字体 ——
      if (allowed.fonts.length && /font-family/i.test(line)) {
        const mm = line.match(/font-family\s*:\s*([^;>{]+)/i);
        if (mm) {
          const first = mm[1].split(",")[0].replace(/["']/g, "").trim().toLowerCase();
          if (first && !GENERIC_FONTS.has(first) && !allowed.fonts.includes(first)) {
            add({
              type: "font",
              severity: "warn",
              file: rel,
              line: ln,
              col: (mm.index || 0) + 1,
              value: first,
              message: `字体 "${first}" 非设计规范字体`,
              suggestion: `改用 ${allowed.fonts.join(" 或 ")}`,
            });
          }
        }
      }

      // —— 动效：过渡时长 / 缓动曲线 ——
      if ((allowed.durations.size || allowed.easings.size) && /transition|animation/i.test(line)) {
        let m;
        const dre = /([\d.]+)(ms|s)\b/g;
        while ((m = dre.exec(line))) {
          const ms = m[2] === "ms" ? parseFloat(m[1]) : parseFloat(m[1]) * 1000;
          if (ms > 0 && allowed.durations.size && ![...allowed.durations].some((d) => Math.abs(d - ms) <= 20)) {
            add({
              type: "motion",
              severity: "info",
              file: rel,
              line: ln,
              col: (m.index || 0) + 1,
              value: `${ms}ms`,
              message: `过渡/动画时长 ${ms}ms 不在动效时长 token 内`,
              suggestion: `使用 ${[...allowed.durations].join(" / ")}ms`,
            });
          }
        }
        const ere = /cubic-bezier\([^)]*\)|ease-in-out|ease-in|ease-out|linear/gi;
        while ((m = ere.exec(line))) {
          const fn = m[0].replace(/\s+/g, "").toLowerCase();
          if (allowed.easings.size && !allowed.easings.has(fn)) {
            add({
              type: "motion",
              severity: "info",
              file: rel,
              line: ln,
              col: (m.index || 0) + 1,
              value: m[0],
              message: `缓动 ${m[0]} 不在动效缓动 token 内`,
              suggestion: `使用 ${[...allowed.easings].join(" / ")}`,
            });
          }
        }
      }

      // —— 间距（可选，默认关闭以免噪声）——
      if (spacingCheck && allowed.spacing.size && /\b(margin|padding|gap)\b/i.test(line)) {
        let m;
        const sre = /(\d+(?:\.\d+)?)px/g;
        while ((m = sre.exec(line))) {
          const px = parseFloat(m[1]);
          if (px <= 0) continue;
          if (!allowed.spacing.has(px)) {
            add({
              type: "spacing",
              severity: "info",
              file: rel,
              line: ln,
              col: (m.index || 0) + 1,
              value: `${px}px`,
              message: `间距 ${px}px 未落在基准阶`,
              suggestion: `吸附到最近的基准倍数`,
            });
          }
        }
      }
    }
  }

  const total = counts.error + counts.warn + counts.info;
  const score = Math.max(0, Math.round(100 - counts.error * 4 - counts.warn * 1.5 - counts.info * 0.5));

  return {
    target,
    filesScanned: files.length,
    colorChecks,
    counts: { ...counts, total },
    byType,
    score,
    truncated,
    violations,
    allowed: {
      colors: allowed.colors.map((c) => ({ role: c.role, hex: c.hex })),
      radii: allowed.radii.map((r) => r.px),
      fonts: allowed.fonts,
      spacing: [...allowed.spacing],
    },
  };
}

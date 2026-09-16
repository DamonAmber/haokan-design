// 打包：把所有产物组装成 output/{name}/（可直接浏览）并压缩为 output/{name}.stylepack（可分享）。
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { toCssVars, toTailwind, toAIRules } from "./rules.js";
import { buildPreviewHtml } from "./preview.js";

const SCHEMA_VERSION = "1.0";
const GENERATOR_VERSION = "0.1.0";

function slug(s) {
  return String(s)
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40);
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * @param {object} args
 *   system, tokens, profile, meta, coverPath, pages(处理结果数组), outputRoot
 */
export function buildPack({ system, tokens, profile, meta, coverPath, pages, outputRoot, capabilities }) {
  const name = `${slug(meta.source)}-${timestamp()}-${Math.random().toString(36).slice(2, 4)}`;
  const dir = path.join(outputRoot, name);
  const coversDir = path.join(dir, "covers");
  const rulesDir = path.join(dir, "rules");
  fs.mkdirSync(coversDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  // 封面
  if (coverPath && fs.existsSync(coverPath)) {
    fs.copyFileSync(coverPath, path.join(coversDir, "cover.png"));
  }
  // 各页截图（作为参考缩略图）
  const shots = [];
  for (const p of pages.filter((x) => x.ok)) {
    for (const [kind, sp] of [["desktop", p.desktopShot], ["mobile", p.mobileShot]]) {
      if (sp && fs.existsSync(sp)) {
        const fname = path.basename(sp);
        fs.copyFileSync(sp, path.join(coversDir, fname));
        shots.push({ url: p.url, kind, file: `covers/${fname}` });
      }
    }
  }

  // tokens.json
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify(tokens, null, 2));

  // profile.md
  fs.writeFileSync(path.join(dir, "profile.md"), profile.markdown + "\n");

  // 集成规则文件
  fs.writeFileSync(path.join(rulesDir, "css-variables.css"), toCssVars(tokens));
  fs.writeFileSync(path.join(rulesDir, "tailwind.config.js"), toTailwind(tokens));
  fs.writeFileSync(path.join(rulesDir, "ai-rules.md"), toAIRules(tokens, profile.markdown, meta));

  // preview.html（传入 tokens 以渲染"活体样张"section）
  const html = buildPreviewHtml({ system, meta, profile, tokens });
  fs.writeFileSync(path.join(dir, "preview.html"), html);

  // manifest.json
  const primaryColor = system.colors.palette.find((c) => c.role === "primary")?.hex || null;
  const manifest = {
    schemaVersion: SCHEMA_VERSION,
    name,
    source: meta.source,
    sourceUrls: (meta.pages || []).map((p) => p.url),
    createdAt: new Date().toISOString(),
    generator: "haokan-design",
    generatorVersion: GENERATOR_VERSION,
    aesthetic: profile.aesthetic || null,
    tags: profile.tags || [],
    tagsEn: profile.tagsEn || [],
    oneLiner: profile.oneLiner || "",
    oneLinerEn: profile.oneLinerEn || "",
    theme: system.colors.mode,
    density: system.density,
    primaryColor,
    capabilities: capabilities || { vision: false, track: profile.track || "structural" },
    layout: system.layout
      ? {
          heroType: system.layout.hero?.type,
          containerWidth: system.layout.containerWidth,
          gridColumns: system.layout.gridColumns,
          alignment: system.layout.alignment,
          imagery: system.layout.imagery,
          rhythm: system.layout.rhythm,
          summary: system.layout.summary,
        }
      : null,
    summary: {
      pagesAnalyzed: system.pagesAnalyzed,
      paletteSize: system.colors.palette.length,
      typeScaleSteps: system.typography.scale.length,
      spacingBase: system.spacing.base,
      radiusStyle: system.radius.style,
      shadowUsage: system.shadows.usage,
      siteTokenCount: system.siteTokens.count,
    },
    contents: {
      tokens: "tokens.json",
      profile: "profile.md",
      preview: "preview.html",
      cover: "covers/cover.png",
      screenshots: shots,
      rules: {
        cssVariables: "rules/css-variables.css",
        tailwind: "rules/tailwind.config.js",
        aiRules: "rules/ai-rules.md",
      },
    },
    attribution:
      "本资产提炼自公开网页的抽象设计风格（颜色/字体/间距等 token 与规范）用于参考；covers/ 内截图版权归原站点所有，仅作参考缩略图。",
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // 压缩为 .stylepack
  const packPath = path.join(outputRoot, `${name}.stylepack`);
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  zip.writeZip(packPath);

  return { name, dir, packPath, previewPath: path.join(dir, "preview.html") };
}

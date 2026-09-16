// 派生/混合资产：从一个已有资产 + 一份经手工微调（或分层混合）的 tokens，
// 非破坏性地生成一个全新的 .stylepack（不覆盖、不删除原资产）。
// 复用现有的 rules.js / preview.js，并用 systemFromTokens 反建 system 供预览生成。
import fs from "node:fs";
import path from "node:path";
import AdmZip from "adm-zip";
import { toCssVars, toTailwind, toAIRules } from "./rules.js";
import { buildPreviewHtml } from "./preview.js";
import { systemFromTokens } from "../extract/system-from-tokens.js";

const LAYER_LABEL = {
  color: "颜色",
  typography: "排版",
  spacing: "间距",
  shape: "形状（圆角/阴影）",
  motion: "动效",
};

function slug(s) {
  return String(s)
    .replace(/^https?:\/\//, "")
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "")
    .toLowerCase()
    .slice(0, 40) || "pack";
}

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

/**
 * @param {object} args
 *   baseDir      源资产目录（绝对路径）
 *   baseName     源资产名
 *   tokens       改过的 tokens（DTCG）
 *   composition  分层混合来源 { color:<packName|null>, typography:..., ... }
 *   label        备注
 *   outputRoot   输出根目录
 */
export function buildDerivedPack({ baseDir, baseName, tokens, composition = {}, label = "", outputRoot }) {
  const baseManifest = JSON.parse(fs.readFileSync(path.join(baseDir, "manifest.json"), "utf8"));
  const source = baseManifest.source || "pack";

  const name = `${slug(source)}-tuned-${timestamp()}-${Math.random().toString(36).slice(2, 4)}`;
  const dir = path.join(outputRoot, name);
  const coversDir = path.join(dir, "covers");
  const rulesDir = path.join(dir, "rules");
  fs.mkdirSync(coversDir, { recursive: true });
  fs.mkdirSync(rulesDir, { recursive: true });

  // 复制源资产的封面与页面截图（成品视觉参考照旧；样张才是"会变成什么"的直观呈现）
  const baseCovers = path.join(baseDir, "covers");
  if (fs.existsSync(baseCovers)) {
    for (const f of fs.readdirSync(baseCovers)) {
      try {
        fs.copyFileSync(path.join(baseCovers, f), path.join(coversDir, f));
      } catch {
        /* 跳过无法复制的文件 */
      }
    }
  }

  // tokens：标注派生出处（诚实的血统声明）
  const workTokens = JSON.parse(JSON.stringify(tokens));
  workTokens.$extensions = workTokens.$extensions || {};
  workTokens.$extensions["haokan.derived"] = {
    base: baseName,
    baseSource: source,
    composition,
    label,
    editedAt: new Date().toISOString(),
  };

  // system 反建（供 preview 生成 + manifest 摘要）
  const system = systemFromTokens(workTokens);

  // profile：沿用源资产 + 顶部标注派生/混合来源
  let baseProfile = "";
  try {
    baseProfile = fs.readFileSync(path.join(baseDir, "profile.md"), "utf8");
  } catch {
    baseProfile = "";
  }
  const compLines = Object.entries(composition || {})
    .filter(([, v]) => v && v !== "__self__")
    .map(([layer, src]) => `> - ${LAYER_LABEL[layer] || layer}：来自 \`${src}\``);
  const note =
    `> **派生资产**：由「${source}」派生微调${label ? `（${label}）` : ""}，生成于 ${new Date().toISOString().slice(0, 10)}。\n` +
    (compLines.length ? `>\n> 分层混合来源：\n${compLines.join("\n")}\n` : "") +
    `>\n> 以下 token 数值经手工微调（非纯自动抽取）；集成规则文件与预览均已按新数值重生成。\n\n`;
  const profileMd = note + baseProfile;
  const profile = {
    markdown: profileMd,
    oneLiner: baseManifest.oneLiner || "",
    oneLinerEn: baseManifest.oneLinerEn || "",
    aesthetic: baseManifest.aesthetic || "",
    tags: baseManifest.tags || [],
    tagsEn: baseManifest.tagsEn || [],
  };
  const meta = { source, pages: (baseManifest.sourceUrls || []).map((u) => ({ url: u, title: "" })) };

  // 落盘：tokens / profile / 集成规则 / 预览
  fs.writeFileSync(path.join(dir, "tokens.json"), JSON.stringify(workTokens, null, 2));
  fs.writeFileSync(path.join(dir, "profile.md"), profileMd + "\n");
  fs.writeFileSync(path.join(rulesDir, "css-variables.css"), toCssVars(workTokens));
  fs.writeFileSync(path.join(rulesDir, "tailwind.config.js"), toTailwind(workTokens));
  fs.writeFileSync(path.join(rulesDir, "ai-rules.md"), toAIRules(workTokens, profileMd, meta));
  fs.writeFileSync(path.join(dir, "preview.html"), buildPreviewHtml({ system, meta, profile, tokens: workTokens }));

  // manifest
  const primaryColor = workTokens.color?.primary?.$value || baseManifest.primaryColor || null;
  const shots = [];
  if (fs.existsSync(coversDir)) {
    for (const f of fs.readdirSync(coversDir)) {
      if (f !== "cover.png") shots.push({ file: `covers/${f}` });
    }
  }
  const manifest = {
    schemaVersion: baseManifest.schemaVersion || "1.0",
    name,
    source,
    sourceUrls: baseManifest.sourceUrls || [],
    createdAt: new Date().toISOString(),
    generator: "haokan-design",
    generatorVersion: baseManifest.generatorVersion || "0.1.0",
    aesthetic: baseManifest.aesthetic || null,
    tags: baseManifest.tags || [],
    tagsEn: baseManifest.tagsEn || [],
    oneLiner: baseManifest.oneLiner || "",
    oneLinerEn: baseManifest.oneLinerEn || "",
    theme: system.colors.mode,
    density: system.density,
    primaryColor,
    capabilities: baseManifest.capabilities || null,
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
    derivedFrom: { base: baseName, baseSource: source, composition, label },
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
      baseManifest.attribution ||
      "本资产由已有设计资产派生微调而来；封面截图版权归原站点所有，仅作参考缩略图。",
  };
  fs.writeFileSync(path.join(dir, "manifest.json"), JSON.stringify(manifest, null, 2));

  // 压缩为 .stylepack
  const packPath = path.join(outputRoot, `${name}.stylepack`);
  const zip = new AdmZip();
  zip.addLocalFolder(dir);
  zip.writeZip(packPath);

  return { name, dir, packPath };
}

// 设计语言合成：把"确定性抽取"的结构化数据交给本地 LLM，
// 让它做"解释与命名"——写出设计语言、原则、do/don't 和美学标签。
// 严格约束：只解释给定数据，不臆造数值。这是防"AI 味"的关键一环。
import fs from "node:fs";
import { log } from "../util/log.js";
import { layoutToProse } from "../extract/layout.js";

// 把美学标签统一成去重的逗号分隔字符串。
// 模型可能返回 "editorial"、"editorial, swiss" 或 ["editorial","minimal"]，
// 全部拍平成 "editorial, swiss"，保证 manifest.aesthetic 始终是字符串。
function normalizeAesthetic(raw) {
  const parts = (Array.isArray(raw) ? raw : String(raw || "").split(","))
    .map((s) => String(s).trim())
    .filter(Boolean);
  return [...new Set(parts)].join(", ");
}

// 把去噪系统压成可读的测量摘要（喂给模型的事实依据）
function digest(system, meta) {
  const L = [];
  L.push(`# 站点：${meta.source || "(unknown)"}`);
  if (meta.pages?.length) {
    L.push(`# 分析页面（${system.pagesAnalyzed} 页）：`);
    meta.pages.forEach((p) => L.push(`  - ${p.title || "(no title)"} — ${p.url}`));
  }
  L.push("");
  const tm = system.colors.themeMix;
  const mixNote = tm?.mixed ? `（站点深浅混排：深 ${tm.dark} 页 / 浅 ${tm.light} 页，主导为 ${system.colors.mode}）` : "";
  L.push(`## 色彩（主题：${system.colors.mode}${mixNote}，正文/背景对比度：${system.colors.contrast}）`);
  system.colors.palette.forEach((c) => L.push(`  - ${c.role}: ${c.hex} (权重 ${c.weight})`));
  L.push("");
  L.push("## 字体排印");
  L.push(`  - 正文/UI 字体: ${system.typography.primaryFont || "(未知)"}`);
  if (system.typography.displayFont && system.typography.displayFont !== system.typography.primaryFont)
    L.push(`  - 展示/标题字体: ${system.typography.displayFont}（大字号标题/hero 使用，正文仍用上面的正文字体）`);
  if (system.typography.secondaryFont) L.push(`  - 次字体: ${system.typography.secondaryFont}`);
  L.push(`  - 正文字号: ${system.typography.body}px，字阶比例: ${system.typography.ratio || "n/a"}`);
  L.push(`  - 字号阶: ${system.typography.scale.map((s) => `${s.role}=${s.px}px`).join(", ")}`);
  L.push(`  - 字重: ${system.typography.weights.join(", ")}`);
  L.push("");
  L.push("## 间距与密度");
  L.push(`  - 基准单位: ${system.spacing.base}px，密度: ${system.density}`);
  L.push(`  - 间距阶: ${system.spacing.scale.map((s) => `${s.px}`).join(", ")}px`);
  L.push("");
  L.push("## 形状与质感");
  L.push(`  - 圆角风格: ${system.radius.style}，典型圆角: ${system.radius.typical}px，圆角阶: ${system.radius.scale.map((r) => r.px).join(", ")}px`);
  L.push(`  - 阴影使用: ${system.shadows.usage}（${system.shadows.levels.length} 级）`);
  if (system.shadows.levels[0]) L.push(`  - 主阴影: ${system.shadows.levels[0].shadow}`);
  L.push("");
  L.push("## 动效与交互");
  const mo = system.motion;
  if (mo && mo.hasMotion) {
    if (mo.durations.length) L.push(`  - 过渡时长: ${mo.durations.map((d) => d.ms + "ms").join(", ")}`);
    if (mo.easings.length) L.push(`  - 缓动曲线: ${mo.easings.map((e) => e.fn).join(" ; ")}`);
    if (mo.hover.changes.length) {
      const dur = mo.hover.durations.length ? `，典型时长 ${mo.hover.durations.map((d) => d.ms + "ms").join("/")}` : "";
      const ez = mo.hover.easings.length ? `，缓动 ${mo.hover.easings.join(" / ")}` : "";
      L.push(`  - hover 交互改变: ${mo.hover.changes.map((c) => c.label).join("、")}${dur}${ez}`);
    }
    if (mo.keyframeNames.length) L.push(`  - 关键帧动画: ${mo.keyframeNames.join(", ")}`);
    if (mo.animNames.length) L.push(`  - 动画名: ${mo.animNames.map((a) => a.name).join(", ")}`);
    if (mo.libraries.length) L.push(`  - 动效库: ${mo.libraries.join(", ")}`);
    if (mo.character.length) L.push(`  - 动效性格: ${mo.character.join(", ")}`);
  } else {
    L.push("  - 未检测到明显动效，倾向静态/克制。");
  }
  L.push("");
  if (system.layout) {
    L.push("");
    L.push("## 布局与构图（确定性抽取的结构指纹）");
    L.push(layoutToProse(system.layout));
  }
  L.push("");
  const varNames = Object.keys(system.siteTokens.sample);
  if (varNames.length) {
    L.push(`## 站点自带 CSS 变量（共 ${system.siteTokens.count} 个，节选变量名以佐证设计意图）`);
    L.push("  " + varNames.slice(0, 24).join(", "));
  }
  return L.join("\n");
}

const SYSTEM_PROMPT = `你是资深设计系统专家，专长是把优秀网页的视觉语言提炼成可复用规范，用于约束 AI 编码工具的产出、消除"AI 味"（居中英雄区+紫渐变+滥用 emoji+千篇一律的默认组件样感）。

严格规则：
1. 只依据用户给出的"测量数据"进行解释和归纳，绝不臆造任何数值（颜色、字号、间距等一律以给定值为准）。
2. 语言精炼、有主见、面向工程落地，禁止空话套话。
3. 用中文输出 Markdown。
4. 结尾必须附一个 \`\`\`json 代码块，包含字段：oneLiner（一句话中文风格定位）、aesthetic（1-3 个**小写英文**美学流派关键词、逗号分隔，只能从固定词表中选：minimal、editorial、magazine、archive、typographic、brutalist、swiss、glassmorphic、neumorphic、skeuomorphic、flat、material、retro、modern、contemporary、futuristic、industrial、corporate、playful、elegant、luxury、technical、precision-driven、geometric、organic、maximal、monochrome、gradient、bold、clean、grid；只输出简短关键词，禁止整句、括号或大写描述，如"Swiss International Style (Dark Variant)"应写作"swiss"）、tags（3-6 个中文风格标签数组）、oneLinerEn（oneLiner 的自然、地道英文翻译，面向设计师、简洁专业，非逐字直译）、tagsEn（tags 的英文对应，数量与含义一一对应，用常见英文设计术语）。

输出结构（用二级标题）：
## 风格定位
## 设计原则（3-5 条）
## 色彩运用（说明各角色何时用、比例关系）
## 字体排印（层级、字重、可读性；若数据区分了"正文/UI 字体"与"展示/标题字体"，须分别说明各自用途——标题/hero 用展示字体，正文/控件用正文字体，不可混为一谈）
## 间距与布局（密度、留白节奏、栅格倾向）
## 布局与构图（据"布局指纹"落地：版心宽度、Hero 构图（居中/左对齐/左右分栏）、整体对齐倾向、栅格列数、区块留白节奏、配图策略；给出"如何复刻这种构图"的具体要点，以及要避免的通用套路）
## 形状与质感（圆角/阴影/边框的取舍）
## 组件风格提示（按钮/卡片/输入框/导航如何落地）
## 动效与交互（基于给定的过渡时长/缓动/hover 变化/动效库，给出可落地的动效配方——如 hover 用多少 ms + 何种缓动、入场方式；并强调克制，避免无意义动画）
## Do / Don't（重点写防 AI 味的负向约束）`;

// 视觉档附加指令：模型会同时收到真实页面截图
const VISION_ADDENDUM = `

【本次附带了该网站的真实页面截图】请务必结合截图，如实刻画：
- 真实的版式构图与视觉层级（什么最大、什么在上、如何分栏、如何留白）；
- 让它"好看/高级"的关键设计决策与"签名动作"（例如超大标题、非对称排布、全出血图、克制的色彩点缀等）；
- 把这些写进「布局与构图」一节，并在「Do / Don't」里给出复刻要点与要避免的平庸套路。
数值（颜色/字号/间距等）仍以给定的测量数据为准，不要臆造；截图用于理解构图与气质。`;

// 读取截图为 Anthropic image 内容块
function readImageBlock(p) {
  try {
    const b = fs.readFileSync(p);
    if (!b || !b.length) return null;
    return { type: "image", source: { type: "base64", media_type: "image/png", data: b.toString("base64") } };
  } catch {
    return null;
  }
}

export async function synthesizeProfile(llm, system, meta, opts = {}) {
  const data = digest(system, meta);
  const shots = (opts.screenshots || []).filter(Boolean);
  const useVision = !!(opts.vision && shots.length);

  let text;
  if (useVision) {
    // 视觉档：把真实截图连同测量数据一起喂给模型，产出"看图后"的构图/审美规范
    const imgs = shots.slice(0, 2).map(readImageBlock).filter(Boolean);
    const promptText =
      `以下是从目标网站确定性抽取并去噪后的设计测量数据，并附上该网站的真实页面截图，` +
      `请据此产出设计语言规范（务必结合截图刻画真实的布局构图、视觉层级与签名设计动作）：\n\n${data}`;
    if (imgs.length) {
      log.detail(`调用模型（视觉档，含 ${imgs.length} 张截图，model=${llm.cfg.defaultModel}）合成设计语言…`);
      const r = await llm.chat({
        system: SYSTEM_PROMPT + VISION_ADDENDUM,
        messages: [{ role: "user", content: [...imgs, { type: "text", text: promptText }] }],
        maxTokens: 4096,
        temperature: 0.4,
        timeoutMs: 220000,
      });
      text = r.text;
    }
  }
  if (text == null) {
    // 无视觉档（或读图失败）：仅用结构化数据 + 布局指纹
    const prompt = `以下是从目标网站确定性抽取并去噪后的设计测量数据，请据此产出设计语言规范：\n\n${data}`;
    log.detail(`调用模型（结构化档，model=${llm.cfg.defaultModel}）合成设计语言…`);
    text = await llm.complete(prompt, {
      system: SYSTEM_PROMPT,
      maxTokens: 4096,
      temperature: 0.4,
      timeoutMs: 180000,
    });
  }

  if (!text) throw new Error("模型未返回内容");

  // 解析结尾的 json 元数据块
  let tags = [];
  let tagsEn = [];
  let oneLiner = "";
  let oneLinerEn = "";
  let aesthetic = "";
  const blocks = [...text.matchAll(/```json\s*([\s\S]*?)```/g)];
  if (blocks.length) {
    try {
      const meta2 = JSON.parse(blocks[blocks.length - 1][1].trim());
      tags = Array.isArray(meta2.tags) ? meta2.tags : [];
      tagsEn = Array.isArray(meta2.tagsEn) ? meta2.tagsEn.map((s) => String(s).trim()).filter(Boolean) : [];
      oneLiner = meta2.oneLiner || "";
      oneLinerEn = meta2.oneLinerEn || "";
      // aesthetic 归一化：模型可能返回数组或逗号串，统一成去重的逗号分隔字符串，
      // 避免下游画廊把数组当单个标签、点击后筛不出任何资产。
      aesthetic = normalizeAesthetic(meta2.aesthetic);
    } catch {
      log.warn("解析 profile 元数据 JSON 失败，继续（tags 置空）");
    }
  }

  return { markdown: text.trim(), tags, tagsEn, oneLiner, oneLinerEn, aesthetic, track: useVision ? "vision" : "structural" };
}

// 生成"一键应用"到 AI 项目的集成文件：CSS 变量、Tailwind 配置、AI 规则文件。
// 这些文件把设计资产变成可被编码工具消费的硬约束。

function stripPrefix(key, prefix) {
  return key.startsWith(prefix) ? key.slice(prefix.length) : key;
}

// 按字体名推断合适的通用回退族：等宽→monospace、衬线→serif、其余→sans-serif。
// 避免把等宽/无衬线字体硬编码回退成 serif（旧版对 Plex Mono 等标注不准）。
const MONO_RE = /mono|code|consol|courier|menlo|monaco|jetbrains|fira\s*code|source\s*code|roboto\s*mono|ibm\s*plex\s*mono|sf\s*mono|cascadia|hack|inconsolata/i;
const SERIF_RE = /serif|georgia|times|garamond|playfair|merriweather|noto\s*serif|source\s*serif|pt\s*serif|lora|song|宋|明體|明朝|mincho|batang/i;
export function familyKind(name) {
  const s = String(name || "");
  if (MONO_RE.test(s)) return "mono";
  if (SERIF_RE.test(s) && !/sans/i.test(s)) return "serif";
  return "sans";
}
const FALLBACK = {
  mono: ["ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
  serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
  sans: ["system-ui", "-apple-system", "Segoe UI", "sans-serif"],
};
export function fallbackArray(name) {
  return FALLBACK[familyKind(name)];
}
export function fallbackStack(name) {
  return fallbackArray(name).join(", ");
}

// —— CSS 自定义属性 ——
export function toCssVars(tokens) {
  const lines = [":root {"];
  for (const [role, t] of Object.entries(tokens.color || {})) lines.push(`  --color-${role}: ${t.$value};`);
  if (tokens.font?.primary) lines.push(`  --font-primary: ${tokens.font.primary.$value}, ${fallbackStack(tokens.font.primary.$value)};`);
  if (tokens.font?.display) lines.push(`  --font-display: ${tokens.font.display.$value}, ${fallbackStack(tokens.font.display.$value)};`);
  if (tokens.font?.secondary) lines.push(`  --font-secondary: ${tokens.font.secondary.$value}, ${fallbackStack(tokens.font.secondary.$value)};`);
  for (const [role, t] of Object.entries(tokens.fontSize || {})) lines.push(`  --text-${role}: ${t.$value};`);
  for (const [key, t] of Object.entries(tokens.spacing || {})) lines.push(`  --space-${stripPrefix(key, "s-")}: ${t.$value};`);
  for (const [key, t] of Object.entries(tokens.radius || {})) {
    const name = key === "default" ? "radius" : `radius-${stripPrefix(key, "r-")}`;
    lines.push(`  --${name}: ${t.$value};`);
  }
  let i = 1;
  for (const [, t] of Object.entries(tokens.shadow || {})) lines.push(`  --shadow-${i++}: ${t.$value};`);
  for (const [key, t] of Object.entries(tokens.duration || {})) lines.push(`  --duration-${stripPrefix(key, "d-")}: ${t.$value};`);
  let e = 1;
  for (const [, t] of Object.entries(tokens.easing || {})) lines.push(`  --ease-${e++}: ${t.$value};`);
  lines.push("}");
  return lines.join("\n") + "\n";
}

// —— Tailwind 配置片段 ——
export function toTailwind(tokens) {
  const colors = {};
  for (const [role, t] of Object.entries(tokens.color || {})) colors[role] = t.$value;
  const fontFamily = {};
  if (tokens.font?.primary) fontFamily.sans = [tokens.font.primary.$value, ...fallbackArray(tokens.font.primary.$value)];
  if (tokens.font?.display) fontFamily.display = [tokens.font.display.$value, ...fallbackArray(tokens.font.display.$value)];
  if (tokens.font?.secondary) {
    // 次字体按其真实类型归入语义键：等宽→mono、衬线→serif、无衬线→alt（避免与 sans 冲突）
    const kind = familyKind(tokens.font.secondary.$value);
    const key = kind === "sans" ? "alt" : kind;
    fontFamily[key] = [tokens.font.secondary.$value, ...fallbackArray(tokens.font.secondary.$value)];
  }
  const fontSize = {};
  for (const [role, t] of Object.entries(tokens.fontSize || {})) fontSize[role] = t.$value;
  const spacing = {};
  for (const [key, t] of Object.entries(tokens.spacing || {})) spacing[stripPrefix(key, "s-")] = t.$value;
  const borderRadius = {};
  for (const [key, t] of Object.entries(tokens.radius || {})) {
    const name = key === "default" ? "DEFAULT" : stripPrefix(key, "r-");
    borderRadius[name] = t.$value;
  }
  const boxShadow = {};
  let i = 1;
  for (const [, t] of Object.entries(tokens.shadow || {})) boxShadow[`level-${i++}`] = t.$value;
  const transitionDuration = {};
  for (const [key, t] of Object.entries(tokens.duration || {})) transitionDuration[stripPrefix(key, "d-")] = t.$value;
  const transitionTimingFunction = {};
  let e = 1;
  for (const [, t] of Object.entries(tokens.easing || {})) transitionTimingFunction[`e-${e++}`] = t.$value;

  const theme = { extend: { colors, fontFamily, fontSize, spacing, borderRadius, boxShadow, transitionDuration, transitionTimingFunction } };
  return (
    "/** 由 haokan-design 从真实网站抽取生成，可并入 tailwind.config.js 的 theme.extend */\n" +
    "module.exports = " +
    JSON.stringify(theme, null, 2) +
    ";\n"
  );
}

// —— 供人读的 token 速查 ——
function tokenQuickRef(tokens) {
  const L = [];
  L.push("### 颜色");
  for (const [role, t] of Object.entries(tokens.color || {})) L.push(`- \`${role}\`: ${t.$value}`);
  L.push("\n### 字体");
  if (tokens.font?.primary) L.push(`- 正文/UI 字体（\`--font-primary\`）: ${tokens.font.primary.$value}`);
  if (tokens.font?.display) L.push(`- 展示/标题字体（\`--font-display\`，用于 h1/hero 等大字号标题）: ${tokens.font.display.$value}`);
  if (tokens.font?.secondary) L.push(`- 次字体: ${tokens.font.secondary.$value}`);
  L.push("\n### 字号");
  for (const [role, t] of Object.entries(tokens.fontSize || {})) L.push(`- \`${role}\`: ${t.$value}`);
  L.push("\n### 间距 (base)");
  L.push("- " + Object.values(tokens.spacing || {}).map((t) => t.$value).join(", "));
  L.push("\n### 圆角");
  L.push("- " + Object.entries(tokens.radius || {}).map(([k, t]) => `${k}=${t.$value}`).join(", "));
  const durs = Object.values(tokens.duration || {}).map((t) => t.$value);
  const eases = Object.values(tokens.easing || {}).map((t) => t.$value);
  const motion = tokens.$extensions?.["haokan.meta"]?.motion;
  if (durs.length || eases.length || motion) {
    L.push("\n### 动效");
    if (durs.length) L.push("- 时长: " + durs.join(", "));
    if (eases.length) L.push("- 缓动: " + eases.join(" ; "));
    if (motion?.character?.length) L.push("- 性格: " + motion.character.join(", "));
    if (motion?.libraries?.length) L.push("- 动效库: " + motion.libraries.join(", "));
    if (motion?.hoverChanges?.length) L.push("- hover 变化: " + motion.hoverChanges.join(", "));
  }
  return L.join("\n");
}

// —— AI 规则文件（.cursorrules / CLAUDE.md / Kiro steering 通用）——
export function toAIRules(tokens, profileMarkdown, meta) {
  // 去掉 profile 结尾的 json 元数据块
  const profile = profileMarkdown.replace(/```json[\s\S]*?```/g, "").trim();
  return `# 设计规范约束（由 haokan-design 从 ${meta.source} 提炼）

> 本文件是本项目的设计语言约束。生成或修改任何 UI 时，**必须**遵守以下 token 与规范，**不得**自行发明颜色、字号、间距，**不得**产出"AI 味"的默认样感（居中英雄区 + 紫色渐变 + 滥用 emoji + 通用卡片阴影）。

## Token 速查（唯一允许使用的取值）
${tokenQuickRef(tokens)}

---

${profile}

---
*应用方式：将本文件放入 \`.cursorrules\`、\`CLAUDE.md\` 或 \`.kiro/steering/\`；或通过 tokens.json / css-variables.css / tailwind.config.js 直接接入构建。*
`;
}

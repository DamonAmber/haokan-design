// 从 tokens.json（DTCG）反向重建 denoise() 产出的 `system` 结构。
// 用途：派生/混合出的资产只有一份改过的 tokens，需要据此重新生成 preview.html
// 与集成规则文件。buildTokens(system) 的逆过程（尽力还原，数值全部来自 tokens）。
import { parseColor, contrastRatio } from "../util/color.js";

function px(v) {
  const n = parseFloat(v);
  return Number.isNaN(n) ? null : n;
}

export function systemFromTokens(tokens) {
  const t = tokens || {};
  const meta = (t.$extensions && t.$extensions["haokan.meta"]) || {};

  // 颜色
  const palette = Object.entries(t.color || {}).map(([role, v]) => ({ role, hex: v.$value }));
  const bg = t.color?.background?.$value || palette.find((p) => /^(background|bg)$/i.test(p.role))?.hex || null;
  const fg =
    t.color?.foreground?.$value ||
    palette.find((p) => /fore|text/i.test(p.role))?.hex ||
    null;
  let contrast = meta.contrast ?? null;
  const cbg = parseColor(bg);
  const cfg = parseColor(fg);
  if (cbg && cfg) contrast = Math.round(contrastRatio(cbg, cfg) * 100) / 100;

  // 排版
  const scale = Object.entries(t.fontSize || {})
    .map(([role, v]) => ({ role, px: px(v.$value) }))
    .filter((s) => s.px != null);
  const weights = Object.values(t.fontWeight || {}).map((v) => v.$value);

  // 间距
  const spacingScale = Object.values(t.spacing || {})
    .map((v) => ({ px: px(v.$value) }))
    .filter((s) => s.px != null)
    .sort((a, b) => a.px - b.px);
  const base = spacingScale.length ? spacingScale[0].px : 8;

  // 圆角
  const radiusScale = Object.entries(t.radius || {})
    .filter(([k]) => k !== "default")
    .map(([, v]) => ({ px: px(v.$value) }))
    .filter((r) => r.px != null)
    .sort((a, b) => a.px - b.px);
  const typical = t.radius?.default
    ? px(t.radius.default.$value)
    : radiusScale.length
    ? radiusScale[Math.floor(radiusScale.length / 2)].px
    : 8;

  // 阴影
  const shadowLevels = Object.values(t.shadow || {}).map((v) => ({ shadow: v.$value }));

  // 动效
  const durations = Object.values(t.duration || {})
    .map((v) => ({ ms: parseInt(v.$value, 10) }))
    .filter((d) => !Number.isNaN(d.ms));
  const easings = Object.values(t.easing || {}).map((v) => ({ fn: v.$value }));
  const mo = meta.motion || null;
  const character = mo?.character || [];
  const libraries = mo?.libraries || [];
  const hoverChanges = mo?.hoverChanges || [];
  const motion = {
    hasMotion: !!(durations.length || easings.length || character.length),
    durations,
    easings,
    keyframeNames: [],
    libraries,
    character,
    hover: {
      durations,
      easings: easings.map((e) => e.fn),
      changes: hoverChanges.map((p) => ({ label: p, prop: p })),
    },
  };

  return {
    colors: {
      palette,
      mode: meta.mode || "light",
      contrast,
      themeMix: meta.themeMix || null,
    },
    typography: {
      primaryFont: t.font?.primary?.$value || null,
      displayFont: t.font?.display?.$value || null,
      secondaryFont: t.font?.secondary?.$value || null,
      scale,
      weights,
      ratio: meta.typeRatio ?? null,
    },
    spacing: { base, scale: spacingScale },
    radius: { style: meta.radiusStyle || "rounded", typical, scale: radiusScale },
    shadows: { usage: meta.shadowUsage || "flat", levels: shadowLevels },
    motion,
    layout: (t.$extensions && t.$extensions["haokan.layout"]) || null,
    density: meta.density || "balanced",
    pagesAnalyzed: meta.pagesAnalyzed || 0,
    siteTokens: { count: meta.siteTokenCount || 0 },
  };
}

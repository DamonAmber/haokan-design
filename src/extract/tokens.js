// 把去噪后的设计系统转成 W3C Design Tokens (DTCG) 标准 JSON。
// 数值全部来自确定性抽取，可信可复用。

export function buildTokens(system, meta = {}) {
  const color = {};
  for (const c of system.colors.palette) {
    // 角色名做 token key，重复角色跳过
    if (!color[c.role]) {
      color[c.role] = { $type: "color", $value: c.hex };
    }
  }

  const font = {};
  if (system.typography.primaryFont) {
    font.primary = { $type: "fontFamily", $value: system.typography.primaryFont };
  }
  // 展示/标题字体：仅当与正文字体不同才单列（供 h1/hero 等大字号标题使用）
  if (
    system.typography.displayFont &&
    system.typography.displayFont !== system.typography.primaryFont
  ) {
    font.display = { $type: "fontFamily", $value: system.typography.displayFont };
  }
  if (system.typography.secondaryFont) {
    font.secondary = { $type: "fontFamily", $value: system.typography.secondaryFont };
  }

  const fontSize = {};
  for (const s of system.typography.scale) {
    // 同角色保留最高频，避免覆盖
    if (!fontSize[s.role]) fontSize[s.role] = { $type: "dimension", $value: `${s.px}px` };
  }

  const fontWeight = {};
  system.typography.weights.forEach((w, i) => {
    fontWeight[`w${i + 1}`] = { $type: "fontWeight", $value: Number(w) || w };
  });

  const spacing = {};
  system.spacing.scale.forEach((s) => {
    spacing[`s-${s.px}`] = { $type: "dimension", $value: `${s.px}px` };
  });

  const radius = {};
  system.radius.scale.forEach((r) => {
    // 极大圆角视为"全圆/胶囊"
    const key = r.px >= 100 ? "full" : `r-${r.px}`;
    if (!radius[key]) radius[key] = { $type: "dimension", $value: `${r.px}px` };
  });
  if (system.radius.typical) {
    radius.default = { $type: "dimension", $value: `${system.radius.typical}px` };
  }

  const shadow = {};
  system.shadows.levels.forEach((lvl, i) => {
    shadow[`level-${i + 1}`] = { $type: "shadow", $value: lvl.shadow };
  });

  // 动效 token
  const duration = {};
  (system.motion?.durations || []).forEach((d) => {
    duration[`d-${d.ms}`] = { $type: "duration", $value: `${d.ms}ms` };
  });
  const easing = {};
  (system.motion?.easings || []).forEach((e, i) => {
    easing[`e-${i + 1}`] = { $type: "cubicBezier", $value: e.fn };
  });

  return {
    $schema: "https://tr.designtokens.org/format/",
    $description: `Design tokens extracted from ${meta.source || "web"} — ${system.colors.mode} theme, ${system.density} density.`,
    color,
    font,
    fontSize,
    fontWeight,
    spacing,
    radius,
    shadow,
    duration,
    easing,
    $extensions: {
      "haokan.meta": {
        mode: system.colors.mode,
        themeMix: system.colors.themeMix || null,
        density: system.density,
        contrast: system.colors.contrast,
        radiusStyle: system.radius.style,
        shadowUsage: system.shadows.usage,
        typeRatio: system.typography.ratio,
        pagesAnalyzed: system.pagesAnalyzed,
        siteTokenCount: system.siteTokens.count,
        motion: system.motion
          ? {
              character: system.motion.character,
              libraries: system.motion.libraries,
              hoverChanges: system.motion.hover.changes.map((c) => c.prop),
            }
          : null,
      },
      // 布局原型：构图/结构信号（容器宽/Hero 构图/栅格/对齐/留白/配图），驱动样张与布局规范
      "haokan.layout": system.layout || null,
    },
  };
}

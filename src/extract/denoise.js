// 去噪：把多页采集到的"杂乱真实值"收敛成"有意为之的设计系统"。
// 颜色按感知色差(ΔE)聚类、间距吸附到基准栅格、字号推断字阶。
// 关键原则：数值全部来自真实测量，这里只做统计收敛，不臆造。
import {
  parseColor,
  rgbToHex,
  rgbToLab,
  deltaE,
  rgbToHsl,
  isNeutral,
  contrastRatio,
  luminance,
} from "../util/color.js";

// 合并多页的频次表
function mergeMaps(pages, key) {
  const merged = {};
  for (const p of pages) {
    const m = p.styles?.[key];
    if (!m) continue;
    for (const [k, v] of Object.entries(m)) merged[k] = (merged[k] || 0) + v;
  }
  return merged;
}

// 颜色聚类：输入 { colorStr: weight }，输出按权重降序的簇
function clusterColors(weightedColors, threshold = 6) {
  const obs = [];
  for (const [str, weight] of Object.entries(weightedColors)) {
    const rgb = parseColor(str);
    if (!rgb) continue;
    if (rgb.a != null && rgb.a < 0.1) continue; // 近透明忽略
    obs.push({ rgb, lab: rgbToLab(rgb), hex: rgbToHex(rgb), weight });
  }
  obs.sort((a, b) => b.weight - a.weight);

  const clusters = [];
  for (const o of obs) {
    let placed = false;
    for (const cl of clusters) {
      if (deltaE(o.lab, cl.lab) < threshold) {
        cl.weight += o.weight;
        cl.members += 1;
        placed = true;
        break;
      }
    }
    if (!placed) clusters.push({ ...o, members: 1 });
  }
  clusters.sort((a, b) => b.weight - a.weight);
  return clusters;
}

function round(n, d = 2) {
  const f = 10 ** d;
  return Math.round(n * f) / f;
}

// —— 颜色系统 ——
function buildColors(pages) {
  const bgClusters = clusterColors(mergeMaps(pages, "bgColors"), 6);
  const textClusters = clusterColors(mergeMaps(pages, "textColors"), 6);
  const borderClusters = clusterColors(mergeMaps(pages, "borderColors"), 8);

  const background = bgClusters[0] || null;
  // 表面色只取中性色：饱和色是强调色而非表面（避免蓝色按钮底被当成 surface）
  const surfaces = bgClusters.slice(1).filter((c) => isNeutral(c.rgb)).slice(0, 3);
  const foreground = textClusters[0] || null;
  // 次级文字色同样只取中性色（链接蓝等归入强调色）
  const mutedText = textClusters.slice(1).filter((c) => isNeutral(c.rgb)).slice(0, 2);
  const border = borderClusters[0] || null;

  // 强调色：品牌色应"鲜艳且中等明度"，而非高频的浅色 UI 底纹（如边框/分隔线的淡蓝灰）。
  // 因此排除过亮/过暗与低饱和色，并按 权重×饱和度 排序，让真正的品牌色胜出。
  const all = [...bgClusters, ...textClusters, ...borderClusters];
  const accentMap = new Map();
  for (const c of all) {
    if (isNeutral(c.rgb)) continue;
    const { s, l } = rgbToHsl(c.rgb);
    if (s < 0.28) continue; // 太灰（含浅色 UI 底纹）
    if (l > 0.8 || l < 0.18) continue; // 过亮的淡色/过暗的深色都不是品牌强调色
    const prev = accentMap.get(c.hex);
    accentMap.set(c.hex, {
      hex: c.hex,
      rgb: c.rgb,
      weight: (prev?.weight || 0) + c.weight,
      sat: s,
    });
  }
  const accents = [...accentMap.values()]
    .map((a) => ({ ...a, score: a.weight * a.sat }))
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);

  // 组装带角色的色板（按优先级填充，同一 hex 只保留最高优先级角色）
  const palette = [];
  const usedHex = new Set();
  const pushColor = (role, hex, weight) => {
    if (!hex) return;
    if (usedHex.has(hex)) return;
    usedHex.add(hex);
    palette.push({ role, hex, weight: round(weight) });
  };
  if (background) pushColor("background", background.hex, background.weight);
  surfaces.forEach((s, i) => pushColor(`surface-${i + 1}`, s.hex, s.weight));
  if (foreground) pushColor("foreground", foreground.hex, foreground.weight);
  mutedText.forEach((m, i) => pushColor(`muted-${i + 1}`, m.hex, m.weight));
  if (accents[0]) pushColor("primary", accents[0].hex, accents[0].weight);
  if (accents[1]) pushColor("secondary", accents[1].hex, accents[1].weight);
  accents.slice(2).forEach((a, i) => pushColor(`accent-${i + 1}`, a.hex, a.weight));
  if (border) pushColor("border", border.hex, border.weight);

  // 明暗判断 & 对比度（基于全站聚合的主导背景色）
  let mode = "light";
  if (background && luminance(background.rgb) < 0.35) mode = "dark";
  let contrast = null;
  if (background && foreground) contrast = round(contrastRatio(background.rgb, foreground.rgb), 2);

  // 深浅混排检测：逐页取各自主导背景判明暗，识别"首页浅色 hero + 内页深色"这类站点。
  // 仅作信息披露，不改变上面基于全站聚合得出的主导 mode。
  const perPage = pages
    .map((p) => {
      const c0 = clusterColors(p.styles?.bgColors || {}, 6)[0];
      return c0 ? (luminance(c0.rgb) < 0.35 ? "dark" : "light") : null;
    })
    .filter(Boolean);
  const darkN = perPage.filter((m) => m === "dark").length;
  const lightN = perPage.filter((m) => m === "light").length;
  const themeMix = { mixed: darkN > 0 && lightN > 0, dark: darkN, light: lightN, dominant: mode };

  return {
    palette,
    mode,
    contrast,
    themeMix,
    accentCount: accents.length,
    _raw: { bgClusters: bgClusters.length, textClusters: textClusters.length },
  };
}

// —— 间距系统：吸附到基准栅格 ——
function buildSpacing(pages) {
  const map = mergeMaps(pages, "spacings");
  const values = Object.entries(map)
    .map(([k, v]) => ({ px: parseInt(k, 10), count: v }))
    .filter((x) => x.px > 0);
  if (values.length === 0) return { base: 8, scale: [], unit: "px" };

  // 推断基准单位：4 与 8 谁能解释更多的观测值
  const explains = (base) =>
    values.reduce((acc, x) => (x.px % base === 0 ? acc + x.count : acc), 0);
  const total = values.reduce((a, x) => a + x.count, 0);
  const r8 = explains(8) / total;
  const r4 = explains(4) / total;
  const base = r8 >= 0.45 ? 8 : r4 >= 0.5 ? 4 : 8;

  // 吸附到基准倍数并聚合权重
  const snapped = {};
  for (const x of values) {
    const step = Math.max(base, Math.round(x.px / base) * base);
    snapped[step] = (snapped[step] || 0) + x.count;
  }
  const scale = Object.entries(snapped)
    .map(([px, count]) => ({ px: parseInt(px, 10), count }))
    .sort((a, b) => a.px - b.px)
    .filter((x) => x.count >= total * 0.01) // 丢弃极罕见值
    .slice(0, 10);

  return { base, unit: "px", scale };
}

// —— 字体排印：推断字阶 ——
function buildTypography(pages) {
  const sizeMap = mergeMaps(pages, "fontSizes");
  const sizes = Object.entries(sizeMap)
    .map(([k, v]) => ({ px: parseInt(k, 10), count: v }))
    .filter((x) => x.px >= 8 && x.px <= 160)
    .sort((a, b) => b.count - a.count);

  // 正文字号：出现最多且落在常见正文区间(13-18)的
  const bodyCandidate =
    sizes.find((s) => s.px >= 13 && s.px <= 18) || sizes[0] || { px: 16, count: 0 };

  const uniqueSorted = [...sizes].sort((a, b) => a.px - b.px);
  // 合并相邻±1px 的近似字号
  const merged = [];
  for (const s of uniqueSorted) {
    const last = merged[merged.length - 1];
    if (last && Math.abs(last.px - s.px) <= 1) {
      if (s.count > last.count) last.px = s.px;
      last.count += s.count;
    } else {
      merged.push({ ...s });
    }
  }

  // 取权重较高的若干级构成字阶：保留高频字号 + 频次前 10 的字号 + 最大字号(标题/hero)
  const total = merged.reduce((a, s) => a + s.count, 0) || 1;
  const byCount = [...merged].sort((a, b) => b.count - a.count);
  const keep = new Set(byCount.slice(0, 10).map((s) => s.px));
  if (merged.length) keep.add(merged[merged.length - 1].px); // 最大字号
  const scaleSizes = merged
    .filter((s) => s.count >= total * 0.004 || keep.has(s.px))
    .sort((a, b) => a.px - b.px)
    .slice(0, 10);

  // 推断比例（相邻级中位数比值）
  const ratios = [];
  for (let i = 1; i < scaleSizes.length; i++) {
    if (scaleSizes[i - 1].px > 0) ratios.push(scaleSizes[i].px / scaleSizes[i - 1].px);
  }
  ratios.sort((a, b) => a - b);
  const ratio = ratios.length ? round(ratios[Math.floor(ratios.length / 2)], 3) : null;

  // 角色命名：以正文为界，向上 h3/h2/h1/display，向下 sm/xs
  const body = bodyCandidate.px;
  const scale = scaleSizes.map((s) => {
    let role;
    if (s.px === body) role = "body";
    else if (s.px < body) role = s.px <= body - 3 ? "xs" : "sm";
    else {
      const stepsUp = scaleSizes.filter((x) => x.px > body && x.px <= s.px).length;
      role = ["md", "lg", "xl", "2xl", "3xl", "display"][Math.min(stepsUp, 5)] || "display";
    }
    return { px: s.px, count: s.count, role };
  });

  // 字体族：区分「正文/UI 字体」与「展示/标题字体」。
  // 旧逻辑用总频次取主字体，会被导航/代码里大量小号（常为等宽）字体带偏，
  // 导致把等宽误判为主字体、真正的大标题字体丢失。这里按字号分桶分别判定。
  const famMap = mergeMaps(pages, "fontFamilies");
  const famBody = mergeMaps(pages, "fontFamiliesBody");
  const famDisplay = mergeMaps(pages, "fontFamiliesDisplay");
  const famWeighted = mergeMaps(pages, "fontFamiliesWeighted");
  const rankTop = (m) => {
    const e = Object.entries(m).sort((a, b) => b[1] - a[1]);
    return e.length ? e[0][0] : null;
  };
  const families = Object.entries(famMap)
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // 字重
  const weightMap = mergeMaps(pages, "fontWeights");
  const weights = Object.entries(weightMap)
    .map(([w, count]) => ({ weight: w, count }))
    .sort((a, b) => b.count - a.count)
    .map((x) => x.weight)
    .slice(0, 6);

  // 正文/UI 字体：正文级字号里最高频，回退到总频次最高
  const primaryFont = rankTop(famBody) || families[0]?.name || null;
  // 展示/标题字体：标题级字号里最高频，回退到按字号加权最高，再回退到正文字体
  const displayFont = rankTop(famDisplay) || rankTop(famWeighted) || primaryFont;
  // 次字体：与正文、展示都不同的高频字体（常为等宽/代码或备用）
  const secondaryFont =
    families.find((f) => f.name !== primaryFont && f.name !== displayFont)?.name ||
    families.find((f) => f.name !== primaryFont)?.name ||
    null;

  return {
    body,
    ratio,
    scale,
    families,
    primaryFont,
    displayFont,
    secondaryFont,
    weights,
  };
}

// —— 圆角 ——
function buildRadius(pages) {
  const map = mergeMaps(pages, "radii");
  // 超大圆角（胶囊/全圆，站点常写成极大 px）统一归一到 9999，避免出现 3355万这种噪声值
  const clamp = {};
  for (const [k, v] of Object.entries(map)) {
    let px = parseInt(k, 10);
    if (!(px > 0)) continue;
    if (px >= 1000) px = 9999;
    clamp[px] = (clamp[px] || 0) + v;
  }
  const values = Object.entries(clamp)
    .map(([k, v]) => ({ px: parseInt(k, 10), count: v }))
    .sort((a, b) => a.px - b.px);
  const total = values.reduce((a, x) => a + x.count, 0) || 1;
  const scale = values.filter((x) => x.count >= total * 0.02).slice(0, 8);
  const maxR = values.length ? values[values.length - 1].px : 0;

  let style = "sharp";
  if (maxR >= 100) style = "pill"; // 存在胶囊/全圆
  else if (maxR >= 6) style = "rounded";
  const typical = scale.length
    ? scale.reduce((m, x) => (x.count > m.count ? x : m), scale[0]).px
    : 0;
  return { style, typical, scale };
}

// —— 阴影 / 高度 ——
function buildShadows(pages) {
  const map = mergeMaps(pages, "shadows");
  const list = Object.entries(map)
    .map(([shadow, count]) => ({ shadow, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 6);
  const usage = list.length === 0 ? "flat" : list.length <= 2 ? "subtle" : "layered";
  return { usage, levels: list };
}

// —— 动效与交互 ——
function durToMs(v) {
  if (!v) return 0;
  const s = String(v).trim();
  if (s.endsWith("ms")) return parseFloat(s);
  if (s.endsWith("s")) return parseFloat(s) * 1000;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}
const IGNORE_EASE = new Set(["", "0s", "initial", "inherit", "normal"]);

function topDurations(map, near = 10, n = 6) {
  const vals = Object.entries(map)
    .map(([k, v]) => ({ ms: Math.round(parseFloat(k)), count: v }))
    .filter((x) => x.ms > 0)
    .sort((a, b) => b.count - a.count);
  const kept = [];
  for (const v of vals) {
    if (kept.some((k) => Math.abs(k.ms - v.ms) <= near)) continue;
    kept.push(v);
    if (kept.length >= n) break;
  }
  return kept.sort((a, b) => a.ms - b.ms);
}

function buildMotion(pages) {
  const durations = topDurations(mergeMaps(pages, "transDur"));
  const animDurations = topDurations(mergeMaps(pages, "animDur"));
  const easings = Object.entries(mergeMaps(pages, "ease"))
    .map(([fn, count]) => ({ fn, count }))
    .filter((e) => !IGNORE_EASE.has(e.fn))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const animNames = Object.entries(mergeMaps(pages, "animName"))
    .map(([name, count]) => ({ name, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);

  // @keyframes 合并
  const keyframes = {};
  for (const p of pages) {
    const kf = p.styles?.keyframes || {};
    for (const [n, props] of Object.entries(kf)) if (!keyframes[n]) keyframes[n] = props;
  }

  // hover 态聚合
  const HOVER_PROPS = ["backgroundColor", "color", "borderColor", "boxShadow", "transform", "opacity"];
  const changeMap = {};
  const hoverDurMap = {};
  const hoverEaseMap = {};
  let samples = 0;
  for (const p of pages) {
    for (const h of p.hover || []) {
      samples++;
      for (const prop of HOVER_PROPS) if (h.before[prop] !== h.after[prop]) changeMap[prop] = (changeMap[prop] || 0) + 1;
      for (const d of String(h.before.transitionDuration || "").split(",")) {
        const ms = durToMs(d);
        if (ms > 0 && ms <= 2000) hoverDurMap[ms] = (hoverDurMap[ms] || 0) + 1;
      }
      const ef = String(h.before.transitionTimingFunction || "").split(",")[0].trim();
      if (ef && !IGNORE_EASE.has(ef)) hoverEaseMap[ef] = (hoverEaseMap[ef] || 0) + 1;
    }
  }
  const PROP_CN = { backgroundColor: "背景色", color: "文字色", borderColor: "边框色", boxShadow: "阴影", transform: "位移/变换", opacity: "透明度" };
  const hoverChanges = Object.entries(changeMap)
    .sort((a, b) => b[1] - a[1])
    .map(([prop, count]) => ({ prop, label: PROP_CN[prop] || prop, count }));
  const hoverDurations = topDurations(hoverDurMap, 10, 3);
  const hoverEasings = Object.entries(hoverEaseMap).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([fn]) => fn);

  // 动效库
  const libSet = new Set();
  for (const p of pages) for (const l of p.meta?.motionLibs || []) libSet.add(l);
  const libraries = [...libSet];

  // 性格标签
  const character = [];
  if (libraries.some((l) => /Lenis|Locomotive/.test(l))) character.push("平滑滚动");
  if (libraries.includes("Framer Motion")) character.push("组件级/弹簧动效");
  if (libraries.some((l) => /GSAP/.test(l))) character.push("时间线动效");
  if (libraries.some((l) => /AOS|ScrollTrigger/.test(l))) character.push("滚动触发入场");
  if (Object.keys(keyframes).length) character.push("关键帧动画");
  if (hoverChanges.length) character.push("hover 微交互");
  if (durations.length) character.push("过渡驱动");

  const hasMotion =
    durations.length > 0 || animNames.length > 0 || Object.keys(keyframes).length > 0 || hoverChanges.length > 0 || libraries.length > 0;

  return {
    hasMotion,
    durations,
    easings,
    animDurations,
    animNames,
    keyframeNames: Object.keys(keyframes).slice(0, 12),
    keyframes,
    hover: { samples, changes: hoverChanges, durations: hoverDurations, easings: hoverEasings },
    libraries,
    character,
  };
}

// —— CSS 变量（站点自带 token）——
function collectCssVars(pages) {
  const merged = {};
  for (const p of pages) {
    const vars = p.styles?.cssVars || {};
    for (const [k, v] of Object.entries(vars)) if (!merged[k]) merged[k] = v;
  }
  return merged;
}

// 主入口
export function denoise(pages) {
  const okPages = pages.filter((p) => p.ok && p.styles);
  if (okPages.length === 0) throw new Error("没有可用于分析的页面数据");

  const colors = buildColors(okPages);
  const spacing = buildSpacing(okPages);
  const typography = buildTypography(okPages);
  const radius = buildRadius(okPages);
  const shadows = buildShadows(okPages);
  const motion = buildMotion(okPages);
  const cssVars = collectCssVars(okPages);

  // 密度：大间距(≥32)占比越高越"通透"
  const spTotal = spacing.scale.reduce((a, s) => a + s.count, 0) || 1;
  const airy = spacing.scale.filter((s) => s.px >= 32).reduce((a, s) => a + s.count, 0) / spTotal;
  const density = airy > 0.25 ? "airy" : airy > 0.12 ? "balanced" : "compact";

  return {
    pagesAnalyzed: okPages.length,
    colors,
    spacing,
    typography,
    radius,
    shadows,
    motion,
    density,
    siteTokens: {
      count: Object.keys(cssVars).length,
      sample: Object.fromEntries(Object.entries(cssVars).slice(0, 40)),
    },
  };
}

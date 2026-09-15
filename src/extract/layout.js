// 把逐页采集的布局指纹（capture.js 的 collectLayout）归纳为一个"布局原型"。
// 布局原型描述"这个站是怎么摆的"——容器宽度、Hero 构图、栅格、对齐、留白、配图倾向——
// 是 token 之外决定"看起来像不像它"的关键，且完全确定性、不依赖模型视觉能力。

const HERO_CN = { centered: "居中", left: "左对齐", split: "左右分栏" };
const IMG_CN = { "image-forward": "重图片", some: "适度配图", minimal: "极简少图" };
const ALIGN_CN = { centered: "整体居中", mixed: "混合对齐", "left-aligned": "左对齐为主" };
const RHYTHM_CN = { tight: "紧凑", roomy: "舒适", generous: "大留白" };

export function classifyLayout(pages) {
  const oks = (pages || []).filter((p) => p && p.ok && p.layout);
  if (!oks.length) return null;
  const entry = oks[0].layout; // 入口页最能代表 Hero 与整体构图

  // 容器宽度：跨页中位数，吸附到 20 的倍数，限幅
  const nums = oks.map((p) => p.layout.containerWidth).filter((n) => n > 0).sort((a, b) => a - b);
  const median = nums.length ? nums[Math.floor(nums.length / 2)] : 1080;
  const containerWidth = Math.max(640, Math.min(1440, Math.round(median / 20) * 20));

  const mode = (key) => {
    const c = {};
    for (const p of oks) {
      const v = p.layout[key];
      if (v != null && v !== "") c[v] = (c[v] || 0) + 1;
    }
    let best = null, bn = 0;
    for (const [k, n] of Object.entries(c)) if (n > bn) { bn = n; best = k; }
    return best;
  };

  const gridColumns = (() => {
    const c = {};
    for (const p of oks) {
      const g = p.layout.gridColumns;
      if (g >= 2) c[g] = (c[g] || 0) + 1;
    }
    let best = 0, bn = 0;
    for (const [k, n] of Object.entries(c)) if (n > bn) { bn = n; best = +k; }
    return best;
  })();

  const heroAlign = entry.heroHeadlineAlign || "left";
  let heroType = entry.heroType || "left";
  // 纠偏：标题明确左/右对齐却被判为 centered（多为几何中心误判）→ 按左对齐构图处理：
  // 含主视觉图时用 split（左文右图），否则用 left（单列左对齐）。保持布局原型自洽。
  if (heroType === "centered" && /left|right/.test(heroAlign)) {
    heroType = entry.heroHasImage ? "split" : "left";
  }
  const hero = {
    type: heroType,
    hasImage: !!entry.heroHasImage,
    align: heroAlign,
  };
  const imagery = mode("imagery") || entry.imagery || "minimal";
  const alignment = mode("alignment") || entry.alignment || "left-aligned";
  const rhythm = mode("rhythm") || entry.rhythm || "roomy";
  const sectionSequence = entry.sectionSequence || [];

  const summary =
    `容器约 ${containerWidth}px · Hero ${HERO_CN[hero.type] || hero.type}${hero.hasImage ? "含图" : ""} · ` +
    `${ALIGN_CN[alignment] || alignment} · ${gridColumns ? gridColumns + " 列栅格 · " : ""}` +
    `${IMG_CN[imagery] || imagery} · ${RHYTHM_CN[rhythm] || rhythm}留白`;

  return { containerWidth, hero, gridColumns, imagery, alignment, rhythm, sectionSequence, summary };
}

// 供 profile 合成与 ai-rules 用的中文小结（无视觉档也据此写结构化布局规范）
export function layoutToProse(layout) {
  if (!layout) return "";
  const L = [];
  L.push(`- 内容容器宽度约 **${layout.containerWidth}px**（据此定版心，不要铺满全宽）。`);
  L.push(`- Hero 构图：**${HERO_CN[layout.hero.type] || layout.hero.type}**${layout.hero.hasImage ? "，含主视觉图/媒体" : "，以文字为主"}；标题对齐 ${layout.hero.align}。`);
  L.push(`- 整体对齐倾向：**${ALIGN_CN[layout.alignment] || layout.alignment}**。`);
  if (layout.gridColumns) L.push(`- 卡片/内容栅格常用 **${layout.gridColumns} 列**。`);
  L.push(`- 配图倾向：**${IMG_CN[layout.imagery] || layout.imagery}**。`);
  L.push(`- 区块留白节奏：**${RHYTHM_CN[layout.rhythm] || layout.rhythm}**。`);
  if (layout.sectionSequence?.length) L.push(`- 页面区块序列（参考）：${layout.sectionSequence.join(" → ")}。`);
  return L.join("\n");
}

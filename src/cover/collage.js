// 拼图封面：把多个代表性截图合成一张"设计方案封面"，
// 传达的是"一套系统"而非"一个页面"，便于在画廊里可视化挑选。
import fs from "node:fs";
import sharp from "sharp";

const W = 1280;
const H = 800;
const PAD = 48;
const GAP = 24;
const CORNER = 14;

function esc(s = "") {
  return String(s).replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" }[c]));
}

// 生成圆角遮罩
function roundedMask(w, h, r = CORNER) {
  return Buffer.from(
    `<svg width="${w}" height="${h}"><rect x="0" y="0" width="${w}" height="${h}" rx="${r}" ry="${r}" fill="#fff"/></svg>`
  );
}

// 把截图裁成槽位尺寸并加圆角
async function makeTile(imgPath, w, h) {
  const base = await sharp(imgPath)
    .resize(w, h, { fit: "cover", position: "top" })
    .toBuffer();
  return sharp(base)
    .composite([{ input: roundedMask(w, h), blend: "dest-in" }])
    .png()
    .toBuffer();
}

// 依据数量计算槽位
function layoutSlots(n) {
  const innerW = W - 2 * PAD;
  const innerH = H - 2 * PAD;
  if (n <= 1) return [{ left: PAD, top: PAD, w: innerW, h: innerH }];
  if (n === 2) {
    const w = Math.round((innerW - GAP) / 2);
    return [
      { left: PAD, top: PAD, w, h: innerH },
      { left: PAD + w + GAP, top: PAD, w: innerW - w - GAP, h: innerH },
    ];
  }
  // 3 个：左大 + 右两小
  const leftW = Math.round((innerW - GAP) * 0.6);
  const rightW = innerW - GAP - leftW;
  const rightH = Math.round((innerH - GAP) / 2);
  const rightX = PAD + leftW + GAP;
  return [
    { left: PAD, top: PAD, w: leftW, h: innerH },
    { left: rightX, top: PAD, w: rightW, h: rightH },
    { left: rightX, top: PAD + rightH + GAP, w: rightW, h: innerH - rightH - GAP },
  ];
}

// 背景渐变（用强调色淡淡点缀，避免死白）
function backgroundSvg(canvasBg, accent) {
  return Buffer.from(`
    <svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${canvasBg}"/>
          <stop offset="100%" stop-color="${accent}" stop-opacity="0.18"/>
        </linearGradient>
      </defs>
      <rect width="${W}" height="${H}" fill="${canvasBg}"/>
      <rect width="${W}" height="${H}" fill="url(#g)"/>
    </svg>`);
}

// 边框 + 标题叠加层
function overlaySvg(slots, title, accent, textColor) {
  const borders = slots
    .map(
      (s) =>
        `<rect x="${s.left}" y="${s.top}" width="${s.w}" height="${s.h}" rx="${CORNER}" ry="${CORNER}" fill="none" stroke="rgba(0,0,0,0.10)" stroke-width="1"/>`
    )
    .join("");
  const label = title
    ? `<text x="${PAD}" y="${H - 18}" font-family="-apple-system,Segoe UI,Roboto,sans-serif" font-size="20" font-weight="600" fill="${textColor}" opacity="0.85">${esc(title)}</text>`
    : "";
  const dot = `<circle cx="${W - PAD}" cy="${H - 24}" r="6" fill="${accent}"/>`;
  return Buffer.from(
    `<svg width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg">${borders}${label}${dot}</svg>`
  );
}

function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return true;
  const n = parseInt(m[1], 16);
  const r = (n >> 16) & 255,
    g = (n >> 8) & 255,
    b = n & 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150;
}

/**
 * 生成封面
 * @param {string[]} shots 截图文件路径数组
 * @param {object} opts { outPath, bgHex, accentHex, title }
 */
export async function buildCover(shots, { outPath, bgHex = "#ffffff", accentHex = "#3b82f6", title = "" }) {
  const valid = (shots || []).filter((p) => p && fs.existsSync(p)).slice(0, 3);

  // 画布底色：若原站背景太亮，用淡灰底衬托截图；太暗则用深色底
  const light = isLight(bgHex);
  const canvasBg = light ? "#eceef2" : "#0e0f13";
  const textColor = light ? "#111418" : "#f5f6f8";

  const composites = [];

  if (valid.length === 0) {
    // 无截图兜底：纯色 + 标题
    const placeholder = Buffer.from(
      `<svg width="${W}" height="${H}"><rect width="${W}" height="${H}" fill="${canvasBg}"/><text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-family="sans-serif" font-size="32" fill="${textColor}">${esc(title || "Design Profile")}</text></svg>`
    );
    await sharp(placeholder).png().toFile(outPath);
    return outPath;
  }

  const slots = layoutSlots(valid.length);
  for (let i = 0; i < valid.length; i++) {
    const s = slots[i];
    try {
      const tile = await makeTile(valid[i], s.w, s.h);
      composites.push({ input: tile, left: s.left, top: s.top });
    } catch {
      /* 单张失败则跳过 */
    }
  }

  const canvas = sharp(backgroundSvg(canvasBg, accentHex)).png();
  composites.push({ input: overlaySvg(slots, title, accentHex, textColor), left: 0, top: 0 });

  await canvas.composite(composites).png().toFile(outPath);
  return outPath;
}

export { W as COVER_W, H as COVER_H };

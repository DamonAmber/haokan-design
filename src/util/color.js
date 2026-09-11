// 颜色解析与感知色差工具（用于去噪聚类）

// 解析 getComputedStyle 常见输出：rgb()/rgba()/#hex/transparent
export function parseColor(input) {
  if (!input || typeof input !== "string") return null;
  const s = input.trim().toLowerCase();
  if (s === "transparent") return { r: 0, g: 0, b: 0, a: 0 };

  let m = s.match(/^rgba?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    const r = clamp255(parseFloat(parts[0]));
    const g = clamp255(parseFloat(parts[1]));
    const b = clamp255(parseFloat(parts[2]));
    const a = parts[3] != null ? clampUnit(parseFloat(parts[3])) : 1;
    if ([r, g, b].some(Number.isNaN)) return null;
    return { r, g, b, a };
  }

  m = s.match(/^hsla?\(([^)]+)\)$/);
  if (m) {
    const parts = m[1].split(/[,/\s]+/).filter(Boolean);
    const h = parseFloat(parts[0]);
    const sat = parseFloat(parts[1]) / 100;
    const li = parseFloat(parts[2]) / 100;
    const a = parts[3] != null ? clampUnit(parseFloat(parts[3])) : 1;
    if ([h, sat, li].some(Number.isNaN)) return null;
    return { ...hslToRgb(h, sat, li), a };
  }

  m = s.match(/^#([0-9a-f]{3,8})$/);
  if (m) {
    const h = m[1];
    if (h.length === 3) {
      return { r: hx(h[0] + h[0]), g: hx(h[1] + h[1]), b: hx(h[2] + h[2]), a: 1 };
    }
    if (h.length === 6) {
      return { r: hx(h.slice(0, 2)), g: hx(h.slice(2, 4)), b: hx(h.slice(4, 6)), a: 1 };
    }
    if (h.length === 8) {
      return {
        r: hx(h.slice(0, 2)),
        g: hx(h.slice(2, 4)),
        b: hx(h.slice(4, 6)),
        a: hx(h.slice(6, 8)) / 255,
      };
    }
  }
  return null;
}

function hx(s) {
  return parseInt(s, 16);
}
function hslToRgb(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const c = (1 - Math.abs(2 * l - 1)) * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = l - c / 2;
  let r = 0,
    g = 0,
    b = 0;
  if (h < 60) [r, g, b] = [c, x, 0];
  else if (h < 120) [r, g, b] = [x, c, 0];
  else if (h < 180) [r, g, b] = [0, c, x];
  else if (h < 240) [r, g, b] = [0, x, c];
  else if (h < 300) [r, g, b] = [x, 0, c];
  else [r, g, b] = [c, 0, x];
  return {
    r: clamp255((r + m) * 255),
    g: clamp255((g + m) * 255),
    b: clamp255((b + m) * 255),
  };
}
function clamp255(n) {
  return Math.max(0, Math.min(255, Math.round(n)));
}
function clampUnit(n) {
  return Math.max(0, Math.min(1, n));
}

export function rgbToHex({ r, g, b }) {
  const h = (n) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`;
}

// 相对亮度（WCAG）
export function luminance({ r, g, b }) {
  const f = (v) => {
    v /= 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  };
  return 0.2126 * f(r) + 0.7152 * f(g) + 0.0722 * f(b);
}

export function contrastRatio(c1, c2) {
  const l1 = luminance(c1);
  const l2 = luminance(c2);
  const hi = Math.max(l1, l2);
  const lo = Math.min(l1, l2);
  return (hi + 0.05) / (lo + 0.05);
}

// sRGB → XYZ → LAB（D65）
export function rgbToLab({ r, g, b }) {
  let R = r / 255,
    G = g / 255,
    B = b / 255;
  const lin = (v) => (v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4));
  R = lin(R);
  G = lin(G);
  B = lin(B);
  const X = (R * 0.4124 + G * 0.3576 + B * 0.1805) / 0.95047;
  const Y = (R * 0.2126 + G * 0.7152 + B * 0.0722) / 1.0;
  const Z = (R * 0.0193 + G * 0.1192 + B * 0.9505) / 1.08883;
  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  const fx = f(X),
    fy = f(Y),
    fz = f(Z);
  return { L: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

// CIE76 色差
export function deltaE(lab1, lab2) {
  return Math.sqrt(
    (lab1.L - lab2.L) ** 2 + (lab1.a - lab2.a) ** 2 + (lab1.b - lab2.b) ** 2
  );
}

// HSL（用于判断中性/饱和度/色相）
export function rgbToHsl({ r, g, b }) {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let h = 0;
  const l = (max + min) / 2;
  const d = max - min;
  let s = 0;
  if (d !== 0) {
    s = d / (1 - Math.abs(2 * l - 1));
    switch (max) {
      case r:
        h = ((g - b) / d) % 6;
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      default:
        h = (r - g) / d + 4;
    }
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s, l };
}

// 是否接近中性色（灰/黑/白）
export function isNeutral(rgb, satThreshold = 0.12) {
  const { s } = rgbToHsl(rgb);
  return s < satThreshold;
}

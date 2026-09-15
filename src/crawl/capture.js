// 页面处理：单次加载即完成 (1) 计算样式抽取 (2) 桌面/移动多视口截图。
// 抽取逻辑跑在浏览器上下文里，采集真实计算样式而非猜测。
import fs from "node:fs";
import path from "node:path";
import { chromium, devices } from "playwright";
import { log } from "../util/log.js";

const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const UA =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

export async function launchBrowser() {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: DESKTOP,
    userAgent: UA,
    deviceScaleFactor: 1,
    locale: "en-US",
  });
  context.setDefaultTimeout(30000);
  return { browser, context };
}

// 在浏览器内采集计算样式聚合
function collectStyles() {
  const inc = (map, key, by = 1) => {
    if (key == null || key === "") return;
    map[key] = (map[key] || 0) + by;
  };
  const px = (v) => {
    const n = parseFloat(v);
    return Number.isFinite(n) ? n : null;
  };

  // 颜色归一化：用 canvas 绘制+读像素，把任意 CSS 颜色（lab/oklab/oklch/color(srgb)/hsl…）
  // 统一转成 rgb/rgba，交给 Node 端解析。现代站点(如 Tailwind v4)大量使用 oklab/lab。
  const _cv = document.createElement("canvas");
  _cv.width = 1;
  _cv.height = 1;
  const _ctx = _cv.getContext("2d", { willReadFrequently: true });
  const _colorCache = new Map();
  const normColor = (col) => {
    if (!col) return col;
    if (_colorCache.has(col)) return _colorCache.get(col);
    let out = col;
    try {
      _ctx.clearRect(0, 0, 1, 1);
      _ctx.fillStyle = "#000";
      _ctx.fillStyle = col;
      _ctx.fillRect(0, 0, 1, 1);
      const d = _ctx.getImageData(0, 0, 1, 1).data;
      out =
        d[3] === 255
          ? `rgb(${d[0]}, ${d[1]}, ${d[2]})`
          : `rgba(${d[0]}, ${d[1]}, ${d[2]}, ${+(d[3] / 255).toFixed(3)})`;
    } catch {
      out = col;
    }
    _colorCache.set(col, out);
    return out;
  };
  const isTransparent = (rgb) => /,\s*0\)$/.test(rgb);

  // 时长字符串 → 毫秒
  const durToMs = (v) => {
    if (!v) return 0;
    const s = v.trim();
    if (s.endsWith("ms")) return parseFloat(s);
    if (s.endsWith("s")) return parseFloat(s) * 1000;
    const n = parseFloat(s);
    return Number.isFinite(n) ? n : 0;
  };
  // 按逗号切分但忽略括号内逗号（cubic-bezier(...)）
  const splitTop = (v) => (v || "").split(/,(?![^(]*\))/).map((x) => x.trim()).filter(Boolean);

  const out = {
    textColors: {}, // color -> count
    bgColors: {}, // color -> 面积权重
    borderColors: {}, // color -> count
    fontFamilies: {}, // family -> count（总频次）
    fontFamiliesDisplay: {}, // family -> count（≥28px 标题级，用于识别展示字体）
    fontFamiliesBody: {}, // family -> count（11–20px 正文级，用于识别正文/UI 字体）
    fontFamiliesWeighted: {}, // family -> Σ字号（按字号加权，大标题贡献更大）
    fontSizes: {}, // px -> count（仅含文本元素）
    fontWeights: {},
    lineHeights: {},
    letterSpacings: {},
    radii: {}, // px -> count
    shadows: {}, // shadow 字符串 -> count
    spacings: {}, // px -> count（padding/margin/gap）
    cssVars: {}, // --name -> value（:root）
    transDur: {}, // 过渡时长(ms) -> count
    ease: {}, // 缓动曲线 -> count
    animDur: {}, // 动画时长(ms) -> count
    animName: {}, // 动画名 -> count
  };
  const keyframes = {}; // name -> [动画的属性]

  // :root 上的 CSS 自定义属性（站点自带的设计 token，直接读最准）
  try {
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue; // 跨域样式表无法读取
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (rule.selectorText === ":root" || rule.selectorText === "html") {
          const style = rule.style;
          for (let i = 0; i < style.length; i++) {
            const name = style[i];
            if (name.startsWith("--")) out.cssVars[name] = style.getPropertyValue(name).trim();
          }
        }
        // @keyframes：记录动画名 + 涉及的属性（transform/opacity 等）
        if (rule.type === 7 || (rule.name && rule.cssRules && rule.cssText?.startsWith("@keyframes"))) {
          const props = new Set();
          for (const kf of Array.from(rule.cssRules || [])) {
            const st = kf.style;
            if (st) for (let j = 0; j < st.length; j++) props.add(st[j]);
          }
          if (rule.name) keyframes[rule.name] = [...props].slice(0, 8);
        }
      }
    }
  } catch {
    /* ignore */
  }

  const els = document.querySelectorAll("*");
  const limit = Math.min(els.length, 6000);
  const viewportArea = window.innerWidth * window.innerHeight || 1;

  for (let i = 0; i < limit; i++) {
    const el = els[i];
    const tag = el.tagName;
    if (tag === "SCRIPT" || tag === "STYLE" || tag === "NOSCRIPT" || tag === "SVG") continue;
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) continue;

    // 背景色（按面积加权，捕捉主导表面色）
    const bg = normColor(cs.backgroundColor);
    if (bg && !isTransparent(bg)) {
      const area = (rect.width * rect.height) / viewportArea;
      inc(out.bgColors, bg, area);
    }

    // 边框
    const bw = px(cs.borderTopWidth);
    if (bw && bw > 0 && cs.borderTopColor && cs.borderTopStyle !== "none") {
      const bc = normColor(cs.borderTopColor);
      if (bc && !isTransparent(bc)) inc(out.borderColors, bc, 1);
    }

    // 圆角（四角）
    for (const k of [
      "borderTopLeftRadius",
      "borderTopRightRadius",
      "borderBottomLeftRadius",
      "borderBottomRightRadius",
    ]) {
      const r = px(cs[k]);
      if (r && r > 0) inc(out.radii, String(Math.round(r)), 1);
    }

    // 阴影
    if (cs.boxShadow && cs.boxShadow !== "none") inc(out.shadows, cs.boxShadow, 1);

    // 过渡（transition）
    const tProp = cs.transitionProperty;
    if (tProp && tProp !== "none" && tProp !== "all") {
      for (const d of splitTop(cs.transitionDuration)) {
        const ms = durToMs(d);
        if (ms > 0 && ms <= 4000) inc(out.transDur, String(ms), 1);
      }
      for (const f of splitTop(cs.transitionTimingFunction)) inc(out.ease, f, 1);
    }
    // 动画（animation）
    if (cs.animationName && cs.animationName !== "none") {
      for (const nm of splitTop(cs.animationName)) if (nm !== "none") inc(out.animName, nm, 1);
      for (const d of splitTop(cs.animationDuration)) {
        const ms = durToMs(d);
        if (ms > 0 && ms <= 10000) inc(out.animDur, String(ms), 1);
      }
      for (const f of splitTop(cs.animationTimingFunction)) inc(out.ease, f, 1);
    }

    // 间距（padding/margin/gap 各方向）
    for (const k of [
      "paddingTop",
      "paddingRight",
      "paddingBottom",
      "paddingLeft",
      "marginTop",
      "marginRight",
      "marginBottom",
      "marginLeft",
      "rowGap",
      "columnGap",
    ]) {
      const v = px(cs[k]);
      if (v && v > 0 && v <= 200) inc(out.spacings, String(Math.round(v)), 1);
    }

    // 文本元素：字体/字号/字重/行高/字距 + 文字色
    let hasText = false;
    for (const node of el.childNodes) {
      if (node.nodeType === 3 && node.textContent.trim().length > 0) {
        hasText = true;
        break;
      }
    }
    if (hasText) {
      const tc = normColor(cs.color);
      if (tc && !isTransparent(tc)) inc(out.textColors, tc, 1);
      const fam = (cs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim();
      const fs = px(cs.fontSize);
      if (fam) {
        inc(out.fontFamilies, fam, 1);
        if (fs) {
          // 按字号分桶：区分展示/标题字体与正文/UI 字体，避免导航/代码的高频小字带偏主字体判定
          inc(out.fontFamiliesWeighted, fam, fs);
          if (fs >= 28) inc(out.fontFamiliesDisplay, fam, 1);
          else if (fs >= 11 && fs <= 20) inc(out.fontFamiliesBody, fam, 1);
        }
      }
      if (fs) inc(out.fontSizes, String(Math.round(fs)), 1);
      if (cs.fontWeight) inc(out.fontWeights, String(cs.fontWeight), 1);
      if (cs.lineHeight && cs.lineHeight !== "normal") {
        const lh = px(cs.lineHeight);
        if (lh) inc(out.lineHeights, String(Math.round(lh)), 1);
      }
      if (cs.letterSpacing && cs.letterSpacing !== "normal") {
        inc(out.letterSpacings, cs.letterSpacing, 1);
      }
    }
  }

  out.keyframes = keyframes;

  // 动效库指纹：全局变量 + data 属性 + 脚本源
  const libs = new Set();
  const w = window;
  if (w.gsap || w.GSAP || w.TweenMax || w.TweenLite) libs.add("GSAP");
  if (w.Framer || w.__FRAMER__ || document.querySelector("[data-framer-name],[data-framerid],[data-framer-appear-id]")) libs.add("Framer Motion");
  if (w.Lenis || document.querySelector("[data-lenis],.lenis") || document.documentElement.classList.contains("lenis")) libs.add("Lenis");
  if (w.AOS || document.querySelector("[data-aos]")) libs.add("AOS");
  if (w.ScrollMagic) libs.add("ScrollMagic");
  if (w.LocomotiveScroll || document.querySelector("[data-scroll],[data-scroll-container]")) libs.add("Locomotive Scroll");
  if (w.Motion || w.motionone) libs.add("Motion One");
  if (w.anime) libs.add("anime.js");
  try {
    for (const s of Array.from(document.scripts)) {
      const src = (s.src || "").toLowerCase();
      for (const [k, name] of [["gsap", "GSAP"], ["framer-motion", "Framer Motion"], ["/framer", "Framer Motion"], ["lenis", "Lenis"], ["aos", "AOS"], ["locomotive", "Locomotive Scroll"], ["scrollmagic", "ScrollMagic"], ["scrolltrigger", "GSAP ScrollTrigger"]]) {
        if (src.includes(k)) libs.add(name);
      }
    }
  } catch {
    /* ignore */
  }

  const bodyCs = getComputedStyle(document.body);
  return {
    styles: out,
    meta: {
      title: document.title || "",
      elementCount: els.length,
      sampled: limit,
      bodyBg: bodyCs.backgroundColor,
      bodyColor: bodyCs.color,
      bodyFont: (bodyCs.fontFamily || "").split(",")[0].replace(/["']/g, "").trim(),
      motionLibs: [...libs],
    },
  };
}

// 布局指纹：确定性地抽取"构图/结构"信号——容器宽度、区块序列、Hero 构图、
// 栅格列数、图片密度、对齐倾向、留白节奏。这些比颜色更决定"看起来像不像它"，
// 且不依赖模型视觉能力（无视觉档也能拿到）。
function collectLayout() {
  const vw = window.innerWidth || 1440;
  const vh = window.innerHeight || 900;
  const pageH = Math.max(document.documentElement.scrollHeight, document.body.scrollHeight, vh);
  const vis = (el) => {
    const cs = getComputedStyle(el);
    if (cs.display === "none" || cs.visibility === "hidden" || parseFloat(cs.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    return r.width > 0 && r.height > 0;
  };
  const hasDirectText = (el) => {
    for (const n of el.childNodes) if (n.nodeType === 3 && n.textContent.trim().length > 1) return true;
    return false;
  };
  const isMedia = (el) => {
    if (["IMG", "VIDEO", "CANVAS", "SVG", "PICTURE"].includes(el.tagName)) return true;
    const bi = getComputedStyle(el).backgroundImage;
    return bi && bi !== "none" && /url\(/.test(bi);
  };

  // 1) 容器宽度：承载内容的"居中块"的代表宽度
  const widths = [];
  let seen = 0;
  for (const el of document.querySelectorAll("main,section,article,header,footer,div")) {
    if (seen++ > 4000) break;
    if (!vis(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width < 360 || r.width > vw + 2) continue;
    const leftGap = r.left, rightGap = vw - r.right;
    const centered = Math.abs(leftGap - rightGap) < 48 && leftGap >= 8;
    if (centered && r.width < vw * 0.985) widths.push(Math.round(r.width));
  }
  widths.sort((a, b) => a - b);
  const containerWidth = widths.length ? widths[Math.floor(widths.length * 0.85)] : Math.round(vw * 0.9);

  // 2) 顶层区块（全宽带）序列
  const bandEls = [];
  const collectBands = (parent) => {
    for (const c of parent.children) {
      if (["SCRIPT", "STYLE", "NOSCRIPT"].includes(c.tagName)) continue;
      if (!vis(c)) continue;
      const r = c.getBoundingClientRect();
      if (r.height < 40 || r.width < vw * 0.55) continue;
      bandEls.push(c);
    }
  };
  const mainEl = document.querySelector("main") || document.querySelector("[role=main]");
  collectBands(document.body);
  if (mainEl && mainEl !== document.body) collectBands(mainEl);
  // 去重 + 按纵向位置排序
  const uniq = [...new Set(bandEls)].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top).slice(0, 14);

  // 找页面最大标题（用于 Hero 判定）
  let biggest = null, biggestSize = 0;
  const heads = document.querySelectorAll("h1,h2,h3,[class*='title'],[class*='head'],[class*='hero']");
  let hc = 0;
  for (const h of heads) {
    if (hc++ > 400) break;
    if (!vis(h) || !h.textContent.trim()) continue;
    const r = h.getBoundingClientRect();
    if (r.top > vh * 1.6) continue; // 仅看首屏附近
    const fs = parseFloat(getComputedStyle(h).fontSize) || 0;
    if (fs > biggestSize) { biggestSize = fs; biggest = h; }
  }

  const classify = (el) => {
    const r = el.getBoundingClientRect();
    const links = el.querySelectorAll("a").length;
    const tag = el.tagName;
    if (tag === "FOOTER") return "footer";
    if (tag === "NAV") return "nav";
    if (r.top < 110 && r.height < 170 && links >= 2) return "nav";
    if (r.top + window.scrollY > pageH - vh * 0.6 && links >= 4 && r.height < vh) return "footer";
    if (biggest && el.contains(biggest)) return "hero";
    // 栅格：直接子里有一排(≥2)等高同类块
    const kids = [...el.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 40);
    if (kids.length >= 2) {
      const tops = kids.map((k) => Math.round(k.getBoundingClientRect().top));
      const firstTop = tops[0];
      const inRow = tops.filter((t) => Math.abs(t - firstTop) < 24).length;
      if (inRow >= 2) return "grid";
    }
    return "section";
  };

  const sections = uniq.map((el) => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      type: classify(el),
      height: Math.round(r.height),
      padY: Math.round((parseFloat(cs.paddingTop) || 0) + (parseFloat(cs.paddingBottom) || 0)),
    };
  });

  // 栅格列数（grid 带里同排块数量的众数）
  const colCounts = {};
  for (const el of uniq) {
    if (classify(el) !== "grid") continue;
    const kids = [...el.children].filter((k) => vis(k) && k.getBoundingClientRect().height > 40);
    if (!kids.length) continue;
    const firstTop = Math.round(kids[0].getBoundingClientRect().top);
    const inRow = kids.filter((k) => Math.abs(Math.round(k.getBoundingClientRect().top) - firstTop) < 24).length;
    if (inRow >= 2) colCounts[inRow] = (colCounts[inRow] || 0) + 1;
  }
  let gridColumns = 0, best = 0;
  for (const [n, c] of Object.entries(colCounts)) if (c > best) { best = c; gridColumns = +n; }

  // Hero 构图
  // 默认按"左对齐"处理：绝大多数现代站点的 Hero 是左对齐大标题，且当页面没有可识别的首屏标题时，
  // 左对齐比居中更安全（与 demo.js 端的默认保持一致，避免两端默认值不一致导致的误居中）。
  let heroType = "left", heroHasImage = false, heroHeadlineAlign = "left";
  if (biggest) {
    const heroBand = uniq.find((el) => el.contains(biggest)) || biggest.parentElement || biggest;
    const hr = heroBand.getBoundingClientRect();
    const hh = biggest.getBoundingClientRect();
    heroHeadlineAlign = getComputedStyle(biggest).textAlign;
    const headCenter = hh.left + hh.width / 2;
    const bandCenter = hr.left + hr.width / 2;
    // 侧边大媒体？
    let media = null, mediaArea = 0;
    let mc = 0;
    for (const el of heroBand.querySelectorAll("*")) {
      if (mc++ > 1200) break;
      if (!vis(el) || !isMedia(el)) continue;
      const r = el.getBoundingClientRect();
      const a = r.width * r.height;
      if (a > mediaArea) { mediaArea = a; media = r; }
    }
    heroHasImage = mediaArea > vw * vh * 0.04;
    // 居中判定：优先信任标题自身的 text-align。
    // - 明确 center → 居中；
    // - 明确 left/right（含 start/end/justify，视觉上仍是左/右起）→ 一律不判居中；
    // - 仅当对齐不明确时，才退回"标题块几何中心 ≈ Hero 带中心"的启发式。
    // 这修正了此前的误判：左对齐大标题因其文字块本身很宽、几何中心恰好落在带中心 ±12% 内而被错判为居中。
    const leftish = /^(left|start|justify)$/.test(heroHeadlineAlign);
    const rightish = /^(right|end)$/.test(heroHeadlineAlign);
    const centeredText =
      /center/.test(heroHeadlineAlign) ||
      (!leftish && !rightish && Math.abs(headCenter - bandCenter) < hr.width * 0.12);
    if (heroHasImage && media) {
      const mediaCenter = media.left + media.width / 2;
      const opposite = Math.abs(mediaCenter - headCenter) > hr.width * 0.22;
      heroType = opposite ? "split" : (centeredText ? "centered" : "left");
    } else {
      heroType = centeredText ? "centered" : "left";
    }
  }

  // 图片密度（全页大图 / 背景图数量，按页高归一）
  let mediaCount = 0, mel = 0;
  for (const el of document.querySelectorAll("img,video,picture,svg,[style*='background-image'],[class*='image'],[class*='img'],[class*='bg-']")) {
    if (mel++ > 3000) break;
    if (!vis(el) || !isMedia(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width * r.height > 6000) mediaCount++;
  }
  const screens = Math.max(1, pageH / vh);
  const mediaPerScreen = mediaCount / screens;
  const imagery = mediaPerScreen >= 3 ? "image-forward" : mediaPerScreen >= 1 ? "some" : "minimal";

  // 对齐倾向：标题/正文里 text-align:center 的比例
  let centerN = 0, totalN = 0, ac = 0;
  for (const el of document.querySelectorAll("h1,h2,h3,p")) {
    if (ac++ > 600) break;
    if (!vis(el) || !el.textContent.trim()) continue;
    totalN++;
    if (/center/.test(getComputedStyle(el).textAlign)) centerN++;
  }
  const centerRatio = totalN ? centerN / totalN : 0;
  const alignment = centerRatio > 0.5 ? "centered" : centerRatio > 0.2 ? "mixed" : "left-aligned";

  // 留白节奏：内容带纵向 padding 的中位数 / 视口高
  const pads = sections.filter((s) => s.type !== "nav" && s.type !== "footer").map((s) => s.padY).filter((p) => p > 0).sort((a, b) => a - b);
  const medPad = pads.length ? pads[Math.floor(pads.length / 2)] : 0;
  const rhythmRatio = medPad / vh;
  const rhythm = rhythmRatio >= 0.16 ? "generous" : rhythmRatio >= 0.08 ? "roomy" : "tight";

  return {
    containerWidth,
    heroType,
    heroHasImage,
    heroHeadlineAlign: /center|right|left/.test(heroHeadlineAlign) ? heroHeadlineAlign : "left",
    gridColumns,
    imagery,
    mediaPerScreen: +mediaPerScreen.toFixed(2),
    alignment,
    centerRatio: +centerRatio.toFixed(2),
    rhythm,
    sectionSequence: sections.map((s) => s.type),
    sectionCount: sections.length,
  };
}

// 悬停态 diff：程序化 hover 若干代表性交互元素，对比前后计算样式，抓出"hover 改了什么 + 用什么过渡"
async function collectHoverEffects(page) {
  const cand = await page.evaluate(() => {
    const PROPS = ["color", "backgroundColor", "borderColor", "boxShadow", "transform", "opacity", "transitionDuration", "transitionTimingFunction"];
    const read = (el) => {
      const cs = getComputedStyle(el);
      const o = {};
      for (const p of PROPS) o[p] = cs[p];
      return o;
    };
    const els = Array.from(document.querySelectorAll("a,button,[role=button],input[type=submit],input[type=button],summary,.btn,[class*='button']"));
    const out = [];
    let idx = 0;
    for (const el of els) {
      if (out.length >= 8) break;
      const r = el.getBoundingClientRect();
      if (r.width < 24 || r.height < 12) continue;
      if (r.top < 4 || r.left < 4 || r.bottom > window.innerHeight - 4 || r.right > window.innerWidth - 4) continue;
      el.setAttribute("data-hkh", String(idx));
      out.push({ idx, cx: Math.round(r.left + r.width / 2), cy: Math.round(r.top + r.height / 2), before: read(el) });
      idx++;
    }
    return out;
  });

  const results = [];
  for (const c of cand) {
    try {
      await page.mouse.move(c.cx, c.cy);
      await page.waitForTimeout(220);
      const after = await page.evaluate((i) => {
        const el = document.querySelector(`[data-hkh="${i}"]`);
        if (!el) return null;
        const cs = getComputedStyle(el);
        const PROPS = ["color", "backgroundColor", "borderColor", "boxShadow", "transform", "opacity", "transitionDuration", "transitionTimingFunction"];
        const o = {};
        for (const p of PROPS) o[p] = cs[p];
        return o;
      }, c.idx);
      if (after) results.push({ before: c.before, after });
    } catch {
      /* 跳过 */
    }
  }
  await page.mouse.move(2, 2).catch(() => {});
  return results;
}

// 处理单个页面
export async function processPage(context, url, { workDir, index }) {
  const page = await context.newPage();
  const shotsDir = path.join(workDir, "shots");
  fs.mkdirSync(shotsDir, { recursive: true });
  const result = { url, ok: false };

  try {
    await page.setViewportSize(DESKTOP);
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 35000 });
    // 等待布局稳定 & 懒加载
    await page.waitForTimeout(1800);
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.5)).catch(() => {});
    await page.waitForTimeout(600);
    await page.evaluate(() => window.scrollTo(0, 0)).catch(() => {});
    await page.waitForTimeout(400);

    // 抽取样式
    const extracted = await page.evaluate(collectStyles);
    result.styles = extracted.styles;
    result.meta = extracted.meta;
    result.title = extracted.meta.title;

    // 抽取布局指纹（确定性构图信号）
    try {
      result.layout = await page.evaluate(collectLayout);
    } catch {
      result.layout = null;
    }

    // 桌面首屏截图
    const desktopShot = path.join(shotsDir, `p${index}-desktop.png`);
    await page.screenshot({ path: desktopShot, fullPage: false });
    result.desktopShot = desktopShot;

    // 悬停态采样（桌面视口下进行）
    try {
      result.hover = await collectHoverEffects(page);
    } catch {
      result.hover = [];
    }

    // 移动视口截图（响应式重排后）
    await page.setViewportSize(MOBILE);
    await page.waitForTimeout(900);
    const mobileShot = path.join(shotsDir, `p${index}-mobile.png`);
    await page.screenshot({ path: mobileShot, fullPage: false });
    result.mobileShot = mobileShot;

    result.ok = true;
  } catch (err) {
    result.error = err.message;
    log.warn(`处理页面失败 ${url}：${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
  return result;
}

export { DESKTOP, MOBILE };

// 站点级采样：发现上下游相关页面（sitemap + 页面内链），
// 再按"路径多样性"挑选有代表性的样本，避免只看单页得出偏颇的风格。
import { log } from "../util/log.js";

const ASSET_RE = /\.(png|jpe?g|gif|svg|webp|avif|ico|pdf|zip|mp4|webm|mp3|css|js|json|xml|rss|woff2?|ttf|eot)(\?|$)/i;

export function normalizeUrl(u) {
  try {
    const url = new URL(u);
    url.hash = "";
    // 去掉末尾斜杠（根路径除外）以便去重
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, "");
    return url.toString();
  } catch {
    return null;
  }
}

function sameOrigin(a, b) {
  try {
    return new URL(a).origin === new URL(b).origin;
  } catch {
    return false;
  }
}

function isLikelyPage(u) {
  try {
    const url = new URL(u);
    if (!/^https?:$/.test(url.protocol)) return false;
    if (ASSET_RE.test(url.pathname)) return false;
    return true;
  } catch {
    return false;
  }
}

// 拉取并解析 sitemap.xml 里的 <loc>
async function fetchSitemap(origin) {
  const urls = [];
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 8000);
    const res = await fetch(`${origin}/sitemap.xml`, { signal: controller.signal });
    clearTimeout(timer);
    if (!res.ok) return urls;
    const xml = await res.text();
    const locs = xml.match(/<loc>([^<]+)<\/loc>/gi) || [];
    for (const l of locs) {
      const m = l.match(/<loc>([^<]+)<\/loc>/i);
      if (m) urls.push(m[1].trim());
    }
  } catch {
    /* 忽略：很多站点没有 sitemap 或有防护 */
  }
  return urls;
}

// 从起始页面抓取同源链接
async function fetchOnPageLinks(context, startUrl) {
  const page = await context.newPage();
  const links = [];
  try {
    await page.goto(startUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
    await page.waitForTimeout(1200);
    const hrefs = await page.evaluate(() => {
      const out = [];
      // 优先导航区域，其次全站链接
      const navSel = "header a, nav a, [role=navigation] a, footer a";
      const navLinks = Array.from(document.querySelectorAll(navSel)).map((a) => a.href);
      const allLinks = Array.from(document.querySelectorAll("a[href]")).map((a) => a.href);
      return { navLinks, allLinks };
    });
    for (const h of hrefs.navLinks) links.push({ url: h, nav: true });
    for (const h of hrefs.allLinks) links.push({ url: h, nav: false });
  } catch (err) {
    log.warn(`读取起始页链接失败：${err.message}`);
  } finally {
    await page.close().catch(() => {});
  }
  return links;
}

// 主入口：返回去重、去资源、同源、按多样性挑选后的页面 URL 列表（含起始页，起始页排第一）
export async function samplePages(context, startUrl, { maxPages = 5 } = {}) {
  const start = normalizeUrl(startUrl);
  if (!start) throw new Error(`无效的起始 URL：${startUrl}`);
  const origin = new URL(start).origin;

  const [sitemapUrls, onPage] = await Promise.all([
    fetchSitemap(origin),
    fetchOnPageLinks(context, start),
  ]);

  // 候选集合：url -> { nav 权重 }
  const cand = new Map();
  const add = (raw, nav) => {
    const n = normalizeUrl(raw);
    if (!n) return;
    if (!sameOrigin(n, start)) return;
    if (!isLikelyPage(n)) return;
    if (n === start) return;
    const prev = cand.get(n) || { nav: false };
    cand.set(n, { nav: prev.nav || nav });
  };
  for (const { url, nav } of onPage) add(url, nav);
  for (const u of sitemapUrls) add(u, false);

  log.detail(`发现候选页面 ${cand.size} 个（sitemap ${sitemapUrls.length} / 页面内链 ${onPage.length}）`);

  // 按多样性挑选：优先导航链接、路径浅、首段各不相同
  const scored = [...cand.entries()].map(([url, meta]) => {
    const path = new URL(url).pathname;
    const segs = path.split("/").filter(Boolean);
    return {
      url,
      nav: meta.nav,
      depth: segs.length,
      section: segs[0] || "",
    };
  });

  scored.sort((a, b) => {
    if (a.nav !== b.nav) return a.nav ? -1 : 1; // 导航优先
    if (a.depth !== b.depth) return a.depth - b.depth; // 浅路径优先
    return a.url.length - b.url.length;
  });

  const picked = [start];
  const usedSections = new Set([""]); // 起始页通常是根
  // 第一轮：每个不同 section 取一个
  for (const s of scored) {
    if (picked.length >= maxPages) break;
    if (usedSections.has(s.section)) continue;
    picked.push(s.url);
    usedSections.add(s.section);
  }
  // 第二轮：还没满就按排序补齐
  if (picked.length < maxPages) {
    for (const s of scored) {
      if (picked.length >= maxPages) break;
      if (picked.includes(s.url)) continue;
      picked.push(s.url);
    }
  }

  return picked.slice(0, maxPages);
}

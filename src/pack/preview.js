// 自包含 preview.html：不装 App、不解压也能双击浏览的"活体样式指南"。
// 排版强调可读性：宽松行距、清晰的章节分隔与留白。

function esc(s = "") {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

// 极简 Markdown → HTML（标题/列表/加粗/行内码/代码块/段落）
function mdToHtml(md) {
  const src = md.replace(/```json[\s\S]*?```/g, "").trim();
  const lines = src.split("\n");
  const out = [];
  let inList = null;
  let inCode = false;
  const closeList = () => {
    if (inList) {
      out.push(`</${inList}>`);
      inList = null;
    }
  };
  const inline = (t) =>
    esc(t)
      .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
      .replace(/`([^`]+)`/g, "<code>$1</code>");

  for (const raw of lines) {
    const line = raw.replace(/\s+$/, "");
    if (/^```/.test(line)) {
      if (inCode) {
        out.push("</code></pre>");
        inCode = false;
      } else {
        closeList();
        out.push("<pre><code>");
        inCode = true;
      }
      continue;
    }
    if (inCode) {
      out.push(esc(raw));
      continue;
    }
    if (!line.trim()) {
      closeList();
      continue;
    }
    let m;
    if ((m = line.match(/^(#{1,4})\s+(.*)$/))) {
      closeList();
      const lvl = m[1].length;
      out.push(`<h${lvl}>${inline(m[2])}</h${lvl}>`);
    } else if ((m = line.match(/^\s*[-*]\s+(.*)$/))) {
      if (inList !== "ul") {
        closeList();
        out.push("<ul>");
        inList = "ul";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else if ((m = line.match(/^\s*\d+[.)]\s+(.*)$/))) {
      if (inList !== "ol") {
        closeList();
        out.push("<ol>");
        inList = "ol";
      }
      out.push(`<li>${inline(m[1])}</li>`);
    } else {
      closeList();
      out.push(`<p>${inline(line)}</p>`);
    }
  }
  closeList();
  if (inCode) out.push("</code></pre>");
  return out.join("\n");
}

function isLight(hex) {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex || "");
  if (!m) return true;
  const n = parseInt(m[1], 16);
  return 0.2126 * ((n >> 16) & 255) + 0.7152 * ((n >> 8) & 255) + 0.0722 * (n & 255) > 150;
}

function swatches(palette) {
  return palette
    .map((c) => {
      const light = isLight(c.hex);
      return `<div class="swatch" style="background:${c.hex};color:${light ? "#111" : "#fff"}">
        <span class="role">${esc(c.role)}</span>
        <span class="hex">${esc(c.hex)}</span>
      </div>`;
    })
    .join("");
}

function typeSamples(scale, bodyFont, displayFont) {
  return scale
    .slice()
    .sort((a, b) => b.px - a.px)
    .map((s) => {
      // 大字号（≥28px 标题级）用展示字体，其余用正文字体，直观呈现两者差异
      const f = s.px >= 28 && displayFont ? displayFont : bodyFont;
      return `<div class="type-row"><span class="type-meta">${esc(s.role)} · ${s.px}px</span>
         <span class="type-sample" style="font-size:${s.px}px;font-family:${esc(f || "inherit")},system-ui,sans-serif">好看的设计 Design</span></div>`;
    })
    .join("");
}

function spacingBars(scale) {
  return scale
    .map((s) => `<div class="sp-row"><span class="sp-label">${s.px}px</span><span class="sp-bar" style="width:${Math.min(s.px, 200)}px"></span></div>`)
    .join("");
}

function radiusSamples(scale) {
  return scale
    .map((r) => `<div class="radius-box" style="border-radius:${Math.min(r.px, 40)}px"><span>${r.px >= 100 ? "full" : r.px + "px"}</span></div>`)
    .join("");
}

function shadowSamples(levels) {
  if (!levels.length) return '<p class="muted">该设计几乎不使用阴影（扁平风格）。</p>';
  return levels.map((l, i) => `<div class="shadow-box" style="box-shadow:${esc(l.shadow)}">level-${i + 1}</div>`).join("");
}

// —— 动效与交互区（含时长/缓动/关键帧/hover 实况演示）——
function motionSection(motion, primary) {
  if (!motion || !motion.hasMotion) {
    return `<section><h2>动效与交互</h2><p class="muted">未检测到明显动效，该设计倾向静态、克制。</p></section>`;
  }
  const durChips = motion.durations.map((d) => `<span class="chip mono">${d.ms}ms</span>`).join("") || '<span class="muted">—</span>';
  const easeRows =
    motion.easings
      .map(
        (e) => `<div class="ease-row"><span class="ease-label">${esc(e.fn)}</span>
      <div class="ease-track"><span class="ease-dot" style="animation-timing-function:${esc(e.fn)}"></span></div></div>`
      )
      .join("") || '<span class="muted">—</span>';
  const kf = motion.keyframeNames.length ? motion.keyframeNames.map((n) => `<span class="chip">${esc(n)}</span>`).join("") : "";
  const libs = motion.libraries.length ? motion.libraries.map((l) => `<span class="chip">${esc(l)}</span>`).join("") : "";
  const chars = motion.character.length ? motion.character.map((l) => `<span class="chip accent">${esc(l)}</span>`).join("") : "";

  const hov = motion.hover;
  const hoverDur = hov.durations[0]?.ms || motion.durations[0]?.ms || 200;
  const hoverEase = hov.easings[0] || motion.easings[0]?.fn || "ease";
  const hoverList = hov.changes.length ? hov.changes.map((c) => `${c.label}`).join("、") : "—";
  const hoverDemo = `
    <div class="hover-demo">
      <button class="demo-btn" style="--d:${hoverDur}ms;--e:${esc(hoverEase)};background:${primary}">悬停我试试</button>
      <span class="muted">hover 改变：${esc(hoverList)}${hov.durations[0] ? `　·　${hoverDur}ms` : ""}　·　${esc(hoverEase)}</span>
    </div>`;

  return `<section>
    <h2>动效与交互</h2>
    ${chars ? `<div class="chips" style="margin-bottom:20px">${chars}</div>` : ""}
    <div class="mo-grid">
      <div><div class="lbl">过渡时长</div><div class="chips">${durChips}</div></div>
      <div><div class="lbl">缓动曲线（动态演示）</div>${easeRows}</div>
    </div>
    <div class="lbl" style="margin-top:24px">Hover 微交互</div>
    ${hoverDemo}
    ${kf ? `<div class="lbl" style="margin-top:24px">关键帧动画</div><div class="chips">${kf}</div>` : ""}
    ${libs ? `<div class="lbl" style="margin-top:24px">动效库</div><div class="chips">${libs}</div>` : ""}
  </section>`;
}

export function buildPreviewHtml({ system, meta, profile, coverRel = "covers/cover.png" }) {
  const primary = system.colors.palette.find((c) => c.role === "primary")?.hex || "#3b82f6";
  const bg = system.colors.mode === "dark" ? "#0e0f13" : "#ffffff";
  const fg = system.colors.mode === "dark" ? "#f5f6f8" : "#14161a";
  const tags = (profile.tags || []).map((t) => `<span class="chip">${esc(t)}</span>`).join("");
  const primaryFont = system.typography.primaryFont;
  const displayFont = system.typography.displayFont || primaryFont;
  const hasDisplay = displayFont && displayFont !== primaryFont;

  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(meta.source)} · 设计资产预览</title>
<style>
  :root{ --primary:${primary}; --bg:${bg}; --fg:${fg}; --line:rgba(128,128,128,.18); --muted:#8a8f98; }
  *{box-sizing:border-box}
  body{margin:0;background:var(--bg);color:var(--fg);font-family:${primaryFont ? `"${esc(primaryFont)}",` : ""}-apple-system,"Segoe UI",Roboto,"PingFang SC","Microsoft YaHei",sans-serif;font-size:16px;line-height:1.7;-webkit-font-smoothing:antialiased}
  .wrap{max-width:900px;margin:0 auto;padding:64px 28px 128px}
  header h1{font-size:38px;line-height:1.2;margin:0 0 10px;letter-spacing:-.02em${hasDisplay ? `;font-family:"${esc(displayFont)}",system-ui,sans-serif` : ""}}
  .src{color:var(--muted);font-size:13px;margin-bottom:20px;word-break:break-all;line-height:1.6}
  .oneliner{font-size:20px;line-height:1.6;opacity:.9;margin:10px 0 20px;font-weight:450}
  .chips{display:flex;flex-wrap:wrap;gap:9px}
  .chip{background:color-mix(in srgb, var(--fg) 6%, transparent);color:var(--fg);border:1px solid var(--line);padding:5px 13px;border-radius:999px;font-size:13px}
  .chip.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace}
  .chip.accent{background:color-mix(in srgb, var(--primary) 12%, transparent);color:var(--primary);border-color:color-mix(in srgb, var(--primary) 26%, transparent)}
  header .chips{margin-bottom:8px}
  .cover{width:100%;border-radius:18px;overflow:hidden;border:1px solid var(--line);margin:32px 0 8px}
  .cover img{width:100%;display:block}

  section{margin:56px 0}
  h2{font-size:14px;font-weight:650;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 22px;padding-bottom:14px;border-bottom:1px solid var(--line)}

  .grid-swatch{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
  .swatch{border-radius:14px;padding:16px;height:104px;display:flex;flex-direction:column;justify-content:flex-end;border:1px solid var(--line)}
  .swatch .role{font-weight:600;font-size:14px}
  .swatch .hex{font-size:12px;opacity:.85;font-family:ui-monospace,monospace;margin-top:2px}

  .type-row{display:flex;align-items:baseline;gap:20px;padding:14px 0;border-bottom:1px solid var(--line)}
  .type-row:last-child{border-bottom:0}
  .type-meta{min-width:120px;color:var(--muted);font-size:12px;font-family:ui-monospace,monospace}
  .type-sample{font-weight:600;line-height:1.3}

  .sp-row{display:flex;align-items:center;gap:14px;margin:10px 0}
  .sp-label{min-width:54px;font-size:12px;color:var(--muted);font-family:ui-monospace,monospace}
  .sp-bar{height:16px;background:var(--primary);border-radius:5px;display:inline-block}

  .radius-row,.shadow-row{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-end}
  .radius-box{width:92px;height:92px;background:color-mix(in srgb, var(--primary) 14%, transparent);border:1.5px solid var(--primary);display:flex;align-items:center;justify-content:center;font-size:12px}
  .shadow-box{width:128px;height:84px;background:var(--bg);border:1px solid var(--line);border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:12px;color:var(--muted);margin:14px 8px}

  .meta-table{width:100%;border-collapse:collapse;font-size:14.5px}
  .meta-table td{padding:11px 12px;border-bottom:1px solid var(--line)}
  .meta-table tr:last-child td{border-bottom:0}
  .meta-table td:first-child{color:var(--muted);width:180px}

  /* 动效区 */
  .lbl{font-size:12px;color:var(--muted);text-transform:uppercase;letter-spacing:.06em;margin-bottom:12px}
  .mo-grid{display:grid;grid-template-columns:1fr 1fr;gap:32px}
  @media(max-width:640px){.mo-grid{grid-template-columns:1fr}}
  .ease-row{display:flex;align-items:center;gap:12px;margin:10px 0}
  .ease-label{min-width:150px;font-size:11px;color:var(--muted);font-family:ui-monospace,monospace;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .ease-track{position:relative;flex:1;height:10px;background:color-mix(in srgb,var(--fg) 8%,transparent);border-radius:999px}
  .ease-dot{position:absolute;top:-3px;left:0;width:16px;height:16px;border-radius:50%;background:var(--primary);animation:hkslide 1.8s infinite}
  @keyframes hkslide{0%{left:0}50%{left:calc(100% - 16px)}100%{left:0}}
  .hover-demo{display:flex;align-items:center;gap:16px;flex-wrap:wrap}
  .demo-btn{border:0;color:#fff;padding:12px 22px;border-radius:10px;font-size:15px;font-weight:600;cursor:pointer;transition:transform var(--d,200ms) var(--e,ease), box-shadow var(--d,200ms) var(--e,ease), filter var(--d,200ms) var(--e,ease)}
  .demo-btn:hover{transform:translateY(-3px);box-shadow:0 12px 26px -10px color-mix(in srgb,var(--primary) 70%,transparent);filter:brightness(1.05)}

  /* 设计语言正文：宽松、分段清晰 */
  .profile{font-size:16px;line-height:1.85}
  .profile h2{font-size:23px;font-weight:680;letter-spacing:-.01em;text-transform:none;color:var(--fg);margin:52px 0 18px;padding-top:32px;border-top:1px solid var(--line)}
  .profile > h2:first-child{margin-top:0;padding-top:0;border-top:0}
  .profile h3{font-size:17px;font-weight:650;margin:30px 0 10px}
  .profile p{margin:0 0 18px}
  .profile ul,.profile ol{margin:0 0 20px;padding-left:24px}
  .profile li{margin-bottom:11px;padding-left:4px}
  .profile li::marker{color:var(--muted)}
  .profile strong{font-weight:680}
  .profile code{background:color-mix(in srgb,var(--fg) 10%,transparent);padding:2px 7px;border-radius:6px;font-size:13.5px;font-family:ui-monospace,monospace}
  .profile pre{background:color-mix(in srgb,var(--fg) 7%,transparent);padding:16px;border-radius:12px;overflow:auto;line-height:1.6}

  .muted{color:var(--muted)}
  footer{margin-top:72px;padding-top:24px;border-top:1px solid var(--line);color:var(--muted);font-size:12px;text-align:center}
</style>
</head>
<body>
<div class="wrap">
  <header>
    <h1>${esc(meta.source)}</h1>
    <div class="src">来源：${(meta.pages || []).map((p) => esc(p.url)).join("　·　")}</div>
    ${profile.oneLiner ? `<div class="oneliner">${esc(profile.oneLiner)}</div>` : ""}
    <div class="chips">${profile.aesthetic ? `<span class="chip accent">${esc(profile.aesthetic)}</span>` : ""}${tags}</div>
  </header>

  <div class="cover"><img src="${coverRel}" alt="cover"/></div>

  <section>
    <h2>概览</h2>
    <table class="meta-table">
      <tr><td>主题模式</td><td>${system.colors.mode}${system.colors.themeMix?.mixed ? `（深浅混排：深 ${system.colors.themeMix.dark} / 浅 ${system.colors.themeMix.light} 页，主导 ${system.colors.mode}）` : ""}</td></tr>
      <tr><td>密度</td><td>${system.density}</td></tr>
      <tr><td>正文/背景对比度</td><td>${system.colors.contrast ?? "n/a"}</td></tr>
      <tr><td>圆角风格</td><td>${system.radius.style}（典型 ${system.radius.typical}px）</td></tr>
      <tr><td>阴影使用</td><td>${system.shadows.usage}</td></tr>
      <tr><td>间距基准</td><td>${system.spacing.base}px</td></tr>
      <tr><td>字阶比例</td><td>${system.typography.ratio ?? "n/a"}</td></tr>
      <tr><td>动效性格</td><td>${(system.motion?.character || []).join("、") || "静态/克制"}</td></tr>
      <tr><td>分析页面数</td><td>${system.pagesAnalyzed}</td></tr>
    </table>
  </section>

  <section>
    <h2>色板</h2>
    <div class="grid-swatch">${swatches(system.colors.palette)}</div>
  </section>

  <section>
    <h2>字体排印${primaryFont ? `　·　正文 ${esc(primaryFont)}${hasDisplay ? `　·　标题 ${esc(displayFont)}` : ""}` : ""}</h2>
    ${typeSamples(system.typography.scale, primaryFont, displayFont)}
  </section>

  <section>
    <h2>间距系统（基准 ${system.spacing.base}px）</h2>
    ${spacingBars(system.spacing.scale)}
  </section>

  <section>
    <h2>圆角</h2>
    <div class="radius-row">${radiusSamples(system.radius.scale)}</div>
  </section>

  <section>
    <h2>阴影 / 高度</h2>
    <div class="shadow-row">${shadowSamples(system.shadows.levels)}</div>
  </section>

  ${motionSection(system.motion, primary)}

  <section class="profile">
    <h2>设计语言规范</h2>
    ${mdToHtml(profile.markdown)}
  </section>

  <footer>由 Haokan 生成 · 数值经确定性抽取，风格由本地模型提炼</footer>
</div>
</body>
</html>`;
}

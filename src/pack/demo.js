// 活体样张（Demo Screens）：用一套 tokens 驱动多个"内容中立、类别不同"的示例页面，
// 让用户直观看到"用这套设计资产会生成出什么样的东西"。同一份设计语言（色彩/字体/
// 间距/圆角/动效/构图原型），套到不同页面类别上：
//   landing 落地页 · dashboard 控制台 · article 文章 · shop 商店 · portfolio 作品集
// 用户可在画廊「样张」标签里切换类别，横向感受设计资产的适应力与质感。
//
// 设计要点：
// - 所有类别只由一组 --hk-* CSS 变量 + 一组 data-* 布局属性驱动；变量由页面内的
//   hkRenderTokens(tokens) 计算并写到 :root（服务端初次渲染与画廊实时微调共用同一入口）。
// - 文字色不照抄提炼出的 foreground（它常被误标）：从整块色板里重新挑"高对比标题色 /
//   正文色 / 次要色"三级层次，深浅主题都保证可读——这是"不灰"的关键。
// - 构图会根据来源的美学原型（editorial / tool / marketing）与布局指纹自适应。

function esc(s = "") {
  return String(s).replace(/[<>&]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;" }[c]));
}

// ============================ 共享基础样式 ============================
const BASE_STYLE = `
*{box-sizing:border-box}
html,body{margin:0}
body{
  background:var(--hk-bg,#fff);color:var(--hk-fg,#3d4351);
  font-family:var(--hk-font,system-ui),system-ui,"PingFang SC","Microsoft YaHei",sans-serif;
  font-size:var(--hk-t-body,16px);line-height:1.65;
  -webkit-font-smoothing:antialiased;text-rendering:optimizeLegibility;
}
img{max-width:100%}
::selection{background:color-mix(in srgb,var(--hk-primary) 30%,transparent)}
.hk-wrap{max-width:var(--hk-container,1080px);margin:0 auto;padding:0 clamp(20px,4vw,calc(var(--hk-unit,9px) * 4))}

/* 顶部对照条（before / after 诚实预期），刻意做薄，避免抢样张 */
.hk-banner{background:var(--hk-surface);border-bottom:1px solid var(--hk-border);padding:9px calc(var(--hk-unit,9px) * 3);display:flex;gap:12px;align-items:center;font-size:12px;color:var(--hk-muted);line-height:1.5}
.hk-banner img{width:52px;height:33px;object-fit:cover;object-position:top;border-radius:6px;border:1px solid var(--hk-border);flex:none}
.hk-banner b{color:var(--hk-fg-strong)}

/* 通用头像 / 徽标占位 */
.hk-av{border-radius:50%;flex:none;border:1px solid var(--hk-border);background:
  radial-gradient(120% 120% at 25% 15%, color-mix(in srgb,var(--hk-primary) 60%, transparent), transparent 60%),
  radial-gradient(120% 120% at 90% 95%, color-mix(in srgb,var(--hk-accent) 55%, transparent), transparent 55%),
  var(--hk-surface-2)}

/* 导航 */
.hk-nav{display:flex;align-items:center;gap:calc(var(--hk-unit,9px) * 2.6);padding:calc(var(--hk-unit,9px) * 2) 0;border-bottom:1px solid var(--hk-border)}
.hk-brand{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-weight:750;font-size:calc(var(--hk-t-body,16px) * 1.16);letter-spacing:-.01em;display:flex;align-items:center;gap:9px;white-space:nowrap}
.hk-logo{width:22px;height:22px;border-radius:calc(var(--hk-r-btn,8px) * .6);background:var(--hk-primary);flex:none}
.hk-nav .links{display:flex;gap:calc(var(--hk-unit,9px) * 2);flex:1}
.hk-nav a{color:var(--hk-muted);text-decoration:none;font-size:var(--hk-t-sm,13px);transition:color var(--hk-dur,200ms) var(--hk-ease,ease)}
.hk-nav a:hover{color:var(--hk-fg-strong)}
@media(max-width:640px){.hk-nav .links{display:none}}

/* 按钮 */
.hk-btn{display:inline-flex;align-items:center;justify-content:center;gap:6px;font:inherit;font-weight:600;font-size:var(--hk-t-sm,13px);padding:calc(var(--hk-unit,9px) * 1.2) calc(var(--hk-unit,9px) * 2.1);border-radius:var(--hk-r-btn,8px);border:1px solid transparent;cursor:pointer;white-space:nowrap;transition:transform var(--hk-dur,200ms) var(--hk-ease,ease),filter var(--hk-dur,200ms) var(--hk-ease,ease),background var(--hk-dur,200ms) var(--hk-ease,ease),border-color var(--hk-dur,200ms) var(--hk-ease,ease)}
.hk-btn.pri{background:var(--hk-primary);color:var(--hk-primary-fg,#fff)}
.hk-btn.pri:hover{filter:brightness(1.08);transform:translateY(-1px)}
.hk-btn.ghost{background:transparent;color:var(--hk-fg-strong);border-color:var(--hk-border)}
.hk-btn.ghost:hover{background:var(--hk-surface);border-color:var(--hk-border-strong)}
.hk-btn.pill{border-radius:var(--hk-r-pill,999px)}

/* 标题体系（跨类别复用） */
.hk-eyebrow{display:inline-flex;align-items:center;gap:8px;font-size:var(--hk-t-sm,13px);color:var(--hk-accent);border:1px solid var(--hk-border);background:var(--hk-surface);padding:5px 13px;border-radius:var(--hk-r-pill,999px);margin-bottom:calc(var(--hk-unit,9px) * 2.4)}
.hk-eyebrow .dot{width:7px;height:7px;border-radius:50%;background:var(--hk-accent)}
.hk-h1{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:var(--hk-t-display,46px);line-height:1.05;letter-spacing:-.022em;font-weight:var(--hk-w-display,780);margin:0 0 calc(var(--hk-unit,9px) * 2.2)}
.hk-kicker{font-size:var(--hk-t-sm,13px);color:var(--hk-accent);font-weight:650;letter-spacing:.02em;margin-bottom:10px}
.hk-h2{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:var(--hk-t-h2,30px);line-height:1.14;letter-spacing:-.014em;font-weight:var(--hk-w-h2,720);margin:0 0 calc(var(--hk-unit,9px) * 3.5);max-width:32ch}

/* 页脚 */
.hk-foot{border-top:1px solid var(--hk-border);padding:calc(var(--hk-unit,9px) * 4.5) 0 calc(var(--hk-unit,9px) * 5.5);display:flex;justify-content:space-between;gap:calc(var(--hk-unit,9px) * 3);flex-wrap:wrap;color:var(--hk-muted);font-size:var(--hk-t-sm,13px)}
.hk-foot .col{display:flex;flex-direction:column;gap:10px}
.hk-foot .col b{color:var(--hk-fg-strong);font-weight:650;margin-bottom:2px}
.hk-foot a{color:var(--hk-muted);text-decoration:none;transition:color var(--hk-dur,200ms) var(--hk-ease,ease)}
.hk-foot a:hover{color:var(--hk-fg-strong)}

/* 原型（archetype）对标题体系的排印微调——跨类别安全生效 */
[data-arch="tool"] .hk-eyebrow,[data-arch="tool"] .hk-kicker{font-family:var(--hk-font-mono,ui-monospace),ui-monospace,monospace;text-transform:uppercase;letter-spacing:.08em;font-size:calc(var(--hk-t-sm,13px) * .92)}
[data-arch="editorial"] .hk-h1{letter-spacing:-.03em;line-height:.98}
[data-arch="editorial"] .hk-kicker{color:var(--hk-muted);text-transform:uppercase;letter-spacing:.14em;font-size:11px;padding-top:12px;border-top:1px solid var(--hk-border-strong);display:inline-block}

/* 窄屏：收敛超大标题 */
@media(max-width:600px){
  .hk-h1{font-size:min(var(--hk-t-display,46px), 12.5vw)}
  .hk-h2{font-size:min(var(--hk-t-h2,30px), 8vw)}
  .hk-wrap{padding-left:20px;padding-right:20px}
}
`;

// ============================ 落地页（landing） ============================
const LANDING_STYLE = `
.hk-hero-wrap{border-bottom:1px solid var(--hk-border);position:relative;overflow:hidden}
.hk-hero{display:grid;grid-template-columns:1fr;gap:calc(var(--hk-unit,9px) * 4);align-items:center;padding:calc(var(--hk-unit,9px) * var(--hk-sec-mult,5.5) * 1.35) 0 calc(var(--hk-unit,9px) * var(--hk-sec-mult,5.5) * 1.05)}
.hk-hero-copy{min-width:0}
.hk-lead{font-size:var(--hk-t-lead,19px);color:var(--hk-muted);margin:0 0 calc(var(--hk-unit,9px) * 3);max-width:54ch;line-height:1.55}
.hk-cta{display:flex;gap:calc(var(--hk-unit,9px) * 1.4);flex-wrap:wrap;align-items:center}
.hk-trust{margin-top:calc(var(--hk-unit,9px) * 3.2);font-size:var(--hk-t-sm,13px);color:var(--hk-muted);display:flex;align-items:center;gap:10px}
.hk-avatars{display:flex}
.hk-avatars i{width:26px;height:26px;border-radius:50%;background:var(--hk-surface-2);border:2px solid var(--hk-bg);margin-left:-8px;display:inline-block}
.hk-avatars i:first-child{margin-left:0}
.hk-hero-media{display:none;position:relative;aspect-ratio:4/3;border-radius:var(--hk-r-card,14px);border:1px solid var(--hk-border);overflow:hidden;background:
  radial-gradient(120% 90% at 12% 8%, color-mix(in srgb,var(--hk-primary) 32%, transparent), transparent 58%),
  radial-gradient(120% 90% at 100% 100%, color-mix(in srgb,var(--hk-accent) 28%, transparent), transparent 55%),
  var(--hk-surface-2)}
.hk-hm-glass{position:absolute;inset:14% 12%;border-radius:calc(var(--hk-r-card,14px) * .7);border:1px solid color-mix(in srgb,var(--hk-fg-strong) 16%,transparent);background:color-mix(in srgb,var(--hk-bg) 55%,transparent);backdrop-filter:blur(2px)}
.hk-hm-code{display:none;position:absolute;inset:14% 12%;border-radius:calc(var(--hk-r-card,14px) * .55);border:1px solid var(--hk-border-strong);background:color-mix(in srgb,var(--hk-bg) 88%,#000);padding:16px;flex-direction:column;gap:9px}
.hk-hm-code i{height:8px;border-radius:3px;background:color-mix(in srgb,var(--hk-fg-strong) 16%,transparent);display:block}
.hk-hm-code i:nth-child(1){width:42%;background:color-mix(in srgb,var(--hk-primary) 65%,transparent)}
.hk-hm-code i:nth-child(2){width:74%}
.hk-hm-code i:nth-child(3){width:58%;background:color-mix(in srgb,var(--hk-accent) 55%,transparent)}
.hk-hm-code i:nth-child(4){width:66%}
.hk-hm-code i:nth-child(5){width:36%}
.hk-hm-code i:nth-child(6){width:80%}
[data-hero="split"] .hk-hero{grid-template-columns:1.02fr .98fr}
[data-hero="split"] .hk-hero-media,[data-imagery="image-forward"] .hk-hero-media,[data-hero-media="1"] .hk-hero-media{display:block}
[data-hero="centered"] .hk-hero{justify-items:center;text-align:center}
[data-hero="centered"] .hk-hero-copy{max-width:46rem}
[data-hero="centered"] .hk-cta,[data-hero="centered"] .hk-trust{justify-content:center}
[data-hero="centered"] .hk-lead{margin-left:auto;margin-right:auto}
[data-hero="centered"] .hk-hero-media{display:none}
[data-arch="tool"] .hk-hero-media .hk-hm-glass{display:none}
[data-arch="tool"] .hk-hero-media .hk-hm-code{display:flex}
[data-arch="tool"] .hk-hero{grid-template-columns:1fr}
[data-arch="tool"][data-hero="split"] .hk-hero{grid-template-columns:1.1fr .9fr}
[data-arch="editorial"] .hk-hero-media .hk-hm-code{display:none}
@media(max-width:760px){.hk-hero{grid-template-columns:1fr !important}.hk-hero-media{aspect-ratio:16/9}}

.hk-sec{padding:calc(var(--hk-unit,9px) * var(--hk-sec-mult,5.5)) 0;border-top:1px solid var(--hk-border)}
.hk-sec.first{border-top:0}
[data-align="centered"] .hk-sec>.hk-kicker,[data-align="centered"] .hk-sec>.hk-h2{text-align:center}
[data-align="centered"] .hk-sec>.hk-h2{margin-left:auto;margin-right:auto}
.hk-grid3{display:grid;grid-template-columns:repeat(var(--hk-cols,3),1fr);gap:calc(var(--hk-unit,9px) * 2)}
@media(max-width:720px){.hk-grid3{grid-template-columns:1fr}}
.hk-card{background:var(--hk-surface);border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);padding:calc(var(--hk-unit,9px) * 2.7);transition:transform var(--hk-dur,200ms) var(--hk-ease,ease),box-shadow var(--hk-dur,200ms) var(--hk-ease,ease),border-color var(--hk-dur,200ms) var(--hk-ease,ease)}
.hk-card:hover{transform:translateY(-3px);box-shadow:var(--hk-shadow);border-color:var(--hk-border-strong)}
.hk-card-media{display:none;height:118px;border-radius:calc(var(--hk-r-card,14px) * .8);border:1px solid var(--hk-border);margin-bottom:calc(var(--hk-unit,9px) * 1.7);background:
  radial-gradient(120% 120% at 18% 8%, color-mix(in srgb,var(--hk-primary) 28%, transparent), transparent 60%), var(--hk-surface-2)}
[data-imagery="image-forward"] .hk-card-media{display:block}
[data-imagery="image-forward"] .hk-card .hk-ico{display:none}
.hk-ico{width:40px;height:40px;border-radius:calc(var(--hk-r-btn,8px) * 1.1);background:color-mix(in srgb,var(--hk-primary) 16%,transparent);display:flex;align-items:center;justify-content:center;color:var(--hk-primary);margin-bottom:calc(var(--hk-unit,9px) * 1.7);font-size:19px}
.hk-card h3{color:var(--hk-fg-strong);font-size:calc(var(--hk-t-body,16px) * 1.12);margin:0 0 8px;font-weight:670}
.hk-card p{margin:0;color:var(--hk-muted);font-size:var(--hk-t-sm,13px);line-height:1.6}
[data-arch="editorial"] .hk-card{background:transparent;border:0;border-top:1px solid var(--hk-border-strong);border-radius:0;padding-left:0;padding-right:0}
[data-arch="editorial"] .hk-card:hover{transform:none;box-shadow:none}
[data-arch="editorial"] .hk-ico{background:transparent;color:var(--hk-fg-strong);font-size:26px;width:auto;height:auto;margin-bottom:14px}
[data-arch="tool"] .hk-card{background:color-mix(in srgb,var(--hk-fg-strong) 3%,var(--hk-bg))}

.hk-metrics{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--hk-unit,9px) * 2);text-align:left}
@media(max-width:720px){.hk-metrics{grid-template-columns:repeat(2,1fr)}}
.hk-metric b{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);display:block;font-size:calc(var(--hk-t-h2,30px) * 1.1);font-weight:780;letter-spacing:-.02em;line-height:1}
.hk-metric span{color:var(--hk-muted);font-size:var(--hk-t-sm,13px);margin-top:6px;display:block}

.hk-price{display:grid;grid-template-columns:repeat(3,1fr);gap:calc(var(--hk-unit,9px) * 2);align-items:start}
@media(max-width:720px){.hk-price{grid-template-columns:1fr}}
.hk-tier{background:var(--hk-surface);border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);padding:calc(var(--hk-unit,9px) * 2.9)}
.hk-tier.hot{background:var(--hk-surface-2);border-color:var(--hk-primary);box-shadow:var(--hk-shadow);position:relative}
.hk-tier .ribbon{position:absolute;top:calc(var(--hk-unit,9px) * -1.4);left:50%;transform:translateX(-50%);background:var(--hk-primary);color:var(--hk-primary-fg,#fff);font-size:11px;font-weight:700;padding:4px 13px;border-radius:var(--hk-r-pill,999px);white-space:nowrap}
.hk-tier h3{color:var(--hk-fg-strong);margin:0 0 4px;font-size:var(--hk-t-body,16px);font-weight:670}
.hk-tier .amt{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:var(--hk-t-h2,30px);font-weight:780;margin:8px 0}
.hk-tier .amt em{font-style:normal;font-size:var(--hk-t-sm,13px);color:var(--hk-muted);font-weight:500}
.hk-tier ul{list-style:none;padding:0;margin:calc(var(--hk-unit,9px) * 1.9) 0;display:flex;flex-direction:column;gap:11px}
.hk-tier li{font-size:var(--hk-t-sm,13px);color:var(--hk-muted);display:flex;gap:9px;align-items:flex-start}
.hk-tier li::before{content:"✓";color:var(--hk-accent);font-weight:800;flex:none}
.hk-tier .hk-btn{width:100%;margin-top:calc(var(--hk-unit,9px) * 1)}

.hk-form{background:var(--hk-surface);border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);padding:calc(var(--hk-unit,9px) * 3.2);display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--hk-unit,9px) * 1.8);max-width:660px}
[data-align="centered"] .hk-form{margin-left:auto;margin-right:auto}
.hk-field{display:flex;flex-direction:column;gap:7px}
.hk-field.full{grid-column:1/-1}
.hk-field label{font-size:var(--hk-t-sm,13px);color:var(--hk-muted)}
.hk-input{font:inherit;font-size:var(--hk-t-sm,13px);padding:calc(var(--hk-unit,9px) * 1.2) calc(var(--hk-unit,9px) * 1.5);border-radius:var(--hk-r-btn,8px);border:1px solid var(--hk-border-strong);background:var(--hk-bg);color:var(--hk-fg-strong);transition:border-color var(--hk-dur,200ms) var(--hk-ease,ease),box-shadow var(--hk-dur,200ms) var(--hk-ease,ease);width:100%;text-align:left}
.hk-input::placeholder{color:var(--hk-muted)}
.hk-input:focus{outline:none;border-color:var(--hk-primary);box-shadow:0 0 0 3px color-mix(in srgb,var(--hk-primary) 28%,transparent)}
textarea.hk-input{resize:vertical;min-height:82px}
`;

// ============================ 控制台（dashboard） ============================
const DASH_STYLE = `
.db{display:grid;grid-template-columns:248px 1fr;min-height:76vh}
.db-side{border-right:1px solid var(--hk-border);background:var(--hk-surface);padding:calc(var(--hk-unit,9px)*2.6) calc(var(--hk-unit,9px)*2);display:flex;flex-direction:column;gap:calc(var(--hk-unit,9px)*2.4)}
.db-nav{display:flex;flex-direction:column;gap:3px}
.db-nav a{display:flex;align-items:center;gap:11px;padding:9px 12px;border-radius:var(--hk-r-btn,8px);color:var(--hk-muted);text-decoration:none;font-size:var(--hk-t-sm,13px);font-weight:550;transition:background var(--hk-dur,200ms) var(--hk-ease,ease),color var(--hk-dur,200ms) var(--hk-ease,ease)}
.db-nav a .di{width:15px;height:15px;border-radius:5px;background:currentColor;opacity:.45;flex:none}
.db-nav a:hover{background:var(--hk-surface-2);color:var(--hk-fg-strong)}
.db-nav a.on{background:color-mix(in srgb,var(--hk-primary) 15%,transparent);color:var(--hk-primary)}
.db-nav a.on .di{background:var(--hk-primary);opacity:1}
.db-upsell{margin-top:auto;border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);padding:calc(var(--hk-unit,9px)*1.9);background:
  radial-gradient(140% 120% at 100% 0%, color-mix(in srgb,var(--hk-primary) 22%, transparent), transparent 60%), var(--hk-surface-2)}
.db-upsell b{color:var(--hk-fg-strong);font-size:var(--hk-t-sm,13px);display:block;margin-bottom:5px}
.db-upsell p{margin:0 0 12px;color:var(--hk-muted);font-size:12px;line-height:1.55}
.db-main{padding:calc(var(--hk-unit,9px)*3.2) calc(var(--hk-unit,9px)*4);min-width:0}
.db-top{display:flex;align-items:center;gap:14px;margin-bottom:calc(var(--hk-unit,9px)*3)}
.db-top h1{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:calc(var(--hk-t-h2,30px)*.86);margin:0;font-weight:740;letter-spacing:-.015em}
.db-top .sub{color:var(--hk-muted);font-size:var(--hk-t-sm,13px);margin-top:3px}
.db-search{margin-left:auto;height:38px;min-width:210px;border:1px solid var(--hk-border);border-radius:var(--hk-r-btn,8px);background:var(--hk-surface);color:var(--hk-muted);font-size:13px;padding:0 14px;display:flex;align-items:center;gap:8px}
.db-search::before{content:"";width:13px;height:13px;border-radius:50%;border:1.6px solid currentColor;opacity:.6;flex:none}
.db-kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:calc(var(--hk-unit,9px)*2);margin-bottom:calc(var(--hk-unit,9px)*2.4)}
@media(max-width:900px){.db-kpis{grid-template-columns:repeat(2,1fr)}}
.db-kpi{border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);background:var(--hk-surface);padding:calc(var(--hk-unit,9px)*2.1)}
.db-kpi .kl{color:var(--hk-muted);font-size:12px}
.db-kpi .kv{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:calc(var(--hk-t-h2,30px)*.94);font-weight:770;letter-spacing:-.02em;margin:8px 0 6px;line-height:1}
.db-chip{display:inline-flex;align-items:center;gap:4px;font-size:11px;font-weight:700;padding:2px 8px;border-radius:var(--hk-r-pill,999px)}
.db-chip.up{color:#2fae66;background:color-mix(in srgb,#2fae66 16%,transparent)}
.db-chip.down{color:#e5555a;background:color-mix(in srgb,#e5555a 16%,transparent)}
.db-grid{display:grid;grid-template-columns:1.6fr 1fr;gap:calc(var(--hk-unit,9px)*2);margin-bottom:calc(var(--hk-unit,9px)*2.4)}
@media(max-width:900px){.db-grid{grid-template-columns:1fr}}
.db-panel{border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);background:var(--hk-surface);padding:calc(var(--hk-unit,9px)*2.3)}
.db-panel .ph{display:flex;align-items:center;justify-content:space-between;margin-bottom:calc(var(--hk-unit,9px)*2)}
.db-panel h3{color:var(--hk-fg-strong);font-size:var(--hk-t-body,16px);margin:0;font-weight:660}
.db-panel .ph span{color:var(--hk-muted);font-size:12px}
.db-bars{display:flex;align-items:flex-end;gap:9px;height:152px}
.db-bars i{flex:1;border-radius:6px 6px 0 0;background:linear-gradient(180deg,var(--hk-primary),color-mix(in srgb,var(--hk-primary) 35%,transparent));min-height:6px;transition:filter var(--hk-dur,200ms) var(--hk-ease,ease)}
.db-bars i.ac{background:linear-gradient(180deg,var(--hk-accent),color-mix(in srgb,var(--hk-accent) 35%,transparent))}
.db-bars:hover i{filter:brightness(1.08)}
.db-feed{display:flex;flex-direction:column;gap:calc(var(--hk-unit,9px)*1.7)}
.db-fi{display:flex;gap:11px;align-items:flex-start;font-size:var(--hk-t-sm,13px)}
.db-fi .dot{width:8px;height:8px;border-radius:50%;background:var(--hk-accent);margin-top:6px;flex:none}
.db-fi b{color:var(--hk-fg-strong);font-weight:600}
.db-fi span{color:var(--hk-muted)}
.db-fi time{color:var(--hk-muted);opacity:.75;font-size:12px;margin-left:auto;white-space:nowrap}
.db-table{border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);background:var(--hk-surface);overflow:hidden}
.db-tr{display:grid;grid-template-columns:2fr 1.1fr 1.3fr 1fr;gap:12px;padding:13px 20px;border-bottom:1px solid var(--hk-border);font-size:var(--hk-t-sm,13px);align-items:center}
.db-tr:last-child{border-bottom:0}
.db-th{color:var(--hk-muted);font-weight:600;background:var(--hk-surface-2);font-size:12px;text-transform:uppercase;letter-spacing:.04em}
.db-tr .nm{color:var(--hk-fg-strong);font-weight:560;display:flex;align-items:center;gap:10px}
.db-tr .nm .hk-av{width:26px;height:26px}
.db-st{display:inline-flex;align-items:center;gap:7px;color:var(--hk-muted)}
.db-st::before{content:"";width:7px;height:7px;border-radius:50%;background:var(--hk-muted)}
.db-st.ok{color:var(--hk-fg-strong)}.db-st.ok::before{background:#2fae66}
.db-st.wait::before{background:#e6a23a}
.db-st.run::before{background:var(--hk-accent)}
@media(max-width:760px){.db{grid-template-columns:1fr}.db-side{display:none}.db-tr{grid-template-columns:1.6fr 1fr 1fr}.db-tr .col-hide{display:none}}
`;

// ============================ 文章（article） ============================
const ARTICLE_STYLE = `
.ar{max-width:min(748px,92vw);margin:0 auto;padding:calc(var(--hk-unit,9px)*5) 0 calc(var(--hk-unit,9px)*6)}
.ar-cat{color:var(--hk-accent);font-weight:650;font-size:var(--hk-t-sm,13px);letter-spacing:.06em;text-transform:uppercase}
.ar-title{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:clamp(30px,var(--hk-t-display,46px),56px);line-height:1.08;letter-spacing:-.02em;font-weight:var(--hk-w-display,780);margin:calc(var(--hk-unit,9px)*1.6) 0 calc(var(--hk-unit,9px)*2.6)}
.ar-by{display:flex;align-items:center;gap:12px;color:var(--hk-muted);font-size:var(--hk-t-sm,13px);margin-bottom:calc(var(--hk-unit,9px)*3.2)}
.ar-by .hk-av{width:40px;height:40px}
.ar-by b{color:var(--hk-fg-strong);font-weight:600;display:block}
.ar-by .meta{opacity:.85}
.ar-cover{aspect-ratio:16/8;border-radius:var(--hk-r-card,14px);border:1px solid var(--hk-border);margin-bottom:calc(var(--hk-unit,9px)*3.6);background:
  radial-gradient(120% 120% at 15% 12%, color-mix(in srgb,var(--hk-primary) 34%, transparent), transparent 60%),
  radial-gradient(120% 120% at 95% 100%, color-mix(in srgb,var(--hk-accent) 30%, transparent), transparent 58%),
  var(--hk-surface-2)}
.ar-lead{font-size:var(--hk-t-lead,19px);color:var(--hk-fg-strong);line-height:1.7;margin:0 0 calc(var(--hk-unit,9px)*2.8);font-weight:500}
.ar p{color:var(--hk-fg);line-height:1.86;margin:0 0 calc(var(--hk-unit,9px)*2.4);font-size:calc(var(--hk-t-body,16px)*1.05)}
.ar h2{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:var(--hk-t-h2,30px);line-height:1.2;letter-spacing:-.01em;font-weight:var(--hk-w-h2,720);margin:calc(var(--hk-unit,9px)*3.6) 0 calc(var(--hk-unit,9px)*1.8)}
.ar-quote{border-left:3px solid var(--hk-primary);padding:2px 0 2px 24px;margin:calc(var(--hk-unit,9px)*3.4) 0;font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:calc(var(--hk-t-lead,19px)*1.28);line-height:1.45;font-weight:600;letter-spacing:-.01em}
.ar ul{color:var(--hk-fg);line-height:1.85;padding-left:22px;margin:0 0 calc(var(--hk-unit,9px)*2.4);font-size:calc(var(--hk-t-body,16px)*1.05)}
.ar ul li{margin-bottom:9px}
.ar ul li::marker{color:var(--hk-accent)}
.ar-tags{display:flex;gap:9px;flex-wrap:wrap;margin-top:calc(var(--hk-unit,9px)*3.4)}
.ar-tag{font-size:12px;color:var(--hk-muted);border:1px solid var(--hk-border);border-radius:var(--hk-r-pill,999px);padding:5px 14px}
.ar-author{display:flex;gap:15px;align-items:center;margin-top:calc(var(--hk-unit,9px)*3.4);padding-top:calc(var(--hk-unit,9px)*3);border-top:1px solid var(--hk-border)}
.ar-author .hk-av{width:52px;height:52px}
.ar-author b{color:var(--hk-fg-strong);font-weight:650}
.ar-author p{margin:4px 0 0;color:var(--hk-muted);font-size:var(--hk-t-sm,13px);line-height:1.6}
`;

// ============================ 商店（shop） ============================
const SHOP_STYLE = `
.sh-head{padding:calc(var(--hk-unit,9px)*4) 0 calc(var(--hk-unit,9px)*1)}
.sh-head h1{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:var(--hk-t-h2,30px);font-weight:var(--hk-w-h2,720);letter-spacing:-.015em;margin:0}
.sh-head p{color:var(--hk-muted);font-size:var(--hk-t-sm,13px);margin:8px 0 0}
.sh-bar{display:flex;align-items:center;gap:9px;padding:calc(var(--hk-unit,9px)*2.4) 0;flex-wrap:wrap;border-bottom:1px solid var(--hk-border);margin-bottom:calc(var(--hk-unit,9px)*3)}
.sh-chip{font-size:var(--hk-t-sm,13px);color:var(--hk-muted);border:1px solid var(--hk-border);border-radius:var(--hk-r-pill,999px);padding:7px 15px;cursor:pointer;transition:.15s;background:var(--hk-bg)}
.sh-chip:hover{color:var(--hk-fg-strong);border-color:var(--hk-border-strong)}
.sh-chip.on{background:var(--hk-fg-strong);color:var(--hk-bg);border-color:transparent}
.sh-sort{margin-left:auto;color:var(--hk-muted);font-size:var(--hk-t-sm,13px);display:flex;align-items:center;gap:7px}
.sh-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(228px,1fr));gap:calc(var(--hk-unit,9px)*2.4);padding-bottom:calc(var(--hk-unit,9px)*4)}
.sh-card{border:1px solid var(--hk-border);border-radius:var(--hk-r-card,14px);overflow:hidden;background:var(--hk-surface);transition:transform var(--hk-dur,200ms) var(--hk-ease,ease),box-shadow var(--hk-dur,200ms) var(--hk-ease,ease),border-color var(--hk-dur,200ms) var(--hk-ease,ease)}
.sh-card:hover{transform:translateY(-4px);box-shadow:var(--hk-shadow);border-color:var(--hk-border-strong)}
.sh-media{position:relative;aspect-ratio:4/5;border-bottom:1px solid var(--hk-border);background:
  radial-gradient(130% 110% at 25% 15%, color-mix(in srgb,var(--hk-primary) 30%, transparent), transparent 62%),
  radial-gradient(130% 110% at 90% 100%, color-mix(in srgb,var(--hk-accent) 26%, transparent), transparent 58%),
  var(--hk-surface-2)}
.sh-badge{position:absolute;top:12px;left:12px;background:var(--hk-primary);color:var(--hk-primary-fg,#fff);font-size:11px;font-weight:700;padding:4px 11px;border-radius:var(--hk-r-pill,999px)}
.sh-badge.mut{background:var(--hk-fg-strong);color:var(--hk-bg)}
.sh-body{padding:calc(var(--hk-unit,9px)*1.9)}
.sh-body h3{color:var(--hk-fg-strong);font-size:var(--hk-t-body,16px);margin:0 0 3px;font-weight:600}
.sh-body .sub{color:var(--hk-muted);font-size:12px;margin-bottom:11px}
.sh-row{display:flex;align-items:center;justify-content:space-between;gap:10px}
.sh-price{color:var(--hk-fg-strong);font-weight:700;font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);font-size:calc(var(--hk-t-body,16px)*1.05)}
.sh-price s{color:var(--hk-muted);font-weight:400;font-size:12px;margin-left:7px}
.sh-stars{color:var(--hk-accent);font-size:12px;letter-spacing:1px}
.sh-add{width:36px;height:36px;border-radius:var(--hk-r-btn,8px);border:1px solid var(--hk-border);background:var(--hk-bg);color:var(--hk-fg-strong);cursor:pointer;font-size:17px;line-height:1;transition:.15s;flex:none}
.sh-add:hover{background:var(--hk-primary);color:var(--hk-primary-fg,#fff);border-color:transparent}
`;

// ============================ 作品集（portfolio） ============================
const PORT_STYLE = `
.pf-hero{padding:calc(var(--hk-unit,9px)*var(--hk-sec-mult,5.5)*1.2) 0 calc(var(--hk-unit,9px)*var(--hk-sec-mult,5.5))}
.pf-hero h1{font-family:var(--hk-font-display,inherit),var(--hk-font,system-ui);color:var(--hk-fg-strong);font-size:clamp(32px,var(--hk-t-display,46px),74px);line-height:1.02;letter-spacing:-.03em;font-weight:var(--hk-w-display,780);max-width:18ch;margin:0}
.pf-hero p{color:var(--hk-muted);font-size:var(--hk-t-lead,19px);max-width:50ch;margin:calc(var(--hk-unit,9px)*2.6) 0 0;line-height:1.55}
.pf-work{display:grid;grid-template-columns:1fr 1fr;gap:calc(var(--hk-unit,9px)*2.6);padding-bottom:calc(var(--hk-unit,9px)*4)}
@media(max-width:720px){.pf-work{grid-template-columns:1fr}}
.pf-tile .m{aspect-ratio:4/3;border-radius:var(--hk-r-card,14px);border:1px solid var(--hk-border);overflow:hidden;transition:transform var(--hk-dur,200ms) var(--hk-ease,ease),box-shadow var(--hk-dur,200ms) var(--hk-ease,ease)}
.pf-tile:nth-child(1) .m{background:radial-gradient(130% 120% at 20% 10%, color-mix(in srgb,var(--hk-primary) 40%,transparent), transparent 62%), var(--hk-surface-2)}
.pf-tile:nth-child(2) .m{background:radial-gradient(130% 120% at 85% 15%, color-mix(in srgb,var(--hk-accent) 40%,transparent), transparent 62%), var(--hk-surface-2)}
.pf-tile:nth-child(3) .m{background:radial-gradient(130% 120% at 50% 100%, color-mix(in srgb,var(--hk-primary) 32%,transparent), transparent 60%), var(--hk-surface-2)}
.pf-tile:nth-child(4) .m{background:radial-gradient(130% 120% at 10% 90%, color-mix(in srgb,var(--hk-accent) 34%,transparent), transparent 60%), var(--hk-surface-2)}
.pf-tile:hover .m{transform:translateY(-4px);box-shadow:var(--hk-shadow)}
.pf-cap{display:flex;justify-content:space-between;align-items:baseline;margin-top:15px;gap:12px}
.pf-cap b{color:var(--hk-fg-strong);font-weight:620;font-size:calc(var(--hk-t-body,16px)*1.08)}
.pf-cap span{color:var(--hk-muted);font-size:var(--hk-t-sm,13px)}
.pf-index{padding-bottom:calc(var(--hk-unit,9px)*3)}
.pf-index .lbl{color:var(--hk-muted);font-size:12px;text-transform:uppercase;letter-spacing:.1em;padding-bottom:14px;border-bottom:1px solid var(--hk-border-strong)}
.pf-row{display:grid;grid-template-columns:64px 1.4fr 1fr 40px;gap:16px;padding:calc(var(--hk-unit,9px)*2) 0;border-bottom:1px solid var(--hk-border);align-items:center;color:var(--hk-muted);font-size:var(--hk-t-sm,13px);transition:.15s}
.pf-row:hover{padding-left:8px}
.pf-row b{color:var(--hk-fg-strong);font-weight:600}
.pf-row .go{text-align:right;color:var(--hk-accent);font-size:16px}
`;

// ---- 共享片段：导航 / 页脚 ----
const NAV = `
<header class="hk-wrap hk-nav">
  <span class="hk-brand"><span class="hk-logo"></span>Northwind</span>
  <span class="links"><a href="#">产品</a><a href="#">方案</a><a href="#">定价</a><a href="#">文档</a><a href="#">博客</a></span>
  <button class="hk-btn ghost">登录</button>
  <button class="hk-btn pri pill">免费试用</button>
</header>`;

const FOOTER = `
<footer class="hk-wrap hk-foot">
  <div class="col"><span class="hk-brand"><span class="hk-logo"></span>Northwind</span><span>更快地把想法变成产品。</span></div>
  <div class="col"><b>产品</b><a href="#">功能</a><a href="#">定价</a><a href="#">更新日志</a></div>
  <div class="col"><b>资源</b><a href="#">文档</a><a href="#">API</a><a href="#">社区</a></div>
  <div class="col"><b>公司</b><a href="#">关于</a><a href="#">博客</a><a href="#">招聘</a></div>
</footer>`;

// ---- 各类别骨架 ----
const BODY_LANDING = NAV + `
<main>
  <section class="hk-hero-wrap"><div class="hk-wrap hk-hero">
    <div class="hk-hero-copy">
      <span class="hk-eyebrow"><span class="dot"></span>全新 2.0 已发布</span>
      <h1 class="hk-h1">把想法更快地<br/>变成可用的产品</h1>
      <p class="hk-lead">一个为团队打造的现代化工作台，从构思到上线只需一处。专注在真正重要的事，其余交给我们。</p>
      <div class="hk-cta">
        <button class="hk-btn pri">开始使用</button>
        <button class="hk-btn ghost">查看演示 →</button>
      </div>
      <div class="hk-trust"><span class="hk-avatars"><i></i><i></i><i></i><i></i></span>已被 12,000+ 团队信赖</div>
    </div>
    <div class="hk-hero-media" aria-hidden="true">
      <div class="hk-hm-glass"></div>
      <div class="hk-hm-code"><i></i><i></i><i></i><i></i><i></i><i></i></div>
    </div>
  </div></section>

  <section class="hk-wrap hk-sec first">
    <div class="hk-kicker">核心能力</div>
    <h2 class="hk-h2">为效率而生的每一个细节</h2>
    <div class="hk-grid3">
      <div class="hk-card"><div class="hk-card-media"></div><div class="hk-ico">◈</div><h3>实时协作</h3><p>团队成员在同一处并肩工作，改动即时同步，冲突自动消解。</p></div>
      <div class="hk-card"><div class="hk-card-media"></div><div class="hk-ico">◆</div><h3>智能自动化</h3><p>把重复的流程交给规则与自动化，让人专注在需要判断的地方。</p></div>
      <div class="hk-card"><div class="hk-card-media"></div><div class="hk-ico">●</div><h3>安全合规</h3><p>企业级权限与审计，数据加密存储，满足主流合规要求。</p></div>
    </div>
  </section>

  <section class="hk-wrap hk-sec">
    <div class="hk-metrics">
      <div class="hk-metric"><b>99.9%</b><span>服务可用性</span></div>
      <div class="hk-metric"><b>12k+</b><span>活跃团队</span></div>
      <div class="hk-metric"><b>40ms</b><span>平均响应</span></div>
      <div class="hk-metric"><b>4.9/5</b><span>用户评分</span></div>
    </div>
  </section>

  <section class="hk-wrap hk-sec">
    <div class="hk-kicker">定价</div>
    <h2 class="hk-h2">按需选择，随时升级</h2>
    <div class="hk-price">
      <div class="hk-tier"><h3>入门</h3><div class="amt">¥0 <em>/ 月</em></div><ul><li>最多 3 名成员</li><li>基础协作</li><li>社区支持</li></ul><button class="hk-btn ghost">开始使用</button></div>
      <div class="hk-tier hot"><span class="ribbon">最受欢迎</span><h3>专业</h3><div class="amt">¥99 <em>/ 月</em></div><ul><li>无限成员</li><li>智能自动化</li><li>优先支持</li><li>高级分析</li></ul><button class="hk-btn pri">升级专业版</button></div>
      <div class="hk-tier"><h3>企业</h3><div class="amt">定制 <em>联系我们</em></div><ul><li>专属部署</li><li>SSO 与审计</li><li>SLA 保障</li></ul><button class="hk-btn ghost">联系销售</button></div>
    </div>
  </section>

  <section class="hk-wrap hk-sec">
    <div class="hk-kicker">开始</div>
    <h2 class="hk-h2">留个邮箱，我们带你上手</h2>
    <form class="hk-form" onsubmit="return false">
      <div class="hk-field"><label>姓名</label><input class="hk-input" placeholder="你的名字"/></div>
      <div class="hk-field"><label>邮箱</label><input class="hk-input" type="email" placeholder="you@company.com"/></div>
      <div class="hk-field full"><label>想解决什么问题？</label><textarea class="hk-input" placeholder="简单描述一下你的场景…"></textarea></div>
      <div class="hk-field full"><button class="hk-btn pri" type="submit">提交并预约演示</button></div>
    </form>
  </section>
</main>` + FOOTER;

const BODY_DASH = `
<div class="db">
  <aside class="db-side">
    <span class="hk-brand"><span class="hk-logo"></span>Northwind</span>
    <nav class="db-nav">
      <a class="on"><span class="di"></span>总览</a>
      <a><span class="di"></span>项目</a>
      <a><span class="di"></span>分析</a>
      <a><span class="di"></span>团队</a>
      <a><span class="di"></span>集成</a>
      <a><span class="di"></span>设置</a>
    </nav>
    <div class="db-upsell"><b>升级到专业版</b><p>解锁高级分析、无限成员与优先支持。</p><button class="hk-btn pri" style="width:100%">立即升级</button></div>
  </aside>
  <main class="db-main">
    <div class="db-top">
      <div><h1>总览</h1><div class="sub">欢迎回来，这是本周的团队概况</div></div>
      <div class="db-search">搜索项目、成员…</div>
      <button class="hk-btn pri">＋ 新建项目</button>
    </div>
    <div class="db-kpis">
      <div class="db-kpi"><div class="kl">活跃项目</div><div class="kv">128</div><span class="db-chip up">▲ 12%</span></div>
      <div class="db-kpi"><div class="kl">本周完成</div><div class="kv">1,204</div><span class="db-chip up">▲ 8%</span></div>
      <div class="db-kpi"><div class="kl">平均周期</div><div class="kv">3.2d</div><span class="db-chip down">▼ 5%</span></div>
      <div class="db-kpi"><div class="kl">团队满意度</div><div class="kv">94%</div><span class="db-chip up">▲ 2%</span></div>
    </div>
    <div class="db-grid">
      <div class="db-panel">
        <div class="ph"><h3>吞吐趋势</h3><span>最近 12 周</span></div>
        <div class="db-bars"><i style="height:44%"></i><i style="height:58%"></i><i style="height:39%"></i><i style="height:72%"></i><i style="height:53%"></i><i style="height:81%"></i><i style="height:64%"></i><i class="ac" style="height:96%"></i><i style="height:70%"></i><i style="height:85%"></i><i style="height:60%"></i><i style="height:78%"></i></div>
      </div>
      <div class="db-panel">
        <div class="ph"><h3>近期动态</h3></div>
        <div class="db-feed">
          <div class="db-fi"><span class="dot"></span><div><b>李桉</b> <span>合并了「结算重构」</span></div><time>10m</time></div>
          <div class="db-fi"><span class="dot"></span><div><b>Mira</b> <span>创建了里程碑 v2.0</span></div><time>1h</time></div>
          <div class="db-fi"><span class="dot"></span><div><b>周珂</b> <span>关闭了 3 个问题</span></div><time>3h</time></div>
          <div class="db-fi"><span class="dot"></span><div><b>Dev</b> <span>部署到生产环境</span></div><time>昨天</time></div>
        </div>
      </div>
    </div>
    <div class="db-table">
      <div class="db-tr db-th"><span>项目</span><span>状态</span><span class="col-hide">负责人</span><span>更新</span></div>
      <div class="db-tr"><span class="nm"><span class="hk-av"></span>结算系统重构</span><span class="db-st ok">已上线</span><span class="col-hide">李桉</span><span>10 分钟前</span></div>
      <div class="db-tr"><span class="nm"><span class="hk-av"></span>移动端改版</span><span class="db-st run">进行中</span><span class="col-hide">Mira</span><span>1 小时前</span></div>
      <div class="db-tr"><span class="nm"><span class="hk-av"></span>数据看板 v2</span><span class="db-st wait">待评审</span><span class="col-hide">周珂</span><span>3 小时前</span></div>
      <div class="db-tr"><span class="nm"><span class="hk-av"></span>权限体系梳理</span><span class="db-st run">进行中</span><span class="col-hide">Dev</span><span>昨天</span></div>
    </div>
  </main>
</div>`;

const BODY_ARTICLE = NAV + `
<main class="hk-wrap"><article class="ar">
  <div class="ar-cat">产品设计</div>
  <h1 class="ar-title">克制，是一种更高级的表达</h1>
  <div class="ar-by">
    <span class="hk-av"></span>
    <div><b>林知远</b><span class="meta">设计主理人 · 2026 年 3 月 12 日 · 6 分钟阅读</span></div>
  </div>
  <div class="ar-cover" aria-hidden="true"></div>
  <p class="ar-lead">好的界面不是把所有东西都塞进画面，而是懂得留白与取舍。当每一个元素都有存在的理由，产品自然会呈现出一种沉静的力量。</p>
  <p>我们常说"少即是多"，但克制并不意味着简陋。它要求设计者对信息层级有清晰的判断：什么是主角，什么是配角，什么根本不必出现。真正的难点不在于做加法，而在于有底气地做减法。</p>
  <h2>从测量出发，而非直觉</h2>
  <p>与其凭感觉调整间距和字号，不如建立一套可复现的系统：基于基准栅格的间距阶、有比例关系的字阶、带角色的色板。系统一旦成立，团队的每一次决策都会更快、更一致，也更经得起推敲。</p>
  <blockquote class="ar-quote">"约束不是创造力的敌人，恰恰是它最好的伙伴。"</blockquote>
  <p>当色彩、字体、圆角、动效都被收敛进有限的选择里，设计师反而能把注意力放回真正重要的地方——内容本身，以及人如何理解它。</p>
  <h2>让规则可被继承</h2>
  <ul>
    <li>把设计决策沉淀成 token，而不是散落在各处的魔法数字；</li>
    <li>用文档记录"为什么"，让新成员快速对齐判断标准；</li>
    <li>用校验回归产出，确保规则真正被执行，而非停留在纸面。</li>
  </ul>
  <p>当这些都到位，设计语言就不再依赖某一个人的品味，而成为团队共同的资产——这，才是可持续的好看。</p>
  <div class="ar-tags"><span class="ar-tag">设计系统</span><span class="ar-tag">排版</span><span class="ar-tag">留白</span><span class="ar-tag">Design Tokens</span></div>
  <div class="ar-author">
    <span class="hk-av"></span>
    <div><b>林知远</b><p>关注可复用的设计系统与写作。相信克制、秩序与长期主义。</p></div>
  </div>
</article></main>` + FOOTER;

const BODY_SHOP = NAV + `
<main class="hk-wrap">
  <div class="sh-head"><h1>本季新品</h1><p>为日常挑选的、经得起时间的物件。</p></div>
  <div class="sh-bar">
    <span class="sh-chip on">全部</span>
    <span class="sh-chip">服饰</span>
    <span class="sh-chip">配件</span>
    <span class="sh-chip">家居</span>
    <span class="sh-chip">文具</span>
    <span class="sh-sort">排序：推荐 ▾</span>
  </div>
  <div class="sh-grid">
    <div class="sh-card"><div class="sh-media"><span class="sh-badge">新品</span></div><div class="sh-body"><h3>羊毛针织开衫</h3><div class="sub">3 色可选</div><div class="sh-row"><span class="sh-price">¥499</span><span class="sh-stars">★★★★★</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
    <div class="sh-card"><div class="sh-media"><span class="sh-badge mut">-20%</span></div><div class="sh-body"><h3>极简皮革手袋</h3><div class="sub">头层牛皮</div><div class="sh-row"><span class="sh-price">¥899 <s>¥1120</s></span><span class="sh-stars">★★★★☆</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
    <div class="sh-card"><div class="sh-media"></div><div class="sh-body"><h3>陶瓷手冲套装</h3><div class="sub">哑光釉面</div><div class="sh-row"><span class="sh-price">¥329</span><span class="sh-stars">★★★★★</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
    <div class="sh-card"><div class="sh-media"><span class="sh-badge">新品</span></div><div class="sh-body"><h3>黄铜台灯</h3><div class="sub">暖光可调</div><div class="sh-row"><span class="sh-price">¥659</span><span class="sh-stars">★★★★☆</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
    <div class="sh-card"><div class="sh-media"></div><div class="sh-body"><h3>亚麻抱枕</h3><div class="sub">水洗质感</div><div class="sh-row"><span class="sh-price">¥189</span><span class="sh-stars">★★★★★</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
    <div class="sh-card"><div class="sh-media"><span class="sh-badge mut">-15%</span></div><div class="sh-body"><h3>硬壳笔记本</h3><div class="sub">道林纸内页</div><div class="sh-row"><span class="sh-price">¥89 <s>¥105</s></span><span class="sh-stars">★★★★☆</span></div><div class="sh-row" style="margin-top:11px"><span class="sh-price">加入购物袋</span><button class="sh-add">＋</button></div></div></div>
  </div>
</main>` + FOOTER;

const BODY_PORT = NAV + `
<main class="hk-wrap">
  <section class="pf-hero">
    <h1>我们把复杂的问题，做成克制的界面。</h1>
    <p>一间专注于品牌与数字产品的独立工作室。为敢于不同的团队，打造经得起推敲的设计系统。</p>
  </section>
  <section class="pf-work">
    <div class="pf-tile"><div class="m"></div><div class="pf-cap"><b>Aster 金融</b><span>品牌 · 产品</span></div></div>
    <div class="pf-tile"><div class="m"></div><div class="pf-cap"><b>Nori 编辑器</b><span>Web App</span></div></div>
    <div class="pf-tile"><div class="m"></div><div class="pf-cap"><b>Loom 播客</b><span>品牌 · 网站</span></div></div>
    <div class="pf-tile"><div class="m"></div><div class="pf-cap"><b>Peak 户外</b><span>电商</span></div></div>
  </section>
  <section class="pf-index">
    <div class="pf-row lbl"><span>年份</span><span>客户</span><span>服务</span><span></span></div>
    <div class="pf-row"><span>2026</span><b>Aster 金融</b><span>品牌识别、设计系统</span><span class="go">→</span></div>
    <div class="pf-row"><span>2025</span><b>Nori 编辑器</b><span>产品设计、前端</span><span class="go">→</span></div>
    <div class="pf-row"><span>2025</span><b>Loom 播客</b><span>品牌、网站</span><span class="go">→</span></div>
    <div class="pf-row"><span>2024</span><b>Peak 户外</b><span>电商体验</span><span class="go">→</span></div>
  </section>
</main>` + FOOTER;

// 类别注册表：label 供画廊切换器展示，style/body 供服务端组装
const VARIANTS = {
  landing: { label: "落地页", style: LANDING_STYLE, body: BODY_LANDING },
  dashboard: { label: "控制台", style: DASH_STYLE, body: BODY_DASH },
  article: { label: "文章", style: ARTICLE_STYLE, body: BODY_ARTICLE },
  shop: { label: "商店", style: SHOP_STYLE, body: BODY_SHOP },
  portfolio: { label: "作品集", style: PORT_STYLE, body: BODY_PORT },
};
export const DEMO_VARIANTS = Object.keys(VARIANTS).map((k) => ({ id: k, label: VARIANTS[k].label }));

// —— 页面内脚本：token→变量 映射 + 布局原型推导 + hkRenderTokens 入口 ——
// 注意：本字符串会被嵌入 HTML，故只用单引号与字符串拼接，绝不使用反引号或 ${}，
// 以免与 Node 模板字面量冲突或提前闭合 <script>。
const DEMO_SCRIPT = `
(function(){
  function parseHex(hex){
    if(typeof hex!=='string') return null;
    var s=hex.trim();
    var m=s.match(/^#([0-9a-fA-F]{3})$/);
    if(m){var h=m[1];return {r:parseInt(h[0]+h[0],16),g:parseInt(h[1]+h[1],16),b:parseInt(h[2]+h[2],16)};}
    m=s.match(/^#([0-9a-fA-F]{6})$/);
    if(m){var h2=m[1];return {r:parseInt(h2.slice(0,2),16),g:parseInt(h2.slice(2,4),16),b:parseInt(h2.slice(4,6),16)};}
    return null;
  }
  function hx(n){n=Math.max(0,Math.min(255,Math.round(n)));var s=n.toString(16);return s.length<2?'0'+s:s;}
  function toHex(c){return '#'+hx(c.r)+hx(c.g)+hx(c.b);}
  function lum(c){var f=function(v){v/=255;return v<=0.03928?v/12.92:Math.pow((v+0.055)/1.055,2.4);};return 0.2126*f(c.r)+0.7152*f(c.g)+0.0722*f(c.b);}
  function lumHex(hex){var c=parseHex(hex);return c?lum(c):0;}
  function readable(hex){var c=parseHex(hex);if(!c) return '#ffffff';return lum(c)>0.42?'#0b0b0f':'#ffffff';}
  function val(o){return (o&&o.$value!=null)?o.$value:null;}
  function num(v){var n=parseFloat(v);return isNaN(n)?null:n;}
  function clamp(n,a,b){return Math.max(a,Math.min(b,n));}
  function contrast(a,b){var ca=parseHex(a),cb=parseHex(b);if(!ca||!cb)return null;var la=lum(ca),lb=lum(cb);var hi=Math.max(la,lb),lo=Math.min(la,lb);return (hi+0.05)/(lo+0.05);}
  function mix(a,b,ra){var ca=parseHex(a),cb=parseHex(b);if(!ca||!cb)return a||b;return toHex({r:ca.r*ra+cb.r*(1-ra),g:ca.g*ra+cb.g*(1-ra),b:ca.b*ra+cb.b*(1-ra)});}
  function toContrast(hex,bg,target,towardLight){
    var base=hex||(towardLight?'#ffffff':'#000000');
    var goal=towardLight?'#ffffff':'#0a0a0c';
    for(var r=1;r>=0;r-=0.06){var cand=mix(goal,base,1-r);if((contrast(cand,bg)||0)>=target)return cand;}
    return goal;
  }

  function tokensToVars(t){
    t=t||{};
    var color=t.color||{},font=t.font||{},fs=t.fontSize||{},rad=t.radius||{},sh=t.shadow||{},dur=t.duration||{},eas=t.easing||{};
    var meta=(t.$extensions&&t.$extensions['haokan.meta'])||{};
    var mode=meta.mode||'light';
    var bg=val(color.background)||(mode==='dark'?'#0b0b0f':'#ffffff');
    var dark=lumHex(bg)<0.5;

    var inkCands=[];
    ['foreground','surface-1','surface-2','surface-3','muted-1','muted-2','muted-3'].forEach(function(k){
      var v=val(color[k]); if(v) inkCands.push(v);
    });
    var strong=null,strongC=0;
    for(var i=0;i<inkCands.length;i++){
      var cand=inkCands[i]; var cc=contrast(cand,bg); if(cc==null) continue;
      var onSide = dark ? lumHex(cand)>0.55 : lumHex(cand)<0.42;
      if(onSide && cc>strongC){strongC=cc;strong=cand;}
    }
    if(!strong || strongC<6){ strong=toContrast(strong||val(color.foreground),bg,dark?11:12,dark); }
    var fgRole=val(color.foreground);
    var fg;
    if(fgRole && (contrast(fgRole,bg)||0)>=4.2 && (dark?lumHex(fgRole)>0.45:lumHex(fgRole)<0.5)) fg=fgRole;
    else fg=mix(strong,bg,dark?0.80:0.74);
    if((contrast(fg,bg)||0)<4) fg=mix(strong,bg,dark?0.86:0.82);
    var mutedRole=val(color['muted-1'])||val(color['muted-2']);
    var muted=mix(fg,bg,0.66);
    if(mutedRole){var mc=contrast(mutedRole,bg); if(mc!=null&&mc>=2.9&&mutedRole.toLowerCase()!==fg.toLowerCase()) muted=mutedRole;}

    var primary=val(color.primary)||val(color['accent-1'])||(dark?'#8fa6ff':'#3b82f6');
    var accent=val(color['accent-1'])||val(color.secondary)||val(color['accent-2'])||primary;
    if(accent.toLowerCase()===primary.toLowerCase()){var alt=val(color.secondary)||val(color['accent-2'])||val(color['accent-3']); if(alt) accent=alt;}
    if((contrast(accent,bg)||0)<2.4) accent=toContrast(accent,bg,3,dark);

    var border=val(color.border);
    if(!border || (contrast(border,bg)||0)>4.5) border=mix(strong,bg,dark?0.16:0.14);
    var borderStrong=mix(strong,bg,dark?0.30:0.24);
    var surface=mix(strong,bg,dark?0.055:0.035);
    var surface2=mix(strong,bg,dark?0.10:0.07);

    var fontMain=val(font.primary)||'system-ui,sans-serif';
    var fontDisp=val(font.display)||fontMain;
    var monoRaw=val(font.secondary)||'';
    var isMono=/mono|code|consol|menlo|courier|iosevka|hack|fira\\s*code|jetbrains/i.test(monoRaw);
    var fontMono=isMono?monoRaw:'ui-monospace,SFMono-Regular,Menlo,monospace';

    var radDefault=num(val(rad.default));
    var radNums=Object.keys(rad).filter(function(k){return k!=='default';}).map(function(k){return num(val(rad[k]));}).filter(function(n){return n!=null;}).sort(function(a,b){return a-b;});
    var isPill=(meta.radiusStyle==='pill')||radNums.some(function(n){return n>=100;})||(radDefault!=null&&radDefault>=100);
    var small=radNums.filter(function(n){return n<40;});
    var rBtn=(radDefault!=null&&radDefault<40)?radDefault:(small.length?small[0]:8);
    rBtn=clamp(rBtn,0,16);
    var cardCands=radNums.filter(function(n){return n>=4&&n<40;});
    var rCard=cardCands.length?Math.min(Math.max.apply(null,cardCands),22):clamp(Math.round(rBtn*1.5),8,18);
    if(rCard<rBtn) rCard=rBtn;
    var rPill=isPill?'999px':(rCard+'px');

    var shVals=Object.keys(sh).map(function(k){return val(sh[k]);}).filter(Boolean);
    var outer=shVals.filter(function(s){return s.indexOf('inset')<0 && /[1-9]/.test(s);});
    var shadow=outer.length?outer[outer.length-1]:(dark?'0 18px 48px -12px rgba(0,0,0,.6)':'0 18px 40px -16px rgba(15,20,40,.22)');

    var displayPx=num(val(fs.display))||num(val(fs['3xl']))||num(val(fs['2xl']))||40;
    var ratio=num(meta.typeRatio)||1.2;
    var hasDispFont=!!(val(font.display)&&val(font.display)!==fontMain);
    var density=meta.density||'balanced';
    var arch;
    if(displayPx>=46 || (hasDispFont&&ratio>=1.3)) arch='editorial';
    else if(dark && isMono) arch='tool';
    else if(isMono && (density==='compact')) arch='tool';
    else arch='marketing';

    var dispMax=arch==='editorial'?84:56;
    var tDisplay=clamp(displayPx, 30, dispMax);
    var h2raw=num(val(fs['2xl']))||num(val(fs.xl))||Math.round(tDisplay*0.6);
    var tH2=clamp(Math.min(h2raw, tDisplay*0.78), 22, arch==='editorial'?44:38);
    var tLead=clamp(num(val(fs.xl))||num(val(fs.lg))||19, 16, 24);
    var tBody=clamp(num(val(fs.body))||num(val(fs.lg))||16, 14, 18);
    var tSm=clamp(num(val(fs.xs))||num(val(fs.body))||13, 12, 15);

    var unit=density==='compact'?8:(density==='spacious'?12:9);
    var wDisp=arch==='editorial'?760:800;
    var wH2=arch==='editorial'?640:720;

    var durList=Object.keys(dur).map(function(k){return val(dur[k]);}).filter(Boolean);
    var d=durList[0]||'200ms';
    var easList=Object.keys(eas).map(function(k){return val(eas[k]);}).filter(function(e){return e&&e!=='linear'&&e!=='steps(1)';});
    var e=easList[0]||'cubic-bezier(.2,.7,.2,1)';

    return {
      vars:{
        '--hk-bg':bg,'--hk-fg-strong':strong,'--hk-fg':fg,'--hk-muted':muted,
        '--hk-primary':primary,'--hk-primary-fg':readable(primary),'--hk-accent':accent,
        '--hk-border':border,'--hk-border-strong':borderStrong,
        '--hk-surface':surface,'--hk-surface-2':surface2,
        '--hk-font':fontMain,'--hk-font-display':fontDisp,'--hk-font-mono':fontMono,
        '--hk-r-btn':rBtn+'px','--hk-r-card':rCard+'px','--hk-r-pill':rPill,
        '--hk-shadow':shadow,
        '--hk-t-display':tDisplay+'px','--hk-t-h2':tH2+'px','--hk-t-lead':tLead+'px','--hk-t-body':tBody+'px','--hk-t-sm':tSm+'px',
        '--hk-w-display':String(wDisp),'--hk-w-h2':String(wH2),
        '--hk-unit':unit+'px','--hk-dur':d,'--hk-ease':e
      },
      arch:arch
    };
  }

  window.hkRenderTokens=function(t){
    var out=tokensToVars(t);
    var root=document.documentElement;
    for(var k in out.vars){ if(out.vars[k]!=null) root.style.setProperty(k, out.vars[k]); }

    var layout=(t.$extensions&&t.$extensions['haokan.layout'])||null;
    var heroType='left',align='left-aligned',imagery='minimal',cols=3,mult=5.5,container=1080,heroMedia=false;
    if(layout){
      if(layout.containerWidth) container=layout.containerWidth;
      if(layout.gridColumns>=2) cols=layout.gridColumns;
      mult=layout.rhythm==='tight'?4.2:(layout.rhythm==='generous'?7:5.5);
      heroType=(layout.hero&&layout.hero.type)||'left';
      align=layout.alignment||'left-aligned';
      imagery=layout.imagery||'minimal';
      heroMedia=!!(layout.hero&&layout.hero.hasImage);
      // 渲染时纠偏：部分已提炼资产存了矛盾数据（hero.type=centered 但 hero.align=left/right，
      // 系早期几何中心误判所致）。此处直接信任标题对齐，把这类 Hero 还原为左对齐构图，
      // 无需重新爬取即可修好存量资产（含图→split 左文右图，否则→left 单列左对齐）。
      var heroAlign=(layout.hero&&layout.hero.align)||'';
      if(heroType==='centered' && /left|right/.test(heroAlign)){
        heroType = heroMedia ? 'split' : 'left';
      }
    }
    if(out.arch==='editorial' && heroType!=='centered'){ heroType='split'; heroMedia=true; }
    cols=clamp(cols,2,4);
    container=clamp(container,900,1360);
    root.style.setProperty('--hk-container',container+'px');
    root.style.setProperty('--hk-cols',String(cols));
    root.style.setProperty('--hk-sec-mult',String(mult));
    root.setAttribute('data-arch',out.arch);
    root.setAttribute('data-hero',heroType);
    root.setAttribute('data-align',align);
    root.setAttribute('data-imagery',imagery);
    root.setAttribute('data-hero-media',heroMedia?'1':'0');
    root.setAttribute('data-hk-ready','1');
  };

  document.addEventListener('DOMContentLoaded', function(){
    if(window.__HK_TOKENS__) window.hkRenderTokens(window.__HK_TOKENS__);
  });
})();
`;

// 供 preview.html 内联到属性里的转义（srcdoc="...")
function attrEscape(s = "") {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

/**
 * 生成一个自包含的样张 HTML 文档。
 * @param {object} args
 *   tokens   DTCG tokens 对象（唯一驱动源）
 *   cover    可选，真实来源截图 URL（非 bare 时显示对照条）
 *   source   来源名（对照条文案）
 *   bare     true 时不显示对照条（用于对比并排 / 编辑器实时预览）
 *   variant  样张类别：landing | dashboard | article | shop | portfolio
 */
export function buildDemoDoc({ tokens, cover = null, source = "", bare = false, variant = "landing" } = {}) {
  const V = VARIANTS[variant] || VARIANTS.landing;
  const vid = VARIANTS[variant] ? variant : "landing";
  const STYLE = BASE_STYLE + V.style;
  const banner =
    !bare && cover
      ? `<div class="hk-banner">
           <img src="${esc(cover)}" alt="来源截图"/>
           <span class="bt"><b>${esc(source)}</b> 是设计来源。下面是用这套设计资产生成的<b>${esc(V.label)}样张</b>——遵循它的色彩 / 字体 / 间距 / 圆角 / 动效与构图原型，而非复制来源的内容与布局。</span>
         </div>`
      : "";
  return `<!doctype html>
<html lang="zh-CN" data-hk-demo data-variant="${vid}">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>样张 · ${esc(V.label)} · ${esc(source)}</title>
<style>${STYLE}</style>
</head>
<body>
${banner}
${V.body}
<script>window.__HK_TOKENS__=${JSON.stringify(tokens)};</script>
<script>${DEMO_SCRIPT}</script>
</body>
</html>`;
}

// 供 preview.html 使用：返回一段可直接插入的样张 section（用 iframe srcdoc 隔离，离线可用）。
// 注意：画廊里 preview.html 是被当作 iframe 载入「规范」标签的，而画廊已有独立的「样张」标签，
// 因此此处内嵌样张仅在"独立/离线打开 preview.html"（顶层窗口）时显示，嵌入画廊时自动隐藏，避免重复。
export function demoSectionForPreview({ tokens, source = "" }) {
  const doc = buildDemoDoc({ tokens, source, bare: true, variant: "landing" });
  const srcdoc = attrEscape(doc);
  return `
  <section id="hk-sample">
    <h2>如果用这套资产做一个页面</h2>
    <p class="muted" style="margin:-6px 0 18px;font-size:14.5px;line-height:1.7">
      下面是一张<strong>内容中立的样张</strong>：同一份假内容，套用本资产的设计 token 与布局原型。
      它让你直观看到"用这套设计语言会生成出什么"——你的成品不会照抄来源截图（见页面顶部封面），而是遵循这里体现的色彩、字体、间距、圆角、动效与构图规则。
    </p>
    <iframe class="demo-frame" title="样张" loading="lazy" srcdoc="${srcdoc}"
      style="width:100%;height:820px;border:1px solid var(--line);border-radius:16px;background:#fff;display:block"></iframe>
  </section>
  <script>
    // 嵌入画廊（iframe）时隐藏——画廊已有独立「样张」标签；仅独立/离线打开时展示。
    if (window.top !== window.self) { var s = document.getElementById("hk-sample"); if (s) s.style.display = "none"; }
  </script>`;
}

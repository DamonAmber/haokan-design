# Haokan

> “Haokan”取中文“好看”拼音。把"好看的网页"提炼成可复用、可分享的**设计资产**（`.stylepack`），用于约束 AI 编码工具的产出、消除"AI 味"。（仓库/包名 `haokan-design`）

这是完整产品的第一条**竖切原型**（CLI）：

```
URL → 站点级采样 → 多视口截图 + 拼图封面 → 确定性抽 token + 本地 LLM 合成设计语言 → 打包 .stylepack（含可直接浏览的 preview.html）
```

## 工作原理

1. **站点级采样**：从起始 URL 出发，结合 sitemap 与页面内链（导航/页脚优先），按路径多样性挑选有代表性的上下游页面——跨页一致的元素才是"有意为之的设计系统"。
2. **单次加载双产出**：每页只加载一次，同时完成桌面/移动截图与真实计算样式抽取（颜色用 canvas 归一化，兼容 `oklch/oklab/lab/color(srgb)` 等现代格式）。
3. **确定性去噪**（数值全部来自真实测量，不臆造）：
   - 颜色按感知色差 ΔE 聚类 → 带角色的色板（背景/前景/muted/primary…）
   - 间距吸附到 4/8 基准栅格
   - 字号推断字阶与比例
   - 圆角/阴影归纳为等级
   - **动效与交互**：过渡时长 / 缓动曲线 / `@keyframes` / hover 前后 diff / 动效库指纹（Framer Motion、GSAP、Lenis、AOS…）→ 动效 token（`duration`/`easing`）+ 可落地的动效配方
4. **本地 LLM 合成**：把去噪后的结构化数据交给本地模型（通过 Claude Code / CC Switch 配置），生成设计语言规范 + Do/Don't + 美学标签。模型只做"解释与命名"，不产生数值。
5. **打包**：产出 `.stylepack`（zip）与可直接双击浏览的 `preview.html`。

## 前置条件

- Node ≥ 18（开发用 v25）
- 已安装并配置 **Claude Code**（本工具自动读取 `~/.claude/settings.json` 的当前生效配置调用模型，兼容 CC Switch 切换的上游；无需单独配 API key）

## 安装

```bash
npm install
npx playwright install chromium
```

## 使用

```bash
node src/cli.js <url> [选项]

  -n, --max-pages <N>   站点级采样最大页面数（默认 5）
  -o, --out <dir>       输出目录（默认 ./output）

# 示例
node src/cli.js https://tailwindcss.com --max-pages 4
node src/cli.js https://linear.app
```

运行结束后：

```bash
open "output/<name>/preview.html"     # 单个资产的可视化预览
```

## 设计资产库画廊（统一浏览）

不必一个个打开 HTML。启动本地画廊，在一个优雅界面里浏览整个资产库：

```bash
npm run gallery      # 启动后自动打开 http://localhost:4173
```

画廊能力：
- **封面网格**：所有 `.stylepack` 以拼图封面卡片展示，含来源、主色、一句话定位、风格标签。
- **搜索 / 筛选**：按名称/来源/标签/描述搜索，按美学流派（swiss/minimal…）或 **★ 收藏** 一键筛选。
- **点开即看详情**：点任意卡片，在浮层内直接查看该资产的完整 `preview.html`（色板/字阶/间距/设计语言规范）。
- **库管理**：卡片可**收藏**（星标，置顶）；**多选**后批量**删除**或**对比**（并排比较所选资产的色板/字体/字阶/间距/圆角）。
- **从 URL 提炼（后台并发）**：一次可粘贴多个网址（每行一个），**后台并发提炼**（默认最多同时 3 个，其余排队）。右下角**任务托盘**实时显示每个任务的进度条、当前步骤、状态，可展开看完整分步骤，并显示**真实模型**——例如配置 `opus` 但实际上游是 `mimo-v2.5-pro`（读取 API 响应的 model 字段）。
- **导入 / 导出**：导入他人分享的 `.stylepack`；详情页可下载 `.stylepack` 或打开本地文件夹。
- **校验项目**：详情页点「校验项目」，用该资产的 token 检查你的项目代码（见下方设计 lint）。
- **重新提炼**：详情页点「重新提炼」，用当前最新版本管线重跑该资产的源网址，生成新资产（不覆盖原资产，便于新旧对比）。
- **模型与视觉能力**：顶栏「模型徽章」实时显示当前调用的模型（配置模型 → 真实上游，如 `claude-opus-5[1M] → mimo-v2.5-pro`）与**是否具备视觉能力**。视觉能力经**真实探测**得出——发送一张纯色图请模型识别颜色：答对即支持、答错或自述"看不到图"即无视觉；点开徽章可查看连通状态、探测回执（模型原话）、端点与配置来源，并可「重新探测」。

## 桌面 App（Electron）

双击即用的桌面应用，内嵌上面的画廊服务：

```bash
npm run app          # 开发模式直接启动桌面 App
npm run dist         # 打包为分发版（macOS .dmg / Windows .nsis / Linux AppImage）
npm run dist:dir     # 仅生成未压缩的 .app（更快，便于本地试用）
```

界面采用 **Apple Liquid Glass 深色风格**（参照苹果官方设计语言）：半透明磨砂玻璃的顶栏/托盘/浮层/弹窗、系统蓝强调色、SF 字体、大圆角与细高光边；macOS 上开启原生窗口 **vibrancy**，真实系统材质透过半透明界面显现。桌面版额外提供**原生文件/目录选择**（导入 .stylepack、选择待校验项目目录）；顶栏为可拖拽区域（macOS 下为红绿灯预留留白）。打包后资产库存放在用户数据目录，持久保存。

> 说明：应用内「从 URL 提炼」依赖 Playwright 的 Chromium；分发前需确保其可用（`npx playwright install chromium`）。浏览/对比/校验/导入不受影响。

## 设计 lint —— 校验闭环（消除 AI 味）

用提炼出的 token **反查**项目代码是否守规矩：颜色是否在色板内（按感知色差 ΔE 判定）、圆角/字体是否落在规范内、**过渡时长与缓动曲线是否在动效 token 内**，并识别"AI 味"信号（如越界的通用紫色渐变）。

```bash
# 用某个资产的 token 校验一个项目目录
node src/lint.js <pack名|tokens.json|.stylepack> <项目路径> [--json] [--spacing]

# 示例
node src/lint.js tailwindcss-com-2026... ./my-app/src
```

输出合规分（0–100）与按文件分组的违规列表，每条给出最接近的 token 建议。也可在画廊详情页可视化运行（分数环 + 违规列表）。

> 这是最有护城河的一环：AI 生成 UI 后，用它回归校验产出是否真的遵守了设计系统。

## 产物结构（`.stylepack`）

```
<name>.stylepack (zip) 与 output/<name>/（同内容，可直接浏览）
├── manifest.json            # 元数据：来源、标签、美学、主色、摘要、出处声明
├── tokens.json              # W3C Design Tokens (DTCG) 标准设计 token
├── profile.md               # LLM 提炼的设计语言规范（含 Do/Don't）
├── preview.html             # 自包含"活体样式指南"，双击即看
├── covers/                  # 拼图封面 + 各页桌面/移动截图
└── rules/                   # 一键接入 AI 项目的集成文件
    ├── css-variables.css    # :root CSS 变量
    ├── tailwind.config.js   # Tailwind theme.extend 片段
    └── ai-rules.md          # 放进 .cursorrules / CLAUDE.md / .kiro/steering/
```

## 应用到你的 AI 项目

**最简单**：在画廊里打开任意资产，点右上角「**应用到项目**」，弹窗提供两种方式：
- **复制粘贴**：一键复制 AI 规则 / CSS 变量 / Tailwind 配置 / Tokens JSON；
- **一键写入项目目录**：填写（或原生选择）项目路径，写入 `.cursorrules`、`CLAUDE.md`、`AGENTS.md`、`.kiro/steering/`，或把 `tokens.json`/`css-variables.css`/`tailwind.config.js` 写入项目的 `haokan-design/` 目录。**写入前会弹出预览**（显示目标文件、将执行的操作、以及将插入的标记块全文），确认后才落盘。

安全保证：完整规范放独立目录 `haokan-design/`，主文档只插入带 `HAOKAN:START/END` 标记的简短引用块——**重复写入只替换该块、不堆积**；首次修改前自动备份为 `.haokan.bak`；Kiro 走独立 steering 文件不碰其它文档。

也可手动：把 `rules/ai-rules.md` 放进对应规则文件，或用 `tokens.json` / `css-variables.css` / `tailwind.config.js` 直接接入构建。让编码工具生成 UI 时遵守该设计语言，从源头消除“AI 味”。

## 测试

核心逻辑（颜色数学、去噪聚类、DTCG token、集成规则生成、设计 lint、模型视觉启发式）由 Node 内置测试框架覆盖，零额外依赖：

```bash
npm test        # node --test，运行 test/ 下全部用例
```

## 已知限制（待下一步优化）

- 上游模型的**视觉能力现已在 App 内真实探测并展示**（顶栏模型徽章）。当探测到无视觉的上游（如 MiMo）时，封面选择用启发式而非视觉打分、风格提炼基于结构化数据而非像素（实时 URL 场景下反而更稳）；切换到带视觉的上游后，可进一步启用像素级封面打分（规划中）。
- ~~次字体回退族硬编码为 `serif`~~ **已修复**：现按字体类型（等宽 / 衬线 / 无衬线）自动选择回退族，并新增独立的**展示/标题字体**（`--font-display`）识别，避免大标题误用正文/等宽字体。
- 页面聚类用 URL 路径启发式，未做 DOM 模板指纹去重。
- lint 目前以 CSS/内联样式的颜色/圆角/字体为主，Tailwind class（如 `rounded-lg`）与 JS 变量间接引用暂未深度解析。
- `npm run dist` 完整打包依赖网络下载 Electron 二进制，且未做代码签名；应用内提炼需本机已装 Playwright Chromium。

## 目录

```
src/
├── cli.js              # 编排入口
├── llm/provider.js     # 读取生效配置，调用本地端点
├── crawl/
│   ├── sampler.js      # 站点级采样
│   └── capture.js      # 截图 + 计算样式抽取（含颜色归一化）
├── extract/
│   ├── denoise.js      # 去噪：色彩聚类/间距吸附/字阶
│   └── tokens.js       # 生成 DTCG token
├── cover/collage.js    # 拼图封面
├── synthesize/profile.js # LLM 设计语言合成
├── pack/
│   ├── rules.js        # 集成文件生成
│   ├── preview.js      # 自包含预览
│   └── builder.js      # 打包 .stylepack
├── lint.js             # 设计 lint CLI
├── lint/linter.js      # lint 核心：token 合规校验
├── gallery/
│   ├── server.js       # 资产库本地服务（扫描/静态/提炼/导入/删除/收藏/lint/下载）
│   └── index.html      # 画廊 Web UI（网格/搜索/多选/收藏/对比/lint 面板）
└── util/               # 颜色数学、日志

electron/
├── main.cjs            # 主进程：内嵌启动画廊服务并加载
└── preload.cjs         # 原生文件/目录选择桥接
```

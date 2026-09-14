// Electron 主进程：在进程内启动画廊服务并加载它，包成双击即用的桌面 App。
const { app, BrowserWindow, Menu, ipcMain, dialog, shell, nativeImage } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");
const { initAutoUpdater, checkForUpdates } = require("./updater.cjs");

const ICON_PATH = path.join(__dirname, "..", "build", "icon.png");

const PORT = parseInt(process.env.HAOKAN_PORT || "4319", 10);
let win = null;

async function startBackend() {
  // 打包后把资产库放到用户数据目录（可写、持久）；开发时用仓库 output/
  if (app.isPackaged && !process.env.HAOKAN_OUTPUT) {
    process.env.HAOKAN_OUTPUT = path.join(app.getPath("userData"), "library");
  }
  process.env.PORT = String(PORT);
  const serverPath = path.join(__dirname, "..", "src", "gallery", "server.js");
  const mod = await import(pathToFileURL(serverPath).href);
  await mod.startServer({ port: PORT, open: false });
}

function createWindow() {
  const smoke = !!process.env.HAOKAN_SMOKE;
  win = new BrowserWindow({
    width: 1360,
    height: 900,
    minWidth: 900,
    minHeight: 600,
    show: !smoke,
    backgroundColor: "#0b0b0f",
    title: "Haokan",
    icon: ICON_PATH,
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    vibrancy: "under-window", // macOS 原生液态玻璃材质（网页半透明处透出）
    visualEffectState: "active",
    webPreferences: { preload: path.join(__dirname, "preload.cjs"), contextIsolation: true },
  });
  win.loadURL(`http://localhost:${PORT}`);

  if (smoke) {
    win.webContents.on("did-finish-load", () => {
      console.log("SMOKE_OK: window loaded gallery");
      setTimeout(() => app.quit(), 400);
    });
    win.webContents.on("did-fail-load", (_e, code, desc) => {
      console.log("SMOKE_FAIL:", code, desc);
      app.quit();
    });
    setTimeout(() => {
      console.log("SMOKE_TIMEOUT");
      app.quit();
    }, 15000);
  }
}

// 应用菜单：保留标准角色，并加入「检查更新…」
function buildAppMenu() {
  const isMac = process.platform === "darwin";
  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about" },
              { label: "检查更新…", click: () => checkForUpdates(true) },
              { type: "separator" },
              { role: "services" },
              { type: "separator" },
              { role: "hide" },
              { role: "hideOthers" },
              { role: "unhide" },
              { type: "separator" },
              { role: "quit" },
            ],
          },
        ]
      : []),
    { role: "editMenu" },
    { role: "viewMenu" },
    { role: "windowMenu" },
    {
      role: "help",
      submenu: [
        ...(!isMac ? [{ label: "检查更新…", click: () => checkForUpdates(true) }] : []),
        { label: "GitHub 仓库", click: () => shell.openExternal("https://github.com/DamonAmber/haokan-design") },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// 手动检查更新（供画廊 Web UI 通过 preload 触发）
ipcMain.handle("check-for-updates", async () => {
  checkForUpdates(true);
  return true;
});

// 原生文件/目录选择
ipcMain.handle("pick-stylepack", async () => {
  const r = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters: [{ name: "Style Pack", extensions: ["stylepack", "zip"] }],
  });
  return r.canceled ? null : r.filePaths[0];
});
ipcMain.handle("pick-directory", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  return r.canceled ? null : r.filePaths[0];
});

app.whenReady().then(async () => {
  app.setName("Haokan");
  if (process.platform === "darwin" && app.dock) {
    try {
      app.dock.setIcon(nativeImage.createFromPath(ICON_PATH));
    } catch {
      /* ignore */
    }
  }
  buildAppMenu();
  try {
    await startBackend();
  } catch (e) {
    console.error("后台服务启动失败：", e);
  }
  createWindow();
  // 自动更新：仅打包后生效，冒烟测试时跳过
  if (!process.env.HAOKAN_SMOKE) {
    initAutoUpdater(() => win);
  }
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

// Electron 主进程：在进程内启动画廊服务并加载它，包成双击即用的桌面 App。
const { app, BrowserWindow, ipcMain, dialog, shell, nativeImage } = require("electron");
const path = require("path");
const { pathToFileURL } = require("url");

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
  try {
    await startBackend();
  } catch (e) {
    console.error("后台服务启动失败：", e);
  }
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

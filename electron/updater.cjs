// 自动更新：基于 electron-updater + GitHub Releases。
// - 启动后延迟检查 + 每 6 小时轮询，自动后台下载新版本；
// - 下载完成后弹原生对话框，让用户「立即重启并更新」或稍后；
// - 提供手动「检查更新」（应用菜单 / IPC）——有更新则提示、已最新则告知。
// 仅在打包后的应用中生效（开发模式跳过）。
const { app, dialog } = require("electron");
const { autoUpdater } = require("electron-updater");

let initialized = false;
let manualCheck = false; // 标记本次检查是否由用户手动触发（决定是否弹「已是最新」）
let checking = false;

function getWin(getWindow) {
  try {
    return typeof getWindow === "function" ? getWindow() : null;
  } catch {
    return null;
  }
}

function wireEvents(getWindow) {
  autoUpdater.autoDownload = true; // 发现更新即后台下载
  autoUpdater.autoInstallOnAppQuit = true; // 下载后若用户没重启，退出时自动安装
  autoUpdater.on("error", (err) => {
    console.error("[updater] 错误：", err);
    if (manualCheck) {
      dialog.showMessageBox(getWin(getWindow), {
        type: "error",
        message: "检查更新失败",
        detail: String((err && err.message) || err),
        buttons: ["好的"],
      });
    }
    manualCheck = false;
    checking = false;
  });

  autoUpdater.on("update-available", (info) => {
    console.log("[updater] 发现新版本", info.version);
    if (manualCheck) {
      dialog.showMessageBox(getWin(getWindow), {
        type: "info",
        message: `发现新版本 ${info.version}`,
        detail: "正在后台下载，完成后会提示你重启更新。",
        buttons: ["好的"],
      });
    }
    checking = false;
  });

  autoUpdater.on("update-not-available", () => {
    console.log("[updater] 已是最新");
    if (manualCheck) {
      dialog.showMessageBox(getWin(getWindow), {
        type: "info",
        message: "已经是最新版本",
        detail: `当前版本 v${app.getVersion()}`,
        buttons: ["好的"],
      });
    }
    manualCheck = false;
    checking = false;
  });

  autoUpdater.on("update-downloaded", async (info) => {
    console.log("[updater] 新版本已下载", info.version);
    manualCheck = false;
    checking = false;
    const { response } = await dialog.showMessageBox(getWin(getWindow), {
      type: "info",
      message: `新版本 ${info.version} 已下载`,
      detail: "重启应用即可完成更新。",
      buttons: ["立即重启并更新", "稍后"],
      defaultId: 0,
      cancelId: 1,
    });
    if (response === 0) {
      // 让对话框先关闭再退出安装
      setImmediate(() => autoUpdater.quitAndInstall());
    }
  });
}

// 手动/自动触发检查。manual=true 时会对「已是最新 / 失败」给出提示。
function checkForUpdates(manual = false) {
  if (!app.isPackaged) {
    if (manual) {
      dialog.showMessageBox({
        type: "info",
        message: "开发模式不检查更新",
        detail: "请在打包后的正式应用中使用自动更新。",
        buttons: ["好的"],
      });
    }
    return;
  }
  if (checking) return;
  checking = true;
  manualCheck = manual;
  autoUpdater.checkForUpdates().catch((e) => {
    console.error("[updater] checkForUpdates 异常：", e);
    checking = false;
  });
}

function initAutoUpdater(getWindow) {
  if (initialized || !app.isPackaged) return;
  initialized = true;
  wireEvents(getWindow);
  setTimeout(() => checkForUpdates(false), 4000); // 启动 4s 后首次检查
  setInterval(() => checkForUpdates(false), 6 * 60 * 60 * 1000); // 每 6 小时轮询
}

module.exports = { initAutoUpdater, checkForUpdates };

// 预加载脚本：向画廊 Web UI 暴露原生能力（文件/目录选择），做渐进增强。
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("haokanNative", {
  pickStylepack: () => ipcRenderer.invoke("pick-stylepack"),
  pickDirectory: () => ipcRenderer.invoke("pick-directory"),
  checkForUpdates: () => ipcRenderer.invoke("check-for-updates"),
});

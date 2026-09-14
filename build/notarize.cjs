// electron-builder afterSign 钩子：打包签名后立即公证并 staple `.app`。
// 这样 dmg 与 zip 里都是「已公证 + 已装订」的 App，latest-mac.yml 校验值也正确，
// 自动更新（zip）与首装（dmg）均无 Gatekeeper 警告。
// 凭据取自本机钥匙串档案 `haokan`（notarytool），不进任何 Secrets。
const path = require("path");

exports.default = async function notarizing(context) {
  const { electronPlatformName, appOutDir } = context;
  if (electronPlatformName !== "darwin") return;
  if (process.env.SKIP_NOTARIZE === "1") {
    console.log("[afterSign] SKIP_NOTARIZE=1，跳过公证");
    return;
  }
  const appName = context.packager.appInfo.productFilename;
  const appPath = path.join(appOutDir, `${appName}.app`);
  console.log(`[afterSign] 公证 ${appPath} …（notarytool 档案 haokan）`);
  const { notarize } = require("@electron/notarize");
  await notarize({ tool: "notarytool", appPath, keychainProfile: "haokan" });
  console.log("[afterSign] 公证 + 装订完成");
};

---
inclusion: auto
name: 发版与打包规范
description: 当任务涉及版本发布、打 tag、构建/打包 dmg、代码签名与公证、GitHub Release、自动更新(latest-mac.yml)、官网(GitHub Pages)发布或回滚时，必须遵循本规范。触发词：发版/发布/release/打 tag/版本号/打包/dmg/签名/公证/notarize/自动更新/上架/官网。
---

# Haokan 发版与打包规范（AI 必须遵循）

## 0. 核心原则

- **只发 Apple Silicon（arm64）一种架构**，不发 Intel（x64）。arm64 包无法在 Intel Mac 上运行，Rosetta 也不支持反向翻译——Intel Mac 不在支持范围内。
- **签名凭据只留本机**：Developer ID 证书私钥与公证凭据只存在维护者本机钥匙串，永不写入 GitHub Secrets 或仓库。
- 发版是**纯本地一步**：本地构建（自动签名 + afterSign 公证 + staple）→ 上传 → 清理，不依赖任何 CI。
- **自动更新已接入**（`electron-updater` + GitHub Releases）：每次发版**必须**上传 `latest-mac.yml` 与 `*-arm64.zip`，否则用户端检测不到更新。版本号必须**严格递增**。
- **发版成功后删除本地包**：上传并核对无误后执行 `rm -rf release`，不在本地留存 dmg/zip。

## 1. 为什么只发 arm64

- Apple Silicon 自 2020 年起普及；对本工具的目标用户，arm64-only 已足够覆盖。
- Intel（x64）此前因「凭据不进 CI」只能出未签名包，体验差。砍掉后对外产物全部签名公证、下载即开。

## 2. 自动更新（electron-updater）

- **产物**：`npm run dist` 产出 `Haokan-<v>-arm64.dmg`（首装）、`Haokan-<v>-arm64.zip`（自动更新用，Squirrel.Mac 走 zip）、`latest-mac.yml`（更新清单）及各自 `.blockmap`。
- **更新源**：`package.json` 的 `build.publish` 指向 GitHub 仓库 `DamonAmber/haokan-design`；App 内嵌 `app-update.yml`，`electron-updater` 据此在 Releases 检查新版。
- **必传文件**：`latest-mac.yml` + `*-arm64.zip`（及 `.zip.blockmap`）+ `*-arm64.dmg`。**漏传 `latest-mac.yml` 或 zip，自动更新会失效。**
- **行为**：启动 4s 后检查 + 每 6 小时轮询，发现即后台下载，下载完成弹窗让用户「立即重启并更新 / 稍后」；应用菜单有「检查更新…」手动入口。逻辑见 `electron/updater.cjs`。
- **生效范围**：只有安装了**含 electron-updater 的版本**（v0.3.0 起）的用户，才能自动更新到之后的版本；更早版本的用户需手动下载一次新版。

## 3. 版本号（SemVer）

- tag 形如 `vX.Y.Z`，`package.json` 的 `version` 必须与之一致（去掉 `v`）。先改 version 再打 tag。
- 已发布的 tag **禁止** `-f` 覆盖；需修正就发更高的补丁版本。自动更新依赖版本严格递增。

## 4. 前置（仅首次配一次，凭据入本机钥匙串）

```bash
xcrun notarytool store-credentials haokan \
  --apple-id "<Apple ID>" --team-id MA5G62M45A --password "<App 专用密码>"
```

> 钥匙串档案名固定为 `haokan`。afterSign 钩子（`build/notarize.cjs`）与手动公证都用它。
> 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**。

## 5. 标准发版流程（全本地）

```bash
# 1) 干净起点 + 测试
git switch main && git pull && npm test

# 2) 升版本号（示例 0.3.0）：先改 package.json 的 "version"，然后提交推送
git add -A && git commit -m "release: v0.3.0" && git push origin main

# 3) 打 tag 并推送（仅标记版本，不触发任何 CI 构建）
git tag -a v0.3.0 -m "Haokan v0.3.0 — <变更摘要>"
git push origin v0.3.0

# 4) 本地构建：自动签名 → afterSign 公证 + staple → 产出 dmg + zip + latest-mac.yml
rm -rf release
npm run dist -- --mac --arm64 --publish never
#   afterSign 钩子会用 notarytool 档案 haokan 公证并装订 .app（几分钟，需联网）。
#   如需跳过公证做本地验证：SKIP_NOTARIZE=1 npm run dist -- --mac --arm64 --publish never

# 5) 验证公证生效（挂载后应为 accepted / Notarized Developer ID）
DMG="release/Haokan-0.3.0-arm64.dmg"
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint /tmp/hkmnt
spctl -a -vvv /tmp/hkmnt/*.app        # 期望：accepted，source=Notarized Developer ID
hdiutil detach /tmp/hkmnt -quiet

# 6) 创建 Release 并上传全部产物（dmg + zip + latest-mac.yml + blockmap）
gh release create v0.3.0 \
  release/Haokan-0.3.0-arm64.dmg \
  release/Haokan-0.3.0-arm64.zip \
  release/latest-mac.yml \
  release/*.blockmap \
  --title "Haokan v0.3.0" --notes "<变更摘要>"
#   若该 tag 的 Release 已存在，改用 gh release upload v0.3.0 <文件...> --clobber

# 7) 核对：Release 内应有 dmg / zip / latest-mac.yml
gh release view v0.3.0 --json assets -q '.assets[].name'

# 8) 发版成功后删除本地包
rm -rf release
```

要点：

- dmg/zip 文件名由 `package.json` 的 `artifactName` 统一为 `Haokan-<version>-arm64.{dmg,zip}`。
- `package.json` 的 `mac.target` 已含 `dmg` + `zip`（均 arm64）；`build.afterSign` 指向 `build/notarize.cjs`。
- 第 3 步（推 tag）与第 4–6 步（本地打包）先后不限；tag 现在只是版本标记，不触发构建。

## 6. 签名 / 公证要点

- 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**。
- `build/entitlements.mac.plist` + `hardenedRuntime: true` 已配置（公证前置）。`package.json` 的 `mac.notarize` 保持 `false`：不用 electron-builder 内置公证，改由 **afterSign 钩子**（`build/notarize.cjs`）在签名后用 `@electron/notarize`（notarytool + 钥匙串档案 `haokan`）公证并 **staple `.app`**。
- 因为 staple 订在 `.app` 上，dmg 与 zip 里的 App 都已装订：首装（dmg）与自动更新（zip）均无 Gatekeeper 警告、可离线校验。
- `spctl` 直接验 dmg/zip 文件会报 `no usable signature`（容器未 codesign），**这不是错误**——以第 5 步「挂载后验 app」为准。

## 7. 官网（GitHub Pages）

- 站点 https://damonamber.github.io/haokan-design/ ，源为 `main` 分支 `/docs`。「下载」按钮固定指向 `releases/latest`，**发新版无需改官网**。
- 官网文案已声明「仅 Apple Silicon（arm64），已签名并公证，下载即开」；若支持范围变化，需同步更新 `docs/index.html`。
- 改 `docs/` 后推送 `main` 自动重新部署；资源放 `docs/assets/`。

## 8. 回滚 / 撤版

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

撤版后尽快发更高的修复版本（自动更新依赖版本递增，不要回退版本号）。

## 9. 发版前检查清单

- [ ] `npm test` 通过
- [ ] `package.json` 的 `version` 已更新、严格递增且与 tag 一致
- [ ] 构建产物含 `dmg` + `zip` + `latest-mac.yml`（+ blockmap）
- [ ] app 已**签名 + 公证 + staple**（第 5 步 spctl 为 accepted / Notarized）
- [ ] Release 内齐全：`Haokan-<v>-arm64.dmg`、`Haokan-<v>-arm64.zip`、`latest-mac.yml`
- [ ] 已 `rm -rf release` 清理本地包
- [ ] 证书 / 公证凭据全程未离开本机

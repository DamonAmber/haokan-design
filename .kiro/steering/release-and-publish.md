---
inclusion: auto
name: 发版与打包规范
description: 当任务涉及版本发布、打 tag、构建/打包 dmg、代码签名与公证、GitHub Release、官网(GitHub Pages)发布或回滚时，必须遵循本规范。触发词：发版/发布/release/打 tag/版本号/打包/dmg/签名/公证/notarize/上架/官网。
---

# Haokan 发版与打包规范（AI 必须遵循）

## 0. 核心原则

- **只发 Apple Silicon（arm64）一种架构**，不发 Intel（x64）。arm64 包无法在 Intel Mac 上运行，Rosetta 也不支持反向翻译——Intel Mac 不在支持范围内。
- **签名凭据只留本机**：Developer ID 证书私钥与公证凭据（Apple ID / App 专用密码）只存在维护者本机钥匙串，永不写入 GitHub Secrets 或仓库。
- 因此发版是**纯本地一步**：本地签名 + 公证 + 上传，不依赖任何 CI 构建。

## 1. 为什么只发 arm64

- Apple Silicon 自 2020 年起普及；对本工具的目标用户，arm64-only 已足够覆盖。
- Intel（x64）此前因「签名凭据不进 CI」只能出**未签名**包，用户首次打开要右键「打开」，体验差。砍掉 x64 后，对外产物**全部签名公证、下载即开**。
- 本机为 arm64，`npm` 装不了 sharp 的 x86_64 二进制，也无法本地打出可用的 x64 包；既然不再交给 CI，x64 就彻底不发。

## 2. 版本号（SemVer）

- tag 形如 `vX.Y.Z`，`package.json` 的 `version` 必须与之一致（去掉 `v`）。先改 version 再打 tag。
- 已发布的 tag **禁止** `-f` 覆盖；需修正就发更高的补丁版本。

## 3. 前置（仅首次配一次，凭据入本机钥匙串）

```bash
xcrun notarytool store-credentials haokan \
  --apple-id "<Apple ID>" --team-id MA5G62M45A --password "<App 专用密码>"
```

> 钥匙串档案名固定为 `haokan`。配一次后，后续公证无需再输密码。
> 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**。

## 4. 标准发版流程（全本地）

```bash
# 1) 干净起点 + 测试
git switch main && git pull && npm test

# 2) 升版本号（示例 0.2.0）：先改 package.json 的 "version"，然后提交推送
git add -A && git commit -m "release: v0.2.0" && git push origin main

# 3) 打 tag 并推送（仅标记版本，不再触发任何 CI 构建）
git tag -a v0.2.0 -m "Haokan v0.2.0 — <变更摘要>"
git push origin v0.2.0

# 4) 本地打 arm64 并签名（electron-builder 自动从钥匙串取 Developer ID）
rm -rf release
npm run dist -- --mac --arm64 --publish never

# 5) 公证 + 装订票据（网络抖动就重试这两步）
DMG="release/Haokan-0.2.0-arm64.dmg"
xcrun notarytool submit "$DMG" --keychain-profile haokan --wait   # 等到 status: Accepted
xcrun stapler staple "$DMG"

# 6) 验证公证生效（挂载后应为 accepted / Notarized Developer ID）
hdiutil attach "$DMG" -nobrowse -quiet -mountpoint /tmp/hkmnt
spctl -a -vvv /tmp/hkmnt/*.app        # 期望：accepted，source=Notarized Developer ID
hdiutil detach /tmp/hkmnt -quiet

# 7) 创建 Release 并上传签名公证的 arm64 dmg
gh release create v0.2.0 "$DMG" "$DMG.blockmap" \
  --title "Haokan v0.2.0" --notes "<变更摘要>"
#   若 tag 的 Release 已存在，改用：
#   gh release upload v0.2.0 "$DMG" "$DMG.blockmap" --clobber

# 8) 最终核对：Release 里应有 arm64 dmg
gh release view v0.2.0 --json assets -q '.assets[].name'
```

要点：

- dmg 文件名由 `package.json` 的 `artifactName` 统一为 `Haokan-<version>-arm64.dmg`。
- `package.json` 的 `mac.target` 已锁定 `arch: arm64`，`npm run dist` 只出 arm64，不会误打 x64。
- 第 3 步（推 tag）与第 4–7 步（本地打包）先后不限；tag 现在只是版本标记，不触发构建。

## 5. 签名 / 公证要点

- 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**。
- `build/entitlements.mac.plist` + `hardenedRuntime: true` 已配置（公证前置）。`package.json` 的 `mac.notarize` 为 `false`：打包阶段只签名不公证，公证在打包后用 `notarytool` 单独做（见上）。
- 公证的是 **dmg**，`stapler staple` 也订到 dmg 上；Gatekeeper 挂载 dmg 时据此放行 app（app 本身未 staple 属正常）。
- `spctl` 直接验 dmg 文件会报 `no usable signature`（dmg 容器未 codesign），**这不是错误**——以第 6 步「挂载后验 app」为准。

## 6. 官网（GitHub Pages）

- 站点 https://damonamber.github.io/haokan-design/ ，源为 `main` 分支 `/docs`。「下载」按钮固定指向 `releases/latest`，**发新版无需改官网**。
- 官网文案已声明「仅 Apple Silicon（arm64），已签名并公证，下载即开」；若支持范围变化，需同步更新 `docs/index.html`。
- 改 `docs/` 后推送 `main` 自动重新部署；产品截图/资源放 `docs/assets/`。

## 7. 回滚 / 撤版

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```

撤版后尽快发更高的修复版本。

## 8. 发版前检查清单

- [ ] `npm test` 通过
- [ ] `package.json` 的 `version` 已更新且与 tag 一致
- [ ] arm64 dmg 已**签名+公证**（第 6 步 spctl 为 accepted / Notarized）
- [ ] Release 内有 `Haokan-<v>-arm64.dmg`（及 `.blockmap`）
- [ ] 证书 / 公证凭据全程未离开本机

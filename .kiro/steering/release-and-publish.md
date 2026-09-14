---
inclusion: auto
name: 发版与打包规范
description: 当任务涉及版本发布、打 tag、构建/打包 dmg、代码签名与公证、GitHub Release、官网(GitHub Pages)发布或回滚时，必须遵循本规范。触发词：发版/发布/release/打 tag/版本号/打包/dmg/签名/公证/notarize/上架/官网。
---

# Haokan 发版与打包规范（AI 必须遵循）

## 0. 核心原则：签名凭据只留本机，绝不进 CI

- **Developer ID 证书私钥与公证凭据（Apple ID / App 专用密码）只存在维护者本机钥匙串，永不写入 GitHub Secrets 或仓库。**
- 因此发布采用「**本地签名公证 arm64 + CI 未签名 x64**」的分工，不要为省事把证书塞进 CI。

## 1. 架构分工（为什么这样）

| 架构 | 谁来构建 | 签名/公证 | 原因 |
| --- | --- | --- | --- |
| **arm64**（Apple Silicon） | 维护者**本地** `npm run dist` | ✅ 签名 + 公证 | 本机就是 arm64，钥匙串有 Developer ID |
| **x64**（Intel） | **CI**（`.github/workflows/release.yml`，`macos-13`） | ❌ 未签名 | arm64 机器 `npm` 装不了 sharp 的 x86_64 二进制（`notsup`），本地打的 x64 包 sharp 架构错误不可用；CI 的 Intel runner 能原生装 x64 sharp |

- x64 为未签名包，Intel 用户首次打开需右键「打开」。这是「凭据不进 CI」的取舍，可接受。
- **不要**试图在 arm64 本地交叉打 x64（sharp 会是 arm64，运行崩溃）。
- ⏳ GitHub 免费的 Intel（`macos-13`）runner 排队时间不稳定，x64 可能等十几分钟甚至更久才开始构建；完成后会**自动追加**到该 tag 的 Release，无需人工干预。因此 arm64 发完即可先对外，x64 稍后到齐。查是否到齐：`gh release view vX.Y.Z --json assets -q '.assets[].name'`。

## 2. 版本号（SemVer）

- tag 形如 `vX.Y.Z`，`package.json` 的 `version` 必须与之一致（去掉 `v`）。先改 version 再打 tag。
- 已发布的 tag **禁止** `-f` 覆盖；需修正就发更高的补丁版本。

## 3. 标准发版流程

前置（仅首次配一次，凭据入本机钥匙串）：
```bash
xcrun notarytool store-credentials haokan \
  --apple-id "<Apple ID>" --team-id MA5G62M45A --password "<App 专用密码>"
```
> 钥匙串档案名固定为 `haokan`。配一次后，后续公证无需再输密码。

发版步骤：
```bash
# 1) 干净起点 + 测试
git switch main && git pull && npm test

# 2) 升版本号（示例 0.2.0），提交推送
#    先把 package.json 的 "version" 改成 0.2.0，然后：
git add -A && git commit -m "release: v0.2.0" && git push origin main

# 3) 打 tag 并推送 —— 触发 CI 构建【x64 未签名】dmg
git tag -a v0.2.0 -m "Haokan v0.2.0 — <变更摘要>"
git push origin v0.2.0

# 4) 本地打【arm64】并签名（钥匙串 Developer ID 自动签名）
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

# 7) 把签名公证的 arm64 dmg 传到该 tag 的 Release（与 CI 的 x64 并存）
gh release upload v0.2.0 "$DMG" "$DMG.blockmap" --clobber

# 8) 最终核对：Release 里应同时有 arm64 与 x64 两个 dmg
gh release view v0.2.0 --json assets -q '.assets[].name'
```

要点：
- 第 3 步（推 tag）与第 4–7 步（本地 arm64）**先后不限**，二者产物落到同一个 Release，不冲突（arm64 来自本地、x64 来自 CI，文件名不同）。
- dmg 文件名由 `package.json` 的 `artifactName` 统一为 `Haokan-<version>-<arch>.dmg`。

## 4. 签名 / 公证要点

- 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**。
- `build/entitlements.mac.plist` + `hardenedRuntime: true` 已配置（公证前置）。`package.json` 的 `mac.notarize` 为 `false`：打包阶段只签名不公证，公证在打包后用 `notarytool` 单独做（见上）。
- 公证的是 **dmg**，`stapler staple` 也订到 dmg 上；Gatekeeper 挂载 dmg 时据此放行 app（app 本身未 staple 属正常）。
- `spctl` 直接验 dmg 文件会报 `no usable signature`（dmg 容器未 codesign），**这不是错误**——以第 6 步「挂载后验 app」为准。

## 5. 官网（GitHub Pages）

- 站点 https://damonamber.github.io/haokan-design/ ，源为 `main` 分支 `/docs`。「下载」按钮固定指向 `releases/latest`，**发新版无需改官网**。
- 改 `docs/` 后推送 `main` 自动重新部署；产品截图放 `docs/assets/`。

## 6. 回滚 / 撤版

```bash
gh release delete vX.Y.Z --yes
git push origin :refs/tags/vX.Y.Z
git tag -d vX.Y.Z
```
撤版后尽快发更高的修复版本。

## 7. 发版前检查清单

- [ ] `npm test` 通过
- [ ] `package.json` 的 `version` 已更新且与 tag 一致
- [ ] arm64 dmg 已**签名+公证**（第 6 步 spctl 为 accepted / Notarized）
- [ ] CI 的 x64 dmg 已产出并进入同一 Release
- [ ] Release 内同时有 `Haokan-<v>-arm64.dmg` 与 `Haokan-<v>-x64.dmg`
- [ ] 证书/公证凭据全程未离开本机

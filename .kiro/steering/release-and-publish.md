---
inclusion: auto
name: 发版与打包规范
description: 当任务涉及版本发布、打 tag、构建/打包 dmg、代码签名与公证、GitHub Release、官网(GitHub Pages)发布或回滚时，必须遵循本规范。触发词：发版/发布/release/打 tag/版本号/打包/dmg/签名/公证/notarize/上架/官网。
---

# Haokan 发版与打包规范（AI 必须遵循）

本项目通过 **打 git tag** 触发 GitHub Actions 自动构建并发布 macOS `.dmg`。所有发版必须按本规范执行，不得绕过。

## 1. 版本号（SemVer）

- 版本号遵循 `MAJOR.MINOR.PATCH`，tag 形如 `vX.Y.Z`。
- **`package.json` 的 `version` 必须与 tag 一致**（去掉 `v` 前缀）。先改 `version` 再打 tag。
- 破坏性变更进 MAJOR，向后兼容的新功能进 MINOR，修复进 PATCH。

## 2. 标准发版流程（唯一入口：打 tag）

```bash
# 1) 确认在 main、工作区干净、测试通过
git switch main && git pull
npm test

# 2) 升版本号（示例 0.2.0），提交
#    编辑 package.json 的 "version" 后：
git add package.json && git commit -m "release: v0.2.0"

# 3) 打带注解的 tag 并推送（推送 tag 即触发发布构建）
git tag -a v0.2.0 -m "Haokan v0.2.0 — <一句话变更>"
git push origin main
git push origin v0.2.0

# 4) 跟踪构建
gh run watch --exit-status $(gh run list --workflow=release.yml -L1 --json databaseId -q '.[0].databaseId')

# 5) 验证 Release 产物（应有 arm64 与 x64 两个 dmg）
gh release view v0.2.0 --json assets -q '.assets[].name'
```

- **禁止**手动在网页端拖拽上传 dmg 作为常规发布方式；一律走 tag + CI。
- **禁止**用 `git tag -f` 覆盖已发布的 tag；如需修正，发新的补丁版本。

## 3. 构建产物与架构

- CI（`.github/workflows/release.yml`）用矩阵在两个 runner 上构建：
  - `macos-14` → **arm64**（Apple Silicon）
  - `macos-13` → **x64**（Intel）
- 两个 job 各自把 `Haokan-<version>-<arch>.dmg` 上传到同一个 tag 的 Release。
- 分架构双 runner 是**刻意选择**：避免在单机交叉编译原生模块（`sharp`）导致架构不匹配。不要改回单 runner 交叉打多架构。
- 本地 `npm run dist` 只产出**当前机器架构**（通常 arm64）的包，用于本地验证；跨架构分发交给 CI。

## 4. 代码签名与公证

- 证书：**Developer ID Application: Damon Wang（Team ID `MA5G62M45A`）**，已在本机钥匙串。
- `build/entitlements.mac.plist` + `hardenedRuntime: true` 已配置（公证前置条件）。`package.json` 中 `mac.notarize` 默认 `false`，避免无凭据环境打包失败。

### 本地打包（会自动签名，默认不公证）
```bash
npm run dist            # 用钥匙串 Developer ID 自动签名，产 arm64 dmg
# 验证签名：
codesign --verify --deep --strict --verbose=2 "release/mac-arm64/Haokan.app"
codesign -dvvv "release/mac-arm64/Haokan.app" | grep Authority
```

### 开启公证（消除 Gatekeeper 警告，推荐正式发布做）
公证需 Apple ID 的 **App 专用密码**（appleid.apple.com 生成），首次配置：
```bash
xcrun notarytool store-credentials haokan \
  --apple-id "<你的 Apple ID>" --team-id MA5G62M45A --password "<App 专用密码>"
```
本地公证一份已签名的 dmg：
```bash
xcrun notarytool submit "release/Haokan-<version>-arm64.dmg" --keychain-profile haokan --wait
xcrun stapler staple "release/Haokan-<version>-arm64.dmg"
```
或让 `npm run dist` 自动公证：把 `package.json` 的 `mac.notarize` 临时设为 `{ "teamId": "MA5G62M45A" }`，并设置环境变量 `APPLE_ID` / `APPLE_APP_SPECIFIC_PASSWORD` / `APPLE_TEAM_ID` 后再打包。

### CI 签名 / 公证（可选，配 Secrets 后自动启用）
在 GitHub 仓库 Settings → Secrets and variables → Actions 添加：

| Secret | 说明 |
| --- | --- |
| `MAC_CSC_LINK` | base64 编码的 Developer ID Application 证书 `.p12`（`base64 -i cert.p12 | pbcopy`）|
| `MAC_CSC_KEY_PASSWORD` | 该 `.p12` 的导出密码 |
| `APPLE_ID` | 公证用 Apple ID（配了才公证）|
| `APPLE_APP_SPECIFIC_PASSWORD` | 该 Apple ID 的 App 专用密码 |
| `APPLE_TEAM_ID` | `MA5G62M45A` |

- 未配 `MAC_CSC_LINK` → CI 产**未签名** dmg（可用，但用户首次打开需右键「打开」）。
- 配了证书未配 `APPLE_ID` → 仅签名不公证。
- 证书 + Apple ID 齐全 → 签名并公证（推荐的对外发布状态）。

## 5. 官网（GitHub Pages）

- 站点：https://damonamber.github.io/haokan-design/ ，源为 `main` 分支 `/docs` 目录。
- 「下载 macOS 版」按钮固定指向 `releases/latest`，**发新版无需改官网**。
- 若官网文案/截图需更新，改 `docs/` 后推送 `main` 即自动重新部署。产品截图放 `docs/assets/`。

## 6. 回滚 / 撤版

```bash
gh release delete vX.Y.Z --yes          # 删除 Release
git push origin :refs/tags/vX.Y.Z       # 删除远程 tag
git tag -d vX.Y.Z                       # 删除本地 tag
```
撤版后应尽快发一个更高的修复版本，避免用户停留在问题版本。

## 7. 发版前检查清单

- [ ] `npm test` 通过
- [ ] `package.json` 的 `version` 已更新且与 tag 一致
- [ ] CHANGELOG / Release notes 写清变更
- [ ] 构建完成后 Release 内确实有 **arm64 + x64 两个 dmg**
- [ ] 正式对外版本已**公证**（`spctl -a -vv` 应为 accepted）

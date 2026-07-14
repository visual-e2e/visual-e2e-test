# Visual E2E Test — 桌面客户端（Electron + Node Sidecar）

Electron WebView + Node sidecar（Fastify `127.0.0.1`）。

## 架构

```
Electron (Chromium WebView)
  └─ spawn Node sidecar → workspace/server
        ├─ electron:dev  → 127.0.0.1:3100
        └─ .app          → 127.0.0.1:6100
        ├─ Fastify API + 文件读写
        ├─ Playwright 测试（channel: chrome，使用本机 Chrome）
        └─ 生产模式托管 workspace/web/dist

用户数据（持久化）:
  electron:dev   macOS: ~/Library/Application Support/visual-e2e-test/Storage/
  .app           macOS: ~/Library/Application Support/Visual E2E Test/Storage/
  Windows 对应: %APPDATA%/visual-e2e-test/ 与 %APPDATA%/Visual E2E Test/
    ├── projects/
    └── config/settings.json
```

## 前置条件

| 工具 | 用途 |
|------|------|
| Node.js 20+ | 开发与构建 |
| macOS: Xcode CLT | 打包（可选） |
| Google Chrome | 运行 E2E 测试（客户端默认 `channel: chrome`） |

## 运行模式

| 模式 | 启动方式 | `E2E_RUNTIME` | API 端口 | 数据目录 |
|------|----------|---------------|----------|----------|
| Web 开发 | `npm run workspace` | `workspace` | `3101` | 仓库 `projects/`、`config/` |
| 客户端开发 | `npm run electron:dev` | `client` | `3100` | `visual-e2e-test/Storage/` |
| 生产 | 安装的 `.app` | `client` | `6100` | `Visual E2E Test/Storage/` |

`/api/health` 的 `runtime` 与 `port` 用于区分当前连的是哪个实例。

### dev 与 build 的差异

| 项 | `electron:dev` | 生产 `.app` |
|----|----------------|----------------------------|
| 代码根 `E2E_ROOT` | 仓库根目录 | `Contents/Resources/app` |
| 用户数据 | `visual-e2e-test/Storage/` | `Visual E2E Test/Storage/` |
| API 端口 | `3100` | `6100` |
| 前端 | Vite `:5173` | server 静态托管 `web/dist` |
| Node | 系统 PATH 中的 `node` | 包内 `resources/node/{platform}/bin/node` |
| `CLIENT_MODE` | `0` | `1` |

`electron:dev` 可与已安装的 `.app` 同时运行（端口与 Storage 独立）。

## 开发

### Web 工作台

```bash
npm install
npm run workspace          # Web :5173，API :3101
```

### Electron 客户端

```bash
npm install
npm run build:engine       # 生成 dist/cli.js
npm run electron:dev
```

`electron:dev` 编译 main 进程、执行 `build:server` 并启动 Vite（`:5173`）。Sidecar 在 `127.0.0.1:3100` 起 API；窗口加载 Vite，Vite 将 `/api` 代理到 `:3100`。

### 用户数据目录

App 菜单 **Visual E2E Test → 打开数据目录** 打开当前模式对应路径。

```bash
# electron:dev（macOS）
open ~/Library/Application\ Support/visual-e2e-test/Storage
# .app（macOS）
open ~/Library/Application\ Support/Visual\ E2E\ Test/Storage
```

首次启动时 sidecar 创建 `Storage/projects`、`Storage/config`；若 `config/settings.json` 不存在，从 `E2E_ROOT/config/settings.json` 复制默认配置。

## 打包

安装包在 **本机 macOS** 构建（含 `playwright-browsers/`），不由 CI 编译。

```bash
npm run download:chromium -- all    # darwin-arm64 / darwin-x64 / win32-x64
npm run electron:build:all          # → build/macos-arm64|macos-x64|windows
```

单架构：

```bash
npm run electron:build:mac:arm64
npm run electron:build:mac:x64
npm run electron:build:win
```

流程：同步版本 → 清空对应 `build/` 子目录 → 下载 Node sidecar → 从 `playwright-browsers/<platform>` stage → `build:client` → `electron-builder` → 整理产物。

| 命令 | 产物 |
|------|------|
| `electron:build:all` | `build/macos-arm64/` + `macos-x64/` + `windows/` |
| `electron:build:mac:arm64` | `build/macos-arm64/`（`.app` + `.dmg`） |
| `electron:build:mac:x64` | `build/macos-x64/`（`.app` + `.dmg`） |
| `electron:build:win` | `build/windows/`（`.exe`） |

发版：`npm run release` → 合并 main → 本机 `download:chromium -- all` + `electron:build:all` → `npm run pub`（打 tag并用 `gh` 上传 Release）。`electron-release.yml` 仅在 Release published 后触发下载站。

### 包内容

- Electron
- Node sidecar 二进制
- 对应平台的 Playwright Chromium（`playwright-browsers/<platform>`）
- engine、server、web、scripts、template、node_modules

## 环境变量（Sidecar / 启动脚本）

| 变量 | `workspace` | `electron:dev` | `.app` |
|------|-------------|----------------|--------|
| `E2E_RUNTIME` | `workspace` | `client` | `client` |
| `WORKSPACE_PORT` | `3101` | `3100` | `6100` |
| `E2E_ROOT` | 仓库根 | 仓库根 | `Resources/app` |
| `PROJECTS_DIR` | `{repo}/projects` | `visual-e2e-test/Storage/projects` | `Visual E2E Test/Storage/projects` |
| `CONFIG_DIR` | `{repo}/config` | `visual-e2e-test/Storage/config` | `Visual E2E Test/Storage/config` |
| `SERVE_WEB` | 未设置 | `0` | `1` |
| `CLIENT_MODE` | 未设置 | `0` | `1` |
| `BUNDLED_NODE` | 清除 | 系统 Node | 包内 Node |

## 常见问题

### 运行中心 spawn node ENOENT

- `workspace`：确认 `curl :3101/api/health` 返回 `"runtime":"workspace"`；勿手动设置 `BUNDLED_NODE`。
- `electron:dev` / `.app`：`.app` 使用包内 `Resources/node/{platform}/bin/node`。

### 浏览器启动失败

确认包内 / 开发机存在 `playwright-browsers/<platform>`（`npm run download:chromium`），且已 `npm run build:engine`。

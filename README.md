# Visual E2E Test

**可视化 E2E 自动化测试工作台** — Visual workbench for JSON-driven E2E automated testing.

基于 **Node.js + TypeScript + Playwright**，测试逻辑全部由 JSON 步骤流驱动。

## 快速开始

```bash
npm install
npm run download:chromium                   # 当前平台 Chromium → playwright-browsers/
npm run download:chromium -- all            # darwin-arm64 / darwin-x64 / win32-x64
npm run download:chromium -- win32-x64      # 指定平台
npm run download:chromium -- all --force

# 业务项目在 projects/{id}/ 下（本地自建，默认不提交 git）
# 脚手架模版见根目录 template/；通过工作台「新建项目」从模版创建

npm run test -- --list
npm run test -- --list-projects
npm run test -- --project <your-project-id> --module login
npm run test -- --project <your-project-id> --module login --scenario login_success
npm run test -- --project <your-project-id> --all
npm run test:all -- --headed
```

## 桌面客户端（Electron）

Electron WebView + Node sidecar，与 CLI / `workspace` 模式**数据隔离**。详见 [docs/CLIENT.md](docs/CLIENT.md)。

```bash
npm run build:engine                        # 首次或 engine 变更后
npm run electron:dev                        # 客户端开发
npm run download:chromium -- all            # 打包前三套 Chromium
npm run electron:build:all                  # 本机：arm64 + x64 + Windows
npm run electron:build:mac:arm64
npm run electron:build:mac:x64
npm run electron:build:win
npm run pub                                 # CDN + tag + GitHub Release（须 gh + 已 build）
```

运行模式与发版细节见 [docs/CLIENT.md](docs/CLIENT.md)。

## 发版配置

```bash
npm run release       # 拉 release 分支并 bump 版本
# 合并 master 后打包…
export QINIU_ACCESS_KEY=...   # 七牛 AccessKey
export QINIU_SECRET_KEY=...   # 七牛 SecretKey
npm run upload:cdn    # 只上传七牛（version.js；已存在则跳过）
npm run pub           # upload:cdn → tag → GitHub Release 备份
```

## 项目结构

```
visual-e2e-test/
├── template/                  # 脚手架模版（提交到 git，新建项目时复制）
│   ├── .env.example
│   ├── fixtures/
│   ├── scenarios/
│   └── 产品画像/
├── projects/                  # 业务项目（本地自建，gitignore）
│   └── .gitkeep
├── config/settings.json       # 浏览器、超时、defaultProject
├── playwright-browsers/       # Chromium（download:chromium）
├── src/
│   ├── types/                 # StepType 枚举 + Step 实体
│   ├── handlers/              # 按 type 分发的 Handler
│   ├── engine/                # ScenarioRunner / StepExecutor
│   ├── runner/                # ModuleRunner / RunSession
│   └── cli.ts
├── electron/                  # 桌面客户端（main / sidecar / 打包资源）
├── tools/                     # 工具平台说明（业务工具为独立仓安装包）
├── rpc/                       # Host ↔ 工具通信契约
├── electron/                  # 桌面客户端（main / sidecar / 打包资源）
└── workspace/                 # Visual E2E Test 工作台（server + web）
```

## 步骤 JSON 结构

```json
{
  "stepId": "s1",
  "type": "click",
  "selector": "button:has-text(\"确定\")",
  "url": "",
  "delay": 500,
  "timeOut": 10000,
  "value": null,
  "params": {},
  "desc": "点击确定"
}
```

### StepType（前端视角）

| type | 说明 |
|------|------|
| `click` | 点击按钮、链接、菜单项（支持 `params.clickAny` / `optional`） |
| `hover` | 悬停 |
| `input` | 输入（params.clearBeforeInput） |
| `link` | 通过 URL 打开或跳转页面 |
| `wait` | 等待固定时间（value=毫秒） |
| `ready` | 等待元素就绪（params.readySelectors，默认最多 30 秒） |
| `scroll` | 滚动 |
| `verify` | 验证（verifyValue / expectValue / matchRule）；**通过后自动截图** |
| `screenshot` | 手动截图 |
| `log` | 输出日志（value=内容） |
| `keyboard` | 键盘按键（value=按键或别名 `undo`/`redo`/`Enter` 等；可选 selector 先聚焦） |
| `macro` | 引用 `fixtures/macros/{value}.json` 可复用步骤组合（宏步骤） |

### 键盘步骤（`keyboard`）

```json
{
  "type": "keyboard",
  "value": "undo",
  "desc": "撤销"
}
```

带聚焦目标：

```json
{
  "type": "keyboard",
  "selector": "input[name=\"projectName\"]",
  "value": "Control+A",
  "desc": "全选项目名称"
}
```

| value | 说明 |
|-------|------|
| `undo` | 撤销（macOS: Meta+Z，其他: Control+Z） |
| `redo` | 重做 |
| `Enter` / `Escape` / `Tab` / `Backspace` / `Delete` | 常用单键 |
| `Control+Z`、`Meta+Shift+Z` 等 | Playwright 按键组合语法 |

### 宏步骤（`macro`）

```json
{
  "type": "macro",
  "value": "thy-select-custom.choose",
  "params": {
    "triggerText": "选择可见范围",
    "optionText": "公开"
  },
  "desc": "选择可见范围为公开"
}
```

宏定义位于 `fixtures/macros/`。运行时展开为多条原子步骤执行。


SPA 页面在 `link` 跳转后可能尚未渲染完成，可通过 `params` 控制等待：

| 字段 | 适用步骤 | 说明 |
|------|----------|------|
| `readySelectors` | `link` 及 `click`/`input`/`keyboard` 等 | 执行前额外等待的选择器（string[]，AND）；**有 `selector` 的步骤会自动等待自身 selector，无需重复配置** |
| `clickAny` | `click` | 候选选择器（string[]，OR），点击第一个可见元素 |
| `optional` | `click` | 为 `true` 时无匹配元素则跳过，不失败 |
| `continueOnFail` | 任意步骤 | 为 `true` 时本步失败继续执行后续步骤（场景仍可能标记 FAILED） |
| `waitUntil` | `link` | 覆盖全局 `navigationWaitUntil`（`load` / `domcontentloaded` / `networkidle`） |
| `loadState` | `link` | 导航后等待的页面状态，默认 `load` |

`ready` 步骤示例（适合登录后慢加载，替代固定延时）：

```json
{
  "type": "ready",
  "params": {
    "readySelectors": [".app-root-header-actions .styx-navbar-actions-avatar"]
  },
  "desc": "等待头像就绪"
}
```

多就绪条件（全部可见后再执行）：

```json
{
  "type": "click",
  "selector": "a.thy-menu-item:has-text(\"项目管理\")",
  "params": {
    "readySelectors": ["button:has-text(\"使用模板\")"]
  },
  "desc": "菜单项与使用模板按钮均就绪后点击"
}
```

上例实际等待：`selector` + `readySelectors` 共两个元素（自动去重）。

**click 多候选 / 可选点击：**

```json
{
  "type": "click",
  "desc": "点击「添加组件」",
  "params": {
    "clickAny": [
      ".add-app-nav-icon",
      "a:has(span:has-text(\"添加组件\"))",
      ".dropdown-menu-item:has-text(\"添加组件\")"
    ]
  }
}
```

```json
{
  "type": "click",
  "selector": "thy-nav .thy-nav-more:has-text(\"更多\")",
  "desc": "若导航栏出现「更多」，点击展开",
  "params": { "optional": true, "continueOnFail": true }
}
```

**步骤失败继续：**

```json
{
  "type": "verify",
  "verifyValue": ".some-field",
  "expectValue": "{value}",
  "matchRule": "contains",
  "params": { "continueOnFail": true },
  "desc": "非关键验证"
}
```

仅等待自身元素时省略 `readySelectors`：

```json
{
  "type": "click",
  "selector": "button:has-text(\"新建项目\")",
  "desc": "点击新建项目"
}
```

全局默认就绪等待上限：`config/settings.json` → `defaultReadyTimeout`（30000ms）

```json
{
  "type": "link",
  "url": "{login_path}",
  "timeOut": 30000,
  "params": {
    "readySelectors": ["{login_username_selector}"],
    "loadState": "networkidle"
  },
  "desc": "打开登录页并等待表单就绪"
}
```

### Verify matchRule

`equals` | `contains` | `regex` | `visible` | `hidden` | `urlContains`

`verifyValue` 指向 `input` / `textarea` / `select` 时自动用 `inputValue()` 读取；普通元素仍用 `textContent()`。可显式覆盖：`params.readAs` = `text` | `inputValue` | `innerText`。

验证通过后自动保存截图；`screenshot` 步骤手动截图。两者均汇总到报告「截图」列展示（非每个步骤都截图）。不需要 verify 自动截图时设 `params.screenshot: false`。

### 流程图分支（`verify.branch`）

`verify` 步骤可配置 `branch`，按验证结果走「是 / 否」出口（流程图菱形）。出口目标可以是**本场景某步骤**，或**同模块另一场景文件**（继承当前浏览器状态，`entryRoute: ""` 时不重新导航）。

```json
{
  "stepId": "s3",
  "type": "verify",
  "verifyValue": "thy-table tbody tr:has-text(\"{project_name}\")",
  "matchRule": "visible",
  "desc": "列表中是否已有该项目",
  "branch": {
    "yes": { "scenario": "project_info_verify" },
    "no": { "scenario": "project_create_and_verify" }
  }
}
```

本场景内跳步：

```json
"branch": {
  "yes": { "step": "s5" },
  "no": { "step": "s9" }
}
```

| 字段 | 说明 |
|------|------|
| `branch.yes` | 验证通过时的出口 |
| `branch.no` | 验证不通过时的出口 |
| `{ "step": "s9" }` | 跳转到本场景 `stepId` |
| `{ "scenario": "project_info_verify" }` | 切换到同模块场景（按 id 或 manifest 文件名解析） |
| `branch`（非 verify 步骤） | 本步成功后跳转到 `branch.yes`（用于操作完成后进入下一段流程） |
| `next` | 本步成功后跳转到指定 `stepId`（无 branch 跳转时生效；与顺序执行二选一） |
| `params.instantVerify` | 带 branch 的 verify 设为 `true` 时即时检查 DOM，不等待；默认等待元素就绪后再分支（`visible`/`hidden` 等同普通 verify） |

场景切换时：入口场景标记 PASSED（message 含 `分支切换 → …`），目标场景独立计入报告；目标场景宜设 `entryRoute: ""` 以接力当前页面。

HTML 报告支持 **PhotoSwipe** 点击截图全屏预览，以及按 **模块 / 状态** 筛选场景列表；报告顶部嵌入本次运行的 **WebM 完整录屏**。

### 运行录屏

默认开启（`config/settings.json` → `output.recordVideo: true`）。整次测试运行共用一个浏览器 Page，录屏保存为 `projects/{id}/runs/{runId}/videos/{runId}.webm`，在 HTML 报告顶部播放。

- 场景间复用同一浏览器会话（登录不重复）
- manifest 中各场景顺序执行，均包含在同一段录屏中
- 关闭录屏：配置 `output.recordVideo: false`，或环境变量 `RECORD_VIDEO=false`

## 场景 JSON

```json
{
  "id": "login_success",
  "name": "登录成功",
  "module": "login",
  "enabled": true,
  "setup": { "requiresLogin": false, "entryRoute": "" },
  "loop": {
    "count": 5,
    "intervalMs": 1000,
    "continueOnFailure": true
  },
  "steps": [ ... ]
}
```

### 场景前置（`setup`）

| 字段 | 说明 | 默认 |
|------|------|------|
| `requiresLogin` | 是否确保已登录 | `true` |
| `entryRoute` | 非空时 `goto` 该路径（支持 `{变量}`）；**优先于** `refresh` | `"/"` |
| `refresh` | `entryRoute` 为空且为 `true` 时 `page.reload()` 刷新当前 URL（适合含动态 id 的项目详情页） | `false` |
| `readySelectors` | 导航或刷新后额外等待的选择器（全部可见） | — |

```json
{
  "setup": {
    "requiresLogin": true,
    "entryRoute": "",
    "refresh": true,
    "readySelectors": [".mission-project-detail-header .project-name-title"]
  }
}
```

`entryRoute: ""` 且不刷新时，场景接力上一场景的页面状态（addon 批量跑常用）。

### 场景继承（`extends`）

场景可继承 `fixtures/rules/` 下的公共流程模板，通过 `params` 传参。解析时自动展开为扁平 `steps`；场景自身的 `steps` 会**追加在模板之后**，用于组件内部测试步骤。

```json
{
  "id": "addon_calendar_add_and_verify",
  "name": "日历组件-添加并验证",
  "module": "mission",
  "setup": { "requiresLogin": true, "entryRoute": "" },
  "extends": "addon-nav-flow",
  "params": {
    "addonName": "日历",
    "readySelector": "mission-task-calendar",
    "screenshot": "addon_calendar_add_and_verify.png",
    "addMacro": "addon-add-plus",
    "cardSelector": ".work-app:has(.name:has-text(\"日历\")) a[thyActionIcon=\"plus-circle-thin\"]"
  },
  "steps": [
    {
      "stepId": "s_extra",
      "type": "verify",
      "verifyValue": ".calendar-header",
      "matchRule": "visible",
      "desc": "组件内部额外验证（示例）"
    }
  ]
}
```

| 字段 | 说明 |
|------|------|
| `extends` | 模板路径（相对 `fixtures/rules/` 或 `fixtures/`） |
| `params` | 替换模板占位符 `{addonName}`、`{readySelector}` 等 |
| `steps` | 可选；追加在模板 steps **之后**，写该组件独有步骤 |

addon 公共导航规则见 `fixtures/rules/addon-nav-flow.json`；各组件参数与内部步骤定义在 `scenarios/project/addon/*.json`。

### 循环 / 压测（`loop`）

| 字段 | 说明 | 默认 |
|------|------|------|
| `count` | 步骤流重复执行次数 | `1`（不循环） |
| `intervalMs` | 每轮之间的等待毫秒数 | `0` |
| `continueOnFailure` | 某轮失败后是否继续下一轮 | `false` |

循环期间日志会输出 `[loop 2/5]` 前缀；步骤中可用占位符 `{loop_index}`、`{loop_count}`：

```json
{ "stepId": "s_log", "type": "log", "value": "第 {loop_index}/{loop_count} 轮", "desc": "循环进度" }
```

登录相关占位符（运行时自动注入，无需写入场景 JSON）：

| 占位符 | 来源 |
|--------|------|
| `{username}` `{password}` | `.env` → USERNAME / PASSWORD |
| `{display_name}` | `fixtures/variables.json` → `login` 段（未设时回退为 USERNAME） |
| `{login_path}` `{login_username_selector}` 等 | `fixtures/variables.json` → `login` 段 |

## 执行语义

- **场景内 fail-fast**：任一步骤失败 → 立即终止该场景 → 输出 log + 失败截图
- **场景间复用登录会话**：同一次运行内只登录一次；`requiresLogin: true` 的场景依赖该会话，不再重复跳转登录页
- **场景间 continue**：默认继续下一个场景（`config/settings.json` → `continueOnScenarioFailure`）
- **一次运行一个目录**：`projects/{id}/runs/{runId}/` 下含 `report.html`、`screenshots/`、`logs/`、`videos/`（整次运行录屏）

## 扩展新 StepType

1. 在 `src/types/step-type.enum.ts` 添加枚举值
2. 在 `src/types/step.types.ts` 添加 zod schema
3. 新建 `src/handlers/xxx.handler.ts` 实现 `IStepHandler`
4. 在 `src/engine/handler-registry.ts` 的 `createHandlerRegistry()` 注册

## 从产品画像生成场景

```bash
node scripts/profile-to-scenario.mjs --all
node scripts/profile-to-scenario.mjs login
node scripts/profile-to-scenario.mjs login 登录成功
node scripts/profile-to-scenario.mjs login --force     # 强制重转
node scripts/profile-to-scenario.mjs project --dry-run
```

## 配置

| 文件 | 说明 |
|------|------|
| `template/` | 脚手架模版，新建项目时复制 |
| `projects/{id}/` | 业务项目目录（本地，不提交 git） |
| `projects/{id}/.env` | BASE_URL、USERNAME、PASSWORD、HEADLESS |
| `config/settings.json` | 浏览器超时、场景间隔、输出目录、defaultProject |
| `projects/{id}/fixtures/variables.json` | 模块级 `{变量}` 占位符 |

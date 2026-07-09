---
name: profile-to-scenario
description: >-
  产品画像场景 md（YAML frontmatter + StepType 步骤表）→ visual-e2e-test scenarios JSON。
  Use when 产品画像转场景、profile-to-scenario、运行 E2E 场景转换、converted 跳过或
  --force 重转、编写或校验 projects/{id}/产品画像/{module}/{场景名}.md.
---

# 产品画像 → 场景 JSON

## 何时使用

| 意图 | 动作 |
|------|------|
| 将场景 md 转为可执行 JSON | 运行 `scripts/profile-to-scenario.mjs` |
| 编写/生成场景画像 | 遵循 `projects/{id}/产品画像/README.md` |
| 从源码 scan 整理操作点（编排前） | 使用 [profile-inventory](../profile-inventory/SKILL.md) |

## 流水线位置

```text
主项目 scan → inventory md（可选）
           → 场景 md（projects/{id}/产品画像/{module}/{场景名}.md）
           → profile-to-scenario.mjs
           → projects/{id}/scenarios/{module}/{id}.json
```

## 目录结构

```text
projects/{id}/
├── 产品画像/
│   ├── README.md
│   └── {module}/
│       ├── {场景名}.md
│       └── {subdir}/
│           └── {场景名}.md
└── scenarios/
    └── {module}/
        ├── manifest.json
        ├── {id}.json
        └── {subdir}/
            └── {id}.json
```

## 场景 md 规范（摘要）

YAML frontmatter 必填：`id`、`name`、`module`、`requiresLogin`、`entryRoute`。

步骤表列：`| 步骤 | 操作类型 | 操作 | Selector / 定位 | 值 | 就绪选择器 | 验证文案 |`

- **操作类型** = StepType（`click` / `input` / `verify` / `ready` / `link` / `screenshot` / `keyboard` / `macro` …）
- 下拉等交互：多行 `click`，或 **`macro`** 引用 `fixtures/macros/{id}.json`
- `macro` 行：Selector 列 = 宏 id；值列 = `key=value; key=value` 参数
- `converted: true` 表示已转换，默认跳过

完整规范见 `projects/{id}/产品画像/README.md`（模版示例见 `template/产品画像/`）。

## 命令

```bash
# 项目由 ACTIVE_PROJECT 或 config/settings.json 的 defaultProject 决定
ACTIVE_PROJECT=<project-id> node scripts/profile-to-scenario.mjs --all

# 转换单个模块
node scripts/profile-to-scenario.mjs login

# 转换单个场景（md 文件名，不含 .md）
node scripts/profile-to-scenario.mjs login 登录成功

# 强制重转（忽略 converted: true）
node scripts/profile-to-scenario.mjs login --force

# 预览，不写 json、不改 md
node scripts/profile-to-scenario.mjs project --dry-run
```

## converted 跳过规则

| frontmatter | CLI | 行为 |
|-------------|-----|------|
| `converted: true` | 无 `--force` | **跳过**该 md |
| `converted: false` 或未写 | 任意 | 转换 |
| `converted: true` | `--force` | 强制重转 |

转换成功后脚本回写：

```yaml
converted: true
convertedAt: "2026-07-03T07:36:53.142Z"
```

画像内容有改动需重转：设 `converted: false` 或使用 `--force`。

## 输出映射

| 画像 | JSON |
|------|------|
| `id` | `scenario.id`、文件名 `{id}.json` |
| `name` | `scenario.name` |
| `module` | `scenario.module` |
| `requiresLogin` | `setup.requiresLogin` |
| `entryRoute` | `setup.entryRoute` |
| `description` | `manifest.description` |
| 操作类型 | `step.type` |
| 操作 | `step.desc` |
| Selector | `selector` / `verifyValue` |
| 值 | `value` / `url` |
| 就绪选择器 | `params.readySelectors` |
| 验证文案 | `expectValue` |

## 执行流程

```
- [ ] 1. 确认 `projects/{id}/产品画像/{module}/*.md` 存在且 frontmatter 完整
- [ ] 2. 需要重转时检查 converted 或准备 --force
- [ ] 3. 运行 profile-to-scenario.mjs
- [ ] 4. 确认 `projects/{id}/scenarios/{module}/{id}.json` 与 manifest.json
- [ ] 5. npm run test:{module} 验证
```

## 范例

- 场景 md 示例：`template/产品画像/login/登录成功.md`
- 输出 JSON：[examples/login_success.sample.json](examples/login_success.sample.json)

## 参考

- 画像规范：`projects/{id}/产品画像/README.md`
- 转换脚本：[scripts/profile-to-scenario.mjs](../../scripts/profile-to-scenario.mjs)
- 页面 inventory：[profile-inventory](../profile-inventory/SKILL.md)

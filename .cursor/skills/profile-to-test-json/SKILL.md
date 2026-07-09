---
name: profile-to-test-json
description: >-
  将 产品画像/*.md 按页面链接（路由）与操作点提炼为自动化测试用 JSON，
  含 URL、路由参数、Playwright 定位与操作类型映射。Use when converting
  product profile to E2E test data, generating test-case JSON from 产品画像,
  or when the user mentions 产品画像转 JSON、测试用例数据提取、页面操作点导出.
---

# 产品画像 → 自动化测试 JSON

## 角色定位

你是资深自动化测试工程师。从**观察者**视角，把 `产品画像/<模块>.md` 转为结构化 JSON：**页面链接 + 页面对应操作点**，供 `init-e2e-test-project` 的 Observer/用例直接消费。

输入：产品画像 Markdown（由 `product-profile` skill 或人工维护）  
输出：`tests/fixtures/profiles/<模块>.json`（或用户指定路径）

## 执行流程

```
转换进度：
- [ ] 1. 确认源文件：产品画像/<模块>.md 存在
- [ ] 2. 运行提取脚本（或手工按 schema 转换）
- [ ] 3. 校验 JSON 结构与必填字段
- [ ] 4. 标记需人工补充项（动态 id、无文案操作、断言预期）
- [ ] 5. 输出摘要：页面数、操作数、可自动化数、跳过数
```

### 命令

```bash
node .cursor/skills/profile-to-test-json/scripts/extract.mjs <模块名>
# 例：node .cursor/skills/profile-to-test-json/scripts/extract.mjs approval
# 输出：tests/fixtures/profiles/approval.json
```

可选参数：

```bash
node .cursor/skills/profile-to-test-json/scripts/extract.mjs approval \
  --input 产品画像/approval.md \
  --output tests/fixtures/profiles/approval.json \
  --base-url-env BASE_URL
```

### 多模块批量

```bash
for m in approval mission; do
  node .cursor/skills/profile-to-test-json/scripts/extract.mjs "$m"
done
```

## 解析规则

### 页面（page）来源

每个 `### \`/route/path\`` 章节 → 一个 `pages[]` 条目：

| Markdown 字段 | JSON 字段 |
|---|---|
| 路由入口 | `route` |
| 路由参数 / id | `params`（解析 `:paramName`） |
| 布局/壳组件 | `layoutComponent` |
| 含子路由 | `childRoutes` |
| 本入口操作数 | 校验用，写入 `stats.operationsInPage` |

**页面链接**：

```text
url = {baseUrl}{route_with_resolved_params}
```

- `baseUrl` 来自 `--base-url-env` 对应环境变量，默认占位 `${BASE_URL}`
- 路由中 `:id`、`:templateId` 等保留在 `params`，`urlTemplate` 供 E2E 替换

### 操作点（operation）来源

操作表格每行 → `pages[].operations[]`：

| Markdown 列 | JSON 字段 |
|---|---|
| 行号 | `sourceLine` |
| 所属组件 | `component` |
| 元素 | `element` |
| 操作方式 | `actionType`（见映射表） |
| 文案 | `label` |
| CSS Selector | `cssSelector` |
| Playwright 建议 | `playwright` |
| 事件绑定 | `eventBinding` |

### 操作方式 → actionType 映射

| 产品画像「操作方式」 | actionType | E2E 交互 |
|---|---|---|
| 点击 | `click` | InteractionService.click |
| 双击 | `dblclick` | InteractionService.dblclick |
| 路由跳转 | `navigate` | PageService.goto + 断言 URL |
| 表单提交 | `submit` | click + wait_loaded |
| 下拉菜单点击 | `menu_click` | click |
| 侧栏菜单点击 | `sidebar_click` | click |
| 行/项点击 | `row_click` | click |
| 事件（*） | `event` | 按 eventBinding 选手势/输入 |
| 事件（keydown.enter、clear） | `keyboard` | press_key / fill |
| 事件（ngModelChange）等 | `input_change` | fill 或 select |

### 路由参数附录

解析 `### 路由参数说明（测试填写）` 表格 → 顶层 `routeParams`：

```json
"routeParams": {
  "templateId": {
    "routes": ["/approval/summary/:templateId"],
    "placeholder": ":templateId",
    "example": null,
    "note": "测试时替换为真实业务 id"
  }
}
```

### 可自动化判定

| 条件 | `testable` | `skipReason` |
|---|---|---|
| 操作表格仅有 `-` 占位行 | false | `no_operations` |
| 文案为 `-` 且无稳定 cssSelector | false | `missing_label` |
| 操作方式为纯事件组件（filter-condition 等） | true | —（标记 `needsManualStep: true`） |
| 路由 `/` 且无操作 | false | `empty_page` |

**不删除**跳过的操作，保留在 JSON 中便于人工补全。

## 输出 JSON Schema

完整字段见 [schema.json](schema.json)。核心结构：

```json
{
  "module": "approval",
  "source": "产品画像/approval.md",
  "generatedAt": "2026-06-05T12:00:00.000Z",
  "baseUrl": "${BASE_URL}",
  "routeParams": {},
  "pages": [
    {
      "id": "approval",
      "route": "/approval",
      "urlTemplate": "${BASE_URL}/approval",
      "params": {},
      "layoutComponent": "ApprovalNextComponent",
      "childRoutes": ["/approval/launch"],
      "operations": [
        {
          "id": "approval-50",
          "sourceLine": 50,
          "component": "AddOrEditStatisticComponent",
          "element": "button",
          "actionType": "click",
          "label": "取消",
          "cssSelector": "wt-add-or-edit-statistic button",
          "playwright": "locator('wt-add-or-edit-statistic').getByRole('button', { name: '取消' })",
          "eventBinding": "click→cancel()",
          "testable": true,
          "needsManualStep": false,
          "assertions": []
        }
      ]
    }
  ],
  "stats": {
    "pages": 4,
    "operations": 44,
    "testable": 38,
    "skipped": 6
  },
  "manualReview": []
}
```

### pages[].id 规则

路由 `/approval/summary/:templateId` → `approval_summary_templateId`（去特殊字符，驼峰或 snake）。

### operations[].id 规则

`{pageId}-{sourceLine}`，无行号时用序号。

## 与 init-e2e-test-project 对接

JSON 消费方式：

1. **Observer 生成**：按 `pages[].route` 建模块 Observer，遍历 `operations` 中 `testable: true` 项
2. **定位优先级**：`playwright` > `cssSelector` > `label`（getByRole）
3. **截图命名**：`{module}_{page.id}_{operation.label}_{timestamp}.png`
4. **断言占位**：`assertions[]` 初始为空，人工在 `manualReview` 指引中补充

示例加载：

```python
import json
from pathlib import Path

def load_profile(module: str) -> dict:
    path = Path("tests/fixtures/profiles") / f"{module}.json"
    return json.loads(path.read_text(encoding="utf-8"))
```

## 人工补全清单

转换完成后，检查并写入 `manualReview`：

- [ ] `routeParams.*.example` 填真实测试 id
- [ ] `needsManualStep: true` 的操作补充步骤说明
- [ ] 关键操作添加 `assertions`（url_contains、visible、no_js_errors）
- [ ] 无文案图标按钮确认 cssSelector 唯一性
- [ ] 弹窗/动态组件触发路径（见画像「待人工补充」）

## 验收标准

1. 脚本对 `approval.md` 可运行且无报错
2. 输出 JSON 通过 [schema.json](schema.json) 结构校验
3. 每个有操作的页面条目含 `urlTemplate` 与 ≥1 条 operation
4. `stats.operations` 与画像「入口聚合操作」一致（允许跳过 empty 页）
5. JSON 可被测试项目 `load_profile()` 直接读取

## 参考

- JSON Schema：[schema.json](schema.json)
- 示例输出：[examples/approval.sample.json](examples/approval.sample.json)
- 产品画像说明：[产品画像/README.md](../../产品画像/README.md)
- 测试项目初始化：[init-e2e-test-project](../init-e2e-test-project/SKILL.md)

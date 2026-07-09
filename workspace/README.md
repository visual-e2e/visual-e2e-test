# Visual E2E Test — Workspace

可视化 E2E 自动化测试工作台。E2E 场景可视化创作与运行工具，与主测试项目解耦。

## 结构

```text
workspace/
├── server/    # Fastify API
└── web/       # React + Ant Design
```

前后端完全独立，各自维护 `types/`，无 shared 包。

## 启动

```bash
# 安装（首次）
cd workspace/server && npm install
cd ../web && npm install

# 开发
cd workspace/server && npm run dev   # http://localhost:3100
cd workspace/web && npm run dev      # http://localhost:5173
```

## 功能概览

| 模块 | 能力 |
|------|------|
| 场景管理（Studio） | 三栏布局：资源树 / 元信息+步骤表 / 步骤详情+JSON |
| 步骤编辑 | 12 种 StepType、extends 模板模式、展开预览 |
| 项目管理 | 多项目切换、新建（从 `template/` 或已有项目复制）/删除；各项目独立 scenarios + fixtures + .env |
| 全局变量 | 编辑 `projects/{id}/fixtures/variables.json` |
| 宏步骤 | 浏览与编辑 `projects/{id}/fixtures/macros/` |
| 规则模板 | 浏览与编辑 `projects/{id}/fixtures/rules/` |
| 产品画像 | `projects/{id}/产品画像/` |
| 运行中心 | 按当前项目运行；环境配置为 `projects/{id}/.env` |
| 校验中心 | 按模块或全量批量校验 |

## 环境变量

| 变量 | 默认 | 说明 |
|------|------|------|
| `E2E_ROOT` | 仓库根目录 | 主项目路径 |
| `WORKSPACE_PORT` | `3100` | API 端口 |
| `WEB_PORT` | `5173` | 前端 dev 端口 |

## API 摘要

- `GET/POST/PUT/DELETE /api/projects` — 项目管理
- 其余 API 需请求头 `X-Project-Id: <projectId>`（工作台 UI 自动注入，默认 `default`）
- `POST /api/validate/scenario` — 校验
- `POST /api/validate/scenario/expand` — extends 展开
- `POST /api/validate/batch/:module` — 批量校验
- `/api/fixtures/*` — variables / macros / rules
- `/api/profiles/*` — 画像列表、解析、保存、双向同步
- `POST /api/runs` — 触发运行（`scope`: scenarios | module | modules | all）
- `GET /api/runs/artifacts/:runId/report.html` — 报告

## 典型工作流

1. **产品画像 → 场景**：画像页「在 Studio 编辑」或「同步 JSON」
2. **手工编排**：场景管理 → 左侧选场景 / 新建 → 配置步骤 → 保存
3. **extends 场景**：模式选「继承规则模板」→ 选 rule + params
4. **运行**：Studio 工具栏「运行」下拉，或运行中心发起面板 → 查看报告

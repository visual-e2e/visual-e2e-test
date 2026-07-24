# 工具平台

主应用作为工具运行时：发现、安装、启动、RPC 嵌入。  
业务工具以独立仓库开发，打包为 `.vettool.zip` 后安装到本机：

```text
~/Library/Application Support/visual-e2e-test/tools/
├── installed/{id}/
├── registry.json
├── runtime.json
└── dev-links.json          # 可选：本地开发目录
```

升级主应用**不会**清除已安装工具。

## 独立工具仓库

| 工具 | 仓库 |
|------|------|
| 图片批量重命名 | `visual-e2e-tool-image-rename` |
| 场景录制 | `visual-e2e-tool-scenario-recorder` |
| 健康扫描 | `visual-e2e-tool-health-scan` |
| 脚手架模板 | `visual-e2e-tool-template` |
| CLI | `visual-e2e-cli`（`vet init tool`） |

```bash
cd visual-e2e-tool-image-rename
npm run pack
# 在工具箱「安装工具包」选择 dist/*.vettool.zip
```

## Host API

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/tools` | 已安装 / dev-link 列表（含 version） |
| POST | `/api/tools/install` | `{ path }` 本地 zip |
| DELETE | `/api/tools/:id` | 卸载用户安装的工具 |

## RPC

见仓库根目录 [`rpc/`](../rpc/README.md)。

## 本地开发联调

在 `{userData}/tools/dev-links.json`：

```json
{
  "links": [
    { "id": "image-rename", "path": "/absolute/path/to/visual-e2e-tool-image-rename" }
  ]
}
```

工具仓自行 `npm run dev`，或由 Host 按 `main` 启动生产构建产物。

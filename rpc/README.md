# Host ↔ Tool RPC

主应用与工具 iframe 的通信契约。工具侧使用 `client.ts`，宿主页使用 `host-bridge.ts`。

协议版本：见 `protocol.ts` 中 `RPC_PROTOCOL_VERSION`。

## 方法

| method | capability | 说明 |
|--------|------------|------|
| `project.getContext` | `project.context` | 当前项目 id / baseUrl |
| `fs.pickFolder` | `fs.pickFolder` | 选本地目录 |
| `scenario.navigate` | `scenario.navigate` | 打开场景管理 |
| `cache.clear` | `cache.clear` | 预留 |

Host → Tool 通知：`project.contextChanged`、`cache.clear`。

## 传输

跨源 iframe：`postMessage`，消息带 `channel: "vet-rpc"`。

/** Tool ↔ Host RPC protocol (iframe postMessage). */

export const RPC_PROTOCOL_VERSION = 1;

export const RPC_CHANNEL = "vet-rpc" as const;

export type RpcMethod =
  | "project.getContext"
  | "fs.pickFolder"
  | "cache.clear"
  | "scenario.navigate";

/** Capability ids declared in tool.json (subset may map 1:1 to methods). */
export type ToolCapability =
  | "project.context"
  | "fs.pickFolder"
  | "cache.clear"
  | "scenario.navigate";

export const METHOD_CAPABILITY: Record<RpcMethod, ToolCapability> = {
  "project.getContext": "project.context",
  "fs.pickFolder": "fs.pickFolder",
  "cache.clear": "cache.clear",
  "scenario.navigate": "scenario.navigate",
};

export interface RpcRequest {
  channel: typeof RPC_CHANNEL;
  kind: "request";
  id: string;
  method: RpcMethod;
  params?: unknown;
}

export interface RpcSuccess {
  channel: typeof RPC_CHANNEL;
  kind: "response";
  id: string;
  result: unknown;
}

export interface RpcFailure {
  channel: typeof RPC_CHANNEL;
  kind: "response";
  id: string;
  error: { code: number; message: string };
}

export type RpcResponse = RpcSuccess | RpcFailure;

/** Host → tool notification (no response expected). */
export interface RpcNotify {
  channel: typeof RPC_CHANNEL;
  kind: "notify";
  method: "project.contextChanged" | "cache.clear";
  params?: unknown;
}

export type RpcMessage = RpcRequest | RpcResponse | RpcNotify;

export interface ProjectContextResult {
  projectId: string;
  projectName?: string;
  baseUrl: string;
  scenariosRelPath: string;
}

export interface NavigateScenarioParams {
  module: string;
  scenario: string;
}

export function isRpcMessage(data: unknown): data is RpcMessage {
  if (!data || typeof data !== "object") return false;
  const msg = data as { channel?: unknown };
  return msg.channel === RPC_CHANNEL;
}

export const RpcErrorCode = {
  PARSE: -32700,
  INVALID_REQUEST: -32600,
  METHOD_NOT_FOUND: -32601,
  INVALID_PARAMS: -32602,
  INTERNAL: -32603,
  CAPABILITY_DENIED: 403,
} as const;

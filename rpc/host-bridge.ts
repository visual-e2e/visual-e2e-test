import {
  METHOD_CAPABILITY,
  RPC_CHANNEL,
  RpcErrorCode,
  isRpcMessage,
  type ProjectContextResult,
  type RpcMethod,
  type RpcNotify,
  type RpcRequest,
  type RpcResponse,
  type ToolCapability,
} from "./protocol.js";

export interface HostBridgeHandlers {
  getProjectContext: () => ProjectContextResult | null | Promise<ProjectContextResult | null>;
  pickFolder: () => Promise<string | null>;
  navigateScenario: (module: string, scenario: string) => void | Promise<void>;
  /** Optional: host-initiated cache clear is a notify, not a request handler. */
}

export interface HostBridgeOptions {
  /** Expected iframe origin; ignore other origins. */
  webOrigin: string;
  /** Capabilities declared by the active tool. */
  capabilities: readonly string[];
  handlers: HostBridgeHandlers;
  getContentWindow: () => Window | null | undefined;
}

function hasCapability(capabilities: readonly string[], method: RpcMethod): boolean {
  const need = METHOD_CAPABILITY[method];
  return capabilities.includes(need);
}

function reply(win: Window, origin: string, response: RpcResponse): void {
  win.postMessage(response, origin);
}

/**
 * Host-page bridge: listen for tool RPC requests and answer via postMessage.
 * Also supports legacy TOOL_MSG until tools migrate (handled by caller if needed).
 */
export function attachHostRpcBridge(options: HostBridgeOptions): () => void {
  const { webOrigin, capabilities, handlers, getContentWindow } = options;

  const onMessage = async (event: MessageEvent) => {
    if (event.origin !== webOrigin) return;
    if (!isRpcMessage(event.data) || event.data.kind !== "request") return;

    const req = event.data as RpcRequest;
    const win = getContentWindow();
    if (!win) return;

    if (!hasCapability(capabilities, req.method)) {
      reply(win, webOrigin, {
        channel: RPC_CHANNEL,
        kind: "response",
        id: req.id,
        error: {
          code: RpcErrorCode.CAPABILITY_DENIED,
          message: `capability denied: ${METHOD_CAPABILITY[req.method]}`,
        },
      });
      return;
    }

    try {
      const result = await dispatch(req, handlers);
      reply(win, webOrigin, {
        channel: RPC_CHANNEL,
        kind: "response",
        id: req.id,
        result,
      });
    } catch (err) {
      reply(win, webOrigin, {
        channel: RPC_CHANNEL,
        kind: "response",
        id: req.id,
        error: {
          code: RpcErrorCode.INTERNAL,
          message: err instanceof Error ? err.message : "internal error",
        },
      });
    }
  };

  window.addEventListener("message", onMessage);
  return () => window.removeEventListener("message", onMessage);
}

async function dispatch(req: RpcRequest, handlers: HostBridgeHandlers): Promise<unknown> {
  switch (req.method) {
    case "project.getContext": {
      const ctx = await handlers.getProjectContext();
      if (!ctx) throw new Error("无当前项目");
      return ctx;
    }
    case "fs.pickFolder": {
      const path = await handlers.pickFolder();
      return { path };
    }
    case "scenario.navigate": {
      const params = (req.params ?? {}) as { module?: string; scenario?: string };
      const module = params.module?.trim();
      const scenario = params.scenario?.trim();
      if (!module || !scenario) throw new Error("module 与 scenario 不能为空");
      await handlers.navigateScenario(module, scenario);
      return { ok: true };
    }
    case "cache.clear":
      return { ok: true };
    default:
      throw new Error(`unknown method: ${(req as RpcRequest).method}`);
  }
}

export function notifyTool(
  win: Window,
  origin: string,
  method: RpcNotify["method"],
  params?: unknown,
): void {
  const msg: RpcNotify = {
    channel: RPC_CHANNEL,
    kind: "notify",
    method,
    params,
  };
  win.postMessage(msg, origin);
}

export function normalizeCapabilities(
  raw: readonly string[] | undefined,
): ToolCapability[] {
  if (!raw?.length) {
    return ["project.context", "fs.pickFolder", "scenario.navigate"];
  }
  const out: ToolCapability[] = [];
  for (const c of raw) {
    if (
      c === "project.context" ||
      c === "fs.pickFolder" ||
      c === "cache.clear" ||
      c === "scenario.navigate"
    ) {
      out.push(c);
    }
    // legacy bridge aliases from older tool.json
    if (c === "pick-folder" && !out.includes("fs.pickFolder")) {
      out.push("fs.pickFolder");
    }
  }
  if (!out.includes("project.context")) out.push("project.context");
  return out;
}

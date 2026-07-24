import {
  RPC_CHANNEL,
  isRpcMessage,
  type ProjectContextResult,
  type RpcFailure,
  type RpcMethod,
  type RpcNotify,
  type RpcRequest,
  type RpcSuccess,
} from "./protocol.js";

export interface ToolRpcClientOptions {
  target?: Window;
  origin?: string;
  timeoutMs?: number;
}

type Pending = {
  resolve: (value: unknown) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
};

function randomId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Tool-iframe side RPC client. Talks to the Host via window.parent postMessage.
 */
export function createToolRpcClient(options: ToolRpcClientOptions = {}) {
  const target = options.target ?? window.parent;
  const origin = options.origin ?? "*";
  const timeoutMs = options.timeoutMs ?? 30_000;
  const pending = new Map<string, Pending>();
  const notifyListeners = new Set<(msg: RpcNotify) => void>();

  const onMessage = (event: MessageEvent) => {
    if (!isRpcMessage(event.data)) return;
    const msg = event.data;
    if (msg.kind === "response") {
      const wait = pending.get(msg.id);
      if (!wait) return;
      clearTimeout(wait.timer);
      pending.delete(msg.id);
      if ("error" in msg && msg.error) {
        wait.reject(new Error(msg.error.message));
      } else {
        wait.resolve((msg as RpcSuccess).result);
      }
      return;
    }
    if (msg.kind === "notify") {
      for (const listener of notifyListeners) listener(msg);
    }
  };

  window.addEventListener("message", onMessage);

  function call<T = unknown>(method: RpcMethod, params?: unknown): Promise<T> {
    const id = randomId();
    const request: RpcRequest = {
      channel: RPC_CHANNEL,
      kind: "request",
      id,
      method,
      params,
    };
    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`RPC timeout: ${method}`));
      }, timeoutMs);
      pending.set(id, {
        resolve: (v) => resolve(v as T),
        reject,
        timer,
      });
      target.postMessage(request, origin);
    });
  }

  return {
    call,
    getProjectContext: () => call<ProjectContextResult>("project.getContext"),
    pickFolder: () => call<{ path: string | null }>("fs.pickFolder"),
    navigateScenario: (module: string, scenario: string) =>
      call<void>("scenario.navigate", { module, scenario }),
    onNotify: (listener: (msg: RpcNotify) => void) => {
      notifyListeners.add(listener);
      return () => notifyListeners.delete(listener);
    },
    dispose: () => {
      window.removeEventListener("message", onMessage);
      for (const wait of pending.values()) {
        clearTimeout(wait.timer);
        wait.reject(new Error("RPC client disposed"));
      }
      pending.clear();
      notifyListeners.clear();
    },
  };
}

export type ToolRpcClient = ReturnType<typeof createToolRpcClient>;

export function isRpcFailure(msg: unknown): msg is RpcFailure {
  return isRpcMessage(msg) && msg.kind === "response" && "error" in msg;
}

import { createServer } from "node:net";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { toolsInstalledDir } from "./paths.js";
import { setRuntimePort } from "./store.js";
import { toolManifestSchema } from "./types.js";

export function tryListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

/** Production port declared in tool.json (preferredProd || prod). */
export function declaredProdPort(ports?: {
  preferredProd?: number;
  prod?: number;
}): number {
  const port = ports?.preferredProd ?? ports?.prod;
  if (typeof port !== "number" || !Number.isInteger(port) || port < 1024 || port > 65535) {
    throw new Error("tool.json 须声明有效的 ports.preferredProd 或 ports.prod（1024–65535）");
  }
  return port;
}

/**
 * Collect prod ports already claimed by other installed tools (by tool.json).
 * @param excludeToolId skip this id (e.g. reinstalling the same tool)
 */
export function collectInstalledProdPorts(
  toolsDir: string,
  excludeToolId?: string,
): Map<number, string> {
  const root = toolsInstalledDir(toolsDir);
  const byPort = new Map<number, string>();
  if (!existsSync(root)) return byPort;

  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    if (excludeToolId && name.name === excludeToolId) continue;
    const manifestPath = join(root, name.name, "tool.json");
    if (!existsSync(manifestPath)) continue;
    try {
      const parsed = toolManifestSchema.safeParse(
        JSON.parse(readFileSync(manifestPath, "utf-8")),
      );
      if (!parsed.success) continue;
      const port = declaredProdPort(parsed.data.ports);
      byPort.set(port, parsed.data.id);
    } catch {
      // skip invalid manifests
    }
  }
  return byPort;
}

/**
 * Ensure the declared prod port is free for install.
 * Rejects if another installed tool claims it, or if the OS port is in use.
 */
export async function assertProdPortAvailableForInstall(options: {
  toolsDir: string;
  toolId: string;
  preferred?: number;
  prod?: number;
}): Promise<number> {
  const port = declaredProdPort({
    preferredProd: options.preferred,
    prod: options.prod ?? options.preferred,
  });

  const claimed = collectInstalledProdPorts(options.toolsDir, options.toolId);
  const conflictId = claimed.get(port);
  if (conflictId) {
    throw new Error(
      `端口 ${port} 已被已安装工具「${conflictId}」占用，请先卸载该工具或修改本工具 tool.json 端口后再安装`,
    );
  }

  if (!(await tryListen(port))) {
    throw new Error(
      `端口 ${port} 已被占用，请释放该端口后再安装（例如结束占用进程，或先在工具箱停止/卸载相关工具）`,
    );
  }

  return port;
}

/**
 * Bind tool to its declared prod port (no auto-increment).
 * Updates runtime.json to match tool.json.
 */
export async function bindDeclaredProdPort(options: {
  toolsDir: string;
  toolId: string;
  preferred?: number;
  reserved: Set<number>;
}): Promise<number> {
  const { toolsDir, toolId, preferred, reserved } = options;
  const port = declaredProdPort({ preferredProd: preferred, prod: preferred });

  if (reserved.has(port)) {
    throw new Error(
      `端口 ${port} 与其它工具声明冲突，请修改 tool.json 中的 ports.preferredProd / prod`,
    );
  }

  setRuntimePort(toolsDir, toolId, port);
  reserved.add(port);
  return port;
}

/** @deprecated use bindDeclaredProdPort — kept name for older call sites */
export const allocateProdPort = bindDeclaredProdPort;

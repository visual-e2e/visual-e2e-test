import { createServer } from "node:net";
import { readRuntime, setRuntimePort } from "./store.js";

function tryListen(port: number): Promise<boolean> {
  return new Promise((resolve) => {
    const server = createServer();
    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}

async function findFreePort(start: number, reserved: Set<number>): Promise<number> {
  let port = Math.max(1024, start);
  for (let i = 0; i < 200; i += 1) {
    const candidate = port + i;
    if (reserved.has(candidate)) continue;
    if (await tryListen(candidate)) return candidate;
  }
  throw new Error("无法分配空闲端口");
}

/**
 * Resolve production port for a tool: runtime cache → preferred → auto.
 */
export async function allocateProdPort(options: {
  toolsDir: string;
  toolId: string;
  preferred?: number;
  reserved: Set<number>;
}): Promise<number> {
  const { toolsDir, toolId, preferred, reserved } = options;
  const runtime = readRuntime(toolsDir);
  const cached = runtime.ports[toolId]?.prod;
  if (cached && !reserved.has(cached) && (await tryListen(cached))) {
    reserved.add(cached);
    return cached;
  }

  const start = preferred && preferred >= 1024 ? preferred : 7200;
  const port = await findFreePort(start, reserved);
  setRuntimePort(toolsDir, toolId, port);
  reserved.add(port);
  return port;
}

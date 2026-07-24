import { spawn, type ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { bundledAppRoot, bundledNodeBinary, resolvePlaywrightBrowsersPath } from "./paths.js";
import { ensureStorage, resolveStorageLayout, type StorageLayout } from "./storage.js";

const DEV_PORT = 3100;
const PROD_PORT = 6100;

let child: ChildProcess | null = null;

function clientPort(isDev: boolean): number {
  return isDev ? DEV_PORT : PROD_PORT;
}

function serverEntry(appRoot: string, isDev: boolean): string {
  if (isDev) {
    const dist = join(appRoot, "workspace/server/dist/index.js");
    if (existsSync(dist)) return dist;
    return join(appRoot, "workspace/server/src/index.ts");
  }
  return join(appRoot, "workspace/server/dist/index.js");
}

async function waitForHealth(port: number, timeoutMs: number): Promise<void> {
  const url = `http://127.0.0.1:${port}/api/health`;
  const started = Date.now();

  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(2000) });
      if (res.ok) return;
    } catch {
      // retry
    }
    await new Promise((r) => setTimeout(r, 250));
  }

  throw new Error(`Server did not become ready at ${url}`);
}

export interface SidecarResult {
  layout: StorageLayout;
  baseUrl: string;
}

export async function startSidecar(
  isDev: boolean,
  resourcesPath: string,
  userDataPath: string,
): Promise<SidecarResult> {
  const appRoot = bundledAppRoot(isDev, resourcesPath);
  const node = bundledNodeBinary(isDev, resourcesPath);
  const entry = serverEntry(appRoot, isDev);

  if (!existsSync(entry)) {
    throw new Error(`Server entry missing: ${entry}. Run: npm run build:server`);
  }

  const port = clientPort(isDev);
  const layout = resolveStorageLayout(isDev, userDataPath);
  ensureStorage(layout, appRoot);

  const playwrightBrowsers = resolvePlaywrightBrowsersPath(isDev, layout.configDir);

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    E2E_ROOT: appRoot,
    PROJECTS_DIR: layout.projectsDir,
    CONFIG_DIR: layout.configDir,
    TOOLS_DIR: layout.toolsDir,
    WORKSPACE_PORT: String(port),
    WORKSPACE_HOST: "127.0.0.1",
    E2E_RUNTIME: "client",
    BUNDLED_NODE: node,
    CLIENT_MODE: isDev ? "0" : "1",
    SERVE_WEB: isDev ? "0" : "1",
  };

  if (playwrightBrowsers) {
    env.PLAYWRIGHT_BROWSERS_PATH = playwrightBrowsers;
  }

  const args: string[] = [];
  if (isDev && entry.endsWith(".ts")) {
    args.push("--import", "tsx", entry);
  } else {
    args.push(entry);
  }

  child = spawn(node, args, {
    cwd: appRoot,
    env,
    stdio: ["ignore", "pipe", "pipe"],
  });

  child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(chunk));
  child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(chunk));

  child.on("error", (err) => {
    console.error(`Sidecar spawn error: ${err.message}`);
  });

  await waitForHealth(port, 60_000);

  return { layout, baseUrl: `http://127.0.0.1:${port}` };
}

export function stopSidecar(): void {
  if (!child) return;
  const proc = child;
  child = null;
  proc.kill();
}

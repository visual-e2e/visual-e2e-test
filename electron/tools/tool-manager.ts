import { spawn, type ChildProcess } from "node:child_process";
import {
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
} from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { resolveStorageLayout } from "../storage.js";

export interface ToolLaunchInfo {
  id: string;
  path: string;
  main: string;
  port: number;
  source: "user" | "bundled" | "dev-link";
}

interface RunningTool {
  child: ChildProcess;
  port: number;
}

const running = new Map<string, RunningTool>();
/** In-flight ensure calls (React Strict Mode can double-invoke). */
const starting = new Map<string, Promise<number>>();

/** Host-provided packages that tools keep external (ESM cannot use NODE_PATH). */
const HOST_PEER_DEPS = ["playwright", "playwright-core"] as const;

/**
 * Symlink Host node_modules peers into the tool root so ESM can resolve them.
 * NODE_PATH alone is ignored by Node ESM resolution.
 */
export function ensureHostPeerDeps(toolRoot: string, appRoot: string): void {
  const hostNm = join(appRoot, "node_modules");
  const toolNm = join(toolRoot, "node_modules");
  mkdirSync(toolNm, { recursive: true });

  for (const name of HOST_PEER_DEPS) {
    const target = join(hostNm, name);
    if (!existsSync(target)) continue;

    const linkPath = join(toolNm, name);
    try {
      if (existsSync(linkPath) || lstatSync(linkPath).isSymbolicLink()) {
        if (lstatSync(linkPath).isSymbolicLink() && readlinkSync(linkPath) === target) {
          continue;
        }
        rmSync(linkPath, { recursive: true, force: true });
      }
    } catch {
      try {
        rmSync(linkPath, { recursive: true, force: true });
      } catch {
        // ignore
      }
    }

    try {
      symlinkSync(target, linkPath, process.platform === "win32" ? "junction" : "dir");
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      throw new Error(`无法为工具注入 Host 依赖 ${name}: ${detail}`);
    }
  }

  // Tools that import playwright need the Host package; fail early with a clear hint
  const needsPw =
    existsSync(join(toolRoot, "server", "dist", "index.js")) &&
    (() => {
      try {
        const code = readFileSync(join(toolRoot, "server", "dist", "index.js"), "utf-8");
        return /\bfrom\s*["']playwright["']|\brequire\(["']playwright["']\)/.test(code);
      } catch {
        return false;
      }
    })();
  if (needsPw && !existsSync(join(toolNm, "playwright"))) {
    throw new Error(
      `Host 未安装 playwright（期望: ${join(hostNm, "playwright")}）。请在主应用目录执行 npm install。`,
    );
  }
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
  throw new Error(`Tool server did not become ready at ${url}`);
}

async function isHealthy(port: number): Promise<boolean> {
  try {
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, {
      signal: AbortSignal.timeout(2000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function buildToolEnv(isDev: boolean, appRoot: string, toolsDir: string): NodeJS.ProcessEnv {
  const layout = resolveStorageLayout(isDev, app.getPath("userData"));
  return {
    ...process.env,
    E2E_ROOT: process.env.E2E_ROOT?.trim() || appRoot,
    PROJECTS_DIR: process.env.PROJECTS_DIR?.trim() || layout.projectsDir,
    CONFIG_DIR: process.env.CONFIG_DIR?.trim() || layout.configDir,
    TOOLS_DIR: process.env.TOOLS_DIR?.trim() || toolsDir,
    E2E_RUNTIME: process.env.E2E_RUNTIME?.trim() || "client",
  };
}

function readLocalToolLaunch(
  toolsDir: string,
  toolId: string,
  _isDev: boolean,
): ToolLaunchInfo | null {
  type Candidate = { path: string; source: ToolLaunchInfo["source"] };
  const candidates: Candidate[] = [];

  const installed = join(toolsDir, "installed", toolId);
  if (existsSync(join(installed, "tool.json"))) {
    candidates.push({ path: installed, source: "user" });
  }

  const linksPath = join(toolsDir, "dev-links.json");
  if (existsSync(linksPath)) {
    try {
      const raw = JSON.parse(readFileSync(linksPath, "utf-8")) as {
        links?: Array<{ id?: string; path?: string }>;
      };
      for (const link of raw.links ?? []) {
        const p = link.path?.trim();
        if (!p || !existsSync(join(p, "tool.json"))) continue;
        try {
          const m = JSON.parse(readFileSync(join(p, "tool.json"), "utf-8")) as { id?: string };
          if (m.id !== toolId && link.id !== toolId) continue;
          if (m.id === toolId || link.id === toolId) {
            candidates.push({ path: p, source: "dev-link" });
          }
        } catch {
          // skip
        }
      }
    } catch {
      // skip
    }
  }

  // Later entries win (dev-link after user → prefer last matching)
  let hit: Candidate | null = null;
  for (const c of candidates) {
    try {
      const m = JSON.parse(readFileSync(join(c.path, "tool.json"), "utf-8")) as { id?: string };
      if (m.id === toolId) hit = c;
    } catch {
      // skip
    }
  }
  if (!hit) return null;

  let manifest: {
    main?: string;
    ports?: { preferredProd?: number; prod?: number; dev?: number };
  };
  try {
    manifest = JSON.parse(readFileSync(join(hit.path, "tool.json"), "utf-8"));
  } catch {
    return null;
  }

  let prod = manifest.ports?.prod ?? manifest.ports?.preferredProd;
  const runtimePath = join(toolsDir, "runtime.json");
  if (existsSync(runtimePath)) {
    try {
      const runtime = JSON.parse(readFileSync(runtimePath, "utf-8")) as {
        ports?: Record<string, { prod?: number }>;
      };
      const allocated = runtime.ports?.[toolId]?.prod;
      if (typeof allocated === "number" && allocated > 0) prod = allocated;
    } catch {
      // keep manifest port
    }
  }
  if (!prod) return null;

  return {
    id: toolId,
    path: hit.path,
    main: manifest.main ?? "server/dist/index.js",
    // Packaged tools always listen on allocated prod (SERVE_WEB=1)
    port: prod,
    source: hit.source,
  };
}

/** Resolve tool launch info via workspace API when possible; fallback to local scan. */
async function resolveToolLaunch(
  toolId: string,
  isDev: boolean,
  appRoot: string,
): Promise<ToolLaunchInfo> {
  const layout = resolveStorageLayout(isDev, app.getPath("userData"));
  const apiPort = isDev ? 3100 : 6100;
  try {
    const res = await fetch(`http://127.0.0.1:${apiPort}/api/tools/${encodeURIComponent(toolId)}`, {
      signal: AbortSignal.timeout(3000),
    });
    if (res.ok) {
      const tool = (await res.json()) as {
        id: string;
        path: string;
        main: string;
        source: "user" | "bundled" | "dev-link";
        resolvedPorts?: { prod: number; dev?: number; webDev?: number };
        ports?: { preferredProd?: number; prod?: number; dev?: number; webDev?: number };
      };
      const prod = tool.resolvedPorts?.prod ?? tool.ports?.prod ?? tool.ports?.preferredProd;
      if (!prod) throw new Error("工具未分配端口");
      // Installed / dev-link packages serve API+web on one port (SERVE_WEB=1) — always prod
      const useProdOnly = tool.source === "user" || tool.source === "dev-link";
      const port = useProdOnly
        ? prod
        : isDev
          ? (tool.resolvedPorts?.dev ?? tool.ports?.dev ?? prod)
          : prod;
      return {
        id: tool.id,
        path: tool.path,
        main: tool.main,
        port,
        source: tool.source,
      };
    }
  } catch {
    // fall through to local scan
  }

  const local = readLocalToolLaunch(layout.toolsDir, toolId, isDev);
  if (local) return local;

  throw new Error(
    `Unknown tool: ${toolId}. Install a .vettool.zip from the Tools hub, or add a dev-link.`,
  );
}

export async function ensureToolRunning(
  toolId: string,
  isDev: boolean,
  appRoot: string,
  nodeBinary: string,
): Promise<number> {
  const existing = running.get(toolId);
  if (existing) return existing.port;

  const inflight = starting.get(toolId);
  if (inflight) return inflight;

  const promise = (async () => {
    const layout = resolveStorageLayout(isDev, app.getPath("userData"));
    const tool = await resolveToolLaunch(toolId, isDev, appRoot);
    const port = tool.port;

    if (await isHealthy(port)) {
      return port;
    }

    const entry = join(tool.path, tool.main);
    if (!existsSync(entry)) {
      throw new Error(
        tool.source === "bundled"
          ? `Tool server missing: ${entry}. Run: npm run tools:build`
          : `Tool server missing: ${entry}. 请重新安装工具包`,
      );
    }

    // Another ensure may have bound the port while we resolved paths
    if (await isHealthy(port)) {
      return port;
    }

    ensureHostPeerDeps(tool.path, appRoot);

    const child = spawn(nodeBinary, [entry], {
      cwd: tool.path,
      env: {
        ...buildToolEnv(isDev, appRoot, layout.toolsDir),
        TOOL_ID: tool.id,
        TOOL_PORT: String(port),
        NODE_ENV: isDev ? "development" : "production",
        SERVE_WEB: "1",
        NODE_PATH: [join(appRoot, "node_modules"), process.env.NODE_PATH]
          .filter(Boolean)
          .join(process.platform === "win32" ? ";" : ":"),
      },
      stdio: ["ignore", "pipe", "pipe"],
    });

    child.stdout?.on("data", (chunk: Buffer) => process.stdout.write(`[tool:${toolId}] ${chunk}`));
    child.stderr?.on("data", (chunk: Buffer) => process.stderr.write(`[tool:${toolId}] ${chunk}`));

    running.set(toolId, { child, port });
    child.on("exit", () => {
      if (running.get(toolId)?.child === child) running.delete(toolId);
    });

    try {
      await waitForHealth(port, 30_000);
    } catch (err) {
      // Port may already be owned by a healthy peer started concurrently
      if (await isHealthy(port)) return port;
      running.delete(toolId);
      if (!child.killed) child.kill();
      throw err;
    }
    return port;
  })();

  starting.set(toolId, promise);
  try {
    return await promise;
  } finally {
    starting.delete(toolId);
  }
}

/** @deprecated use ensureToolRunning */
export const ensureBuiltinTool = ensureToolRunning;

export function stopTool(toolId: string): void {
  const entry = running.get(toolId);
  if (!entry) return;
  if (!entry.child.killed) entry.child.kill();
  running.delete(toolId);
}

export function stopAllTools(): void {
  for (const { child } of running.values()) {
    if (!child.killed) child.kill();
  }
  running.clear();
}

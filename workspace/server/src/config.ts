import { existsSync, readFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { resolveDefaultProjectId, listProjectIds } from "./project-context.js";
import { resolveConfigDir, resolveE2eRoot, resolveProjectsDir, resolveSettingsPath } from "./paths.js";
import { ensureToolsDir, resolveToolsDir } from "./tools/paths.js";

function tryResolveDefaultProjectId(e2eRoot: string): string {
  if (listProjectIds(e2eRoot).length === 0) return "";
  try {
    return resolveDefaultProjectId(e2eRoot);
  } catch {
    return "";
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

export type E2eRuntime = "workspace" | "client";

export interface WorkspaceConfig {
  runtime: E2eRuntime;
  e2eRoot: string;
  projectsDir: string;
  configDir: string;
  toolsDir: string;
  settingsPath: string;
  defaultProjectId: string;
  port: number;
  host: string;
  serveWeb: boolean;
  webDistDir: string;
}

export function loadConfig(): WorkspaceConfig {
  const e2eRoot = resolveE2eRoot(resolve(__dirname, "../../.."));
  if (!existsSync(e2eRoot)) {
    throw new Error(`E2E_ROOT 不存在: ${e2eRoot}`);
  }

  const projectsDir = resolveProjectsDir(e2eRoot);
  const configDir = resolveConfigDir(e2eRoot);
  const toolsDir = resolveToolsDir();
  ensureToolsDir(toolsDir);
  const settingsPath = resolveSettingsPath(e2eRoot);
  const defaultProjectId = tryResolveDefaultProjectId(e2eRoot);
  const serveWeb = process.env.SERVE_WEB === "1" || process.env.SERVE_WEB === "true";
  const runtime: E2eRuntime = process.env.E2E_RUNTIME === "client" ? "client" : "workspace";

  return {
    runtime,
    e2eRoot,
    projectsDir,
    configDir,
    toolsDir,
    settingsPath,
    defaultProjectId,
    port: Number(process.env.WORKSPACE_PORT ?? 3100),
    host: process.env.WORKSPACE_HOST ?? (serveWeb ? "127.0.0.1" : "0.0.0.0"),
    serveWeb,
    webDistDir: join(e2eRoot, "workspace/web/dist"),
  };
}

export function readDefaultProjectId(e2eRoot: string): string {
  const settingsPath = resolveSettingsPath(e2eRoot);
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { defaultProject?: string };
    if (settings.defaultProject) return settings.defaultProject;
  }
  return resolveDefaultProjectId(e2eRoot);
}

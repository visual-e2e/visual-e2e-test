import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { getProjectsDir, resolveDefaultProjectId, listProjectIds } from "./project-context.js";

function tryResolveDefaultProjectId(e2eRoot: string): string {
  if (listProjectIds(e2eRoot).length === 0) return "";
  try {
    return resolveDefaultProjectId(e2eRoot);
  } catch {
    return "";
  }
}

const __dirname = dirname(fileURLToPath(import.meta.url));

function resolveE2eRoot(): string {
  if (process.env.E2E_ROOT) {
    return resolve(process.env.E2E_ROOT);
  }
  return resolve(__dirname, "../../..");
}

export interface WorkspaceConfig {
  e2eRoot: string;
  projectsDir: string;
  defaultProjectId: string;
  port: number;
}

export function loadConfig(): WorkspaceConfig {
  const e2eRoot = resolveE2eRoot();
  if (!existsSync(e2eRoot)) {
    throw new Error(`E2E_ROOT 不存在: ${e2eRoot}`);
  }

  const defaultProjectId = tryResolveDefaultProjectId(e2eRoot);

  return {
    e2eRoot,
    projectsDir: getProjectsDir(e2eRoot),
    defaultProjectId,
    port: Number(process.env.WORKSPACE_PORT ?? 3100),
  };
}

export function readDefaultProjectId(e2eRoot: string): string {
  const settingsPath = join(e2eRoot, "config", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { defaultProject?: string };
    if (settings.defaultProject) return settings.defaultProject;
  }
  return resolveDefaultProjectId(e2eRoot);
}

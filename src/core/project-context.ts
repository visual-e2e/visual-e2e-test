import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  createdAt?: string;
}

export interface ProjectContext {
  id: string;
  root: string;
  scenariosDir: string;
  fixturesDir: string;
  variablesPath: string;
  profilesDir: string;
  envPath: string;
  runsDir: string;
}

export function getProjectsDir(e2eRoot: string): string {
  return join(e2eRoot, "projects");
}

export function listProjectIds(e2eRoot: string): string[] {
  const dir = getProjectsDir(e2eRoot);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "project.json")))
    .map((e) => e.name)
    .sort();
}

export function readProjectMeta(e2eRoot: string, projectId: string): ProjectMeta {
  const path = join(getProjectsDir(e2eRoot), projectId, "project.json");
  if (!existsSync(path)) {
    throw new Error(`项目不存在: ${projectId}`);
  }
  const raw = JSON.parse(readFileSync(path, "utf-8")) as ProjectMeta;
  return { ...raw, id: raw.id ?? projectId };
}

export function resolveProjectContext(e2eRoot: string, projectId: string): ProjectContext {
  const root = resolve(e2eRoot, "projects", projectId);
  if (!existsSync(join(root, "project.json"))) {
    throw new Error(`项目不存在: ${projectId}`);
  }
  return {
    id: projectId,
    root,
    scenariosDir: join(root, "scenarios"),
    fixturesDir: join(root, "fixtures"),
    variablesPath: join(root, "fixtures", "variables.json"),
    profilesDir: join(root, "产品画像"),
    envPath: join(root, ".env"),
    runsDir: join(root, "runs"),
  };
}

export function resolveDefaultProjectId(e2eRoot: string, preferred?: string): string {
  const ids = listProjectIds(e2eRoot);
  if (ids.length === 0) {
    throw new Error("未找到任何项目，请在 projects/ 下创建项目或通过工作台新建");
  }

  if (preferred && ids.includes(preferred)) return preferred;

  const fromEnv = process.env.ACTIVE_PROJECT?.trim();
  if (fromEnv && ids.includes(fromEnv)) return fromEnv;

  const settingsPath = join(e2eRoot, "config", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { defaultProject?: string };
    if (settings.defaultProject && ids.includes(settings.defaultProject)) {
      return settings.defaultProject;
    }
  }

  if (ids.length === 1) return ids[0]!;
  throw new Error(
    `存在多个项目 (${ids.join(", ")})，请通过 --project、ACTIVE_PROJECT 或 config/settings.json 的 defaultProject 指定`,
  );
}

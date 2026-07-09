import {
  cpSync,
  existsSync,
  readdirSync,
  readFileSync,
  writeFileSync,
  rmSync,
  renameSync,
  mkdirSync,
} from "node:fs";
import { join, resolve, basename, relative, sep } from "node:path";

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

export interface ProjectSummary extends ProjectMeta {
  envReady: boolean;
  moduleCount: number;
}

export function isProtectedProject(_projectId: string): boolean {
  return false;
}

export function resolveTemplateRoot(e2eRoot: string, templateId?: string): string {
  const tpl = templateId?.trim() || BUILTIN_TEMPLATE_ID;
  if (tpl === BUILTIN_TEMPLATE_ID) {
    const dir = getTemplateDir(e2eRoot);
    if (!existsSync(dir)) throw new Error("内置模版不存在: template/");
    return dir;
  }
  const projectRoot = join(getProjectsDir(e2eRoot), tpl);
  if (!existsSync(join(projectRoot, "project.json"))) {
    throw new Error(`模板项目不存在: ${tpl}`);
  }
  return projectRoot;
}

export const BUILTIN_TEMPLATE_ID = "__template__";

export function getTemplateDir(e2eRoot: string): string {
  return join(e2eRoot, "template");
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
  if (!existsSync(path)) throw new Error(`项目不存在: ${projectId}`);
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
    if (settings.defaultProject && ids.includes(settings.defaultProject)) return settings.defaultProject;
  }

  if (ids.length === 1) return ids[0]!;
  throw new Error(
    `存在多个项目 (${ids.join(", ")})，请通过 X-Project-Id、ACTIVE_PROJECT 或 config/settings.json 的 defaultProject 指定`,
  );
}

const REQUIRED_ENV_KEYS = ["BASE_URL", "USERNAME", "PASSWORD"];

export function checkProjectEnv(envPath: string): { ok: boolean; missing: string[] } {
  if (!existsSync(envPath)) return { ok: false, missing: [".env 文件"] };
  const content = readFileSync(envPath, "utf-8");
  const missing: string[] = [];
  for (const key of REQUIRED_ENV_KEYS) {
    if (!content.match(new RegExp(`^${key}=.+`, "m"))) missing.push(key);
  }
  return { ok: missing.length === 0, missing };
}

export function scaffoldProject(e2eRoot: string, meta: ProjectMeta, templateId?: string): ProjectContext {
  const templateRoot = resolveTemplateRoot(e2eRoot, templateId);
  const projectsDir = getProjectsDir(e2eRoot);
  mkdirSync(projectsDir, { recursive: true });
  const root = join(projectsDir, meta.id);
  if (existsSync(root)) throw new Error(`项目已存在: ${meta.id}`);

  cpSync(templateRoot, root, {
    recursive: true,
    filter: (src) => shouldCopyScaffoldSource(src, templateRoot),
  });

  mkdirSync(join(root, "runs"), { recursive: true });

  writeFileSync(join(root, "project.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf-8");

  const envExample = join(root, ".env.example");
  const envPath = join(root, ".env");
  if (!existsSync(envPath) && existsSync(envExample)) {
    writeFileSync(envPath, readFileSync(envExample, "utf-8"), "utf-8");
  }

  return resolveProjectContext(e2eRoot, meta.id);
}

function shouldCopyScaffoldSource(src: string, templateRoot: string): boolean {
  if (basename(src) === ".env") return false;
  const rel = relative(templateRoot, src);
  if (rel === "runs" || rel.startsWith(`runs${sep}`)) return false;
  return true;
}

export function renameProject(e2eRoot: string, oldId: string, newId: string): void {
  if (oldId === newId) return;
  if (isProtectedProject(oldId)) throw new Error(`不能重命名受保护项目: ${oldId}`);
  if (!newId.match(/^[a-z0-9][a-z0-9-_]*$/)) {
    throw new Error("项目 id 须为小写字母、数字、-、_");
  }
  const projectsDir = getProjectsDir(e2eRoot);
  const oldRoot = join(projectsDir, oldId);
  const newRoot = join(projectsDir, newId);
  if (!existsSync(join(oldRoot, "project.json"))) throw new Error(`项目不存在: ${oldId}`);
  if (existsSync(newRoot)) throw new Error(`项目 id 已存在: ${newId}`);
  renameSync(oldRoot, newRoot);
  syncSettingsDefaultProject(e2eRoot, oldId, newId);
}

function syncSettingsDefaultProject(e2eRoot: string, oldId: string, newId: string): void {
  const settingsPath = join(e2eRoot, "config", "settings.json");
  if (!existsSync(settingsPath)) return;
  const settings = JSON.parse(readFileSync(settingsPath, "utf-8")) as { defaultProject?: string };
  if (settings.defaultProject !== oldId) return;
  settings.defaultProject = newId;
  writeFileSync(settingsPath, `${JSON.stringify(settings, null, 2)}\n`, "utf-8");
}

export function deleteProject(e2eRoot: string, projectId: string): void {
  if (isProtectedProject(projectId)) throw new Error(`不能删除受保护项目: ${projectId}`);
  const root = join(getProjectsDir(e2eRoot), projectId);
  if (!existsSync(join(root, "project.json"))) throw new Error(`项目不存在: ${projectId}`);
  const ids = listProjectIds(e2eRoot);
  if (ids.length <= 1) throw new Error("至少保留一个项目");
  rmSync(root, { recursive: true, force: true });
}

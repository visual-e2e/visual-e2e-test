import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { resolveProjectToolContext } from "./project-context.js";
import type { ScenarioExport, ScenarioMeta } from "./types.js";

export type RecordingStatus = "draft" | "imported";

export interface Recording {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  sessionMeta: ScenarioMeta & { startUrl: string };
  scenario: ScenarioExport;
  status: RecordingStatus;
  description?: string;
  importedFile?: string;
}

export interface RecordingSummary {
  id: string;
  projectId: string;
  createdAt: string;
  updatedAt: string;
  scenarioId: string;
  scenarioName: string;
  module: string;
  stepCount: number;
  status: RecordingStatus;
  description?: string;
  importedFile?: string;
}

function nowIso(): string {
  return new Date().toISOString();
}

function recordingsDir(projectId: string): string {
  return join(resolveProjectToolContext(projectId).root, "recordings");
}

function recordingPath(projectId: string, id: string): string {
  return join(recordingsDir(projectId), `${id}.json`);
}

function scenariosModuleDir(projectId: string, module: string): string {
  return join(resolveProjectToolContext(projectId).root, "scenarios", module);
}

function ensureRecordingsDir(projectId: string): string {
  const dir = recordingsDir(projectId);
  mkdirSync(dir, { recursive: true });
  return dir;
}

function toSummary(rec: Recording): RecordingSummary {
  return {
    id: rec.id,
    projectId: rec.projectId,
    createdAt: rec.createdAt,
    updatedAt: rec.updatedAt,
    scenarioId: rec.scenario.id,
    scenarioName: rec.scenario.name,
    module: rec.scenario.module,
    stepCount: rec.scenario.steps?.length ?? 0,
    status: rec.status,
    ...(rec.description ? { description: rec.description } : {}),
    importedFile: rec.importedFile,
  };
}

function readRecordingFile(path: string): Recording | null {
  try {
    return JSON.parse(readFileSync(path, "utf-8")) as Recording;
  } catch {
    return null;
  }
}

export function listRecordings(projectId: string): RecordingSummary[] {
  const dir = recordingsDir(projectId);
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith(".json"))
    .map((f) => readRecordingFile(join(dir, f)))
    .filter((r): r is Recording => Boolean(r))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map(toSummary);
}

export function getRecording(projectId: string, id: string): Recording {
  const path = recordingPath(projectId, id);
  if (!existsSync(path)) throw new Error(`录制记录不存在: ${id}`);
  const rec = readRecordingFile(path);
  if (!rec) throw new Error(`录制记录损坏: ${id}`);
  return rec;
}

export function createRecording(input: {
  projectId: string;
  sessionMeta: ScenarioMeta & { startUrl: string };
  scenario: ScenarioExport;
  description?: string;
  allowEmptySteps?: boolean;
}): Recording {
  resolveProjectToolContext(input.projectId);
  validateScenarioExport(input.scenario, { allowEmptySteps: input.allowEmptySteps === true });
  const now = nowIso();
  const description = input.description?.trim();
  const recording: Recording = {
    id: randomUUID(),
    projectId: input.projectId,
    createdAt: now,
    updatedAt: now,
    sessionMeta: input.sessionMeta,
    scenario: input.scenario,
    status: "draft",
    ...(description ? { description } : {}),
  };
  ensureRecordingsDir(input.projectId);
  writeFileSync(recordingPath(input.projectId, recording.id), `${JSON.stringify(recording, null, 2)}\n`);
  return recording;
}

export function updateRecording(
  projectId: string,
  id: string,
  patch: {
    scenario?: ScenarioExport;
    sessionMeta?: ScenarioMeta & { startUrl: string };
    description?: string | null;
    status?: RecordingStatus;
    clearImported?: boolean;
    allowEmptySteps?: boolean;
  },
): Recording {
  const rec = getRecording(projectId, id);
  if (patch.scenario) {
    validateScenarioExport(patch.scenario, { allowEmptySteps: patch.allowEmptySteps === true });
    rec.scenario = patch.scenario;
  }
  if (patch.sessionMeta) {
    rec.sessionMeta = patch.sessionMeta;
  }
  if (patch.description !== undefined) {
    const description = patch.description?.trim() || "";
    if (description) rec.description = description;
    else delete rec.description;
  }
  if (patch.status) {
    rec.status = patch.status;
  }
  if (patch.clearImported) {
    delete rec.importedFile;
  }
  rec.updatedAt = nowIso();
  writeFileSync(recordingPath(projectId, id), `${JSON.stringify(rec, null, 2)}\n`);
  return rec;
}

export function deleteRecording(projectId: string, id: string): void {
  const path = recordingPath(projectId, id);
  if (!existsSync(path)) throw new Error(`录制记录不存在: ${id}`);
  unlinkSync(path);
}

export function scenarioExists(projectId: string, module: string, file: string): boolean {
  return existsSync(join(scenariosModuleDir(projectId, module), file));
}

export function importRecording(
  projectId: string,
  id: string,
  options: { overwrite?: boolean } = {},
): { recording: Recording; file: string; overwritten: boolean } {
  const rec = getRecording(projectId, id);
  validateScenarioExport(rec.scenario);

  const module = rec.scenario.module.trim();
  if (!/^[a-z][a-z0-9_-]*$/.test(module)) {
    throw new Error("模块名须以小写字母开头，仅含字母、数字、_、-");
  }

  const file = `${rec.scenario.id}.json`;
  const moduleDir = scenariosModuleDir(projectId, module);
  const abs = join(moduleDir, file);
  const exists = existsSync(abs);
  if (exists && !options.overwrite) {
    const err = new Error(`场景已存在: ${module}/${file}`) as Error & { code?: string };
    err.code = "CONFLICT";
    throw err;
  }

  mkdirSync(moduleDir, { recursive: true });
  writeFileSync(abs, `${JSON.stringify(rec.scenario, null, 2)}\n`);
  ensureManifestEntry(projectId, module, file);

  rec.status = "imported";
  rec.importedFile = `${module}/${file}`;
  rec.updatedAt = nowIso();
  writeFileSync(recordingPath(projectId, id), `${JSON.stringify(rec, null, 2)}\n`);

  return { recording: rec, file, overwritten: exists };
}

function ensureManifestEntry(projectId: string, module: string, file: string): void {
  const manifestPath = join(scenariosModuleDir(projectId, module), "manifest.json");
  let manifest: { module: string; description?: string; scenarios: string[] };
  if (existsSync(manifestPath)) {
    manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as typeof manifest;
  } else {
    manifest = { module, scenarios: [] };
  }
  if (!manifest.scenarios.includes(file)) {
    manifest.scenarios.push(file);
    manifest.scenarios.sort((a, b) => a.localeCompare(b, "zh-CN"));
  }
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

export function validateScenarioExport(
  scenario: ScenarioExport,
  options: { allowEmptySteps?: boolean } = {},
): void {
  if (!scenario || typeof scenario !== "object") throw new Error("场景 JSON 无效");
  if (!String(scenario.id ?? "").trim()) throw new Error("场景 id 不能为空");
  if (!String(scenario.name ?? "").trim()) throw new Error("场景名称不能为空");
  if (!String(scenario.module ?? "").trim()) throw new Error("模块不能为空");
  if (!Array.isArray(scenario.steps)) throw new Error("steps 须为数组");
  if (!options.allowEmptySteps && scenario.steps.length === 0) {
    throw new Error("场景至少需要一个步骤");
  }
}

export function parseScenarioExport(
  raw: unknown,
  options: { allowEmptySteps?: boolean } = {},
): ScenarioExport {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    throw new Error("根节点须为 JSON 对象");
  }
  const record = raw as Record<string, unknown>;
  const setup = (record.setup as Record<string, unknown> | undefined) ?? {};
  const scenario: ScenarioExport = {
    id: String(record.id ?? "").trim(),
    name: String(record.name ?? "").trim(),
    module: String(record.module ?? "").trim(),
    enabled: record.enabled !== false,
    setup: {
      requiresLogin: setup.requiresLogin !== false,
      entryRoute: String(setup.entryRoute ?? ""),
    },
    steps: Array.isArray(record.steps) ? (record.steps as ScenarioExport["steps"]) : [],
  };
  validateScenarioExport(scenario, options);
  return scenario;
}

import type {
  HealthResponse, ModuleInfo, ScenarioSummary, ValidateResult,
  ProfileSummary, MacroSummary, RuleSummary, RunJob, RunScope,
} from "../types/module";
import type { ScenarioDraft } from "../types/scenario";
import { compactScenarioPayload } from "../utils/scenario-serialize";
import type { SettingsDraft } from "../types/settings";

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

let activeProjectId = localStorage.getItem("activeProjectId") ?? "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const headers = new Headers(init?.headers);
  const hasBody = init?.body !== undefined && init.body !== null && init.body !== "";
  if (hasBody && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (activeProjectId) {
    headers.set("X-Project-Id", activeProjectId);
  }

  const res = await fetch(`${API_BASE}${path}`, { ...init, headers });
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; message?: string; issues?: unknown };
    const err = new Error(body.error ?? body.message ?? `请求失败: ${res.status}`) as Error & { issues?: unknown };
    err.issues = body.issues;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  setProjectId: (id: string) => { activeProjectId = id; },
  getProjectId: () => activeProjectId,
  health: () => request<HealthResponse>("/api/health"),
  projects: () => request<ProjectMeta[]>("/api/projects"),
  createProject: (data: { id: string; name: string; description?: string; templateProjectId?: string }) =>
    request<ProjectMeta>("/api/projects", { method: "POST", body: JSON.stringify(data) }),
  updateProject: (id: string, data: { id?: string; name?: string; description?: string }) =>
    request<ProjectMeta>(`/api/projects/${id}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteProject: (id: string) =>
    request<{ ok: boolean }>(`/api/projects/${id}`, { method: "DELETE" }),
  modules: () => request<ModuleInfo[]>("/api/modules"),
  createModule: (module: string, description?: string) =>
    request<ModuleInfo>("/api/modules", {
      method: "POST",
      body: JSON.stringify({ module, description }),
    }),
  scenarios: (module: string, q?: string) =>
    request<ScenarioSummary[]>(`/api/modules/${module}/scenarios${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  getScenario: (module: string, file: string) =>
    request<Record<string, unknown>>(`/api/scenarios/${module}/${file}`),
  createScenario: (module: string, file: string, data: ScenarioDraft) =>
    request<{ file: string }>("/api/scenarios", {
      method: "POST",
      body: JSON.stringify({ module, file, data: draftPayload(data) }),
    }),
  updateScenario: (module: string, file: string, data: ScenarioDraft) =>
    request<{ file: string }>(`/api/scenarios/${module}/${file}`, {
      method: "PUT",
      body: JSON.stringify({ data: draftPayload(data) }),
    }),
  deleteScenario: (module: string, file: string) =>
    request<{ ok: boolean }>(`/api/scenarios/${module}/${file}`, { method: "DELETE" }),
  duplicateScenario: (module: string, file: string, newId: string) =>
    request<{ file: string }>("/api/scenarios/duplicate", {
      method: "POST",
      body: JSON.stringify({ module, file, newId }),
    }),
  validateScenario: (data: ScenarioDraft) =>
    request<ValidateResult>("/api/validate/scenario", {
      method: "POST",
      body: JSON.stringify({ data: draftPayload(data) }),
    }),
  expandScenario: (data: ScenarioDraft) =>
    request<{ expanded: unknown }>("/api/validate/scenario/expand", {
      method: "POST",
      body: JSON.stringify({ data: draftPayload(data) }),
    }),
  validateBatch: (module: string) =>
    request<unknown>(`/api/validate/batch/${module}`, { method: "POST" }),
  validateBatchAll: () => request<unknown>("/api/validate/batch-all", { method: "POST" }),

  getSettings: () => request<SettingsDraft>("/api/config/settings"),
  saveSettings: (data: SettingsDraft) =>
    request<{ ok: boolean }>("/api/config/settings", { method: "PUT", body: JSON.stringify(data) }),

  variables: () => request<Record<string, Record<string, string>>>("/api/fixtures/variables"),
  saveVariables: (data: Record<string, Record<string, string>>) =>
    request<{ ok: boolean }>("/api/fixtures/variables", { method: "PUT", body: JSON.stringify(data) }),
  macros: () => request<MacroSummary[]>("/api/fixtures/macros"),
  getMacro: (id: string) => request<Record<string, unknown>>(`/api/fixtures/macros/${encodeURIComponent(id)}`),
  saveMacro: (id: string, data: unknown) =>
    request<{ ok: boolean }>(`/api/fixtures/macros/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  createMacro: (id: string, data: unknown) =>
    request<{ ok: boolean }>("/api/fixtures/macros", {
      method: "POST",
      body: JSON.stringify({ id, data }),
    }),
  deleteMacro: (id: string) =>
    request<{ ok: boolean }>(`/api/fixtures/macros/${encodeURIComponent(id)}`, { method: "DELETE" }),
  rules: () => request<RuleSummary[]>("/api/fixtures/rules"),
  getRule: (id: string) => request<Record<string, unknown>>(`/api/fixtures/rules/${encodeURIComponent(id)}`),
  saveRule: (id: string, data: unknown) =>
    request<{ ok: boolean }>(`/api/fixtures/rules/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  createRule: (id: string, data: unknown) =>
    request<{ ok: boolean }>("/api/fixtures/rules", {
      method: "POST",
      body: JSON.stringify({ id, data }),
    }),
  deleteRule: (id: string) =>
    request<{ ok: boolean }>(`/api/fixtures/rules/${encodeURIComponent(id)}`, { method: "DELETE" }),

  profiles: (module?: string) =>
    request<ProfileSummary[]>(`/api/profiles${module ? `?module=${module}` : ""}`),
  getProfileContent: (module: string, file: string) =>
    request<{ content: string }>(`/api/profiles/${module}/${file}`),
  saveProfile: (module: string, file: string, content: string) =>
    request<{ ok: boolean }>("/api/profiles/export", {
      method: "PUT",
      body: JSON.stringify({ module, file, content }),
    }),
  deleteProfile: (module: string, file: string) =>
    request<{ ok: boolean; deletedScenario: string | null }>(
      `/api/profiles/${module}/${file}`,
      { method: "DELETE" },
    ),
  getProfileStatus: (module: string, file: string) =>
    request<{ converted: boolean; jsonPath: string | null; jsonExists: boolean; diverged: boolean }>(
      `/api/profiles/status?module=${encodeURIComponent(module)}&file=${encodeURIComponent(file)}`,
    ),
  parseProfile: (module: string, file: string) =>
    request<{ scenario: Record<string, unknown> }>("/api/profiles/parse", {
      method: "POST",
      body: JSON.stringify({ module, file }),
    }),
  syncFromScenario: (module: string, profileFile: string, scenario: ScenarioDraft) =>
    request<{ ok: boolean }>("/api/profiles/sync-from-scenario", {
      method: "POST",
      body: JSON.stringify({ module, profileFile, scenario: draftPayload(scenario) }),
    }),
  syncProfile: (module: string, scenarioName?: string, force?: boolean) =>
    request<{ ok: boolean; stdout: string }>("/api/profiles/sync-to-scenario", {
      method: "POST",
      body: JSON.stringify({ module, scenarioName, force }),
    }),
  syncProfileBatch: (force?: boolean) =>
    request<{ ok: boolean; stdout: string }>("/api/profiles/sync-batch", {
      method: "POST",
      body: JSON.stringify({ force }),
    }),
  scenarioToMd: (scenario: ScenarioDraft, module: string, profileFile: string) =>
    request<{ content: string }>("/api/profiles/scenario-to-md", {
      method: "POST",
      body: JSON.stringify({ scenario: draftPayload(scenario), module, profileFile }),
    }),

  envCheck: () => request<{ ok: boolean; missing: string[] }>("/api/runs/env-check"),
  browserCheck: () => request<BrowserCheckResponse>("/api/runs/browser-check"),
  getBrowserRuntime: () => request<BrowserRuntimeResponse>("/api/browser/runtime"),
  saveBrowserRuntime: (body: { mode?: "managed" | "custom"; executablePath?: string }) =>
    request<BrowserRuntimeResponse>("/api/browser/runtime", {
      method: "PUT",
      body: JSON.stringify(body),
    }),
  detectBrowsers: () => request<{ candidates: BrowserCandidate[] }>("/api/browser/detect"),
  installBrowser: () => request<BrowserInstallJob>("/api/browser/install", { method: "POST" }),
  getBrowserInstallJob: (jobId: string) => request<BrowserInstallJob>(`/api/browser/install/${jobId}`),
  getEnv: () => request<{ exists: boolean; content: string; template: string; path?: string }>("/api/runs/env"),
  saveEnv: (content: string) =>
    request<{ ok: boolean; missing: string[] }>("/api/runs/env", {
      method: "PUT",
      body: JSON.stringify({ content }),
    }),
  createRun: (plan: {
    scope: RunScope;
    modules: string[];
    scenarios?: string[];
    options?: RunJob["options"];
  }) =>
    request<RunJob>("/api/runs", {
      method: "POST",
      body: JSON.stringify({
        scope: plan.scope,
        modules: plan.modules,
        scenarios: plan.scenarios ?? [],
        options: plan.options,
      }),
    }),
  listRuns: () => request<RunJob[]>("/api/runs"),
  getRun: (jobId: string) => request<RunJob>(`/api/runs/${jobId}`),
  cancelRun: (jobId: string) =>
    request<{ ok: boolean }>(`/api/runs/${jobId}`, { method: "DELETE" }),
  deleteRuns: (runIds: string[]) =>
    request<{ deleted: string[]; skipped: Array<{ runId: string; reason: string }> }>(
      "/api/runs/delete",
      { method: "POST", body: JSON.stringify({ runIds }) },
    ),

  toolsRegistry: () =>
    request<import("../features/tools/types").ToolRegistryResponse>("/api/tools"),
  listTools: () =>
    request<import("../features/tools/types").ToolRegistryResponse>("/api/tools"),
  installTool: (path: string) =>
    request<{ ok: boolean; tool: { id: string; version: string; name: string } }>(
      "/api/tools/install",
      { method: "POST", body: JSON.stringify({ path }) },
    ),
  uninstallTool: (toolId: string) =>
    request<{ ok: boolean }>(`/api/tools/${encodeURIComponent(toolId)}`, {
      method: "DELETE",
    }),
};

function draftPayload(draft: ScenarioDraft): Record<string, unknown> {
  return compactScenarioPayload(draft);
}

export function reportUrl(job: RunJob): string | undefined {
  if (!job.runDir) return undefined;
  const runId = job.runDir.split("/").pop();
  const projectId = job.projectId ?? activeProjectId;
  if (!runId || !projectId) return undefined;
  return `/api/runs/artifacts/${projectId}/${runId}/report.html`;
}

export function canOpenReport(job: RunJob): boolean {
  return job.status !== "running" && !!job.reportFile;
}

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
  envReady?: boolean;
  moduleCount?: number;
}

export interface BrowserCheckResponse {
  ok: boolean;
  status: "missing" | "invalid" | "ready";
  mode: "managed" | "custom";
  platform: string;
  path: string;
  version: string;
  hints: string[];
}

export interface BrowserRuntimeConfig {
  version: number;
  mode: "managed" | "custom";
  managed: { browsersPath: string };
  custom: { executablePath: string };
  detected: { version?: string; source?: string; verifiedAt?: string } | null;
}

export interface BrowserRuntimeResponse {
  runtime: BrowserRuntimeConfig;
  check: BrowserCheckResponse;
  engineVersion: string;
}

export const BROWSER_COMPATIBILITY = {
  EXACT: "exact",
  DIFFERENT: "different",
  UNKNOWN: "unknown",
} as const;

export type BrowserCompatibility =
  typeof BROWSER_COMPATIBILITY[keyof typeof BROWSER_COMPATIBILITY];

export interface BrowserCandidate {
  path: string;
  label: string;
  source: string;
  version: string;
  engineVersion: string;
  compatibility: BrowserCompatibility;
}

export interface BrowserInstallJob {
  jobId: string;
  status: "running" | "done" | "failed";
  logs: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

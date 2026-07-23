import type {
  BrowserStatus,
  ProjectMeta,
  ProjectToolContext,
  Recording,
  RecordingSummary,
  RecorderCommand,
  RecorderSession,
  ScenarioExport,
  ScenarioMeta,
} from "../types";

const API = "";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API}${path}`, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => ({}))) as { error?: string; code?: string };
    const err = new Error(body.error ?? `请求失败: ${res.status}`) as Error & { code?: string; status?: number };
    err.code = body.code;
    err.status = res.status;
    throw err;
  }
  return res.json() as Promise<T>;
}

export const api = {
  browserStatus: () => request<BrowserStatus>("/api/browser/status"),

  projects: () => request<{ projects: ProjectMeta[] }>("/api/projects"),

  projectContext: (projectId: string) =>
    request<ProjectToolContext>(`/api/projects/${encodeURIComponent(projectId)}/context`),

  createSession: (body: { startUrl: string; meta: ScenarioMeta }) =>
    request<RecorderSession>("/api/sessions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  getSession: (sessionId: string) => request<RecorderSession>(`/api/sessions/${sessionId}`),

  command: (sessionId: string, command: RecorderCommand) =>
    request<RecorderSession>(`/api/sessions/${sessionId}/command`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ command }),
    }),

  cancel: (sessionId: string) =>
    request<{ ok: boolean }>(`/api/sessions/${sessionId}`, { method: "DELETE" }),

  listRecordings: (projectId: string) =>
    request<{ recordings: RecordingSummary[] }>(
      `/api/recordings?projectId=${encodeURIComponent(projectId)}`,
    ),

  getRecording: (projectId: string, id: string) =>
    request<Recording>(
      `/api/recordings/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`,
    ),

  createRecording: (body: {
    projectId: string;
    sessionMeta: ScenarioMeta & { startUrl: string };
    scenario: ScenarioExport;
    description?: string;
    allowEmptySteps?: boolean;
  }) =>
    request<Recording>("/api/recordings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  updateRecording: (
    id: string,
    body: {
      projectId: string;
      scenario?: ScenarioExport;
      sessionMeta?: ScenarioMeta & { startUrl: string };
      description?: string | null;
      status?: "draft" | "imported";
      clearImported?: boolean;
      allowEmptySteps?: boolean;
    },
  ) =>
    request<Recording>(`/api/recordings/${encodeURIComponent(id)}`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    }),

  deleteRecording: (projectId: string, id: string) =>
    request<{ ok: boolean }>(
      `/api/recordings/${encodeURIComponent(id)}?projectId=${encodeURIComponent(projectId)}`,
      { method: "DELETE" },
    ),

  scenarioExists: (projectId: string, module: string, file: string) =>
    request<{ exists: boolean }>(
      `/api/scenarios/exists?projectId=${encodeURIComponent(projectId)}&module=${encodeURIComponent(module)}&file=${encodeURIComponent(file)}`,
    ),

  importRecording: (id: string, body: { projectId: string; overwrite?: boolean }) =>
    request<{ recording: Recording; file: string; overwritten: boolean }>(
      `/api/recordings/${encodeURIComponent(id)}/import`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
};

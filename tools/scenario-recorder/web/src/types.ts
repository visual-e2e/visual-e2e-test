export interface StepDraft {
  stepId: string;
  type: string;
  selector?: string;
  url?: string;
  value?: string | number;
  params?: Record<string, unknown>;
  desc?: string;
}

export interface ScenarioMeta {
  id: string;
  name: string;
  module: string;
  requiresLogin: boolean;
}

export interface ScenarioExport {
  id: string;
  name: string;
  module: string;
  enabled: boolean;
  setup: {
    requiresLogin: boolean;
    entryRoute: string;
  };
  steps: StepDraft[];
}

export type RecorderStatus =
  | "starting"
  | "preparing"
  | "recording"
  | "paused"
  | "stopping"
  | "stopped"
  | "cancelled"
  | "error";

export interface RecorderSession {
  sessionId: string;
  status: RecorderStatus;
  startUrl: string;
  currentUrl: string;
  meta: ScenarioMeta;
  steps: StepDraft[];
  scenario?: ScenarioExport;
  error?: string;
  startedAt: string;
  updatedAt: string;
  revision: number;
}

export interface BrowserStatus {
  ok: boolean;
  path: string;
  version: string;
  hints: string[];
}

export type RecorderCommand = "start" | "pause" | "resume" | "stop";

export interface ProjectMeta {
  id: string;
  name: string;
  description?: string;
}

export interface ProjectToolContext {
  projectId: string;
  projectName: string;
  baseUrl: string;
  scenariosRelPath: string;
  recordingsRelPath: string;
  root: string;
}

export type RecordingStatus = "draft" | "imported";

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

export const TOOL_MSG = {
  CACHE_CLEAR: "vet-tool:cache:clear",
  CACHE_CLEARED: "vet-tool:cache:cleared",
  PICK_FOLDER: "vet-tool:bridge:pick-folder",
  PICK_FOLDER_RESULT: "vet-tool:bridge:pick-folder-result",
  PROJECT_CONTEXT: "vet-tool:project:context",
  PROJECT_CONTEXT_REQUEST: "vet-tool:project:context:request",
  NAVIGATE_SCENARIO: "vet-tool:scenario:navigate",
} as const;

export interface HostProjectContext {
  type: typeof TOOL_MSG.PROJECT_CONTEXT;
  projectId: string;
  projectName?: string;
  baseUrl: string;
  scenariosRelPath: string;
}

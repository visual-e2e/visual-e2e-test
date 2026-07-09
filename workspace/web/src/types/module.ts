export interface ModuleInfo {
  module: string;
  description?: string;
  entryRoute?: string;
  scenarioCount: number;
}

export interface ScenarioSummary {
  id: string;
  name: string;
  module: string;
  file: string;
  enabled: boolean;
  extends?: string;
  stepCount?: number;
}

export interface HealthResponse {
  ok: boolean;
  e2eRoot: string;
  defaultProject?: string;
  projects?: Array<{ id: string; name: string; envReady?: boolean }>;
}

export interface ValidateIssue {
  level: "error" | "warning";
  message: string;
  path?: string;
}

export interface ValidateResult {
  valid: boolean;
  issues: ValidateIssue[];
  expanded?: unknown;
}

export interface ProfileSummary {
  module: string;
  file: string;
  title: string;
  id?: string;
  converted?: boolean;
}

export interface MacroSummary {
  id: string;
  description?: string;
  stepCount?: number;
}

export interface RuleSummary {
  id: string;
  description?: string;
  stepCount?: number;
}

export type RunScope = "scenarios" | "module" | "modules" | "all";

export interface RunJob {
  jobId: string;
  projectId?: string;
  status: "running" | "passed" | "failed" | "cancelled" | "error";
  scope?: RunScope;
  modules: string[];
  scenarios: string[];
  options: { headed?: boolean; headless?: boolean; slowMo?: number };
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  runDir?: string;
  reportFile?: string;
  logs: string[];
  error?: string;
  cancellable?: boolean;
}

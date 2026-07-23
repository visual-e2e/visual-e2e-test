export const STEP_TYPES = [
  "click", "hover", "input", "link", "wait", "ready", "scroll",
  "verify", "screenshot", "log", "keyboard", "macro",
] as const;

export const MATCH_RULES = [
  "equals", "contains", "regex", "visible", "hidden", "urlContains",
] as const;

export type StepType = (typeof STEP_TYPES)[number];
export type MatchRule = (typeof MATCH_RULES)[number];

export interface StepDraft {
  stepId: string;
  type: StepType;
  selector?: string;
  url?: string;
  delay?: number;
  timeOut?: number;
  value?: string | number | null;
  params?: Record<string, unknown>;
  desc?: string;
  branch?: { yes: { step: string } | { scenario: string }; no: { step: string } | { scenario: string } };
  next?: string;
  verifyValue?: string;
  expectValue?: string;
  matchRule?: MatchRule;
}

export interface ScenarioSetup {
  requiresLogin: boolean;
  entryRoute: string;
  refresh?: boolean;
  readySelectors?: string[];
}

export interface ScenarioLoop {
  count: number;
  intervalMs: number;
  continueOnFailure: boolean;
}

export interface ScenarioDraft {
  id: string;
  name: string;
  module: string;
  enabled: boolean;
  mode: "full" | "extends";
  setup: ScenarioSetup;
  loop?: ScenarioLoop;
  extends?: string;
  params?: Record<string, string>;
  steps: StepDraft[];
}

export function emptyScenario(module: string): ScenarioDraft {
  return {
    id: "",
    name: "",
    module,
    enabled: true,
    mode: "full",
    setup: { requiresLogin: true, entryRoute: "/" },
    steps: [],
  };
}

/** 与引擎 / 落盘语义一致：缺省或非 false 视为需要登录 */
export function normalizeSetup(raw: unknown): ScenarioSetup {
  const setup = (raw && typeof raw === "object" && !Array.isArray(raw)
    ? (raw as Record<string, unknown>)
    : {}) as Partial<ScenarioSetup>;
  return {
    requiresLogin: setup.requiresLogin !== false,
    entryRoute: typeof setup.entryRoute === "string" ? setup.entryRoute : "/",
    ...(setup.refresh ? { refresh: true } : {}),
    ...(Array.isArray(setup.readySelectors) && setup.readySelectors.length > 0
      ? { readySelectors: setup.readySelectors.filter((s): s is string => typeof s === "string") }
      : {}),
  };
}

export function rawToDraft(raw: Record<string, unknown>, module: string): ScenarioDraft {
  if (raw.extends) {
    return {
      id: String(raw.id ?? ""),
      name: String(raw.name ?? ""),
      module: String(raw.module ?? module),
      enabled: raw.enabled !== false,
      mode: "extends",
      setup: normalizeSetup(raw.setup),
      loop: raw.loop as ScenarioLoop | undefined,
      extends: String(raw.extends),
      params: (raw.params as Record<string, string>) ?? {},
      steps: (raw.steps as StepDraft[]) ?? [],
    };
  }
  return {
    id: String(raw.id ?? ""),
    name: String(raw.name ?? ""),
    module: String(raw.module ?? module),
    enabled: raw.enabled !== false,
    mode: "full",
    setup: normalizeSetup(raw.setup),
    loop: raw.loop as ScenarioLoop | undefined,
    steps: (raw.steps as StepDraft[]) ?? [],
  };
}

export function draftToRaw(draft: ScenarioDraft): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: draft.id,
    name: draft.name,
    module: draft.module,
    enabled: draft.enabled,
    setup: draft.setup,
  };
  if (draft.loop) base.loop = draft.loop;
  if (draft.mode === "extends") {
    base.extends = draft.extends;
    base.params = draft.params ?? {};
    if (draft.steps.length) base.steps = draft.steps;
    return base;
  }
  base.steps = draft.steps;
  return base;
}

export function nextStepId(steps: StepDraft[]): string {
  const nums = steps
    .map((s) => parseInt(s.stepId.replace(/\D/g, ""), 10))
    .filter((n) => !Number.isNaN(n));
  const max = nums.length ? Math.max(...nums) : 0;
  return `s${max + 1}`;
}

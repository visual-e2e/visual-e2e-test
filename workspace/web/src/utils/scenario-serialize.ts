import type { MatchRule, ScenarioDraft, StepDraft, StepType } from "../types/scenario";
import { nextStepId } from "../types/scenario";
import { renumberAutoStepIds } from "./step-id";

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

export function defaultFieldsForType(type: StepType): Partial<StepDraft> {
  if (type === "verify") {
    return { matchRule: "contains" as MatchRule, verifyValue: "body", expectValue: "" };
  }
  return {};
}

export function createEmptyStep(steps: StepDraft[], type: StepType = "click"): StepDraft {
  return {
    stepId: nextStepId(steps),
    type,
    desc: "",
    selector: "",
    ...defaultFieldsForType(type),
  };
}

export function insertStep(
  steps: StepDraft[],
  selectedIndex: number | undefined,
  newStep: StepDraft,
): StepDraft[] {
  let next: StepDraft[];
  if (selectedIndex == null || selectedIndex < 0 || selectedIndex >= steps.length) {
    next = [...steps, newStep];
  } else {
    next = [...steps];
    next.splice(selectedIndex + 1, 0, newStep);
  }
  return renumberAutoStepIds(next);
}

export { renumberAutoStepIds, renameStepId, isAutoStepId } from "./step-id";

function compactParams(params: Record<string, unknown> | undefined): Record<string, unknown> | undefined {
  if (!params) return undefined;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null) continue;
    // continueOnFail:false 需保留，以便覆盖全局 defaultContinueOnFail
    if (value === false && key !== "continueOnFail") continue;
    if (Array.isArray(value) && value.length === 0) continue;
    if (typeof value === "string" && !value.trim()) continue;
    out[key] = value;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

export function compactStep(step: StepDraft): Record<string, unknown> {
  const type = step.type;
  const out: Record<string, unknown> = {
    stepId: step.stepId,
    type,
  };

  if (!isBlank(step.desc)) out.desc = step.desc;

  if (["click", "hover", "input", "keyboard", "ready", "scroll"].includes(type)) {
    if (!isBlank(step.selector)) out.selector = step.selector;
  }
  if (type === "link" && !isBlank(step.url)) out.url = step.url;

  if (["input", "wait", "screenshot", "log", "keyboard"].includes(type)) {
    if (step.value != null && step.value !== "") out.value = step.value;
  }
  if (type === "macro" && step.value != null && step.value !== "") {
    out.value = step.value;
  }

  if (type === "verify") {
    out.verifyValue = !isBlank(step.verifyValue) ? step.verifyValue : "body";
    if (!isBlank(step.expectValue)) out.expectValue = step.expectValue;
    out.matchRule = step.matchRule ?? "contains";
  }

  const params = compactParams(step.params);
  if (params) out.params = params;
  if (step.branch) out.branch = step.branch;
  if (step.next) out.next = step.next;
  if (step.delay != null) out.delay = step.delay;
  if (step.timeOut != null && step.timeOut > 0) out.timeOut = step.timeOut;

  return out;
}

function compactSetup(setup: ScenarioDraft["setup"]): Record<string, unknown> {
  const out: Record<string, unknown> = {
    requiresLogin: setup.requiresLogin === true,
  };
  if (!isBlank(setup.entryRoute) && setup.entryRoute !== "/") out.entryRoute = setup.entryRoute;
  if (setup.refresh) out.refresh = true;
  if (setup.readySelectors?.length) out.readySelectors = setup.readySelectors;
  return out;
}

export function compactScenarioPayload(draft: ScenarioDraft): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: draft.id,
    name: draft.name,
    module: draft.module,
    enabled: draft.enabled,
  };

  const setup = compactSetup(draft.setup);
  if (Object.keys(setup).length > 0) base.setup = setup;

  if (draft.loop) base.loop = draft.loop;

  if (draft.mode === "extends") {
    base.extends = draft.extends;
    if (draft.params && Object.keys(draft.params).length > 0) base.params = draft.params;
    if (draft.steps.length > 0) base.steps = draft.steps.map(compactStep);
    return base;
  }

  base.steps = draft.steps.map(compactStep);
  return base;
}

export const MODULE_ID_PATTERN = /^[a-z][a-z0-9_-]*$/;

export function normalizeModuleId(raw: string): string {
  return raw.trim().toLowerCase();
}

export function validateModuleId(module: string): string | undefined {
  const id = normalizeModuleId(module);
  if (!id) return "模块名不能为空";
  if (!MODULE_ID_PATTERN.test(id)) return "模块名须以小写字母开头，仅含字母、数字、_、-";
  return undefined;
}

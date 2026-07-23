import type { ScenarioWrite } from "../schemas/scenario.schema.js";
import { isExtendsScenario } from "../schemas/scenario.schema.js";

function isBlank(value: string | undefined): boolean {
  return !value || !value.trim();
}

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

function compactStep(step: Record<string, unknown>): Record<string, unknown> {
  const type = step.type as string;
  const out: Record<string, unknown> = {
    stepId: step.stepId,
    type,
  };

  if (!isBlank(step.desc as string | undefined)) out.desc = step.desc;

  if (["click", "hover", "input", "keyboard", "ready", "scroll"].includes(type)) {
    if (!isBlank(step.selector as string | undefined)) out.selector = step.selector;
  }
  if (type === "link" && !isBlank(step.url as string | undefined)) out.url = step.url;

  if (["input", "wait", "screenshot", "log", "keyboard"].includes(type)) {
    if (step.value != null && step.value !== "") out.value = step.value;
  }
  if (type === "macro" && step.value != null && step.value !== "") {
    out.value = step.value;
  }

  if (type === "verify") {
    out.verifyValue = !isBlank(step.verifyValue as string | undefined)
      ? step.verifyValue
      : "body";
    if (!isBlank(step.expectValue as string | undefined)) out.expectValue = step.expectValue;
    out.matchRule = step.matchRule ?? "contains";
  }

  const params = compactParams(step.params as Record<string, unknown> | undefined);
  if (params) out.params = params;
  if (step.branch) out.branch = step.branch;
  if (step.next) out.next = step.next;
  if (typeof step.delay === "number") out.delay = step.delay;
  if (typeof step.timeOut === "number" && step.timeOut > 0) out.timeOut = step.timeOut;

  return out;
}

function compactSetup(setup: ScenarioWrite["setup"]): Record<string, unknown> | undefined {
  if (!setup) return undefined;
  const out: Record<string, unknown> = {
    // zod default 为 true；写入显式 boolean，避免 UI 与 JSON 对 undefined 解读不一致
    requiresLogin: setup.requiresLogin !== false,
  };
  if (!isBlank(setup.entryRoute) && setup.entryRoute !== "/") out.entryRoute = setup.entryRoute;
  if (setup.refresh) out.refresh = true;
  if (setup.readySelectors?.length) out.readySelectors = setup.readySelectors;
  return out;
}

export function compactScenarioWrite(data: ScenarioWrite): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: data.id,
    name: data.name,
    module: data.module,
    enabled: data.enabled,
  };

  const setup = compactSetup(data.setup);
  if (setup) base.setup = setup;
  if (data.loop) base.loop = data.loop;

  if (isExtendsScenario(data)) {
    base.extends = data.extends;
    if (data.params && Object.keys(data.params).length > 0) base.params = data.params;
    if (data.steps?.length) {
      base.steps = data.steps.map((s) => compactStep(s as Record<string, unknown>));
    }
    return base;
  }

  base.steps = data.steps.map((s) => compactStep(s as Record<string, unknown>));
  return base;
}

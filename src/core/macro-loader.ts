import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { Step } from "../types/step.types.js";
import { parseStep } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";

export interface MacroDefinition {
  id: string;
  description?: string;
  params?: Record<string, { required?: boolean }>;
  steps: unknown[];
}

function substituteString(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.split(`{${key}}`).join(value);
  }
  return result;
}

function substituteValue(value: unknown, vars: Record<string, string>): unknown {
  if (typeof value === "string") return substituteString(value, vars);
  if (Array.isArray(value)) return value.map((item) => substituteValue(item, vars));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = substituteValue(v, vars);
    }
    return out;
  }
  return value;
}

export function loadMacroDefinition(macrosDir: string, macroId: string): MacroDefinition {
  const filePath = join(macrosDir, `${macroId}.json`);
  if (!existsSync(filePath)) {
    throw new Error(`未找到宏定义: ${macroId} (${filePath})`);
  }
  const raw = JSON.parse(readFileSync(filePath, "utf-8")) as MacroDefinition;
  if (!raw.steps?.length) {
    throw new Error(`宏 ${macroId} 缺少 steps`);
  }
  return raw;
}

export function expandMacroSteps(
  ctx: RunContext,
  macrosDir: string,
  macroId: string,
  params: Record<string, unknown>,
  parentStepId: string,
): Step[] {
  const def = loadMacroDefinition(macrosDir, macroId);

  const resolvedParams: Record<string, string> = {};
  for (const [key, value] of Object.entries(params)) {
    resolvedParams[key] = ctx.resolve(value as string);
  }

  for (const [key, meta] of Object.entries(def.params ?? {})) {
    const required = (meta as { required?: boolean }).required;
    if (required && !resolvedParams[key]) {
      throw new Error(`宏 ${macroId} 缺少参数: ${key}`);
    }
  }

  return def.steps.map((rawStep, index) => {
    const substituted = substituteValue(rawStep, resolvedParams) as Record<string, unknown>;
    if (!substituted.stepId) {
      substituted.stepId = `${parentStepId}_${index + 1}`;
    }
    return parseStep(substituted);
  });
}

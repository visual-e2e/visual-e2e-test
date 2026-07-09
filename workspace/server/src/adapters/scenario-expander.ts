import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

interface ScenarioTemplate {
  params?: Record<string, { required?: boolean }>;
  setup?: unknown;
  steps: unknown[];
}

interface ScenarioRaw {
  id: string;
  extends?: string;
  params?: Record<string, string>;
  setup?: unknown;
  steps?: unknown[];
}

function substituteString(template: string, vars: Record<string, string>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    result = result.replace(new RegExp(`\\{${key}\\}`, "g"), value);
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

function resolveTemplatePath(fixturesDir: string, ref: string): string {
  const normalized = ref.replace(/\\/g, "/").replace(/^\//, "");
  const candidates = [
    join(fixturesDir, normalized.endsWith(".json") ? normalized : `${normalized}.json`),
    join(fixturesDir, "rules", normalized.endsWith(".json") ? normalized : `${normalized}.json`),
  ];
  for (const path of candidates) {
    if (existsSync(path)) return path;
  }
  throw new Error(`未找到场景模板: ${ref}`);
}

function loadTemplate(fixturesDir: string, ref: string): ScenarioTemplate {
  const path = resolveTemplatePath(fixturesDir, ref);
  const raw = JSON.parse(readFileSync(path, "utf-8")) as ScenarioTemplate;
  if (!raw.steps?.length) throw new Error(`场景模板缺少 steps: ${ref}`);
  return raw;
}

export function expandScenarioRaw(raw: unknown, fixturesDir: string): unknown {
  const scenario = raw as ScenarioRaw;
  if (!scenario.extends) return raw;

  const template = loadTemplate(fixturesDir, scenario.extends);
  const params = { ...(scenario.params ?? {}) };

  for (const [key, meta] of Object.entries(template.params ?? {})) {
    if (meta.required && !params[key]) {
      throw new Error(`场景模板 ${scenario.extends} 缺少参数: ${key}`);
    }
  }

  const templateSteps = template.steps.map((step) => substituteValue(step, params));
  const childSteps = (scenario.steps ?? []).map((step) => substituteValue(step, params));
  const mergedSteps = [...templateSteps, ...childSteps];

  if (mergedSteps.length === 0) {
    throw new Error(`场景 ${scenario.id} 展开后 steps 为空`);
  }

  const { extends: _e, params: _p, steps: _s, ...rest } = scenario;
  return {
    ...rest,
    setup: scenario.setup ?? template.setup ?? { requiresLogin: true, entryRoute: "/" },
    steps: mergedSteps,
  };
}

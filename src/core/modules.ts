import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join, basename } from "node:path";
import { parseManifest, parseScenario } from "../types/scenario.types.js";
import type { Scenario } from "../types/scenario.types.js";

export interface ScenarioRef {
  name: string;
  module: string;
  file: string;
  scenario: Scenario;
}

export interface ModuleInfo {
  module: string;
  description?: string;
  scenarios: ScenarioRef[];
}

export function discoverModules(scenariosDir: string): string[] {
  if (!existsSync(scenariosDir)) return [];
  return readdirSync(scenariosDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .filter((entry) => existsSync(join(scenariosDir, entry.name, "manifest.json")))
    .map((entry) => entry.name)
    .sort();
}

export function discoverScenarios(scenariosDir: string, fixturesDir?: string): ScenarioRef[] {
  const refs: ScenarioRef[] = [];

  for (const module of discoverModules(scenariosDir)) {
    refs.push(...loadModuleScenarios(scenariosDir, module, fixturesDir));
  }

  return refs;
}

export function listModules(scenariosDir: string, fixturesDir?: string): ModuleInfo[] {
  return discoverModules(scenariosDir).map((module) => {
    const manifestPath = join(scenariosDir, module, "manifest.json");
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
    return {
      module,
      description: manifest.description,
      scenarios: loadModuleScenarios(scenariosDir, module, fixturesDir),
    };
  });
}

function loadModuleScenarios(scenariosDir: string, module: string, fixturesDir?: string): ScenarioRef[] {
  const manifestPath = join(scenariosDir, module, "manifest.json");
  const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
  const files = manifest.scenarios.length
    ? manifest.scenarios
    : readdirSync(join(scenariosDir, module)).filter((f) => f.endsWith(".json") && f !== "manifest.json");

  const refs: ScenarioRef[] = [];
  for (const file of files) {
    const scenarioPath = join(scenariosDir, module, file);
    if (!existsSync(scenarioPath)) continue;
    const scenario = parseScenario(JSON.parse(readFileSync(scenarioPath, "utf-8")), fixturesDir);
    refs.push({ name: basename(file, ".json"), module, file, scenario });
  }
  return refs;
}

/**
 * 按模块解析执行目标：
 * - modules=[login] → login 下全部场景（manifest 顺序）
 * - modules=[login], scenarioNames=[login_success] → 指定场景
 * - scenarioNames=[login/login_success, project/foo] → 跨模块指定场景
 * - all=true → 全部模块全部场景
 */
export function resolveExecutionTargets(
  scenariosDir: string,
  options: { modules: string[]; scenarioNames: string[]; all: boolean },
  fixturesDir?: string,
): { refs: ScenarioRef[]; unknownModules: string[]; unknownScenarios: string[] } {
  const moduleInfos = listModules(scenariosDir, fixturesDir);
  const knownModules = new Set(moduleInfos.map((m) => m.module));
  const allRefs = discoverScenarios(scenariosDir, fixturesDir);

  if (options.all) {
    return { refs: allRefs, unknownModules: [], unknownScenarios: [] };
  }

  const hasQualified = options.scenarioNames.some((s) => s.includes("/"));

  if (options.modules.length === 0 && options.scenarioNames.length === 0) {
    return { refs: [], unknownModules: [], unknownScenarios: [] };
  }

  if (options.modules.length === 0 && hasQualified) {
    return resolveQualifiedScenarios(allRefs, knownModules, options.scenarioNames);
  }

  if (options.modules.length === 0) {
    return resolveUnqualifiedScenarios(allRefs, options.scenarioNames);
  }

  const unknownModules = options.modules.filter((m) => !knownModules.has(m));
  if (unknownModules.length) {
    return { refs: [], unknownModules, unknownScenarios: options.scenarioNames };
  }

  let refs: ScenarioRef[] = [];
  for (const module of options.modules) {
    const moduleScenarios = moduleInfos.find((m) => m.module === module)?.scenarios ?? [];
    refs.push(...moduleScenarios);
  }

  const unknownScenarios: string[] = [];
  if (options.scenarioNames.length > 0) {
    const filtered: ScenarioRef[] = [];
    for (const name of options.scenarioNames) {
      if (name.includes("/")) {
        const matched = matchQualifiedSpec(allRefs, name);
        if (matched.length === 0) unknownScenarios.push(name);
        else filtered.push(...matched);
        continue;
      }
      let matched = refs.filter((r) => r.name === name || r.scenario.id === name);
      if (matched.length === 0) {
        matched = allRefs.filter((r) => r.name === name || r.scenario.id === name);
      }
      if (matched.length === 0) {
        unknownScenarios.push(name);
      } else {
        filtered.push(...matched);
      }
    }
    refs = filtered;
  }

  return { refs: dedupeRefs(refs), unknownModules: [], unknownScenarios };
}

function matchQualifiedSpec(allRefs: ScenarioRef[], spec: string): ScenarioRef[] {
  const slash = spec.indexOf("/");
  if (slash <= 0) return [];
  const mod = spec.slice(0, slash);
  const name = spec.slice(slash + 1);
  return allRefs.filter((r) => r.module === mod && (r.name === name || r.scenario.id === name));
}

function resolveQualifiedScenarios(
  allRefs: ScenarioRef[],
  knownModules: Set<string>,
  scenarioNames: string[],
): { refs: ScenarioRef[]; unknownModules: string[]; unknownScenarios: string[] } {
  const unknownScenarios: string[] = [];
  const unknownModules: string[] = [];
  const filtered: ScenarioRef[] = [];

  for (const spec of scenarioNames) {
    const slash = spec.indexOf("/");
    if (slash <= 0) {
      unknownScenarios.push(spec);
      continue;
    }
    const mod = spec.slice(0, slash);
    if (!knownModules.has(mod)) {
      unknownModules.push(mod);
      continue;
    }
    const matched = matchQualifiedSpec(allRefs, spec);
    if (matched.length === 0) unknownScenarios.push(spec);
    else filtered.push(...matched);
  }

  return { refs: dedupeRefs(filtered), unknownModules, unknownScenarios };
}

function resolveUnqualifiedScenarios(
  allRefs: ScenarioRef[],
  scenarioNames: string[],
): { refs: ScenarioRef[]; unknownModules: string[]; unknownScenarios: string[] } {
  const unknownScenarios: string[] = [];
  const filtered: ScenarioRef[] = [];

  for (const name of scenarioNames) {
    const matched = allRefs.filter((r) => r.name === name || r.scenario.id === name);
    if (matched.length === 0) unknownScenarios.push(name);
    else filtered.push(...matched);
  }

  return { refs: dedupeRefs(filtered), unknownModules: [], unknownScenarios };
}

function dedupeRefs(refs: ScenarioRef[]): ScenarioRef[] {
  const seen = new Set<string>();
  return refs.filter((r) => {
    const key = `${r.module}/${r.name}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

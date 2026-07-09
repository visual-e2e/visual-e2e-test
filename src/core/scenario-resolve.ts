import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join, basename } from "node:path";
import { parseScenario, type Scenario } from "../types/scenario.types.js";

function readScenarioFile(path: string, fixturesDir?: string): Scenario {
  return parseScenario(JSON.parse(readFileSync(path, "utf-8")), fixturesDir);
}

function normalizeRef(ref: string): string {
  return ref.replace(/\.json$/i, "").replace(/\\/g, "/");
}

/**
 * 在同模块目录（scenarios/{moduleDir}/）下按 id、文件名或相对路径解析场景。
 */
export function resolveScenarioInModule(
  scenariosDir: string,
  moduleDir: string,
  ref: string,
  fixturesDir?: string,
): Scenario | undefined {
  const modulePath = join(scenariosDir, moduleDir);
  if (!existsSync(modulePath)) return undefined;

  const normalized = normalizeRef(ref);

  const tryPath = (relativePath: string): Scenario | undefined => {
    const file = relativePath.endsWith(".json") ? relativePath : `${relativePath}.json`;
    const full = join(modulePath, file);
    if (!existsSync(full)) return undefined;
    return readScenarioFile(full, fixturesDir);
  };

  const direct = tryPath(normalized);
  if (direct) return direct;

  const manifestPath = join(modulePath, "manifest.json");
  if (existsSync(manifestPath)) {
    const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { scenarios?: string[] };
    for (const file of manifest.scenarios ?? []) {
      const fileKey = normalizeRef(file);
      const name = basename(fileKey);
      const scenarioPath = join(modulePath, file);
      if (!existsSync(scenarioPath)) continue;
      const scenario = readScenarioFile(scenarioPath, fixturesDir);
      if (scenario.id === normalized || name === normalized || fileKey === normalized) {
        return scenario;
      }
    }
  }

  const walk = (dir: string, prefix = ""): Scenario | undefined => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === "manifest.json") continue;
      const rel = prefix ? `${prefix}/${entry.name}` : entry.name;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) {
        const found = walk(full, rel);
        if (found) return found;
        continue;
      }
      if (!entry.name.endsWith(".json")) continue;
      const key = normalizeRef(rel);
      const name = basename(key);
      const scenario = readScenarioFile(full, fixturesDir);
      if (scenario.id === normalized || name === normalized || key === normalized) {
        return scenario;
      }
    }
    return undefined;
  };

  return walk(modulePath);
}

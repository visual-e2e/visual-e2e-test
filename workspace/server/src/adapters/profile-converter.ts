import { pathToFileURL } from "node:url";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

export interface ProfileConverterModule {
  loadScenarioFromMd: (mdPath: string) => {
    scenario: Record<string, unknown>;
    content: string;
    frontmatter: Record<string, unknown>;
  } | null;
  buildScenario: (scenario: Record<string, unknown>, moduleName: string) => Record<string, unknown>;
  serializeFrontmatter: (data: Record<string, unknown>) => string;
  convertModule: (
    moduleName: string,
    opts: { dryRun?: boolean; force?: boolean },
    scenarioFilter?: string,
  ) => number;
  discoverProfileModules: () => string[];
  pruneStep: (step: Record<string, unknown>) => Record<string, unknown>;
}

let cached: ProfileConverterModule | null = null;

export async function loadProfileConverter(): Promise<ProfileConverterModule> {
  if (cached) return cached;
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../..");
  const scriptPath = join(root, "scripts/profile-to-scenario.mjs");
  cached = (await import(pathToFileURL(scriptPath).href)) as ProfileConverterModule;
  return cached;
}

export async function spawnProfileConvertAll(
  projectId: string,
  opts: { force?: boolean } = {},
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  const mod = await loadProfileConverter();
  const prev = process.env.ACTIVE_PROJECT;
  process.env.ACTIVE_PROJECT = projectId;
  try {
    const modules = mod.discoverProfileModules();
    let total = 0;
    const logs: string[] = [];
    for (const m of modules) {
      logs.push(`== 模块: ${m} ==`);
      total += mod.convertModule(m, { force: opts.force });
    }
    logs.push(`完成，共转换 ${total} 个场景`);
    return { stdout: logs.join("\n"), stderr: "", exitCode: 0 };
  } finally {
    if (prev === undefined) delete process.env.ACTIVE_PROJECT;
    else process.env.ACTIVE_PROJECT = prev;
  }
}

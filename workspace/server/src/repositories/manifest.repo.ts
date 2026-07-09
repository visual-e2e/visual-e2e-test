import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { manifestSchema, type ModuleManifest } from "../schemas/scenario.schema.js";

export class ManifestRepository {
  constructor(private readonly project: ProjectContext) {}

  read(module: string): ModuleManifest {
    const path = this.manifestPath(module);
    if (!existsSync(path)) {
      throw new Error(`模块不存在: ${module}`);
    }
    return manifestSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }

  write(module: string, manifest: ModuleManifest): void {
    const path = this.manifestPath(module);
    mkdirSync(dirname(path), { recursive: true });
    const parsed = manifestSchema.parse(manifest);
    writeFileSync(path, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  }

  addScenario(module: string, filePath: string): void {
    const manifest = this.read(module);
    if (!manifest.scenarios.includes(filePath)) {
      manifest.scenarios.push(filePath);
      manifest.scenarios.sort(compareScenarioPath);
      this.write(module, manifest);
    }
  }

  removeScenario(module: string, filePath: string): void {
    const manifest = this.read(module);
    manifest.scenarios = manifest.scenarios.filter((f) => f !== filePath);
    this.write(module, manifest);
  }

  replaceScenarioPath(module: string, oldPath: string, newPath: string): void {
    const manifest = this.read(module);
    manifest.scenarios = manifest.scenarios.map((f) => (f === oldPath ? newPath : f));
    manifest.scenarios.sort(compareScenarioPath);
    this.write(module, manifest);
  }

  ensureModule(module: string, description?: string): void {
    const path = this.manifestPath(module);
    if (existsSync(path)) return;
    mkdirSync(dirname(path), { recursive: true });
    this.write(module, { module, description, scenarios: [] });
  }

  private manifestPath(module: string): string {
    return join(this.project.scenariosDir, module, "manifest.json");
  }
}

function compareScenarioPath(a: string, b: string): number {
  const aDepth = a.split("/").length;
  const bDepth = b.split("/").length;
  if (aDepth !== bDepth) return aDepth - bDepth;
  return a.localeCompare(b, "zh-CN");
}

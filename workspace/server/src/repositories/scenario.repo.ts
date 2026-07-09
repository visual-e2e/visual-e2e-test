import {
  existsSync, mkdirSync, readFileSync, readdirSync, renameSync, unlinkSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { resolveWithin } from "../utils/path-security.js";
import type { ModuleInfo, ScenarioSummary, ScenarioTreeNode } from "../types/module.js";
import type { ScenarioWrite } from "../schemas/scenario.schema.js";
import { ManifestRepository } from "./manifest.repo.js";

interface ScenarioRaw {
  id?: string;
  name?: string;
  module?: string;
  enabled?: boolean;
  extends?: string;
  steps?: unknown[];
}

export class ScenarioRepository {
  private manifestRepo: ManifestRepository;

  constructor(private readonly project: ProjectContext) {
    this.manifestRepo = new ManifestRepository(project);
  }

  listModules(): ModuleInfo[] {
    const { scenariosDir } = this.project;
    if (!existsSync(scenariosDir)) return [];

    return readdirSync(scenariosDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(scenariosDir, e.name, "manifest.json")))
      .map((e) => e.name)
      .sort()
      .map((module) => {
        const manifest = this.manifestRepo.read(module);
        return {
          module,
          description: manifest.description,
          entryRoute: manifest.entryRoute,
          scenarioCount: manifest.scenarios.length,
        };
      });
  }

  getModuleTree(module: string): ScenarioTreeNode[] {
    const manifest = this.manifestRepo.read(module);
    return buildTree(manifest.scenarios);
  }

  listScenarios(module: string, query?: string): ScenarioSummary[] {
    const manifest = this.manifestRepo.read(module);
    const moduleDir = join(this.project.scenariosDir, module);
    const q = query?.toLowerCase();

    const results: ScenarioSummary[] = [];
    for (const file of manifest.scenarios) {
      const abs = join(moduleDir, file);
      if (!existsSync(abs)) continue;
      const raw = JSON.parse(readFileSync(abs, "utf-8")) as ScenarioRaw;
      const summary: ScenarioSummary = {
        id: raw.id ?? basename(file, ".json"),
        name: raw.name ?? basename(file, ".json"),
        module,
        file,
        enabled: raw.enabled !== false,
        extends: raw.extends,
        stepCount: raw.steps?.length,
      };
      if (q) {
        const hay = `${summary.id} ${summary.name} ${summary.file}`.toLowerCase();
        if (!hay.includes(q)) continue;
      }
      results.push(summary);
    }
    return results;
  }

  readScenario(module: string, filePath: string): unknown {
    const abs = this.resolveScenarioPath(module, filePath);
    if (!existsSync(abs)) throw new Error(`场景不存在: ${module}/${filePath}`);
    return JSON.parse(readFileSync(abs, "utf-8"));
  }

  createScenario(module: string, filePath: string, data: ScenarioWrite): { file: string } {
    const rel = normalizeScenarioPath(filePath, data.id);
    const abs = this.resolveScenarioPath(module, rel);
    if (existsSync(abs)) throw new Error(`场景已存在: ${module}/${rel}`);

    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
    this.manifestRepo.ensureModule(module);
    this.manifestRepo.addScenario(module, rel);
    return { file: rel };
  }

  updateScenario(module: string, filePath: string, data: ScenarioWrite): { file: string } {
    const abs = this.resolveScenarioPath(module, filePath);
    if (!existsSync(abs)) throw new Error(`场景不存在: ${module}/${filePath}`);

    const newRel = normalizeScenarioPath(filePath, data.id);
    const newAbs = this.resolveScenarioPath(module, newRel);

    writeFileSync(newAbs, `${JSON.stringify(data, null, 2)}\n`, "utf-8");

    if (newRel !== filePath) {
      if (existsSync(abs) && abs !== newAbs) unlinkSync(abs);
      this.manifestRepo.replaceScenarioPath(module, filePath, newRel);
    }
    return { file: newRel };
  }

  deleteScenario(module: string, filePath: string): void {
    const abs = this.resolveScenarioPath(module, filePath);
    if (!existsSync(abs)) throw new Error(`场景不存在: ${module}/${filePath}`);
    unlinkSync(abs);
    this.manifestRepo.removeScenario(module, filePath);
  }

  duplicateScenario(module: string, filePath: string, newId: string): { file: string } {
    const raw = this.readScenario(module, filePath) as ScenarioWrite;
    const copy: ScenarioWrite = { ...raw, id: newId, name: `${raw.name} (副本)` };
    const dir = dirname(filePath);
    const newFile = dir === "." ? `${newId}.json` : `${dir}/${newId}.json`;
    return this.createScenario(module, newFile, copy);
  }

  private resolveScenarioPath(module: string, filePath: string): string {
    return resolveWithin(join(this.project.scenariosDir, module), filePath);
  }
}

function normalizeScenarioPath(filePath: string, id: string): string {
  const dir = dirname(filePath);
  const fileName = `${id}.json`;
  return dir === "." ? fileName : `${dir}/${fileName}`;
}

function buildTree(files: string[]): ScenarioTreeNode[] {
  const root: ScenarioTreeNode[] = [];
  for (const file of files) {
    const parts = file.split("/");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const isFile = i === parts.length - 1;
      const key = parts.slice(0, i + 1).join("/");
      let node = level.find((n) => n.key === key);
      if (!node) {
        node = {
          key,
          title: isFile ? basename(part, ".json") : part,
          isLeaf: isFile,
          children: isFile ? undefined : [],
          file: isFile ? file : undefined,
        };
        level.push(node);
      }
      if (!isFile && node.children) level = node.children;
    }
  }
  return root;
}

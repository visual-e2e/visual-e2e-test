import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import {
  listProjectIds,
  readProjectMeta,
  resolveDefaultProjectId,
  resolveProjectContext,
  checkProjectEnv,
  scaffoldProject,
  deleteProject,
  renameProject,
  type ProjectMeta,
  type ProjectSummary,
  type ProjectContext,
} from "../project-context.js";
import type { WorkspaceConfig } from "../config.js";

export class ProjectRepository {
  constructor(private readonly config: WorkspaceConfig) {}

  list(): ProjectSummary[] {
    return listProjectIds(this.config.e2eRoot).map((id) => this.getSummary(id));
  }

  get(id: string): ProjectSummary {
    return this.getSummary(id);
  }

  create(input: { id: string; name: string; description?: string; templateProjectId?: string }): ProjectSummary {
    const meta: ProjectMeta = {
      id: input.id,
      name: input.name,
      description: input.description,
      createdAt: new Date().toISOString(),
    };
    scaffoldProject(this.config.e2eRoot, meta, input.templateProjectId);
    return this.getSummary(input.id);
  }

  update(id: string, patch: { id?: string; name?: string; description?: string }): ProjectSummary {
    const newId = patch.id?.trim();
    if (newId && newId !== id) {
      renameProject(this.config.e2eRoot, id, newId);
      id = newId;
    }

    const project = resolveProjectContext(this.config.e2eRoot, id);
    const meta = readProjectMeta(this.config.e2eRoot, id);
    const next: ProjectMeta = {
      ...meta,
      id,
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.description !== undefined ? { description: patch.description } : {}),
    };
    writeFileSync(resolve(project.root, "project.json"), `${JSON.stringify(next, null, 2)}\n`, "utf-8");
    return this.getSummary(id);
  }

  remove(id: string): void {
    deleteProject(this.config.e2eRoot, id);
  }

  private getSummary(id: string): ProjectSummary {
    const meta = readProjectMeta(this.config.e2eRoot, id);
    const project = resolveProjectContext(this.config.e2eRoot, id);
    const env = checkProjectEnv(project.envPath);
    let moduleCount = 0;
    if (existsSync(project.scenariosDir)) {
      moduleCount = readdirSync(project.scenariosDir, { withFileTypes: true })
        .filter((e) => e.isDirectory() && existsSync(join(project.scenariosDir, e.name, "manifest.json")))
        .length;
    }
    return { ...meta, envReady: env.ok, moduleCount };
  }
}

export function resolveRequestProject(e2eRoot: string, headerValue?: string): ProjectContext {
  const projectId = resolveDefaultProjectId(e2eRoot, headerValue?.trim());
  return resolveProjectContext(e2eRoot, projectId);
}

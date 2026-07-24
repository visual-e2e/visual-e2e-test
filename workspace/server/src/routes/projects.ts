import type { FastifyInstance } from "fastify";
import type { WorkspaceConfig } from "../config.js";
import { ProjectRepository } from "../repositories/project.repo.js";
import { resolveRequestProject } from "../repositories/project.repo.js";

export function registerProjectRoutes(app: FastifyInstance, config: WorkspaceConfig): void {
  const repo = new ProjectRepository(config);

  app.get("/api/projects", async () => repo.list());

  app.get<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    try {
      return repo.get(req.params.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return reply.status(404).send({ error: message });
    }
  });

  app.post<{ Body: { id: string; name: string; description?: string; templateProjectId?: string } }>(
    "/api/projects",
    async (req, reply) => {
      try {
        if (!req.body.id?.match(/^[a-z0-9][a-z0-9-_]*$/)) {
          return reply.status(400).send({ error: "项目 id 须为小写字母、数字、-、_" });
        }
        return repo.create(req.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        return reply.status(409).send({ error: message });
      }
    },
  );

  app.put<{ Params: { id: string }; Body: { id?: string; name?: string; description?: string } }>(
    "/api/projects/:id",
    async (req, reply) => {
      try {
        if (req.body.id && !req.body.id.match(/^[a-z0-9][a-z0-9-_]*$/)) {
          return reply.status(400).send({ error: "项目 id 须为小写字母、数字、-、_" });
        }
        return repo.update(req.params.id, req.body);
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        return reply.status(404).send({ error: message });
      }
    },
  );

  app.delete<{ Params: { id: string } }>("/api/projects/:id", async (req, reply) => {
    try {
      repo.remove(req.params.id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return reply.status(400).send({ error: message });
    }
  });
}

export function registerProjectMiddleware(app: FastifyInstance, config: WorkspaceConfig): void {
  app.addHook("onRequest", async (req, reply) => {
    if (req.url.startsWith("/api/health") || req.url.startsWith("/artifacts/")) return;
    if (req.url.startsWith("/api/runs/artifacts/")) return;
    if (req.url === "/api/projects" || req.url.startsWith("/api/projects/")) return;
    // Tools are app-global (not project-scoped); Electron ensure-tool has no X-Project-Id
    if (req.url === "/api/tools" || req.url.startsWith("/api/tools/")) return;
    if (req.url.startsWith("/api/config/settings")) return;
    if (!req.url.startsWith("/api/")) return;

    try {
      const header = req.headers["x-project-id"];
      const projectId = typeof header === "string" ? header : Array.isArray(header) ? header[0] : undefined;
      req.project = resolveRequestProject(config.e2eRoot, projectId);
    } catch (err) {
      const message = err instanceof Error ? err.message : "项目解析失败";
      return reply.status(400).send({ error: message });
    }
  });
}

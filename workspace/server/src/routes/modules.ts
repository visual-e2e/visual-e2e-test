import type { FastifyInstance } from "fastify";
import type { WorkspaceConfig } from "../config.js";
import { ScenarioRepository } from "../repositories/scenario.repo.js";

export function registerModuleRoutes(app: FastifyInstance, _config: WorkspaceConfig): void {
  app.get("/api/modules", async (req) => new ScenarioRepository(req.project).listModules());

  app.get<{ Params: { module: string }; Querystring: { q?: string } }>(
    "/api/modules/:module/scenarios",
    async (req, reply) => {
      try {
        return new ScenarioRepository(req.project).listScenarios(req.params.module, req.query.q);
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        return reply.status(404).send({ error: message });
      }
    },
  );

  app.get<{ Params: { module: string } }>("/api/modules/:module/tree", async (req, reply) => {
    try {
      return new ScenarioRepository(req.project).getModuleTree(req.params.module);
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return reply.status(404).send({ error: message });
    }
  });
}

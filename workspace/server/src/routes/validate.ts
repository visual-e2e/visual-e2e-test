import type { FastifyInstance } from "fastify";
import { ValidateService } from "../services/validate.service.js";
import { ScenarioRepository } from "../repositories/scenario.repo.js";
import type { WorkspaceConfig } from "../config.js";

export function registerValidateRoutes(app: FastifyInstance, _config: WorkspaceConfig): void {
  app.post<{ Body: { data: unknown } }>("/api/validate/scenario", async (req) => {
    return new ValidateService(req.project).validateScenario(req.body.data);
  });

  app.post<{ Body: { data: unknown } }>("/api/validate/scenario/expand", async (req, reply) => {
    try {
      const expanded = new ValidateService(req.project).expand(req.body.data);
      return { expanded };
    } catch (err) {
      const message = err instanceof Error ? err.message : "展开失败";
      return reply.status(400).send({ error: message });
    }
  });

  app.post<{ Params: { module: string } }>("/api/validate/batch/:module", async (req, reply) => {
    try {
      const repo = new ScenarioRepository(req.project);
      const validate = new ValidateService(req.project);
      const summaries = repo.listScenarios(req.params.module);
      const scenarios = summaries.map((s) => ({
        file: s.file,
        raw: repo.readScenario(req.params.module, s.file),
      }));
      const results = validate.validateBatch(req.params.module, scenarios);
      const valid = results.filter((r) => r.valid).length;
      return {
        module: req.params.module,
        total: results.length,
        valid,
        failed: results.length - valid,
        results: summaries.map((s, i) => ({
          file: s.file,
          id: s.id,
          valid: results[i].valid,
          issues: results[i].issues,
        })),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return reply.status(404).send({ error: message });
    }
  });

  app.post("/api/validate/batch-all", async (req) => {
    const repo = new ScenarioRepository(req.project);
    const validate = new ValidateService(req.project);
    const modules = repo.listModules();
    const allResults = [];
    for (const mod of modules) {
      const summaries = repo.listScenarios(mod.module);
      const scenarios = summaries.map((s) => ({
        file: s.file,
        raw: repo.readScenario(mod.module, s.file),
      }));
      const results = validate.validateBatch(mod.module, scenarios);
      allResults.push({
        module: mod.module,
        total: results.length,
        valid: results.filter((r) => r.valid).length,
        failed: results.filter((r) => !r.valid).length,
        results: summaries.map((s, i) => ({
          file: s.file,
          id: s.id,
          valid: results[i].valid,
          issues: results[i].issues,
        })),
      });
    }
    return allResults;
  });
}

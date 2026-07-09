import type { FastifyInstance } from "fastify";
import { scenarioWriteSchema } from "../schemas/scenario.schema.js";
import { PathSecurityError } from "../utils/path-security.js";
import { ScenarioRepository } from "../repositories/scenario.repo.js";
import { ValidateService } from "../services/validate.service.js";
import type { WorkspaceConfig } from "../config.js";

export function registerScenarioRoutes(app: FastifyInstance, _config: WorkspaceConfig): void {
  app.post<{ Body: { module: string; file: string; newId: string } }>(
    "/api/scenarios/duplicate",
    async (req, reply) => {
      try {
        const result = new ScenarioRepository(req.project).duplicateScenario(
          req.body.module,
          req.body.file,
          req.body.newId,
        );
        return { ok: true, ...result };
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.get<{ Params: { module: string; "*": string } }>(
    "/api/scenarios/:module/*",
    async (req, reply) => {
      const filePath = req.params["*"];
      if (!filePath?.endsWith(".json")) {
        return reply.status(400).send({ error: "路径须为 .json 场景文件" });
      }
      try {
        return new ScenarioRepository(req.project).readScenario(req.params.module, filePath);
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.post<{ Body: { module: string; file: string; data: unknown } }>(
    "/api/scenarios",
    async (req, reply) => {
      try {
        const data = scenarioWriteSchema.parse(req.body.data);
        const validate = new ValidateService(req.project);
        const validation = validate.validateScenario(data);
        if (!validation.valid) {
          return reply.status(400).send({ error: "校验失败", issues: validation.issues });
        }
        const result = new ScenarioRepository(req.project).createScenario(req.body.module, req.body.file, data);
        return { ok: true, ...result };
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.put<{ Params: { module: string; "*": string }; Body: { data: unknown } }>(
    "/api/scenarios/:module/*",
    async (req, reply) => {
      const filePath = req.params["*"];
      if (!filePath?.endsWith(".json")) {
        return reply.status(400).send({ error: "路径须为 .json 场景文件" });
      }
      try {
        const data = scenarioWriteSchema.parse(req.body.data);
        const validate = new ValidateService(req.project);
        const validation = validate.validateScenario(data);
        if (!validation.valid) {
          return reply.status(400).send({ error: "校验失败", issues: validation.issues });
        }
        const result = new ScenarioRepository(req.project).updateScenario(req.params.module, filePath, data);
        return { ok: true, ...result };
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );

  app.delete<{ Params: { module: string; "*": string } }>(
    "/api/scenarios/:module/*",
    async (req, reply) => {
      const filePath = req.params["*"];
      try {
        new ScenarioRepository(req.project).deleteScenario(req.params.module, filePath);
        return { ok: true };
      } catch (err) {
        return handleError(reply, err);
      }
    },
  );
}

function handleError(reply: { status: (c: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof PathSecurityError) {
    return reply.status(400).send({ error: err.message });
  }
  const message = err instanceof Error ? err.message : "未知错误";
  const status = message.includes("不存在") ? 404 : message.includes("已存在") ? 409 : 500;
  return reply.status(status).send({ error: message });
}

import type { FastifyInstance } from "fastify";
import { ProfileRepository } from "../repositories/profile.repo.js";
import { ProfileService } from "../services/profile.service.js";
import { spawnProfileConvertAll } from "../adapters/profile-converter.js";
import type { WorkspaceConfig } from "../config.js";

export function registerProfileRoutes(app: FastifyInstance, _config: WorkspaceConfig): void {
  app.get<{ Querystring: { module?: string } }>("/api/profiles", async (req) => {
    return new ProfileRepository(req.project).listProfiles(req.query.module);
  });

  app.get<{ Params: { module: string; "*": string } }>("/api/profiles/:module/*", async (req, reply) => {
    try {
      const content = new ProfileRepository(req.project).readProfile(req.params.module, req.params["*"]);
      return { content };
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });

  app.get<{ Querystring: { module: string; file: string } }>(
    "/api/profiles/status",
    async (req, reply) => {
      try {
        return new ProfileService(req.project).getStatus(req.query.module, req.query.file);
      } catch (err) {
        return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
      }
    },
  );

  app.post<{ Body: { module: string; file: string } }>("/api/profiles/parse", async (req, reply) => {
    try {
      const scenario = await new ProfileService(req.project).parseToScenario(req.body.module, req.body.file);
      return { scenario };
    } catch (err) {
      const message = err instanceof Error ? err.message : "解析失败";
      return reply.status(400).send({ error: message });
    }
  });

  app.put<{ Body: { module: string; file: string; content: string } }>(
    "/api/profiles/export",
    async (req, reply) => {
      try {
        new ProfileService(req.project).saveContent(req.body.module, req.body.file, req.body.content);
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
      }
    },
  );

  app.delete<{ Params: { module: string; "*": string } }>(
    "/api/profiles/:module/*",
    async (req, reply) => {
      try {
        const result = new ProfileService(req.project).deleteProfile(req.params.module, req.params["*"]);
        return { ok: true, ...result };
      } catch (err) {
        const message = err instanceof Error ? err.message : "未知错误";
        const status = message.includes("不存在") ? 404 : 400;
        return reply.status(status).send({ error: message });
      }
    },
  );

  app.post<{ Body: { module: string; scenarioName?: string; force?: boolean } }>(
    "/api/profiles/sync-to-scenario",
    async (req, reply) => {
      try {
        await new ProfileService(req.project).syncToJson(req.body.module, req.body.scenarioName, req.body.force);
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
      }
    },
  );

  app.post<{ Body: { force?: boolean } }>("/api/profiles/sync-batch", async (req) => {
    const result = await spawnProfileConvertAll(req.project.id, { force: req.body.force });
    return { ok: result.exitCode === 0, stdout: result.stdout, stderr: result.stderr };
  });

  app.post<{ Body: { module: string; profileFile: string; scenario: unknown } }>(
    "/api/profiles/sync-from-scenario",
    async (req, reply) => {
      try {
        await new ProfileService(req.project).syncFromScenario(req.body.module, req.body.profileFile, req.body.scenario);
        return { ok: true };
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
      }
    },
  );

  app.post<{ Body: { scenario: unknown; profileFile: string; module: string } }>(
    "/api/profiles/scenario-to-md",
    async (req, reply) => {
      try {
        const service = new ProfileService(req.project);
        await service.syncFromScenario(req.body.module, req.body.profileFile, req.body.scenario);
        const content = new ProfileRepository(req.project).readProfile(req.body.module, req.body.profileFile);
        return { content };
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
      }
    },
  );
}

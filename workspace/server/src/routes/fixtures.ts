import type { FastifyInstance } from "fastify";
import { FixtureRepository } from "../repositories/fixture.repo.js";
import type { WorkspaceConfig } from "../config.js";

export function registerFixtureRoutes(app: FastifyInstance, _config: WorkspaceConfig): void {
  app.get("/api/fixtures/variables", async (req) => new FixtureRepository(req.project).readVariables());
  app.put<{ Body: Record<string, Record<string, string>> }>("/api/fixtures/variables", async (req, reply) => {
    try {
      new FixtureRepository(req.project).writeVariables(req.body);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "未知错误";
      return reply.status(400).send({ error: message });
    }
  });

  app.get("/api/fixtures/macros", async (req) => new FixtureRepository(req.project).listMacroSummaries());
  app.get<{ Params: { id: string } }>("/api/fixtures/macros/:id", async (req, reply) => {
    try {
      return new FixtureRepository(req.project).readMacro(req.params.id);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.post<{ Body: { id: string; data: unknown } }>("/api/fixtures/macros", async (req, reply) => {
    try {
      new FixtureRepository(req.project).writeMacro(req.body.id, req.body.data);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.put<{ Params: { id: string }; Body: unknown }>("/api/fixtures/macros/:id", async (req, reply) => {
    try {
      new FixtureRepository(req.project).writeMacro(req.params.id, req.body);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.delete<{ Params: { id: string } }>("/api/fixtures/macros/:id", async (req, reply) => {
    try {
      new FixtureRepository(req.project).deleteMacro(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });

  app.get("/api/fixtures/rules", async (req) => new FixtureRepository(req.project).listRuleSummaries());
  app.get<{ Params: { id: string } }>("/api/fixtures/rules/:id", async (req, reply) => {
    try {
      return new FixtureRepository(req.project).readRule(req.params.id);
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.post<{ Body: { id: string; data: unknown } }>("/api/fixtures/rules", async (req, reply) => {
    try {
      new FixtureRepository(req.project).writeRule(req.body.id, req.body.data);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.put<{ Params: { id: string }; Body: unknown }>("/api/fixtures/rules/:id", async (req, reply) => {
    try {
      new FixtureRepository(req.project).writeRule(req.params.id, req.body);
      return { ok: true };
    } catch (err) {
      return reply.status(400).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
  app.delete<{ Params: { id: string } }>("/api/fixtures/rules/:id", async (req, reply) => {
    try {
      new FixtureRepository(req.project).deleteRule(req.params.id);
      return { ok: true };
    } catch (err) {
      return reply.status(404).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });
}

import type { FastifyInstance } from "fastify";
import type { SettingsRepository } from "../repositories/settings.repo.js";

export function registerConfigRoutes(app: FastifyInstance, repo: SettingsRepository): void {
  app.get("/api/config/settings", async () => repo.read());

  app.put<{ Body: unknown }>("/api/config/settings", async (req, reply) => {
    try {
      const saved = repo.write(req.body);
      return { ok: true, data: saved };
    } catch (err) {
      const message = err instanceof Error ? err.message : "保存失败";
      return reply.status(400).send({ error: message });
    }
  });
}

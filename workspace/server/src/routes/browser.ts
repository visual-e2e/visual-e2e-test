import type { FastifyInstance } from "fastify";
import type { WorkspaceConfig } from "../config.js";
import { BrowserRuntimeService } from "../services/browser-runtime.service.js";

export function registerBrowserRoutes(app: FastifyInstance, config: WorkspaceConfig): void {
  const service = () => new BrowserRuntimeService(config);

  app.get("/api/browser/runtime", async () => {
    const svc = service();
    const [runtime, check, engineVersion] = await Promise.all([
      svc.getConfig(),
      svc.check(),
      svc.getEngineVersion(),
    ]);
    return { runtime, check, engineVersion };
  });

  app.put<{ Body: { mode?: "managed" | "custom"; executablePath?: string } }>(
    "/api/browser/runtime",
    async (req, reply) => {
      try {
        const svc = service();
        if (req.body?.mode === "managed") {
          const runtime = await svc.setManagedMode();
          const [check, engineVersion] = await Promise.all([svc.check(), svc.getEngineVersion()]);
          return { ok: true, runtime, check, engineVersion };
        }
        if (req.body?.executablePath) {
          const { config: runtime, check } = await svc.setCustomPath(req.body.executablePath);
          const engineVersion = await svc.getEngineVersion();
          return { ok: true, runtime, check, engineVersion };
        }
        return reply.status(400).send({ error: "请指定 mode 或 executablePath" });
      } catch (err) {
        return reply.status(400).send({ error: err instanceof Error ? err.message : "保存失败" });
      }
    },
  );

  app.get("/api/browser/detect", async () => {
    const candidates = await service().detect();
    return { candidates };
  });

  app.post<{ Body: { path?: string } }>("/api/browser/verify", async (req, reply) => {
    const path = req.body?.path?.trim();
    if (!path) return reply.status(400).send({ error: "path 不能为空" });
    const result = await service().verifyPath(path);
    return result;
  });

  app.get("/api/runs/browser-check", async () => service().check());

  app.post("/api/browser/install", async () => {
    const job = await service().startInstall();
    return job;
  });

  app.get<{ Params: { jobId: string } }>("/api/browser/install/:jobId", async (req, reply) => {
    const job = service().getInstallJob(req.params.jobId);
    if (!job) return reply.status(404).send({ error: "安装任务不存在" });
    return job;
  });
}

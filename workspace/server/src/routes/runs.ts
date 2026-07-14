import type { FastifyInstance } from "fastify";
import { RunOrchestratorService, type RunScope } from "../services/run-orchestrator.service.js";
import { EnvService } from "../services/env.service.js";
import { pipeRunsZip } from "../services/run-archive.service.js";
import type { WorkspaceConfig } from "../config.js";
import { readFileSync } from "node:fs";
import { extname } from "node:path";

export function registerRunRoutes(
  app: FastifyInstance,
  runs: RunOrchestratorService,
  _config: WorkspaceConfig,
): void {
  app.get("/api/runs/env-check", async (req) => new EnvService(_config.e2eRoot, req.project).check());

  app.get("/api/runs/env", async (req) => new EnvService(_config.e2eRoot, req.project).getEnv());

  app.put<{ Body: { content: string } }>("/api/runs/env", async (req, reply) => {
    const result = new EnvService(_config.e2eRoot, req.project).saveEnv(req.body.content ?? "");
    if (!result.ok) {
      return reply.status(400).send({ error: `缺少: ${result.missing.join(", ")}`, missing: result.missing });
    }
    return { ok: true, missing: [] };
  });

  app.post<{
    Body: {
      scope?: RunScope;
      modules: string[];
      scenarios?: string[];
      options?: { headed?: boolean; headless?: boolean; slowMo?: number };
    };
  }>("/api/runs", async (req, reply) => {
    const envCheck = new EnvService(_config.e2eRoot, req.project).check();
    if (!envCheck.ok) {
      return reply.status(400).send({
        error: `环境未就绪，缺少: ${envCheck.missing.join(", ")}`,
        missing: envCheck.missing,
      });
    }
    try {
      const scope = req.body.scope ?? (req.body.scenarios?.length ? "scenarios" : "module");
      const job = runs.createJobFromPlan({
        scope,
        projectId: req.project.id,
        modules: req.body.modules,
        scenarios: req.body.scenarios ?? [],
        options: req.body.options ?? {},
      });
      return job;
    } catch (err) {
      return reply.status(409).send({ error: err instanceof Error ? err.message : "未知错误" });
    }
  });

  app.get("/api/runs", async (req) => runs.listJobs(req.project.id));

  app.post<{ Body: { runIds?: string[] } }>("/api/runs/delete", async (req, reply) => {
    const runIds = req.body.runIds ?? [];
    if (runIds.length === 0) {
      return reply.status(400).send({ error: "runIds 不能为空" });
    }
    return runs.deleteRuns(req.project.id, runIds);
  });

  app.post<{ Body: { runIds?: string[] } }>("/api/runs/download", async (req, reply) => {
    const runIds = req.body.runIds ?? [];
    if (runIds.length === 0) {
      return reply.status(400).send({ error: "runIds 不能为空" });
    }
    const { entries, skipped } = runs.resolveRunArchiveEntries(req.project.id, runIds);
    if (entries.length === 0) {
      return reply.status(404).send({ error: "没有可下载的运行记录", skipped });
    }
    const ids = entries.map((e) => e.runId);
    await pipeRunsZip(reply, entries, runs.zipFilename(req.project.id, ids));
    return reply;
  });

  app.get<{ Params: { runId: string; projectId: string } }>(
    "/api/runs/artifacts/:projectId/:runId/download.zip",
    async (req, reply) => {
      const { projectId, runId } = req.params;
      const { entries, skipped } = runs.resolveRunArchiveEntries(projectId, [runId]);
      if (entries.length === 0) {
        return reply.status(404).send({ error: "运行记录不存在", skipped });
      }
      await pipeRunsZip(reply, entries, runs.zipFilename(projectId, [runId]));
      return reply;
    },
  );

  app.get<{ Params: { jobId: string } }>("/api/runs/:jobId", async (req, reply) => {
    const job = runs.getJob(req.params.jobId, req.project.id);
    if (!job) return reply.status(404).send({ error: "任务不存在" });
    return job;
  });

  app.get<{ Params: { jobId: string } }>("/api/runs/:jobId/logs", async (req, reply) => {
    const job = runs.getJob(req.params.jobId, req.project.id);
    if (!job) return reply.status(404).send({ error: "任务不存在" });
    return { logs: job.logs };
  });

  app.get<{ Params: { jobId: string } }>("/api/runs/:jobId/logs/stream", async (req, reply) => {
    const job = runs.getJob(req.params.jobId, req.project.id);
    if (!job) return reply.status(404).send({ error: "任务不存在" });

    reply.raw.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    });

    let lastIndex = 0;
    const interval = setInterval(() => {
      while (lastIndex < job.logs.length) {
        reply.raw.write(`data: ${JSON.stringify({ line: job.logs[lastIndex] })}\n\n`);
        lastIndex++;
      }
      if (job.status !== "running") {
        reply.raw.write(`data: ${JSON.stringify({ done: true, status: job.status })}\n\n`);
        clearInterval(interval);
        reply.raw.end();
      }
    }, 500);

    req.raw.on("close", () => clearInterval(interval));
  });

  app.delete<{ Params: { jobId: string } }>("/api/runs/:jobId", async (req, reply) => {
    const ok = runs.cancelJob(req.params.jobId, req.project.id);
    if (!ok) return reply.status(404).send({ error: "任务不存在或已结束" });
    return { ok: true };
  });

  app.get<{ Params: { runId: string; projectId: string; "*": string } }>(
    "/api/runs/artifacts/:projectId/:runId/*",
    async (req, reply) => {
      const { projectId, runId } = req.params;
      const subPath = req.params["*"] || "report.html";

      if (subPath === "download.zip") {
        const { entries } = runs.resolveRunArchiveEntries(projectId, [runId]);
        if (entries.length === 0) {
          return reply.status(404).send({ error: "运行记录不存在" });
        }
        await pipeRunsZip(reply, entries, runs.zipFilename(projectId, [runId]));
        return reply;
      }

      const filePath = runs.resolveRunArtifactPath(projectId, runId, subPath);
      if (!filePath) {
        return reply.status(404).send({ error: "文件不存在" });
      }
      const ext = extname(subPath).toLowerCase();
      const types: Record<string, string> = {
        ".html": "text/html; charset=utf-8",
        ".json": "application/json; charset=utf-8",
        ".png": "image/png",
        ".jpg": "image/jpeg",
        ".webm": "video/webm",
        ".log": "text/plain; charset=utf-8",
      };
      return reply.type(types[ext] ?? "application/octet-stream").send(readFileSync(filePath));
    },
  );
}

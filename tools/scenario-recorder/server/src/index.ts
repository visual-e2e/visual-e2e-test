import Fastify from "fastify";
import cors from "@fastify/cors";
import fastifyStatic from "@fastify/static";
import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { getBrowserStatus } from "./resolve-browser.js";
import {
  buildScenarioExport,
  cancelSession,
  commandSession,
  createSession,
  getSession,
} from "./session.js";
import type { ScenarioMeta } from "./types.js";
import { listProjects, resolveProjectToolContext } from "./project-context.js";
import {
  createRecording,
  deleteRecording,
  getRecording,
  importRecording,
  listRecordings,
  parseScenarioExport,
  scenarioExists,
  updateRecording,
} from "./recordings.js";

const port = Number(process.env.TOOL_PORT ?? 3202);
const host = "127.0.0.1";
const serveWeb = process.env.SERVE_WEB === "1";

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });

app.get("/api/health", async () => ({
  ok: true,
  toolId: process.env.TOOL_ID ?? "scenario-recorder",
  port,
}));

app.get("/api/browser/status", async () => getBrowserStatus());

app.get("/api/projects", async () => ({ projects: listProjects() }));

app.get<{ Params: { projectId: string } }>("/api/projects/:projectId/context", async (req, reply) => {
  try {
    return resolveProjectToolContext(req.params.projectId);
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取项目失败";
    return reply.status(404).send({ error: message });
  }
});

app.post<{
  Body: {
    startUrl?: string;
    meta?: Partial<ScenarioMeta>;
  };
}>("/api/sessions", async (req, reply) => {
  const startUrl = req.body?.startUrl?.trim();
  const metaInput = req.body?.meta ?? {};
  if (!startUrl) return reply.status(400).send({ error: "startUrl 不能为空" });
  if (!metaInput.id?.trim()) return reply.status(400).send({ error: "场景 id 不能为空" });
  if (!metaInput.name?.trim()) return reply.status(400).send({ error: "场景名称不能为空" });
  if (!metaInput.module?.trim()) return reply.status(400).send({ error: "模块不能为空" });

  const meta: ScenarioMeta = {
    id: metaInput.id.trim(),
    name: metaInput.name.trim(),
    module: metaInput.module.trim(),
    requiresLogin: metaInput.requiresLogin ?? true,
  };

  try {
    const session = await createSession({ startUrl, meta });
    return session;
  } catch (err) {
    const message = err instanceof Error ? err.message : "创建会话失败";
    return reply.status(500).send({ error: message });
  }
});

app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId", async (req, reply) => {
  const session = getSession(req.params.sessionId);
  if (!session) return reply.status(404).send({ error: "会话不存在" });
  return session;
});

app.post<{
  Params: { sessionId: string };
  Body: { command?: "start" | "pause" | "resume" | "stop" };
}>("/api/sessions/:sessionId/command", async (req, reply) => {
  const command = req.body?.command;
  if (!command) return reply.status(400).send({ error: "command 不能为空" });
  try {
    return await commandSession(req.params.sessionId, command);
  } catch (err) {
    const message = err instanceof Error ? err.message : "命令执行失败";
    return reply.status(400).send({ error: message });
  }
});

app.delete<{ Params: { sessionId: string } }>("/api/sessions/:sessionId", async (req, reply) => {
  await cancelSession(req.params.sessionId);
  return { ok: true };
});

app.get<{ Params: { sessionId: string } }>("/api/sessions/:sessionId/export", async (req, reply) => {
  const session = getSession(req.params.sessionId);
  if (!session) return reply.status(404).send({ error: "会话不存在" });
  return buildScenarioExport(session.meta, session.steps);
});

app.get<{ Querystring: { projectId?: string } }>("/api/recordings", async (req, reply) => {
  const projectId = req.query.projectId?.trim();
  if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
  try {
    return { recordings: listRecordings(projectId) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "读取录制记录失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{
  Body: {
    projectId?: string;
    sessionMeta?: ScenarioMeta & { startUrl?: string };
    scenario?: unknown;
    description?: string;
    allowEmptySteps?: boolean;
  };
}>("/api/recordings", async (req, reply) => {
  const projectId = req.body?.projectId?.trim();
  if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
  try {
    const allowEmptySteps = req.body?.allowEmptySteps === true;
    const scenario = parseScenarioExport(req.body?.scenario, { allowEmptySteps });
    const meta = req.body?.sessionMeta;
    const sessionMeta = {
      id: meta?.id?.trim() || scenario.id,
      name: meta?.name?.trim() || scenario.name,
      module: meta?.module?.trim() || scenario.module,
      requiresLogin: meta?.requiresLogin ?? scenario.setup.requiresLogin,
      startUrl: meta?.startUrl?.trim() || scenario.setup.entryRoute || "",
    };
    return createRecording({
      projectId,
      sessionMeta,
      scenario,
      description: req.body?.description,
      allowEmptySteps,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "保存录制记录失败";
    return reply.status(400).send({ error: message });
  }
});

app.get<{ Params: { id: string }; Querystring: { projectId?: string } }>(
  "/api/recordings/:id",
  async (req, reply) => {
    const projectId = req.query.projectId?.trim();
    if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
    try {
      return getRecording(projectId, req.params.id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "读取失败";
      return reply.status(404).send({ error: message });
    }
  },
);

app.put<{
  Params: { id: string };
  Body: {
    projectId?: string;
    scenario?: unknown;
    sessionMeta?: ScenarioMeta & { startUrl?: string };
    description?: string | null;
    status?: "draft" | "imported";
    clearImported?: boolean;
    allowEmptySteps?: boolean;
  };
}>("/api/recordings/:id", async (req, reply) => {
  const projectId = req.body?.projectId?.trim();
  if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
  try {
    const allowEmptySteps = req.body?.allowEmptySteps === true;
    const patch: Parameters<typeof updateRecording>[2] = { allowEmptySteps };
    if (req.body?.scenario !== undefined) {
      patch.scenario = parseScenarioExport(req.body.scenario, { allowEmptySteps });
    }
    if (req.body?.sessionMeta) {
      const meta = req.body.sessionMeta;
      patch.sessionMeta = {
        id: meta.id,
        name: meta.name,
        module: meta.module,
        requiresLogin: meta.requiresLogin,
        startUrl: meta.startUrl ?? "",
      };
    }
    if (req.body?.description !== undefined) {
      patch.description = req.body.description;
    }
    if (req.body?.status) patch.status = req.body.status;
    if (req.body?.clearImported) patch.clearImported = true;
    return updateRecording(projectId, req.params.id, patch);
  } catch (err) {
    const message = err instanceof Error ? err.message : "更新失败";
    return reply.status(400).send({ error: message });
  }
});

app.delete<{ Params: { id: string }; Querystring: { projectId?: string } }>(
  "/api/recordings/:id",
  async (req, reply) => {
    const projectId = req.query.projectId?.trim();
    if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
    try {
      deleteRecording(projectId, req.params.id);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "删除失败";
      return reply.status(404).send({ error: message });
    }
  },
);

app.get<{
  Querystring: { projectId?: string; module?: string; file?: string };
}>("/api/scenarios/exists", async (req, reply) => {
  const projectId = req.query.projectId?.trim();
  const module = req.query.module?.trim();
  const file = req.query.file?.trim();
  if (!projectId || !module || !file) {
    return reply.status(400).send({ error: "projectId、module、file 不能为空" });
  }
  try {
    return { exists: scenarioExists(projectId, module, file) };
  } catch (err) {
    const message = err instanceof Error ? err.message : "检查失败";
    return reply.status(400).send({ error: message });
  }
});

app.post<{
  Params: { id: string };
  Body: { projectId?: string; overwrite?: boolean };
}>("/api/recordings/:id/import", async (req, reply) => {
  const projectId = req.body?.projectId?.trim();
  if (!projectId) return reply.status(400).send({ error: "projectId 不能为空" });
  try {
    return importRecording(projectId, req.params.id, { overwrite: req.body?.overwrite === true });
  } catch (err) {
    const error = err as Error & { code?: string };
    const message = error.message || "导入失败";
    if (error.code === "CONFLICT") {
      return reply.status(409).send({ error: message, code: "CONFLICT" });
    }
    return reply.status(400).send({ error: message });
  }
});

if (serveWeb) {
  const root = join(dirname(fileURLToPath(import.meta.url)), "../../web/dist");
  if (existsSync(root)) {
    await app.register(fastifyStatic, { root, prefix: "/" });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api")) return reply.code(404).send({ error: "Not found" });
      return reply.sendFile("index.html", root);
    });
  }
}

await app.listen({ port, host });
console.log(`scenario-recorder tool: http://${host}:${port}`);

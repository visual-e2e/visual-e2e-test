import type { FastifyInstance } from "fastify";
import { existsSync } from "node:fs";
import { discoverToolsWithPorts, getToolById } from "./scanner.js";
import { installToolFromZip, uninstallTool } from "./installer.js";
import { ensureToolsDir } from "./paths.js";

export function registerToolsRoutes(
  app: FastifyInstance,
  options: { e2eRoot: string; toolsDir: string },
): void {
  const { e2eRoot, toolsDir } = options;
  ensureToolsDir(toolsDir);

  app.get("/api/tools", async () => {
    const tools = await discoverToolsWithPorts(toolsDir, e2eRoot);
    return {
      version: 1,
      toolsDir,
      tools: tools.map((t) => ({
        id: t.id,
        version: t.version,
        name: t.name,
        description: t.description,
        icon: t.icon,
        category: t.category,
        source: t.source,
        capabilities: t.capabilities,
        rpcProtocolVersion: t.rpcProtocolVersion,
        compatible: t.compatible,
        incompatibleReason: t.incompatibleReason,
        ports: {
          prod: t.resolvedPorts?.prod ?? t.ports.prod ?? t.ports.preferredProd,
          dev: t.resolvedPorts?.dev ?? t.ports.dev,
          webDev: t.resolvedPorts?.webDev ?? t.ports.webDev,
        },
        // legacy aliases for existing UI
        devPort: t.resolvedPorts?.dev ?? t.ports.dev,
        prodPort: t.resolvedPorts?.prod ?? t.ports.prod ?? t.ports.preferredProd,
        webDevPort: t.resolvedPorts?.webDev ?? t.ports.webDev,
        entry: t.id,
        uninstallable: t.source === "user",
      })),
    };
  });

  /** @deprecated use GET /api/tools */
  app.get("/api/tools/registry", async () => {
    const tools = await discoverToolsWithPorts(toolsDir, e2eRoot);
    return {
      version: 1,
      tools: tools.map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        entry: t.id,
        icon: t.icon,
        category: t.category,
        version: t.version,
        source: t.source,
        uninstallable: t.source === "user",
        compatible: t.compatible,
        incompatibleReason: t.incompatibleReason,
        capabilities: t.capabilities,
        devPort: t.resolvedPorts?.dev ?? t.ports.dev ?? 0,
        prodPort: t.resolvedPorts?.prod ?? t.ports.prod ?? t.ports.preferredProd ?? 0,
        webDevPort: t.resolvedPorts?.webDev ?? t.ports.webDev ?? 0,
      })),
    };
  });

  app.get<{ Params: { toolId: string } }>("/api/tools/:toolId", async (req, reply) => {
    const tools = await discoverToolsWithPorts(toolsDir, e2eRoot);
    const tool = tools.find((t) => t.id === req.params.toolId);
    if (!tool) return reply.status(404).send({ error: "工具不存在" });
    return tool;
  });

  app.post<{ Body: { path?: string } }>("/api/tools/install", async (req, reply) => {
    const zipPath = req.body?.path?.trim();
    if (!zipPath) return reply.status(400).send({ error: "path 不能为空" });
    if (!existsSync(zipPath)) return reply.status(400).send({ error: "文件不存在" });
    try {
      const result = await installToolFromZip(toolsDir, zipPath);
      return { ok: true, tool: result };
    } catch (err) {
      const message = err instanceof Error ? err.message : "安装失败";
      return reply.status(400).send({ error: message });
    }
  });

  app.delete<{ Params: { toolId: string } }>("/api/tools/:toolId", async (req, reply) => {
    const tool = getToolById(toolsDir, e2eRoot, req.params.toolId);
    if (!tool) return reply.status(404).send({ error: "工具不存在" });
    if (tool.source !== "user") {
      return reply.status(400).send({ error: "仅可卸载用户安装的工具" });
    }
    try {
      uninstallTool(toolsDir, req.params.toolId);
      return { ok: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : "卸载失败";
      return reply.status(400).send({ error: message });
    }
  });
}

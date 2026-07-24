import { existsSync, readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { HOST_RPC_PROTOCOL_VERSION, toolManifestSchema, type ToolDescriptor } from "./types.js";
import { toolsDevLinksPath, toolsInstalledDir } from "./paths.js";
import { declaredProdPort } from "./ports.js";
import { setRuntimePort } from "./store.js";

function readManifest(dir: string): ToolDescriptor | null {
  const manifestPath = join(dir, "tool.json");
  if (!existsSync(manifestPath)) return null;
  try {
    const raw = JSON.parse(readFileSync(manifestPath, "utf-8"));
    const parsed = toolManifestSchema.safeParse(raw);
    if (!parsed.success) return null;
    const m = parsed.data;
    const rpcProtocolVersion = m.rpc?.protocolVersion ?? 1;
    const compatible = rpcProtocolVersion <= HOST_RPC_PROTOCOL_VERSION;
    return {
      id: m.id,
      version: m.version,
      name: m.name,
      description: m.description ?? "",
      icon: m.icon,
      category: m.category,
      source: "user",
      path: dir,
      main: m.main ?? "server/dist/index.js",
      webRoot: m.webRoot ?? "web/dist",
      capabilities: [
        ...(m.capabilities ?? []),
        ...(m.sandbox?.bridge ?? []),
      ],
      rpcProtocolVersion,
      ports: {
        preferredProd: m.ports?.preferredProd ?? m.ports?.prod,
        dev: m.ports?.dev,
        webDev: m.ports?.webDev,
        prod: m.ports?.prod,
      },
      compatible,
      incompatibleReason: compatible
        ? undefined
        : `需要 Host RPC ≤ ${HOST_RPC_PROTOCOL_VERSION}，工具为 ${rpcProtocolVersion}`,
    };
  } catch {
    return null;
  }
}

function scanInstalled(toolsDir: string): ToolDescriptor[] {
  const root = toolsInstalledDir(toolsDir);
  if (!existsSync(root)) return [];
  const out: ToolDescriptor[] = [];
  for (const name of readdirSync(root, { withFileTypes: true })) {
    if (!name.isDirectory()) continue;
    const desc = readManifest(join(root, name.name));
    if (desc) {
      desc.source = "user";
      out.push(desc);
    }
  }
  return out;
}

function scanDevLinks(toolsDir: string): ToolDescriptor[] {
  const path = toolsDevLinksPath(toolsDir);
  if (!existsSync(path)) return [];
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as {
      links?: Array<{ id?: string; path?: string }>;
    };
    const out: ToolDescriptor[] = [];
    for (const link of raw.links ?? []) {
      if (!link.path?.trim()) continue;
      const desc = readManifest(link.path.trim());
      if (!desc) continue;
      if (link.id && link.id !== desc.id) continue;
      desc.source = "dev-link";
      out.push(desc);
    }
    return out;
  } catch {
    return [];
  }
}

/** @deprecated Bundled monorepo tools removed — kept as empty for API compat. */
function scanBundled(_e2eRoot: string): ToolDescriptor[] {
  return [];
}

/**
 * Merge priority (later wins): bundled → dev-link → user installed.
 */
export function discoverTools(toolsDir: string, e2eRoot: string): ToolDescriptor[] {
  const map = new Map<string, ToolDescriptor>();
  for (const tool of scanBundled(e2eRoot)) map.set(tool.id, tool);
  for (const tool of scanDevLinks(toolsDir)) map.set(tool.id, tool);
  for (const tool of scanInstalled(toolsDir)) map.set(tool.id, tool);
  return [...map.values()].sort((a, b) => a.name.localeCompare(b.name, "zh-CN"));
}

export async function discoverToolsWithPorts(
  toolsDir: string,
  e2eRoot: string,
): Promise<ToolDescriptor[]> {
  const tools = discoverTools(toolsDir, e2eRoot);

  for (const tool of tools) {
    if (tool.source === "bundled") {
      const prod = tool.ports.prod ?? tool.ports.preferredProd ?? 7200;
      tool.resolvedPorts = {
        prod,
        dev: tool.ports.dev,
        webDev: tool.ports.webDev,
      };
      continue;
    }

    try {
      const prod = declaredProdPort(tool.ports);
      setRuntimePort(toolsDir, tool.id, prod);
      tool.resolvedPorts = {
        prod,
        dev: tool.ports.dev,
        webDev: tool.ports.webDev,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : "端口声明无效";
      tool.compatible = false;
      tool.incompatibleReason = message;
      tool.resolvedPorts = {
        prod: tool.ports.prod ?? tool.ports.preferredProd ?? 0,
        dev: tool.ports.dev,
        webDev: tool.ports.webDev,
      };
    }
  }
  return tools;
}

export function getToolById(
  toolsDir: string,
  e2eRoot: string,
  toolId: string,
): ToolDescriptor | undefined {
  return discoverTools(toolsDir, e2eRoot).find((t) => t.id === toolId);
}

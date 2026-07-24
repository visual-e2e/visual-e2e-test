import {
  existsSync,
  mkdirSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  toolsRegistryPath,
  toolsRuntimePath,
} from "./paths.js";
import type { ToolsRegistryFile, ToolsRuntimeFile } from "./types.js";

const EMPTY_REGISTRY: ToolsRegistryFile = { version: 1, tools: [] };
const EMPTY_RUNTIME: ToolsRuntimeFile = { version: 1, ports: {} };

export function readRegistry(toolsDir: string): ToolsRegistryFile {
  const path = toolsRegistryPath(toolsDir);
  if (!existsSync(path)) return { ...EMPTY_REGISTRY, tools: [] };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as ToolsRegistryFile;
    return {
      version: 1,
      tools: Array.isArray(raw.tools) ? raw.tools : [],
    };
  } catch {
    return { ...EMPTY_REGISTRY, tools: [] };
  }
}

export function writeRegistry(toolsDir: string, data: ToolsRegistryFile): void {
  mkdirSync(toolsDir, { recursive: true });
  const path = toolsRegistryPath(toolsDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

export function upsertRegistryEntry(
  toolsDir: string,
  entry: ToolsRegistryFile["tools"][number],
): void {
  const reg = readRegistry(toolsDir);
  const idx = reg.tools.findIndex((t) => t.id === entry.id);
  if (idx >= 0) reg.tools[idx] = entry;
  else reg.tools.push(entry);
  writeRegistry(toolsDir, reg);
}

export function removeRegistryEntry(toolsDir: string, toolId: string): void {
  const reg = readRegistry(toolsDir);
  reg.tools = reg.tools.filter((t) => t.id !== toolId);
  writeRegistry(toolsDir, reg);
}

export function readRuntime(toolsDir: string): ToolsRuntimeFile {
  const path = toolsRuntimePath(toolsDir);
  if (!existsSync(path)) return { ...EMPTY_RUNTIME, ports: {} };
  try {
    const raw = JSON.parse(readFileSync(path, "utf-8")) as ToolsRuntimeFile;
    return {
      version: 1,
      ports: raw.ports && typeof raw.ports === "object" ? raw.ports : {},
    };
  } catch {
    return { ...EMPTY_RUNTIME, ports: {} };
  }
}

export function writeRuntime(toolsDir: string, data: ToolsRuntimeFile): void {
  mkdirSync(toolsDir, { recursive: true });
  const path = toolsRuntimePath(toolsDir);
  const tmp = `${path}.tmp`;
  writeFileSync(tmp, `${JSON.stringify(data, null, 2)}\n`, "utf-8");
  renameSync(tmp, path);
}

export function setRuntimePort(toolsDir: string, toolId: string, prod: number): void {
  const runtime = readRuntime(toolsDir);
  runtime.ports[toolId] = { prod, updatedAt: new Date().toISOString() };
  writeRuntime(toolsDir, runtime);
}

export function clearRuntimePort(toolsDir: string, toolId: string): void {
  const runtime = readRuntime(toolsDir);
  delete runtime.ports[toolId];
  writeRuntime(toolsDir, runtime);
}

export function removeInstalledDir(installedRoot: string, toolId: string): void {
  const dir = join(installedRoot, toolId);
  if (existsSync(dir)) {
    rmSync(dir, { recursive: true, force: true });
  }
}

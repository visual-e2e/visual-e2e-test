import { existsSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join, resolve } from "node:path";

/**
 * Application Support root (sibling of Storage/).
 * macOS: ~/Library/Application Support/visual-e2e-test
 */
export function resolveAppSupportRoot(): string {
  const fromEnv = process.env.APP_SUPPORT_ROOT?.trim();
  if (fromEnv) return resolve(fromEnv);

  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "visual-e2e-test");
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) throw new Error("APPDATA env not set");
    return join(appdata, "visual-e2e-test");
  }
  return join(homedir(), ".local", "share", "visual-e2e-test");
}

/** User-installed tools root: {appSupport}/tools */
export function resolveToolsDir(): string {
  const fromEnv = process.env.TOOLS_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(resolveAppSupportRoot(), "tools");
}

export function toolsInstalledDir(toolsDir: string): string {
  return join(toolsDir, "installed");
}

export function toolsRegistryPath(toolsDir: string): string {
  return join(toolsDir, "registry.json");
}

export function toolsRuntimePath(toolsDir: string): string {
  return join(toolsDir, "runtime.json");
}

export function toolsDevLinksPath(toolsDir: string): string {
  return join(toolsDir, "dev-links.json");
}

/** Create tools directories only — never delete installed tools. */
export function ensureToolsDir(toolsDir: string): void {
  mkdirSync(toolsInstalledDir(toolsDir), { recursive: true });
  const registry = toolsRegistryPath(toolsDir);
  const runtime = toolsRuntimePath(toolsDir);
  if (!existsSync(dirname(registry))) {
    mkdirSync(dirname(registry), { recursive: true });
  }
  void registry;
  void runtime;
}

import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { shell } from "electron";
import { devStorageRoot } from "./paths.js";

export interface StorageLayout {
  /** userData root (Application Support/visual-e2e-test) */
  appSupportRoot: string;
  storageRoot: string;
  projectsDir: string;
  configDir: string;
  toolsDir: string;
}

function layoutFromAppSupport(appSupportRoot: string): StorageLayout {
  const storageRoot = join(appSupportRoot, "Storage");
  return {
    appSupportRoot,
    storageRoot,
    projectsDir: join(storageRoot, "projects"),
    configDir: join(storageRoot, "config"),
    toolsDir: join(appSupportRoot, "tools"),
  };
}

export function resolveAppSupportRoot(isDev: boolean, userDataPath: string): string {
  if (isDev) {
    // sibling of Storage from legacy helper
    return dirname(devStorageRoot());
  }
  return userDataPath;
}

export function resolveStorageLayout(isDev: boolean, userDataPath: string): StorageLayout {
  return layoutFromAppSupport(resolveAppSupportRoot(isDev, userDataPath));
}

export function ensureStorage(layout: StorageLayout, bundledAppRoot: string): void {
  mkdirSync(layout.projectsDir, { recursive: true });
  mkdirSync(layout.configDir, { recursive: true });
  mkdirSync(join(layout.toolsDir, "installed"), { recursive: true });

  const settingsPath = join(layout.configDir, "settings.json");
  if (!existsSync(settingsPath)) {
    const bundled = join(bundledAppRoot, "config", "settings.json");
    if (existsSync(bundled)) {
      copyFileSync(bundled, settingsPath);
    }
  }
}

export async function openStorageInFileManager(layout: StorageLayout): Promise<void> {
  const err = await shell.openPath(layout.storageRoot);
  if (err) throw new Error(err);
}

export async function openToolsInFileManager(layout: StorageLayout): Promise<void> {
  mkdirSync(join(layout.toolsDir, "installed"), { recursive: true });
  const err = await shell.openPath(layout.toolsDir);
  if (err) throw new Error(err);
}

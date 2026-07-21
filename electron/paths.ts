import { execSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { cpus, homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const ELECTRON_DIST_DIR = dirname(fileURLToPath(import.meta.url));

/** Repository root (dev: electron/dist → ../..). */
export function repoRoot(): string {
  return join(ELECTRON_DIST_DIR, "../..");
}

export type PlatformKey = "darwin-arm64" | "darwin-x64" | "win32-x64";

function darwinHardwareArch(): "arm64" | "x64" {
  try {
    const translated = execSync("sysctl -in sysctl.proc_translated", {
      encoding: "utf8",
    }).trim();
    if (translated === "1") return "arm64";
  } catch {
    // unavailable in some sandboxes
  }
  try {
    const brand = execSync("sysctl -n machdep.cpu.brand_string", {
      encoding: "utf8",
    }).trim();
    if (/Apple/i.test(brand)) return "arm64";
  } catch {
    // fall through
  }
  if (cpus().some((cpu) => /Apple/i.test(cpu.model))) return "arm64";
  return process.arch === "arm64" ? "arm64" : "x64";
}

export function currentPlatformKey(): PlatformKey {
  if (process.platform === "darwin") {
    return darwinHardwareArch() === "arm64" ? "darwin-arm64" : "darwin-x64";
  }
  if (process.platform === "win32") {
    return "win32-x64";
  }
  throw new Error(`Unsupported platform: ${process.platform}/${process.arch}`);
}

export function bundledAppRoot(isDev: boolean, resourcesPath: string): string {
  if (isDev) return repoRoot();
  return join(resourcesPath, "app");
}

export function bundledNodeBinary(isDev: boolean, resourcesPath: string): string {
  if (isDev) return resolveDevNode();
  const key = currentPlatformKey();
  const platformDir = join(resourcesPath, "node", key);
  if (process.platform === "win32") {
    return join(platformDir, "node.exe");
  }
  return join(platformDir, "bin", "node");
}

/** Resolve managed browsers path from user config or dev tree. */
export function resolvePlaywrightBrowsersPath(
  isDev: boolean,
  configDir?: string,
): string | undefined {
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (fromEnv) return fromEnv;

  if (configDir) {
    const runtimePath = join(configDir, "browser-runtime.json");
    if (existsSync(runtimePath)) {
      try {
        const raw = JSON.parse(readFileSync(runtimePath, "utf-8")) as {
          mode?: string;
          managed?: { browsersPath?: string };
        };
        if (raw.mode !== "custom") {
          const key = currentPlatformKey();
          const candidates = [
            join(dirname(dirname(configDir)), "playwright-browsers", key),
            join(dirname(configDir), "playwright-browsers", key),
          ];
          for (const dir of candidates) {
            if (existsSync(dir)) return dir;
          }
        }
      } catch {
        // ignore invalid config
      }
    }
  }

  if (isDev) {
    const devDir = join(repoRoot(), "playwright-browsers", currentPlatformKey());
    if (existsSync(devDir)) return devDir;
  }

  return undefined;
}

function resolveDevNode(): string {
  const fromEnv = process.env.BUNDLED_NODE?.trim();
  if (fromEnv) return fromEnv;

  const which = process.platform === "win32" ? "where" : "which";
  try {
    const output = execSync(`${which} node`, { encoding: "utf8" });
    const path = output.split(/\r?\n/).find((line) => line.trim())?.trim();
    if (path) return path;
  } catch {
    // fall through
  }
  return "node";
}

export function devStorageRoot(): string {
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support", "visual-e2e-test", "Storage");
  }
  if (process.platform === "win32") {
    const appdata = process.env.APPDATA;
    if (!appdata) throw new Error("APPDATA env not set");
    return join(appdata, "visual-e2e-test", "Storage");
  }
  return join(homedir(), ".local", "share", "visual-e2e-test", "Storage");
}

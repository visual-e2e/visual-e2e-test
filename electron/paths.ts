import { execSync } from "node:child_process";
import { existsSync } from "node:fs";
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

/** Directory for PLAYWRIGHT_BROWSERS_PATH (project-local / packaged Chromium). */
export function bundledPlaywrightBrowsersPath(isDev: boolean, resourcesPath: string): string {
  const fromEnv = process.env.PLAYWRIGHT_BROWSERS_PATH?.trim();
  if (fromEnv) return fromEnv;

  const key = currentPlatformKey();
  if (isDev) {
    return join(repoRoot(), "playwright-browsers", key);
  }
  return join(resourcesPath, "playwright-browsers", key);
}

/** Same as bundledPlaywrightBrowsersPath, but fails if the tree is missing. */
export function requirePlaywrightBrowsersPath(isDev: boolean, resourcesPath: string): string {
  const dir = bundledPlaywrightBrowsersPath(isDev, resourcesPath);
  if (!existsSync(dir)) {
    const hint = isDev
      ? "Run: npm run download:chromium  (or -- all / -- darwin-arm64|darwin-x64|win32-x64)"
      : "Packaged Playwright browsers are missing from app resources.";
    throw new Error(`Playwright browsers not found: ${dir}. ${hint}`);
  }
  return dir;
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

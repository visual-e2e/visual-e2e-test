import { existsSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import type { WorkspaceConfig } from "../config.js";

export type BrowserRuntimeMode = "managed" | "custom";

export const BROWSER_COMPATIBILITY = {
  EXACT: "exact",
  DIFFERENT: "different",
  UNKNOWN: "unknown",
} as const;

export type BrowserCompatibility =
  typeof BROWSER_COMPATIBILITY[keyof typeof BROWSER_COMPATIBILITY];

export interface BrowserRuntimeConfig {
  version: number;
  mode: BrowserRuntimeMode;
  managed: { browsersPath: string };
  custom: { executablePath: string };
  detected: {
    version?: string;
    source?: string;
    verifiedAt?: string;
  } | null;
}

export interface BrowserCheckResult {
  ok: boolean;
  status: "missing" | "invalid" | "ready";
  mode: BrowserRuntimeMode;
  platform: string;
  path: string;
  version: string;
  hints: string[];
}

export interface BrowserCandidate {
  path: string;
  label: string;
  source: string;
  version: string;
  engineVersion: string;
  compatibility: BrowserCompatibility;
}

type DetectedBrowserCandidate = Pick<BrowserCandidate, "path" | "label" | "source">;

export interface InstallJob {
  jobId: string;
  status: "running" | "done" | "failed";
  logs: string[];
  error?: string;
  startedAt: string;
  finishedAt?: string;
}

type BrowserRuntimeLib = {
  readBrowserRuntime: (configDir: string, e2eRoot: string, runtime: string) => BrowserRuntimeConfig;
  writeBrowserRuntime: (configDir: string, data: BrowserRuntimeConfig) => BrowserRuntimeConfig;
  checkBrowserRuntime: (configDir: string, e2eRoot: string, runtime: string) => Promise<BrowserCheckResult>;
  resolveLaunchEnv: (
    configDir: string,
    e2eRoot: string,
    runtime: string,
  ) => Promise<{ ok: boolean; check: BrowserCheckResult; env: Record<string, string> }>;
  detectCandidates: (options?: {
    configDir?: string;
    e2eRoot?: string;
    runtime?: string;
  }) => DetectedBrowserCandidate[];
  expectedChromiumVersion: (e2eRoot: string) => string;
  verifyExecutablePath: (path: string) => Promise<{ ok: boolean; path: string; version: string; error: string }>;
  normalizeExecutablePath: (path: string) => string;
  resolveManagedBrowsersDir: (configDir: string, e2eRoot: string, runtime: string) => string;
  runInstallChromium: (opts: {
    e2eRoot: string;
    nodeBin: string;
    browsersPath: string;
    platformKey: string;
    installChromium?: boolean;
    onLog?: (line: string) => void;
  }) => Promise<{ browsersPath: string }>;
  currentPlatformKey: () => string;
};

const installJobs = new Map<string, InstallJob>();
let jobCounter = 0;

async function loadLib(e2eRoot: string): Promise<BrowserRuntimeLib> {
  const modPath = join(e2eRoot, "scripts/lib/browser-runtime.mjs");
  if (!existsSync(modPath)) {
    throw new Error(`browser-runtime 模块未找到: ${modPath}`);
  }
  return import(pathToFileURL(modPath).href) as Promise<BrowserRuntimeLib>;
}

export class BrowserRuntimeService {
  private libPromise: Promise<BrowserRuntimeLib>;

  constructor(private readonly config: WorkspaceConfig) {
    this.libPromise = loadLib(config.e2eRoot);
  }

  private resolveNodeBinary(): string {
    if (this.config.runtime !== "client") {
      return process.execPath;
    }
    const fromEnv = process.env.BUNDLED_NODE?.trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;
    return process.execPath;
  }

  async getConfig(): Promise<BrowserRuntimeConfig> {
    const lib = await this.libPromise;
    return lib.readBrowserRuntime(this.config.configDir, this.config.e2eRoot, this.config.runtime);
  }

  async saveConfig(patch: Partial<BrowserRuntimeConfig>): Promise<BrowserRuntimeConfig> {
    const lib = await this.libPromise;
    const current = lib.readBrowserRuntime(this.config.configDir, this.config.e2eRoot, this.config.runtime);
    const next: BrowserRuntimeConfig = {
      ...current,
      ...patch,
      managed: { ...current.managed, ...(patch.managed ?? {}) },
      custom: { ...current.custom, ...(patch.custom ?? {}) },
    };
    return lib.writeBrowserRuntime(this.config.configDir, next);
  }

  async check(): Promise<BrowserCheckResult> {
    const lib = await this.libPromise;
    return lib.checkBrowserRuntime(this.config.configDir, this.config.e2eRoot, this.config.runtime);
  }

  async getEngineVersion(): Promise<string> {
    const lib = await this.libPromise;
    return lib.expectedChromiumVersion(this.config.e2eRoot);
  }

  async resolveLaunchEnv(): Promise<{
    ok: boolean;
    check: BrowserCheckResult;
    env: Record<string, string>;
  }> {
    const lib = await this.libPromise;
    return lib.resolveLaunchEnv(this.config.configDir, this.config.e2eRoot, this.config.runtime);
  }

  async detect(): Promise<BrowserCandidate[]> {
    const lib = await this.libPromise;
    const candidates = lib.detectCandidates({
      configDir: this.config.configDir,
      e2eRoot: this.config.e2eRoot,
      runtime: this.config.runtime,
    });
    const engineVersion = lib.expectedChromiumVersion(this.config.e2eRoot);
    return Promise.all(candidates.map(async (candidate) => {
      const verified = await lib.verifyExecutablePath(candidate.path);
      const version = verified.version.match(/\d+(?:\.\d+){3}/)?.[0] ?? "";
      const compatibility = !version || !engineVersion
        ? BROWSER_COMPATIBILITY.UNKNOWN
        : version === engineVersion
          ? BROWSER_COMPATIBILITY.EXACT
          : BROWSER_COMPATIBILITY.DIFFERENT;
      return {
        ...candidate,
        version,
        engineVersion,
        compatibility,
      };
    }));
  }

  async verifyPath(execPath: string) {
    const lib = await this.libPromise;
    return lib.verifyExecutablePath(execPath);
  }

  async setCustomPath(execPath: string): Promise<{ config: BrowserRuntimeConfig; check: BrowserCheckResult }> {
    const lib = await this.libPromise;
    const verified = await lib.verifyExecutablePath(execPath);
    if (!verified.ok) {
      throw new Error(verified.error || "浏览器路径无效");
    }
    const config = await this.saveConfig({
      mode: "custom",
      custom: { executablePath: verified.path },
      detected: {
        version: verified.version,
        source: "manual",
        verifiedAt: new Date().toISOString(),
      },
    });
    const check = await lib.checkBrowserRuntime(this.config.configDir, this.config.e2eRoot, this.config.runtime);
    return { config, check };
  }

  async setManagedMode(): Promise<BrowserRuntimeConfig> {
    const lib = await this.libPromise;
    const browsersPath = lib.resolveManagedBrowsersDir(
      this.config.configDir,
      this.config.e2eRoot,
      this.config.runtime,
    );
    return this.saveConfig({
      mode: "managed",
      managed: { browsersPath },
    });
  }

  getInstallJob(jobId: string): InstallJob | undefined {
    return installJobs.get(jobId);
  }

  async startInstall(): Promise<InstallJob> {
    const lib = await this.libPromise;
    const running = [...installJobs.values()].find((j) => j.status === "running");
    if (running) return running;

    const current = await this.getConfig();
    const installChromium = current.mode !== "custom";
    const platformKey = lib.currentPlatformKey();
    const browsersPath = lib.resolveManagedBrowsersDir(
      this.config.configDir,
      this.config.e2eRoot,
      this.config.runtime,
    );

    const jobId = `browser-install-${++jobCounter}-${Date.now()}`;
    const job: InstallJob = {
      jobId,
      status: "running",
      logs: [],
      startedAt: new Date().toISOString(),
    };
    installJobs.set(jobId, job);

    const nodeBin = this.resolveNodeBinary();
    void lib
      .runInstallChromium({
        e2eRoot: this.config.e2eRoot,
        nodeBin,
        browsersPath,
        platformKey,
        installChromium,
        onLog: (line) => {
          job.logs.push(line);
          if (job.logs.length > 500) job.logs.shift();
        },
      })
      .then(async () => {
        if (installChromium) {
          await this.saveConfig({
            mode: "managed",
            managed: { browsersPath },
            detected: {
              source: "managed-install",
              verifiedAt: new Date().toISOString(),
            },
          });
        }
        job.status = "done";
        job.finishedAt = new Date().toISOString();
      })
      .catch((err: Error) => {
        job.status = "failed";
        job.error = err.message;
        job.finishedAt = new Date().toISOString();
        job.logs.push(`[error] ${err.message}`);
      });

    return job;
  }
}

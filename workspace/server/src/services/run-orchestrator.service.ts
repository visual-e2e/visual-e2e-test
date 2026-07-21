import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { WorkspaceConfig } from "../config.js";
import type { ProjectContext } from "../project-context.js";
import { checkProjectEnv } from "../project-context.js";
import type { RunArchiveEntry } from "./run-archive.service.js";
import { BrowserRuntimeService } from "./browser-runtime.service.js";

export type RunScope = "scenarios" | "module" | "modules" | "all";

export interface RunOptions {
  headed?: boolean;
  headless?: boolean;
  slowMo?: number;
}

export interface RunPlan {
  scope: RunScope;
  projectId: string;
  modules: string[];
  scenarios: string[];
  options: RunOptions;
}

export interface RunJob {
  jobId: string;
  projectId?: string;
  status: "running" | "passed" | "failed" | "cancelled" | "error";
  scope?: RunScope;
  modules: string[];
  scenarios: string[];
  options: RunOptions;
  startedAt: string;
  finishedAt?: string;
  exitCode?: number;
  runDir?: string;
  reportFile?: string;
  logs: string[];
  error?: string;
  /** 当前进程仍可被终止（仅内存中有 live process 时为 true） */
  cancellable?: boolean;
}

/** 运行中的任务（jobId === 磁盘 runId） */
const activeJobs = new Map<string, RunJob>();

export class RunOrchestratorService {
  private processes = new Map<string, ReturnType<typeof spawn>>();

  constructor(private readonly config: WorkspaceConfig) {}

  checkEnv(project: ProjectContext): { ok: boolean; missing: string[] } {
    return checkProjectEnv(project.envPath);
  }

  createJob(
    project: ProjectContext,
    modules: string[],
    scenarios: string[],
    options: RunOptions = {},
  ): Promise<RunJob> {
    return this.createJobFromPlan({
      scope: scenarios.length ? "scenarios" : "module",
      projectId: project.id,
      modules,
      scenarios,
      options,
    });
  }

  async createJobFromPlan(plan: RunPlan): Promise<RunJob> {
    this.reconcileStaleRunningJobs();
    if (this.hasLiveProcess()) {
      throw new Error("已有运行中的任务，请等待完成或取消后再试");
    }

    const browserEnv = await this.resolveBrowserEnv();
    if (!browserEnv.ok) {
      throw new Error("测试浏览器未就绪，请先在「浏览器环境」中安装或配置");
    }

    const modules = plan.scope === "all" ? [] : plan.modules;
    const scenarios = plan.scope === "scenarios" ? plan.scenarios : [];

    const runId = formatRunId(new Date());
    const runDir = join(this.runsBase(plan.projectId), runId);
    this.prepareRunDir(runDir);

    const job: RunJob = {
      jobId: runId,
      projectId: plan.projectId,
      status: "running",
      scope: plan.scope,
      modules,
      scenarios,
      options: plan.options,
      startedAt: new Date().toISOString(),
      runDir,
      reportFile: join(runDir, "report.html"),
      logs: [],
    };
    activeJobs.set(runId, job);
    this.spawnRunProcess(job, plan.scope, plan.projectId, browserEnv.env);
    return job;
  }

  getJob(jobId: string, projectId?: string): RunJob | undefined {
    if (!/^\d{14}$/.test(jobId)) return undefined;

    const active = activeJobs.get(jobId);
    if (projectId) {
      if (active && active.projectId !== projectId) return undefined;
      const disk = this.getDiskJob(jobId, projectId);
      if (!disk && !active) return undefined;
      return this.mergeActiveJob(disk ?? active!);
    }

    for (const id of this.listProjectIdsWithRuns()) {
      const disk = this.getDiskJob(jobId, id);
      if (disk) return this.mergeActiveJob(disk);
    }
    return active ? this.mergeActiveJob(active) : undefined;
  }

  listJobs(projectId: string): RunJob[] {
    this.reconcileStaleRunningJobs();
    this.pruneFinishedJobs();

    const diskRuns = this.listDiskRuns(projectId);
    const seen = new Set<string>();
    const jobs: RunJob[] = [];

    for (const disk of diskRuns) {
      seen.add(disk.jobId);
      jobs.push(this.mergeActiveJob(disk));
    }

    for (const [runId, active] of activeJobs) {
      if (active.projectId !== projectId || seen.has(runId)) continue;
      jobs.push(this.mergeActiveJob(active));
    }

    return jobs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  cancelJob(jobId: string, projectId?: string): boolean {
    this.reconcileStaleRunningJobs();

    const active = activeJobs.get(jobId);
    if (active && (active.status === "running" || this.isLiveRunning(jobId))) {
      const proc = this.processes.get(jobId);
      if (proc) this.killRunProcess(proc);
      active.status = "cancelled";
      active.finishedAt = new Date().toISOString();
      active.logs.push(`[system] 任务已终止 ${new Date().toISOString()}`);
      this.processes.delete(jobId);
      if (active.runDir) this.markDiskRunCancelled(active.runDir);
      return true;
    }

    if (!projectId || !/^\d{14}$/.test(jobId)) return false;

    const runDir = this.resolveRunDir(projectId, jobId);
    if (!runDir) return false;
    const diskJob = this.diskRunFromDir(runDir, projectId);
    if (diskJob.status !== "running") return false;
    this.markDiskRunCancelled(runDir);
    return true;
  }

  resolveRunArtifactPath(projectId: string, runId: string, subPath: string): string | undefined {
    const filePath = join(this.runsBase(projectId), runId, subPath);
    if (!existsSync(filePath)) return undefined;
    return filePath;
  }

  resolveRunDir(projectId: string, runId: string): string | undefined {
    if (!/^\d{14}$/.test(runId)) return undefined;
    const runDir = join(this.runsBase(projectId), runId);
    if (!existsSync(runDir) || !statSync(runDir).isDirectory()) return undefined;
    return runDir;
  }

  deleteRuns(
    projectId: string,
    runIds: string[],
  ): { deleted: string[]; skipped: Array<{ runId: string; reason: string }> } {
    const deleted: string[] = [];
    const skipped: Array<{ runId: string; reason: string }> = [];

    for (const id of runIds) {
      const result = this.deleteOneRun(projectId, id);
      if (result.ok) deleted.push(id);
      else skipped.push({ runId: id, reason: result.reason });
    }

    return { deleted, skipped };
  }

  private deleteOneRun(
    projectId: string,
    runId: string,
  ): { ok: true } | { ok: false; reason: string } {
    if (!/^\d{14}$/.test(runId)) {
      return { ok: false, reason: "not_found" };
    }
    if (this.isRunLive(projectId, runId)) {
      return { ok: false, reason: "running" };
    }
    const runDir = this.resolveRunDir(projectId, runId);
    if (!runDir) {
      return { ok: false, reason: "not_found" };
    }
    rmSync(runDir, { recursive: true, force: true });
    activeJobs.delete(runId);
    this.processes.delete(runId);
    return { ok: true };
  }

  resolveRunArchiveEntries(
    projectId: string,
    runIds: string[],
  ): { entries: RunArchiveEntry[]; skipped: Array<{ runId: string; reason: string }> } {
    const entries: RunArchiveEntry[] = [];
    const skipped: Array<{ runId: string; reason: string }> = [];

    for (const runId of runIds) {
      if (!/^\d{14}$/.test(runId)) {
        skipped.push({ runId, reason: "invalid_run_id" });
        continue;
      }
      const runDir = this.resolveRunDir(projectId, runId);
      if (!runDir) {
        skipped.push({ runId, reason: "not_found" });
        continue;
      }
      entries.push({ runId, runDir });
    }

    return { entries, skipped };
  }

  zipFilename(projectId: string, runIds: string[]): string {
    if (runIds.length === 1) return `${projectId}-${runIds[0]}.zip`;
    const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    return `${projectId}-runs-${stamp}.zip`;
  }

  private isRunLive(projectId: string, runId: string): boolean {
    const job = activeJobs.get(runId);
    return job?.projectId === projectId && this.isLiveRunning(runId);
  }

  private appendRunLogLine(runDir: string, line: string): void {
    const logPath = join(runDir, "logs", "run.log");
    if (existsSync(logPath)) {
      appendFileSync(logPath, line);
    } else {
      mkdirSync(dirname(logPath), { recursive: true });
      writeFileSync(logPath, line);
    }
  }

  private markDiskRunCancelled(runDir: string): void {
    this.appendRunLogLine(runDir, `${new Date().toISOString()} [system] 任务已手动终止\n`);
  }

  private getDiskJob(runId: string, projectId: string): RunJob | undefined {
    if (!/^\d{14}$/.test(runId)) return undefined;
    const runDir = join(this.runsBase(projectId), runId);
    if (!existsSync(runDir)) return undefined;
    return this.diskRunFromDir(runDir, projectId);
  }

  private runsBase(projectId: string): string {
    return join(this.config.projectsDir, projectId, "runs");
  }

  private prepareRunDir(runDir: string): void {
    mkdirSync(join(runDir, "logs"), { recursive: true });
    mkdirSync(join(runDir, "screenshots"), { recursive: true });
    mkdirSync(join(runDir, "videos"), { recursive: true });
  }

  /** 进程已退出但内存 job 未清理的僵尸条目 */
  private reconcileStaleRunningJobs(): void {
    for (const [jobId, job] of [...activeJobs.entries()]) {
      const proc = this.processes.get(jobId);
      if (!proc) {
        if (job.status === "running") {
          job.status = "error";
          job.error = job.error ?? "进程未启动或已异常退出";
          job.finishedAt = job.finishedAt ?? new Date().toISOString();
        }
        continue;
      }
      if (proc.exitCode !== null || proc.signalCode) {
        if (job.status === "running") {
          this.completeActiveJob(job, proc.exitCode);
        } else {
          this.finalizeActiveJob(job);
        }
        continue;
      }
      if (job.status !== "running" && job.status !== "cancelled") {
        this.processes.delete(jobId);
      }
    }
  }

  private pruneFinishedJobs(): void {
    const maxAgeMs = 24 * 60 * 60 * 1000;
    for (const [jobId, job] of activeJobs) {
      if (job.status === "running") continue;
      if (!job.finishedAt) continue;
      if (Date.now() - new Date(job.finishedAt).getTime() > maxAgeMs) {
        activeJobs.delete(jobId);
      }
    }
  }

  private hasLiveProcess(): boolean {
    for (const [jobId, proc] of this.processes) {
      if (proc.exitCode !== null || proc.signalCode) continue;
      const job = activeJobs.get(jobId);
      if (job && (job.status === "running" || job.status === "cancelled")) return true;
    }
    return false;
  }

  private killRunProcess(proc: ChildProcess): void {
    const pid = proc.pid;
    if (!pid) {
      proc.kill("SIGKILL");
      return;
    }
    if (process.platform === "win32") {
      spawn("taskkill", ["/pid", String(pid), "/f", "/t"], { stdio: "ignore" });
      return;
    }
    try {
      process.kill(-pid, "SIGTERM");
    } catch {
      proc.kill("SIGTERM");
    }
    setTimeout(() => {
      try {
        process.kill(-pid, "SIGKILL");
      } catch {
        try {
          proc.kill("SIGKILL");
        } catch {
          /* ignore */
        }
      }
    }, 1500);
  }

  private isLiveRunning(runId: string): boolean {
    const proc = this.processes.get(runId);
    if (!proc || proc.exitCode !== null || proc.signalCode) return false;
    const job = activeJobs.get(runId);
    if (job && job.status !== "running" && job.status !== "cancelled") return false;
    return true;
  }

  /** 仅当 jobId 精确匹配时合并内存中的运行态 */
  private mergeActiveJob(job: RunJob): RunJob {
    const active = activeJobs.get(job.jobId);
    if (!active) {
      return { ...job, cancellable: false };
    }
    const cancellable = this.isLiveRunning(job.jobId);
    return {
      ...job,
      status: active.status,
      logs: active.logs.length > job.logs.length ? active.logs : job.logs,
      finishedAt: active.status === "running" ? undefined : (active.finishedAt ?? job.finishedAt),
      cancellable,
      scope: active.scope ?? job.scope,
      modules: active.modules.length ? active.modules : job.modules,
      scenarios: active.scenarios.length ? active.scenarios : job.scenarios,
      options: active.options,
      error: active.error ?? job.error,
      exitCode: active.exitCode ?? job.exitCode,
      runDir: active.runDir ?? job.runDir,
      reportFile: active.reportFile ?? job.reportFile,
    };
  }

  private completeActiveJob(job: RunJob, code: number | null): void {
    if (!activeJobs.has(job.jobId)) return;
    job.exitCode = code ?? 1;
    job.finishedAt = new Date().toISOString();
    if (job.status !== "cancelled") {
      job.status = code === 0 ? "passed" : "failed";
    }
    this.finalizeActiveJob(job);
  }

  private finalizeActiveJob(job: RunJob): void {
    this.processes.delete(job.jobId);
  }

  private resolveNodeBinary(): string {
    if (this.config.runtime !== "client") {
      return process.execPath;
    }
    const fromEnv = process.env.BUNDLED_NODE?.trim();
    if (fromEnv && existsSync(fromEnv)) return fromEnv;
    return process.execPath;
  }

  private spawnRunProcess(
    job: RunJob,
    scope: RunScope,
    projectId: string,
    browserEnv: Record<string, string>,
  ): void {
    const args = ["scripts/run-test.mjs", "--project", projectId];
    if (scope === "all") {
      args.push("--all");
    } else if (scope === "scenarios" && job.scenarios.length > 0) {
      const crossModule = job.scenarios.every((s) => s.includes("/"));
      if (crossModule) {
        for (const s of job.scenarios) args.push(`--${s}`);
      } else {
        for (const mod of job.modules) args.push(`--${mod}`);
        for (const s of job.scenarios) args.push(`--${s}`);
      }
    } else {
      for (const mod of job.modules) args.push(`--${mod}`);
      for (const s of job.scenarios) args.push(`--${s}`);
    }
    if (job.options.headed) args.push("--headed");
    if (job.options.headless) args.push("--headless");
    if (job.options.slowMo) args.push("--slow-mo", String(job.options.slowMo));

    const nodeBin = this.resolveNodeBinary();
    const proc = spawn(nodeBin, args, {
      cwd: this.config.e2eRoot,
      env: {
        ...process.env,
        ...browserEnv,
        BUNDLED_NODE: nodeBin,
        E2E_ROOT: this.config.e2eRoot,
        PROJECTS_DIR: this.config.projectsDir,
        CONFIG_DIR: this.config.configDir,
        CLIENT_MODE: process.env.CLIENT_MODE ?? "",
        ACTIVE_PROJECT: projectId,
        RUN_SCOPE: this.buildRunScopeEnv(scope, job),
        RUN_ID: job.jobId,
        RUN_DIR: job.runDir!,
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.processes.set(job.jobId, proc);

    const append = (line: string) => {
      if (job.status === "cancelled") return;
      job.logs.push(line);
      if (job.logs.length > 2000) job.logs.shift();
    };

    proc.stdout?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) append(line);
    });
    proc.stderr?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) append(`[stderr] ${line}`);
    });

    proc.on("close", (code) => {
      this.completeActiveJob(job, code);
    });

    proc.on("exit", (code) => {
      if (!activeJobs.has(job.jobId)) return;
      this.completeActiveJob(job, code);
    });

    proc.on("error", (err) => {
      job.status = "error";
      job.error = err.message;
      job.logs.push(`[system] ${err.message}`);
      job.finishedAt = new Date().toISOString();
      this.processes.delete(job.jobId);
    });
  }

  private async resolveBrowserEnv(): Promise<{ ok: boolean; env: Record<string, string> }> {
    const svc = new BrowserRuntimeService(this.config);
    const resolved = await svc.resolveLaunchEnv();
    return { ok: resolved.ok, env: resolved.env };
  }

  private listProjectIdsWithRuns(): string[] {
    const { projectsDir } = this.config;
    if (!existsSync(projectsDir)) return [];
    return readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "project.json")))
      .map((e) => e.name);
  }

  private listDiskRuns(projectId: string): RunJob[] {
    const base = join(this.config.projectsDir, projectId, "runs");
    if (!existsSync(base)) return [];
    const runs: RunJob[] = [];
    for (const name of readdirSync(base)) {
      if (!/^\d{14}$/.test(name)) continue;
      const runDir = join(base, name);
      if (statSync(runDir).isDirectory()) runs.push(this.diskRunFromDir(runDir, projectId));
    }
    return runs.sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime()).slice(0, 50);
  }

  private diskRunFromDir(runDir: string, projectId: string): RunJob {
    const runId = basename(runDir);
    const logPath = join(runDir, "logs", "run.log");
    const parsed = parseRunLog(logPath);
    const reportFile = join(runDir, "report.html");
    return {
      jobId: runId,
      projectId,
      status: parsed.status,
      scope: parsed.scope,
      modules: parsed.modules,
      scenarios: parsed.scenarios,
      options: {},
      startedAt: parsed.startedAt ?? runIdToIso(runId),
      finishedAt: parsed.finishedAt,
      runDir,
      reportFile: existsSync(reportFile) ? reportFile : undefined,
      logs: parsed.logs,
    };
  }

  private buildRunScopeEnv(scope: RunScope, job: RunJob): string {
    if (scope === "all") return "all";
    if (scope === "module" || scope === "modules") return `module|${job.modules.join(",")}`;
    return `scenarios|${job.scenarios.join(",")}`;
  }
}

function parseRunLog(logPath: string): {
  scenarios: string[];
  scope?: RunScope;
  modules: string[];
  status: RunJob["status"];
  startedAt?: string;
  finishedAt?: string;
  logs: string[];
} {
  if (!existsSync(logPath)) {
    return { scenarios: [], modules: [], status: "running", logs: [] };
  }

  const content = readFileSync(logPath, "utf-8");
  const lines = content.split("\n").filter((l) => l.trim());

  const { scope, modules, scenarioRefs } = parseRunScopeFromLog(content);

  let scenarios: string[] = [];
  if (scope === "scenarios" && scenarioRefs.length > 0) {
    scenarios = scenarioRefs.map((ref) => (ref.includes("/") ? ref.split("/").pop()! : ref));
  } else {
    const scenarioList = content.match(/测试运行开始[\s\S]*?场景: (.+)/);
    if (scenarioList?.[1]) {
      for (const name of scenarioList[1].split(",")) {
        const trimmed = name.trim();
        if (trimmed) scenarios.push(trimmed);
      }
    }
    if (scenarios.length === 0) {
      const idMatches = content.matchAll(/场景: \[[\w]+\] .+ \(([\w_]+)\)/g);
      for (const m of idMatches) scenarios.push(m[1]!);
    }
  }

  let status: RunJob["status"] = "failed";
  const summary = content.match(/运行完成 \| 总计 (\d+) \| 通过 (\d+) \| 失败 (\d+)(?: \| 错误 (\d+))?/);
  if (summary) {
    const failed = parseInt(summary[3], 10);
    const errors = parseInt(summary[4] ?? "0", 10);
    status = failed === 0 && errors === 0 ? "passed" : "failed";
  } else if (content.includes("任务已手动终止") || content.includes("[system] 任务已终止")) {
    status = "cancelled";
  } else if (content.includes("[system] 运行异常中断")) {
    status = "error";
  } else if (content.includes("测试运行开始")) {
    status = "running";
  }

  const startedAt = lines[0]?.match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1];
  const finishedAt = lines.length > 0
    ? lines[lines.length - 1].match(/^(\d{4}-\d{2}-\d{2}T[\d:.]+Z)/)?.[1]
    : undefined;

  return {
    scenarios,
    scope,
    modules,
    status,
    startedAt,
    finishedAt,
    logs: lines.slice(-500),
  };
}

function parseRunScopeFromLog(content: string): { scope?: RunScope; modules: string[]; scenarioRefs: string[] } {
  const scopeLine = content.match(/运行范围: (all|module\|[^\n]+|scenarios\|[^\n]+)/)?.[1];
  if (!scopeLine) return { modules: [], scenarioRefs: [] };
  if (scopeLine === "all") return { scope: "all", modules: [], scenarioRefs: [] };
  if (scopeLine.startsWith("module|")) {
    return {
      scope: "module",
      modules: scopeLine.slice(7).split(",").map((s) => s.trim()).filter(Boolean),
      scenarioRefs: [],
    };
  }
  if (scopeLine.startsWith("scenarios|")) {
    return {
      scope: "scenarios",
      modules: [],
      scenarioRefs: scopeLine.slice(10).split(",").map((s) => s.trim()).filter(Boolean),
    };
  }
  return { modules: [], scenarioRefs: [] };
}

function formatRunId(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

function runIdToIso(runId: string): string {
  const m = runId.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date().toISOString();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
}

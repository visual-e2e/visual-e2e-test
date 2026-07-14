import { spawn, type ChildProcess } from "node:child_process";
import {
  appendFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync,
} from "node:fs";
import { basename, dirname, join } from "node:path";
import type { WorkspaceConfig } from "../config.js";
import type { ProjectContext } from "../project-context.js";
import { checkProjectEnv, resolveProjectContext } from "../project-context.js";
import type { RunArchiveEntry } from "./run-archive.service.js";

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

/** 运行中的任务（仅进程未结束） */
const activeJobs = new Map<string, RunJob>();
/** run-1-xxx → 20260709140124，供详情/日志跳转 */
const jobAliases = new Map<string, string>();
let jobCounter = 0;

export class RunOrchestratorService {
  private processes = new Map<string, ReturnType<typeof spawn>>();

  constructor(private readonly config: WorkspaceConfig) {}

  checkEnv(project: ProjectContext): { ok: boolean; missing: string[] } {
    return checkProjectEnv(project.envPath);
  }

  createJob(project: ProjectContext, modules: string[], scenarios: string[], options: RunOptions = {}): RunJob {
    return this.createJobFromPlan({
      scope: scenarios.length ? "scenarios" : "module",
      projectId: project.id,
      modules,
      scenarios,
      options,
    });
  }

  createJobFromPlan(plan: RunPlan): RunJob {
    this.reconcileStaleRunningJobs();
    if (this.hasLiveProcess()) {
      throw new Error("已有运行中的任务，请等待完成或取消后再试");
    }

    const modules = plan.scope === "all" ? [] : plan.modules;
    const scenarios = plan.scope === "scenarios" ? plan.scenarios : [];

    const jobId = `run-${++jobCounter}-${Date.now()}`;
    const job: RunJob = {
      jobId,
      projectId: plan.projectId,
      status: "running",
      scope: plan.scope,
      modules,
      scenarios,
      options: plan.options,
      startedAt: new Date().toISOString(),
      logs: [],
    };
    activeJobs.set(jobId, job);
    this.startProcess(job, plan.scope, plan.projectId);
    return job;
  }

  getJob(jobId: string, projectId?: string): RunJob | undefined {
    const mem = activeJobs.get(jobId);
    if (mem) return this.withLiveState(mem);

    const memoryJobId = this.resolveLiveJobId(jobId);
    if (memoryJobId) {
      const live = activeJobs.get(memoryJobId);
      if (live && projectId && live.projectId !== projectId) return undefined;
      if (live) return this.withLiveState({ ...live, jobId });
    }

    const resolvedId = jobAliases.get(jobId) ?? jobId;
    if (projectId) {
      const disk = this.getDiskJob(resolvedId, projectId);
      return disk ? this.withLiveState(disk) : undefined;
    }
    for (const id of this.listProjectIdsWithRuns()) {
      const job = this.getDiskJob(resolvedId, id);
      if (job) return this.withLiveState(job);
    }
    return undefined;
  }

  listJobs(projectId: string): RunJob[] {
    this.reconcileStaleRunningJobs();
    this.reconcileMemoryJobsWithDisk(projectId);
    this.reconcileStaleDiskRuns(projectId);
    this.pruneFinishedJobs();

    const diskRuns = this.listDiskRuns(projectId);
    const diskIds = new Set(diskRuns.map((d) => d.jobId));
    const running = [...activeJobs.values()]
      .filter((j) => j.projectId === projectId)
      .filter((j) => !this.hasMatchingDiskRun(j, diskRuns))
      .filter((j) => {
        const diskId = j.runDir ? basename(j.runDir) : jobAliases.get(j.jobId);
        return !(diskId && diskIds.has(diskId));
      });

    return [...running, ...diskRuns]
      .map((j) => this.withLiveState(j))
      .sort((a, b) => new Date(b.startedAt).getTime() - new Date(a.startedAt).getTime());
  }

  cancelJob(jobId: string, projectId?: string): boolean {
    this.reconcileStaleRunningJobs();
    if (projectId) {
      this.reconcileMemoryJobsWithDisk(projectId);
    }

    const memIds = this.collectMemoryJobIds(jobId);
    for (const memId of memIds) {
      const job = activeJobs.get(memId);
      if (job?.status === "running" || this.isLiveRunning(memId)) {
        const proc = this.processes.get(memId);
        if (proc) this.killRunProcess(proc);
        if (job) {
          job.status = "cancelled";
          job.finishedAt = new Date().toISOString();
          job.logs.push(`[system] 任务已终止 ${new Date().toISOString()}`);
        }
        this.processes.delete(memId);
        if (projectId) {
          const diskId = jobAliases.get(memId);
          if (diskId) {
            const runDir = this.resolveRunDir(projectId, diskId);
            if (runDir) this.markDiskRunCancelled(runDir);
            this.cleanupRunReferences(diskId);
          }
        }
        jobAliases.delete(memId);
        return true;
      }
      this.cleanupZombieProcess(memId);
    }

    if (!projectId) return false;

    for (const diskId of this.collectDiskRunIds(jobId)) {
      const runDir = this.resolveRunDir(projectId, diskId);
      if (!runDir) continue;
      const diskJob = this.diskRunFromDir(runDir, projectId);
      if (diskJob.status !== "running") continue;
      this.markDiskRunCancelled(runDir);
      this.cleanupRunReferences(diskId);
      return true;
    }

    const known = this.getJob(jobId, projectId);
    if (known?.status === "running" && known.runDir) {
      this.markDiskRunCancelled(known.runDir);
      this.cleanupRunReferences(basename(known.runDir));
      return true;
    }

    return false;
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
    id: string,
  ): { ok: true } | { ok: false; reason: string } {
    if (/^\d{14}$/.test(id)) {
      if (this.isRunLive(projectId, id)) {
        return { ok: false, reason: "running" };
      }
      const runDir = this.resolveRunDir(projectId, id);
      if (!runDir) {
        return { ok: false, reason: "not_found" };
      }
      rmSync(runDir, { recursive: true, force: true });
      this.cleanupRunReferences(id);
      return { ok: true };
    }

    const memoryJobId = this.resolveMemoryJobId(id);
    if (memoryJobId) {
      const job = activeJobs.get(memoryJobId);
      if (!job || job.projectId !== projectId) {
        return { ok: false, reason: "not_found" };
      }
      if (job.status === "running" || this.isLiveRunning(memoryJobId)) {
        return { ok: false, reason: "running" };
      }
      const diskId = job.runDir ? basename(job.runDir) : jobAliases.get(memoryJobId);
      if (diskId && /^\d{14}$/.test(diskId)) {
        const runDir = this.resolveRunDir(projectId, diskId);
        if (runDir) {
          rmSync(runDir, { recursive: true, force: true });
          this.cleanupRunReferences(diskId);
        }
      }
      activeJobs.delete(memoryJobId);
      jobAliases.delete(memoryJobId);
      this.processes.delete(memoryJobId);
      return { ok: true };
    }

    return { ok: false, reason: "not_found" };
  }

  private resolveMemoryJobId(id: string): string | undefined {
    if (activeJobs.has(id)) return id;
    for (const [memId, alias] of jobAliases) {
      if (alias === id) return memId;
    }
    return undefined;
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
    for (const [memoryJobId, job] of activeJobs) {
      if (job.projectId !== projectId || job.status !== "running") continue;
      if (!this.isLiveRunning(memoryJobId)) continue;
      const diskId = job.runDir ? basename(job.runDir) : jobAliases.get(memoryJobId);
      if (diskId === runId || job.jobId === runId) return true;
    }
    for (const [memId, alias] of jobAliases) {
      if (alias !== runId) continue;
      if (this.isLiveRunning(memId)) return true;
    }
    return false;
  }

  private collectMemoryJobIds(jobId: string): Set<string> {
    const ids = new Set<string>();
    if (activeJobs.has(jobId)) ids.add(jobId);
    const live = this.resolveLiveJobId(jobId);
    if (live) ids.add(live);
    for (const [memId, alias] of jobAliases) {
      if (memId === jobId || alias === jobId) ids.add(memId);
    }
    return ids;
  }

  private collectDiskRunIds(jobId: string): Set<string> {
    const ids = new Set<string>();
    const resolved = jobAliases.get(jobId) ?? jobId;
    if (/^\d{14}$/.test(resolved)) ids.add(resolved);
    if (/^\d{14}$/.test(jobId)) ids.add(jobId);
    return ids;
  }

  private cleanupZombieProcess(memId: string): void {
    const proc = this.processes.get(memId);
    if (!proc) return;
    this.killRunProcess(proc);
    this.processes.delete(memId);
    jobAliases.delete(memId);
  }

  /** 磁盘 run 日志仍为 running 但无 live 进程时，标记为 error 以停止列表轮询 */
  private reconcileStaleDiskRuns(projectId: string): void {
    const base = this.runsBase(projectId);
    if (!existsSync(base)) return;
    for (const name of readdirSync(base)) {
      if (!/^\d{14}$/.test(name)) continue;
      const runDir = join(base, name);
      if (!statSync(runDir).isDirectory()) continue;
      const job = this.diskRunFromDir(runDir, projectId);
      if (job.status !== "running") continue;
      if (this.isRunLive(projectId, name)) continue;
      this.markDiskRunStale(runDir);
    }
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

  private markDiskRunStale(runDir: string): void {
    const marker = "[system] 运行异常中断";
    const logPath = join(runDir, "logs", "run.log");
    if (existsSync(logPath) && readFileSync(logPath, "utf-8").includes(marker)) return;
    this.appendRunLogLine(runDir, `${new Date().toISOString()} ${marker}（进程已结束或无响应）\n`);
  }

  private cleanupRunReferences(runId: string): void {
    for (const [memId, alias] of [...jobAliases.entries()]) {
      if (alias === runId) jobAliases.delete(memId);
    }
    for (const [jobId, job] of [...activeJobs.entries()]) {
      if (job.runDir && basename(job.runDir) === runId) {
        activeJobs.delete(jobId);
        this.processes.delete(jobId);
      }
    }
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

  /** 磁盘 run 已落盘时建立 alias；列表通过 hasMatchingDiskRun 去重，内存 job 保留至进程结束 */
  private reconcileMemoryJobsWithDisk(projectId: string): void {
    const diskRuns = this.listDiskRuns(projectId);
    for (const [jobId, job] of [...activeJobs.entries()]) {
      if (job.projectId !== projectId) continue;
      if (!this.hasMatchingDiskRun(job, diskRuns)) continue;
      const runId = job.runDir
        ? basename(job.runDir)
        : diskRuns.find((d) => {
            const memStart = new Date(job.startedAt).getTime();
            const diskStart = new Date(d.startedAt).getTime();
            return Math.abs(diskStart - memStart) < 120_000;
          })?.jobId;
      if (runId) jobAliases.set(jobId, runId);
    }
  }

  private resolveLiveJobId(jobId: string): string | undefined {
    if (this.processes.has(jobId)) return jobId;
    for (const [memId, runId] of jobAliases) {
      if (runId === jobId && this.processes.has(memId)) return memId;
    }
    return undefined;
  }

  private isLiveRunning(memoryJobId: string): boolean {
    const proc = this.processes.get(memoryJobId);
    if (!proc || proc.exitCode !== null || proc.signalCode) return false;
    const job = activeJobs.get(memoryJobId);
    if (job && job.status !== "running" && job.status !== "cancelled") return false;
    return true;
  }

  private withLiveState(job: RunJob): RunJob {
    const memoryJobId = this.resolveLiveJobId(job.jobId)
      ?? (this.processes.has(job.jobId) ? job.jobId : undefined);
    if (!memoryJobId) {
      return { ...job, cancellable: false };
    }
    const live = activeJobs.get(memoryJobId);
    if (!live) return { ...job, cancellable: false };
    const cancellable = this.isLiveRunning(memoryJobId);
    return {
      ...job,
      status: live.status === "cancelled" ? "cancelled" : job.status,
      cancellable,
      logs: live.logs.length > job.logs.length ? live.logs : job.logs,
      finishedAt: live.finishedAt ?? job.finishedAt,
    };
  }

  private hasMatchingDiskRun(memJob: RunJob, diskRuns: RunJob[]): boolean {
    if (memJob.runDir) {
      const runId = basename(memJob.runDir);
      if (diskRuns.some((d) => d.jobId === runId)) return true;
    }
    const memStart = new Date(memJob.startedAt).getTime();
    return diskRuns.some((d) => {
      const diskStart = new Date(d.startedAt).getTime();
      return Math.abs(diskStart - memStart) < 120_000;
    });
  }

  private completeActiveJob(job: RunJob, code: number | null, projectId?: string): void {
    if (!activeJobs.has(job.jobId)) return;
    job.exitCode = code ?? 1;
    job.finishedAt = new Date().toISOString();
    if (job.status !== "cancelled") {
      const pid = projectId ?? job.projectId;
      if (!job.runDir && pid) job.runDir = this.findRunDirForJob(pid, job.startedAt);
      if (job.runDir) job.reportFile = join(job.runDir, "report.html");
      job.status = code === 0 ? "passed" : "failed";
    }
    this.finalizeActiveJob(job);
  }

  private finalizeActiveJob(job: RunJob): void {
    if (job.runDir) {
      jobAliases.set(job.jobId, basename(job.runDir));
    }
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

  private startProcess(job: RunJob, scope: RunScope = "scenarios", projectId: string): void {
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
        BUNDLED_NODE: nodeBin,
        E2E_ROOT: this.config.e2eRoot,
        PROJECTS_DIR: this.config.projectsDir,
        CONFIG_DIR: this.config.configDir,
        CLIENT_MODE: process.env.CLIENT_MODE ?? "",
        ACTIVE_PROJECT: projectId,
        RUN_SCOPE: this.buildRunScopeEnv(scope, job),
      },
      stdio: ["ignore", "pipe", "pipe"],
      detached: process.platform !== "win32",
    });
    this.processes.set(job.jobId, proc);

    const append = (line: string) => {
      if (job.status === "cancelled") return;
      job.logs.push(line);
      if (job.logs.length > 2000) job.logs.shift();
      const runMatch = line.match(/运行:\s*(.+)/);
      if (runMatch) {
        const raw = runMatch[1].trim();
        job.runDir = raw.startsWith("/") ? raw : join(this.config.e2eRoot, raw);
        job.reportFile = join(job.runDir, "report.html");
      }
    };

    proc.stdout?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) append(line);
    });
    proc.stderr?.on("data", (buf) => {
      for (const line of buf.toString().split("\n")) if (line.trim()) append(`[stderr] ${line}`);
    });

    proc.on("close", (code) => {
      this.completeActiveJob(job, code, projectId);
    });

    proc.on("exit", (code) => {
      if (!activeJobs.has(job.jobId)) return;
      this.completeActiveJob(job, code, projectId);
    });

    proc.on("error", (err) => {
      job.status = "error";
      job.error = err.message;
      job.logs.push(`[system] ${err.message}`);
      job.finishedAt = new Date().toISOString();
      this.processes.delete(job.jobId);
    });
  }

  private listProjectIdsWithRuns(): string[] {
    const { projectsDir } = this.config;
    if (!existsSync(projectsDir)) return [];
    return readdirSync(projectsDir, { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "project.json")))
      .map((e) => e.name);
  }

  /** 匹配本次任务开始后创建的 run 目录，避免误关联历史 run */
  private findRunDirForJob(projectId: string, startedAt: string): string | undefined {
    const base = join(this.config.projectsDir, projectId, "runs");
    if (!existsSync(base)) return undefined;

    const startedMs = new Date(startedAt).getTime() - 3000;
    const candidates = readdirSync(base)
      .filter((name) => /^\d{14}$/.test(name))
      .map((name) => join(base, name))
      .filter((p) => statSync(p).isDirectory())
      .filter((p) => {
        const runId = basename(p);
        const runMs = runIdToMs(runId);
        return runMs >= startedMs || statSync(p).mtimeMs >= startedMs;
      })
      .sort((a, b) => statSync(b).mtimeMs - statSync(a).mtimeMs);

    return candidates[0];
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
    return { scenarios: [], modules: [], status: "failed", logs: [] };
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

function runIdToIso(runId: string): string {
  const m = runId.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/);
  if (!m) return new Date().toISOString();
  return new Date(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`).toISOString();
}

function runIdToMs(runId: string): number {
  return new Date(runIdToIso(runId)).getTime();
}

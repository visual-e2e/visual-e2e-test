import type { RunJob } from "../../types/module";

export function resolveRunId(job: RunJob): string | undefined {
  if (job.runDir) {
    const id = job.runDir.split("/").filter(Boolean).pop();
    if (id && /^\d{14}$/.test(id)) return id;
  }
  if (/^\d{14}$/.test(job.jobId)) return job.jobId;
  return undefined;
}

/** 运行中任务均可终止（含磁盘上 stale running、无 live process 的情况） */
export function canCancelJob(job: RunJob): boolean {
  return job.status === "running";
}

/** 非运行中的 job 可删除（含无磁盘产物的内存任务） */
export function canDeleteJob(job: RunJob): boolean {
  return job.status !== "running";
}

export function resolveDeleteId(job: RunJob): string {
  return resolveRunId(job) ?? job.jobId;
}

export function canManageRunArtifacts(job: RunJob): boolean {
  return canDeleteJob(job) && !!resolveRunId(job);
}

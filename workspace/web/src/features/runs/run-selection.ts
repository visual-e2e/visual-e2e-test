import type { RunJob, RunScope } from "../../types/module";

const SCOPE_LABEL: Record<RunScope, string> = {
  all: "全部",
  module: "整模块",
  modules: "整模块",
  scenarios: "指定场景",
};

export function formatRunSelection(job: RunJob): string {
  const scope = job.scope ?? inferScope(job);

  if (scope === "all") return SCOPE_LABEL.all;

  if (scope === "module" || scope === "modules") {
    return job.modules.length ? `${SCOPE_LABEL.module} · ${job.modules.join(", ")}` : SCOPE_LABEL.module;
  }

  if (scope === "scenarios") {
    const n = job.scenarios.length;
    return n ? `${SCOPE_LABEL.scenarios} · ${n} 个` : SCOPE_LABEL.scenarios;
  }

  return "—";
}

function inferScope(job: RunJob): RunScope | undefined {
  if (job.modules.length === 1 && job.scenarios.length === 0) return "module";
  if (job.scenarios.length === 1) return "scenarios";
  if (job.scenarios.length > 1) return "all";
  return undefined;
}

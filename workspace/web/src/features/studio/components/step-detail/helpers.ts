import type { StepDraft } from "../../../../types/scenario";
import type { BranchKind, BranchTarget } from "./types";

export function nextStepOptions(steps: StepDraft[], currentStepId: string, currentNext?: string) {
  const options = steps
    .filter((s) => s.stepId && s.stepId !== currentStepId)
    .map((s) => ({
      value: s.stepId,
      label: s.desc ? `${s.stepId} — ${s.desc}` : s.stepId,
    }));
  if (currentNext && !options.some((o) => o.value === currentNext)) {
    options.unshift({ value: currentNext, label: `${currentNext}（不在当前列表）` });
  }
  return options;
}

export function paramBool(step: StepDraft, key: string): boolean {
  return step.params?.[key] === true;
}

/** 三态：true / false / undefined(继承全局) */
export function paramBoolOverride(step: StepDraft, key: string): boolean | undefined {
  const v = step.params?.[key];
  if (v === true) return true;
  if (v === false) return false;
  return undefined;
}

export function branchKind(target: BranchTarget | undefined): BranchKind {
  return target && "scenario" in target ? "scenario" : "step";
}

export function branchValue(target: BranchTarget | undefined): string {
  if (!target) return "";
  return "scenario" in target ? target.scenario : target.step;
}

export function formatBranchTarget(target: BranchTarget): string {
  return "scenario" in target ? `scenario:${target.scenario}` : `step:${target.step}`;
}

export function makeBranchTarget(kind: BranchKind, value: string): BranchTarget {
  return kind === "scenario" ? { scenario: value } : { step: value };
}

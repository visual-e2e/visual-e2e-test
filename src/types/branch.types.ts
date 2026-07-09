import { z } from "zod";

/** 分支出口：跳转到本场景某步骤，或切换到同模块另一场景文件 */
export const branchTargetSchema = z.union([
  z.object({ step: z.string().min(1) }),
  z.object({ scenario: z.string().min(1) }),
]);

export const branchSchema = z.object({
  yes: branchTargetSchema,
  no: branchTargetSchema,
});

export type BranchTarget = z.infer<typeof branchTargetSchema>;
export type Branch = z.infer<typeof branchSchema>;

export function isStepTarget(target: BranchTarget): target is { step: string } {
  return "step" in target;
}

export function isScenarioTarget(target: BranchTarget): target is { scenario: string } {
  return "scenario" in target;
}

export function formatBranchTarget(target: BranchTarget): string {
  if (isStepTarget(target)) return `step:${target.step}`;
  return `scenario:${target.scenario}`;
}

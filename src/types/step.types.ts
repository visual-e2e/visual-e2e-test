import { z } from "zod";
import { branchSchema } from "./branch.types.js";
import { StepType } from "./step-type.enum.js";
import { MatchRule } from "./match-rule.enum.js";

export const baseStepSchema = z.object({
  stepId: z.string(),
  type: z.nativeEnum(StepType),
  selector: z.string().optional().default(""),
  url: z.string().optional().default(""),
  delay: z.number().optional().default(0),
  timeOut: z.number().optional(),
  value: z.union([z.string(), z.number(), z.null()]).optional().nullable(),
  params: z.record(z.unknown()).optional().default({}),
  desc: z.string().optional().default(""),
  /** verify：按验证结果走 yes/no；其他步骤：成功后走 yes（流程跳转） */
  branch: branchSchema.optional(),
  /** 本步成功后跳转到指定 stepId（无 branch 跳转时生效） */
  next: z.string().optional(),
});

export const verifyStepSchema = baseStepSchema.extend({
  type: z.literal(StepType.Verify),
  verifyValue: z.string().optional().default("body"),
  /** visible / hidden 规则可不填，其余规则必填 */
  expectValue: z.string().optional().default(""),
  matchRule: z.nativeEnum(MatchRule),
});

export const stepSchema = z.discriminatedUnion("type", [
  baseStepSchema.extend({ type: z.literal(StepType.Click) }),
  baseStepSchema.extend({ type: z.literal(StepType.Hover) }),
  baseStepSchema.extend({ type: z.literal(StepType.Input) }),
  baseStepSchema.extend({ type: z.literal(StepType.Link) }),
  baseStepSchema.extend({ type: z.literal(StepType.Wait) }),
  baseStepSchema.extend({ type: z.literal(StepType.Ready) }),
  baseStepSchema.extend({ type: z.literal(StepType.Scroll) }),
  verifyStepSchema,
  baseStepSchema.extend({ type: z.literal(StepType.Screenshot) }),
  baseStepSchema.extend({ type: z.literal(StepType.Log) }),
  baseStepSchema.extend({ type: z.literal(StepType.Keyboard) }),
  baseStepSchema.extend({ type: z.literal(StepType.Macro) }),
]);

export type BaseStep = z.infer<typeof baseStepSchema>;
export type VerifyStep = z.infer<typeof verifyStepSchema>;
export type Step = z.infer<typeof stepSchema>;

export function parseStep(raw: unknown): Step {
  return stepSchema.parse(raw);
}

export function parseSteps(raw: unknown[]): Step[] {
  return raw.map(parseStep);
}

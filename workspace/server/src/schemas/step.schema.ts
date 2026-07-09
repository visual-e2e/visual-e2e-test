import { z } from "zod";

export const STEP_TYPES = [
  "click", "hover", "input", "link", "wait", "ready", "scroll",
  "verify", "screenshot", "log", "keyboard", "macro",
] as const;

export const MATCH_RULES = [
  "equals", "contains", "regex", "visible", "hidden", "urlContains",
] as const;

const branchTargetSchema = z.union([
  z.object({ step: z.string().min(1) }),
  z.object({ scenario: z.string().min(1) }),
]);

const branchSchema = z.object({
  yes: branchTargetSchema,
  no: branchTargetSchema,
});

const baseStepSchema = z.object({
  stepId: z.string(),
  type: z.enum(STEP_TYPES),
  selector: z.string().optional().default(""),
  url: z.string().optional().default(""),
  delay: z.number().optional().default(0),
  timeOut: z.number().optional(),
  value: z.union([z.string(), z.number(), z.null()]).optional().nullable(),
  params: z.record(z.unknown()).optional().default({}),
  desc: z.string().optional().default(""),
  branch: branchSchema.optional(),
  next: z.string().optional(),
});

export const stepSchema = z.discriminatedUnion("type", [
  baseStepSchema.extend({ type: z.literal("click") }),
  baseStepSchema.extend({ type: z.literal("hover") }),
  baseStepSchema.extend({ type: z.literal("input") }),
  baseStepSchema.extend({ type: z.literal("link") }),
  baseStepSchema.extend({ type: z.literal("wait") }),
  baseStepSchema.extend({ type: z.literal("ready") }),
  baseStepSchema.extend({ type: z.literal("scroll") }),
  baseStepSchema.extend({
    type: z.literal("verify"),
    verifyValue: z.string().optional().default("body"),
    expectValue: z.string().optional().default(""),
    matchRule: z.enum(MATCH_RULES),
  }),
  baseStepSchema.extend({ type: z.literal("screenshot") }),
  baseStepSchema.extend({ type: z.literal("log") }),
  baseStepSchema.extend({ type: z.literal("keyboard") }),
  baseStepSchema.extend({ type: z.literal("macro") }),
]);

export type Step = z.infer<typeof stepSchema>;

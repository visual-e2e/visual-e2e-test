import { z } from "zod";
import { stepSchema } from "./step.schema.js";

export const macroSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  params: z.record(z.object({ required: z.boolean().optional() })).optional(),
  steps: z.array(stepSchema).min(1),
});

export const ruleSchema = z.object({
  id: z.string().min(1),
  description: z.string().optional(),
  params: z.record(z.object({ required: z.boolean().optional() })).optional(),
  setup: z.record(z.unknown()).optional(),
  steps: z.array(stepSchema).min(1),
});

export const variablesSchema = z.record(z.record(z.string()));

export type MacroDefinition = z.infer<typeof macroSchema>;
export type RuleDefinition = z.infer<typeof ruleSchema>;

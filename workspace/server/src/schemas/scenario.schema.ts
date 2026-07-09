import { z } from "zod";
import { stepSchema } from "./step.schema.js";

export const scenarioSetupSchema = z.object({
  requiresLogin: z.boolean().default(true),
  entryRoute: z.string().default("/"),
  refresh: z.boolean().default(false),
  readySelectors: z.array(z.string()).optional(),
});

export const scenarioLoopSchema = z.object({
  count: z.number().int().min(1).default(1),
  intervalMs: z.number().int().min(0).default(0),
  continueOnFailure: z.boolean().default(false),
});

/** 完整步骤场景 */
export const fullScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  module: z.string().min(1),
  enabled: z.boolean().default(true),
  setup: scenarioSetupSchema.optional().default({ requiresLogin: true, entryRoute: "/" }),
  loop: scenarioLoopSchema.optional(),
  steps: z.array(stepSchema).min(1),
});

/** extends 模板场景 */
export const extendsScenarioSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  module: z.string().min(1),
  enabled: z.boolean().default(true),
  setup: scenarioSetupSchema.optional(),
  loop: scenarioLoopSchema.optional(),
  extends: z.string().min(1),
  params: z.record(z.string()).default({}),
  steps: z.array(stepSchema).optional(),
});

export const scenarioWriteSchema = z.union([fullScenarioSchema, extendsScenarioSchema]);

export const manifestSchema = z.object({
  module: z.string(),
  description: z.string().optional(),
  entryRoute: z.string().optional(),
  scenarios: z.array(z.string()),
});

export type ScenarioWrite = z.infer<typeof scenarioWriteSchema>;
export type ModuleManifest = z.infer<typeof manifestSchema>;

export function isExtendsScenario(s: ScenarioWrite): s is z.infer<typeof extendsScenarioSchema> {
  return "extends" in s && !!s.extends;
}

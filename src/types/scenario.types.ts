import { z } from "zod";
import { expandScenarioRaw } from "../core/scenario-expand.js";
import { stepSchema } from "./step.types.js";

export const scenarioSetupSchema = z.object({
  requiresLogin: z.boolean().default(true),
  /** 非空时 goto 该路径；优先于 refresh */
  entryRoute: z.string().default("/"),
  /** entryRoute 为空时为 true 则 page.reload() 刷新当前 URL（适用于动态 id 路由） */
  refresh: z.boolean().default(false),
  /** 导航或刷新后额外等待的选择器（AND，全部可见） */
  readySelectors: z.array(z.string()).optional(),
});

/** 压测 / 步骤循环控制（count=1 时等价于不循环） */
export const scenarioLoopSchema = z.object({
  count: z.number().int().min(1).default(1),
  intervalMs: z.number().int().min(0).default(0),
  continueOnFailure: z.boolean().default(false),
});

export const scenarioSchema = z.object({
  id: z.string(),
  name: z.string(),
  module: z.string(),
  enabled: z.boolean().default(true),
  setup: scenarioSetupSchema.optional().default({ requiresLogin: true, entryRoute: "/" }),
  loop: scenarioLoopSchema.optional(),
  steps: z.array(stepSchema).min(1),
});

export const manifestSchema = z.object({
  module: z.string(),
  description: z.string().optional(),
  entryRoute: z.string().optional(),
  scenarios: z.array(z.string()),
});

export type ScenarioSetup = z.infer<typeof scenarioSetupSchema>;
export type ScenarioLoop = z.infer<typeof scenarioLoopSchema>;
export type Scenario = z.infer<typeof scenarioSchema>;
export type ModuleManifest = z.infer<typeof manifestSchema>;

export type ScenarioStatus = "PASSED" | "FAILED" | "ERROR" | "SKIPPED";

export interface StepResult {
  stepId: string;
  type: string;
  desc: string;
  status: ScenarioStatus;
  message: string;
  elapsedMs: number;
  loopIndex?: number;
  screenshot?: string;
}

export interface LoopSummary {
  total: number;
  passed: number;
  failed: number;
}

export interface ScenarioScreenshot {
  stepId: string;
  stepType: string;
  desc: string;
  path: string;
  status: "PASS" | "FAIL";
  loopIndex?: number;
}

export interface ScenarioResult {
  scenarioId: string;
  scenarioName: string;
  module: string;
  status: ScenarioStatus;
  message: string;
  elapsedMs: number;
  /** 场景过程中产生的全部截图（verify 成功 + screenshot 步骤 + 失败截图） */
  screenshots: ScenarioScreenshot[];
  failedStep?: StepResult;
  steps: StepResult[];
  loopSummary?: LoopSummary;
}

export function parseScenario(raw: unknown, fixturesDir?: string): Scenario {
  const expanded = expandScenarioRaw(raw, fixturesDir);
  return scenarioSchema.parse(expanded);
}

export function parseManifest(raw: unknown): ModuleManifest {
  return manifestSchema.parse(raw);
}

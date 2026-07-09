import { StepType } from "../types/step-type.enum.js";
import type { Branch, BranchTarget } from "../types/branch.types.js";
import { formatBranchTarget, isScenarioTarget, isStepTarget } from "../types/branch.types.js";
import type { Step, VerifyStep } from "../types/step.types.js";
import type { RunContext } from "./run-context.js";
import type { RunLogger } from "../core/logger.js";
import {
  evaluateVerify,
  captureVerifyPassScreenshot,
  isBranchVerifyInstant,
} from "../core/verify-evaluate.js";
import type { StepExecutor } from "./step-executor.js";

export type BranchJump = { kind: "jump"; stepId: string; index: number };
export type BranchHandoff = { kind: "handoff"; scenarioRef: string };

export function resolveStepVars(ctx: RunContext, step: Step): Step {
  const clone = { ...step, params: step.params ? { ...step.params } : {} } as Step & Record<string, unknown>;
  if (clone.selector) clone.selector = ctx.resolve(clone.selector);
  if (clone.url) clone.url = ctx.resolve(clone.url);
  if (clone.value !== null && clone.value !== undefined) {
    clone.value = ctx.resolve(clone.value);
  }
  if (Array.isArray(clone.params?.clickAny)) {
    clone.params.clickAny = clone.params.clickAny.map((s: unknown) => ctx.resolve(String(s)));
  }
  if (clone.type === "verify") {
    const v = clone as Step & { expectValue?: string; verifyValue?: string };
    if (v.expectValue) v.expectValue = ctx.resolve(v.expectValue);
    if (v.verifyValue) v.verifyValue = ctx.resolve(v.verifyValue);
  }
  return clone as Step;
}

export function resolveBranchTarget(
  target: BranchTarget,
  stepIndex: Map<string, number>,
): BranchJump | BranchHandoff {
  if (isStepTarget(target)) {
    const index = stepIndex.get(target.step);
    if (index === undefined) {
      throw new Error(`分支目标步骤不存在: ${target.step}`);
    }
    return { kind: "jump", stepId: target.step, index };
  }
  if (isScenarioTarget(target)) {
    return { kind: "handoff", scenarioRef: target.scenario };
  }
  throw new Error("无效的分支目标");
}

export async function executeBranchedStep(
  executor: StepExecutor,
  ctx: RunContext,
  step: Step,
  stepIndex: Map<string, number>,
  logger: RunLogger,
  logName: string,
  prefix: string,
): Promise<BranchJump | BranchHandoff | null> {
  const resolved = resolveStepVars(ctx, step);
  const branch = (resolved as Step & { branch?: Branch }).branch;

  if (step.type === StepType.Verify && branch) {
    const verifyStep = resolved as VerifyStep;
    const instant = isBranchVerifyInstant(verifyStep);
    const passed = await evaluateVerify(ctx, verifyStep, { instant });
    const target = passed ? branch.yes : branch.no;
    const branchLabel = passed ? "yes" : "no";

    ctx.logInfo(
      `验证分支 ${branchLabel}${instant ? "（即时）" : "（等待）"} → ${formatBranchTarget(target)}`,
    );
    logger.info(logName, `${prefix}  ? ${verifyStep.stepId} verify=${passed ? "yes" : "no"}`);

    if (passed) {
      ctx.lastStepScreenshot = await captureVerifyPassScreenshot(ctx, verifyStep);
    }

    return resolveBranchTarget(target, stepIndex);
  }

  await executor.execute(ctx, resolved);

  if (branch) {
    ctx.logInfo(`流程跳转 → ${formatBranchTarget(branch.yes)}`);
    logger.info(logName, `${prefix}  → ${step.stepId} 跳转 ${formatBranchTarget(branch.yes)}`);
    return resolveBranchTarget(branch.yes, stepIndex);
  }

  return null;
}

const MAX_STEP_JUMPS = 500;

/** 在步骤列表内执行（支持 branch / next），用于宏展开步骤 */
export async function runStepList(
  executor: StepExecutor,
  ctx: RunContext,
  steps: Step[],
  logger: RunLogger,
  logName: string,
  prefix: string,
): Promise<void> {
  const stepIndex = new Map(steps.map((step, index) => [step.stepId, index]));
  let i = 0;
  let jumps = 0;

  while (i < steps.length) {
    jumps++;
    if (jumps > MAX_STEP_JUMPS) {
      throw new Error(`步骤跳转次数超过上限 ${MAX_STEP_JUMPS}`);
    }

    const step = steps[i];
    logger.info(logName, `${prefix}→ [${step.stepId}] ${step.type}: ${step.desc || ""}`);

    ctx.lastStepScreenshot = undefined;
    const branchOutcome = await executeBranchedStep(
      executor,
      ctx,
      step,
      stepIndex,
      logger,
      logName,
      prefix,
    );

    if (branchOutcome?.kind === "handoff") {
      throw new Error(`宏内不支持场景切换: ${branchOutcome.scenarioRef}`);
    }

    if (branchOutcome?.kind === "jump") {
      logger.info(
        logName,
        `${prefix}  ↪ ${step.stepId} 分支跳转 → step:${branchOutcome.stepId}`,
      );
      i = branchOutcome.index;
      continue;
    }

    logger.info(logName, `${prefix}  ✓ ${step.stepId}`);

    const delay = ctx.getDefaultDelay(step.delay);
    if (delay > 0) {
      await ctx.page.waitForTimeout(delay);
    }

    const nextStepId = (step as Step & { next?: string }).next?.trim();
    if (nextStepId) {
      const nextIdx = stepIndex.get(nextStepId);
      if (nextIdx === undefined) {
        throw new Error(`next 目标步骤不存在: ${nextStepId}`);
      }
      logger.info(logName, `${prefix}  → next ${step.stepId} → ${nextStepId}`);
      i = nextIdx;
    } else {
      i++;
    }
  }
}

import { captureStepScreenshot, collectScreenshotsFromSteps } from "../core/screenshot.js";
import { resolveScenarioInModule } from "../core/scenario-resolve.js";
import {
  evaluateVerify,
  captureVerifyPassScreenshot,
  isBranchVerifyInstant,
} from "../core/verify-evaluate.js";
import { mkdirSync } from "node:fs";
import type { Page } from "playwright";
import type { AppConfig } from "../core/config.js";
import type { RunLogger } from "../core/logger.js";
import { ensureLoggedIn, navigateTo, reloadPage, type RunAuthState } from "../core/auth.js";
import { waitForSetupReady } from "../core/page-ready.js";
import type { Scenario, ScenarioLoop, ScenarioResult, StepResult } from "../types/scenario.types.js";
import type { Branch, BranchTarget } from "../types/branch.types.js";
import { formatBranchTarget, isScenarioTarget, isStepTarget } from "../types/branch.types.js";
import type { Step, VerifyStep } from "../types/step.types.js";
import { StepType } from "../types/step-type.enum.js";
import { RunContext } from "./run-context.js";
import { StepExecutor } from "./step-executor.js";
import type { HandlerRegistry } from "./handler-registry.js";
import { ScenarioFailedError } from "../handlers/base.handler.js";

const DEFAULT_LOOP: ScenarioLoop = { count: 1, intervalMs: 0, continueOnFailure: false };
const MAX_STEP_JUMPS = 500;
const MAX_SCENARIO_HANDOFFS = 20;

interface StepFailure {
  message: string;
  stepId: string;
  screenshot?: string;
  failedStep: StepResult;
}

type RunStepsOutcome =
  | { kind: "ok" }
  | { kind: "failure"; failure: StepFailure }
  | { kind: "handoff"; scenarioRef: string };

export class ScenarioRunner {
  private executor: StepExecutor;

  constructor(
    private registry: HandlerRegistry,
    private config: AppConfig,
  ) {
    this.executor = new StepExecutor(registry);
  }

  async run(
    page: Page,
    scenario: Scenario,
    moduleDir: string,
    variables: Record<string, string>,
    logger: RunLogger,
    runDirs: { logDir: string; screenshotDir: string },
    authState: RunAuthState,
  ): Promise<ScenarioResult[]> {
    const results: ScenarioResult[] = [];
    let current = scenario;
    let handoffs = 0;

    mkdirSync(runDirs.screenshotDir, { recursive: true });

    while (current) {
      const result = await this.runOneScenario(
        page,
        current,
        variables,
        logger,
        runDirs,
        authState,
      );

      results.push(result.scenarioResult);

      if (result.handoffRef) {
        handoffs++;
        if (handoffs > MAX_SCENARIO_HANDOFFS) {
          throw new Error(`场景切换次数超过上限 ${MAX_SCENARIO_HANDOFFS}`);
        }
        const next = resolveScenarioInModule(
          this.config.scenariosDir,
          moduleDir,
          result.handoffRef,
          this.config.fixturesDir,
        );
        if (!next) {
          throw new Error(`分支目标场景不存在: ${result.handoffRef}`);
        }
        logger.info("run", `↪ 场景切换: ${current.id} → ${next.id} (${result.handoffRef})`);
        current = next;
        continue;
      }

      break;
    }

    return results;
  }

  private async runOneScenario(
    page: Page,
    scenario: Scenario,
    variables: Record<string, string>,
    logger: RunLogger,
    runDirs: { logDir: string; screenshotDir: string },
    authState: RunAuthState,
  ): Promise<{ scenarioResult: ScenarioResult; handoffRef?: string }> {
    const logName = `${scenario.module}_${scenario.id}`;
    const stepResults: StepResult[] = [];
    const start = Date.now();
    const loopConfig = scenario.loop ?? DEFAULT_LOOP;
    let loopPassed = 0;
    let loopFailed = 0;
    let lastFailure: StepFailure | undefined;
    let handoffRef: string | undefined;

    const ctx = new RunContext(
      page,
      this.config,
      scenario,
      variables,
      logger,
      runDirs.screenshotDir,
      logName,
    );

    logger.info("run", `\n${"=".repeat(50)}`);
    logger.info("run", `场景: [${scenario.module}] ${scenario.name} (${scenario.id})`);
    if (loopConfig.count > 1) {
      logger.info(
        "run",
        `循环: ${loopConfig.count} 次 | 间隔 ${loopConfig.intervalMs}ms | continueOnFailure=${loopConfig.continueOnFailure}`,
      );
    }
    logger.info(logName, `开始场景: ${scenario.name}`);

    try {
      await this.runSetup(ctx, authState);

      for (let loopIndex = 1; loopIndex <= loopConfig.count; loopIndex++) {
        ctx.loopIndex = loopIndex;
        ctx.loopCount = loopConfig.count;

        if (loopConfig.count > 1) {
          logger.info(logName, `--- 循环 ${loopIndex}/${loopConfig.count} ---`);
          logger.info("run", `场景 [${scenario.id}] 循环 ${loopIndex}/${loopConfig.count}`);
        }

        const outcome = await this.runSteps(
          page,
          ctx,
          scenario,
          loopConfig,
          stepResults,
          logger,
          logName,
        );

        if (outcome.kind === "handoff") {
          handoffRef = outcome.scenarioRef;
          loopPassed++;
          break;
        }

        if (outcome.kind === "failure") {
          loopFailed++;
          lastFailure = outcome.failure;
          if (!loopConfig.continueOnFailure) {
            throw new ScenarioFailedError(outcome.failure.message, scenario.id, outcome.failure.stepId);
          }
          logger.warn(
            logName,
            `${ctx.loopLabel()}本轮失败，${ctx.loopIndex < loopConfig.count ? "继续下一轮" : "已是最后一轮"}`,
          );
        } else {
          loopPassed++;
        }

        if (handoffRef) break;

        if (loopIndex < loopConfig.count && loopConfig.intervalMs > 0) {
          logger.info(logName, `循环间隔 ${loopConfig.intervalMs}ms`);
          await page.waitForTimeout(loopConfig.intervalMs);
        }
      }

      const elapsedMs = Date.now() - start;
      const loopSummary =
        loopConfig.count > 1 ? { total: loopConfig.count, passed: loopPassed, failed: loopFailed } : undefined;

      if (loopFailed > 0) {
        logger.error(logName, `场景失败: ${loopFailed}/${loopConfig.count} 轮未通过 (${elapsedMs}ms)`);
        logger.error("run", `✗ [${scenario.id}] FAILED (${elapsedMs}ms)`);
        return {
          handoffRef,
          scenarioResult: {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            module: scenario.module,
            status: "FAILED",
            message: `${loopFailed}/${loopConfig.count} 轮失败`,
            elapsedMs,
            screenshots: collectScreenshotsFromSteps(stepResults),
            failedStep: lastFailure?.failedStep,
            steps: stepResults,
            loopSummary,
          },
        };
      }

      const passMessage = handoffRef
        ? `分支切换 → ${handoffRef}`
        : loopConfig.count > 1
          ? `${loopConfig.count} 轮全部通过`
          : "场景执行成功";

      logger.info(logName, handoffRef ? `场景分支切换 (${elapsedMs}ms)` : `场景通过 (${elapsedMs}ms)`);
      logger.info("run", `✓ [${scenario.id}] PASSED (${elapsedMs}ms)`);

      return {
        handoffRef,
        scenarioResult: {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          module: scenario.module,
          status: "PASSED",
          message: passMessage,
          elapsedMs,
          screenshots: collectScreenshotsFromSteps(stepResults),
          steps: stepResults,
          loopSummary,
        },
      };
    } catch (err) {
      const elapsedMs = Date.now() - start;
      const loopSummary =
        loopConfig.count > 1 ? { total: loopConfig.count, passed: loopPassed, failed: loopFailed } : undefined;

      if (err instanceof ScenarioFailedError) {
        const lastFailed = stepResults.find((s) => s.status === "FAILED");
        return {
          scenarioResult: {
            scenarioId: scenario.id,
            scenarioName: scenario.name,
            module: scenario.module,
            status: "FAILED",
            message: err.message,
            elapsedMs,
            screenshots: collectScreenshotsFromSteps(stepResults),
            failedStep: lastFailed,
            steps: stepResults,
            loopSummary,
          },
        };
      }

      const message = err instanceof Error ? err.message : String(err);
      logger.error(logName, `场景异常: ${message}`);
      return {
        scenarioResult: {
          scenarioId: scenario.id,
          scenarioName: scenario.name,
          module: scenario.module,
          status: "ERROR",
          message,
          elapsedMs,
          screenshots: collectScreenshotsFromSteps(stepResults),
          steps: stepResults,
          loopSummary,
        },
      };
    }
  }

  private async runSetup(ctx: RunContext, authState: RunAuthState): Promise<void> {
    const setup = ctx.scenario.setup ?? { requiresLogin: true, entryRoute: "/" };
    const { page } = ctx;

    if (setup.requiresLogin) {
      await ensureLoggedIn(page, this.config, authState, (msg) =>
        ctx.logger.info(ctx.logName, msg),
      );
    }

    const entryRoute = setup.entryRoute?.trim();
    if (entryRoute) {
      const resolvedRoute = ctx.resolve(entryRoute);
      ctx.logInfo(`进入模块: ${resolvedRoute}`);
      await navigateTo(page, this.config, resolvedRoute);
    } else if (setup.refresh) {
      ctx.logInfo("刷新当前页面");
      await reloadPage(page, this.config);
    }

    const readySelectors = setup.readySelectors;
    if (Array.isArray(readySelectors) && readySelectors.length > 0) {
      await waitForSetupReady(ctx, readySelectors);
    }
  }

  private async runSteps(
    page: Page,
    ctx: RunContext,
    scenario: Scenario,
    loopConfig: ScenarioLoop,
    stepResults: StepResult[],
    logger: RunLogger,
    logName: string,
  ): Promise<RunStepsOutcome> {
    const prefix = ctx.loopLabel();
    let deferredFailure: StepFailure | undefined;
    const stepIndex = new Map(scenario.steps.map((step, index) => [step.stepId, index]));
    let i = 0;
    let jumps = 0;

    while (i < scenario.steps.length) {
      jumps++;
      if (jumps > MAX_STEP_JUMPS) {
        return {
          kind: "failure",
          failure: {
            message: `步骤跳转次数超过上限 ${MAX_STEP_JUMPS}`,
            stepId: scenario.steps[i]?.stepId ?? "?",
            failedStep: {
              stepId: scenario.steps[i]?.stepId ?? "?",
              type: "system",
              desc: "",
              status: "FAILED",
              message: "步骤跳转死循环",
              elapsedMs: 0,
            },
          },
        };
      }

      const step = scenario.steps[i];
      const stepStart = Date.now();
      logger.info(logName, `${prefix}→ [${step.stepId}] ${step.type}: ${step.desc || ""}`);

      try {
        ctx.lastStepScreenshot = undefined;
        const branchOutcome = await this.executeStepWithBranch(
          ctx,
          step,
          stepIndex,
          logger,
          logName,
          prefix,
        );

        if (branchOutcome?.kind === "handoff") {
          const elapsed = Date.now() - stepStart;
          stepResults.push({
            stepId: step.stepId,
            type: step.type,
            desc: step.desc ?? "",
            status: "PASSED",
            message: `branch → ${formatBranchTarget({ scenario: branchOutcome.scenarioRef })}`,
            elapsedMs: elapsed,
            loopIndex: loopConfig.count > 1 ? ctx.loopIndex : undefined,
            screenshot: ctx.lastStepScreenshot,
          });
          logger.info(
            logName,
            `${prefix}  ↪ ${step.stepId} 分支切换 → scenario:${branchOutcome.scenarioRef} (${elapsed}ms)`,
          );
          return { kind: "handoff", scenarioRef: branchOutcome.scenarioRef };
        }

        if (branchOutcome?.kind === "jump") {
          const elapsed = Date.now() - stepStart;
          stepResults.push({
            stepId: step.stepId,
            type: step.type,
            desc: step.desc ?? "",
            status: "PASSED",
            message: `branch → step:${branchOutcome.stepId}`,
            elapsedMs: elapsed,
            loopIndex: loopConfig.count > 1 ? ctx.loopIndex : undefined,
            screenshot: ctx.lastStepScreenshot,
          });
          logger.info(
            logName,
            `${prefix}  ↪ ${step.stepId} 分支跳转 → step:${branchOutcome.stepId} (${elapsed}ms)`,
          );
          i = branchOutcome.index;
          continue;
        }

        const elapsed = Date.now() - stepStart;
        stepResults.push({
          stepId: step.stepId,
          type: step.type,
          desc: step.desc ?? "",
          status: "PASSED",
          message: "OK",
          elapsedMs: elapsed,
          loopIndex: loopConfig.count > 1 ? ctx.loopIndex : undefined,
          screenshot: ctx.lastStepScreenshot,
        });
        logger.info(logName, `${prefix}  ✓ ${step.stepId} (${elapsed}ms)`);

        const delay = ctx.getDefaultDelay(step.delay);
        if (delay > 0) {
          await page.waitForTimeout(delay);
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
      } catch (err) {
        const elapsed = Date.now() - stepStart;
        const message = err instanceof Error ? err.message : String(err);

        let screenshot: string | undefined;
        try {
          screenshot = await captureStepScreenshot(ctx, step, "FAIL");
        } catch {
          /* ignore */
        }

        const failed: StepResult = {
          stepId: step.stepId,
          type: step.type,
          desc: step.desc ?? "",
          status: "FAILED",
          message,
          elapsedMs: elapsed,
          loopIndex: loopConfig.count > 1 ? ctx.loopIndex : undefined,
          screenshot,
        };
        stepResults.push(failed);

        logger.error(logName, `${prefix}  ✗ ${step.stepId}: ${message}`);

        const failure: StepFailure = { message, stepId: step.stepId, screenshot, failedStep: failed };

        if (step.params?.continueOnFail === true) {
          logger.warn(logName, `${prefix}  ↷ ${step.stepId} 失败但 continueOnFail，继续下一步`);
          deferredFailure ??= failure;
          i++;
          continue;
        }

        logger.error("run", `场景失败 [${scenario.id}] ${prefix}步骤 ${step.stepId}: ${message}`);
        return { kind: "failure", failure };
      }
    }

    return deferredFailure ? { kind: "failure", failure: deferredFailure } : { kind: "ok" };
  }

  private async executeStepWithBranch(
    ctx: RunContext,
    step: Step,
    stepIndex: Map<string, number>,
    logger: RunLogger,
    logName: string,
    prefix: string,
  ): Promise<{ kind: "jump"; stepId: string; index: number } | { kind: "handoff"; scenarioRef: string } | null> {
    const resolved = this.resolveStepVars(ctx, step);
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

      return this.resolveBranchTarget(target, stepIndex);
    }

    await this.executor.execute(ctx, resolved);

    if (branch) {
      ctx.logInfo(`流程跳转 → ${formatBranchTarget(branch.yes)}`);
      logger.info(logName, `${prefix}  → ${step.stepId} 跳转 ${formatBranchTarget(branch.yes)}`);
      return this.resolveBranchTarget(branch.yes, stepIndex);
    }

    return null;
  }

  private resolveBranchTarget(
    target: BranchTarget,
    stepIndex: Map<string, number>,
  ): { kind: "jump"; stepId: string; index: number } | { kind: "handoff"; scenarioRef: string } {
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

  private resolveStepVars(ctx: RunContext, step: Step): Step {
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
}

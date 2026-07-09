import { join } from "node:path";
import type { RunContext } from "../engine/run-context.js";
import type { Step } from "../types/step.types.js";
import type { ScenarioScreenshot, StepResult } from "../types/scenario.types.js";

export type ScreenshotStatus = "PASS" | "FAIL";

export function stepScreenshotPath(
  ctx: RunContext,
  step: Step,
  status: ScreenshotStatus,
): string {
  const loopSuffix = ctx.loopCount > 1 ? `_loop${ctx.loopIndex}` : "";
  return join(ctx.screenshotDir, `${ctx.scenario.id}${loopSuffix}_${step.stepId}_${status}.png`);
}

export async function captureStepScreenshot(
  ctx: RunContext,
  step: Step,
  status: ScreenshotStatus,
): Promise<string> {
  const filePath = stepScreenshotPath(ctx, step, status);
  const fullPage = (step.params?.fullPage as boolean) ?? false;
  ctx.logInfo(`截图(${status}): ${filePath}`);
  await ctx.page.screenshot({ path: filePath, fullPage, timeout: 10000 });
  return filePath;
}

/** verify 步骤默认成功后截图，params.screenshot=false 可关闭 */
export function shouldScreenshotOnVerifyPass(step: Step): boolean {
  return step.params?.screenshot !== false;
}

export function collectScreenshotsFromSteps(stepResults: StepResult[]): ScenarioScreenshot[] {
  return stepResults
    .filter((s) => s.screenshot)
    .map((s) => ({
      stepId: s.stepId,
      stepType: s.type,
      desc: s.desc,
      path: s.screenshot!,
      status: s.status === "FAILED" ? ("FAIL" as const) : ("PASS" as const),
      loopIndex: s.loopIndex,
    }));
}

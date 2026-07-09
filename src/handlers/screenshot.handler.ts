import { join } from "node:path";
import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { captureStepScreenshot } from "../core/screenshot.js";
import { IStepHandler } from "./base.handler.js";

export class ScreenshotHandler implements IStepHandler {
  readonly type = StepType.Screenshot;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    ctx.lastStepScreenshot = await captureStepScreenshot(ctx, step, "PASS");
  }
}

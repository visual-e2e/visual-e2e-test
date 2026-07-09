import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";

export class WaitHandler implements IStepHandler {
  readonly type = StepType.Wait;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const ms = typeof step.value === "number" ? step.value : parseInt(String(step.value ?? "1000"), 10);
    ctx.logInfo(`等待: ${ms}ms`);
    await ctx.page.waitForTimeout(ms);
  }
}

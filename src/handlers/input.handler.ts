import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";

export class InputHandler implements IStepHandler {
  readonly type = StepType.Input;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const selector = ctx.resolve(step.selector ?? "");
    if (!selector) throw new Error("input 步骤缺少 selector");
    const value = ctx.resolve(step.value ?? "");
    const clearBefore = (step.params?.clearBeforeInput as boolean) ?? true;
    ctx.logInfo(`输入: ${selector} = ${value}`);
    const loc = ctx.page.locator(selector);
    if (clearBefore) {
      await loc.fill(value, { timeout: ctx.getDefaultTimeout(step.timeOut) });
    } else {
      await loc.pressSequentially(value, { timeout: ctx.getDefaultTimeout(step.timeOut) });
    }
  }
}

import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";

export class HoverHandler implements IStepHandler {
  readonly type = StepType.Hover;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const selector = ctx.resolve(step.selector ?? "");
    if (!selector) throw new Error("hover 步骤缺少 selector");
    ctx.logInfo(`悬停: ${selector}`);
    await ctx.page.hover(selector, { timeout: ctx.getDefaultTimeout(step.timeOut) });
  }
}

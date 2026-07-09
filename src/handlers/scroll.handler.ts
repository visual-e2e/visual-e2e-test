import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";

export class ScrollHandler implements IStepHandler {
  readonly type = StepType.Scroll;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const selector = ctx.resolve(step.selector ?? "");
    const distance = typeof step.value === "number" ? step.value : parseInt(String(step.value ?? "300"), 10);
    if (selector) {
      ctx.logInfo(`滚动到元素: ${selector}`);
      await ctx.page.locator(selector).scrollIntoViewIfNeeded({
        timeout: ctx.getDefaultTimeout(step.timeOut),
      });
    } else {
      ctx.logInfo(`页面滚动: ${distance}px`);
      await ctx.page.evaluate((d) => {
        globalThis.scrollBy(0, d);
      }, distance);
    }
  }
}

import { StepType } from "../types/step-type.enum.js";
import { MatchRule } from "../types/match-rule.enum.js";
import type { VerifyStep } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { captureVerifyPassScreenshot, evaluateVerify } from "../core/verify-evaluate.js";
import { IStepHandler } from "./base.handler.js";

export class VerifyHandler implements IStepHandler<VerifyStep> {
  readonly type = StepType.Verify;

  async execute(ctx: RunContext, step: VerifyStep): Promise<void> {
    const expectValue = ctx.resolve(step.expectValue);
    const rule = step.matchRule;
    ctx.logInfo(`验证: ${rule} expect="${expectValue}"`);

    const passed = await evaluateVerify(ctx, step);
    if (!passed) {
      throw new Error(this.failureMessage(ctx, step));
    }

    ctx.lastStepScreenshot = await captureVerifyPassScreenshot(ctx, step);
  }

  private failureMessage(ctx: RunContext, step: VerifyStep): string {
    const rule = step.matchRule;
    const expectValue = ctx.resolve(step.expectValue);

    if (rule === MatchRule.Visible || rule === MatchRule.Hidden) {
      const sel = ctx.resolve(step.selector || step.verifyValue || "");
      return `${rule} 失败: selector="${sel}"`;
    }
    if (rule === MatchRule.UrlContains) {
      return `URL 不包含 "${expectValue}"，实际: ${ctx.page.url()}`;
    }
    return `${rule} 验证未通过`;
  }
}

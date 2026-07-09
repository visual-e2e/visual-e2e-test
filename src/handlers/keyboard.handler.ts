import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";
import { resolveKeyboardKey } from "../core/keyboard-keys.js";

export class KeyboardHandler implements IStepHandler {
  readonly type = StepType.Keyboard;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const key = resolveKeyboardKey(ctx.resolve(String(step.value ?? "")));
    const selector = ctx.resolve(step.selector ?? "").trim();
    const timeout = ctx.getDefaultTimeout(step.timeOut);

    if (selector) {
      ctx.logInfo(`键盘: ${key} @ ${selector}`);
      await ctx.page.locator(selector).press(key, { timeout });
      return;
    }

    ctx.logInfo(`键盘: ${key}`);
    await ctx.page.keyboard.press(key);
  }
}

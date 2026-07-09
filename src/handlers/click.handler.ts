import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { clickFirstMatch } from "../core/click-resolve.js";
import { IStepHandler } from "./base.handler.js";

export class ClickHandler implements IStepHandler {
  readonly type = StepType.Click;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    await clickFirstMatch(ctx, step);
  }
}

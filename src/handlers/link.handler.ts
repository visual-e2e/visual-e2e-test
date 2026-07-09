import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { navigateAndWait } from "../core/page-ready.js";
import { IStepHandler } from "./base.handler.js";

export class LinkHandler implements IStepHandler {
  readonly type = StepType.Link;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const url = ctx.resolveUrl(step.url ?? step.selector ?? "/");
    await navigateAndWait(ctx, step, url);
  }
}

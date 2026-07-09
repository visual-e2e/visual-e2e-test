import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { resolveReadySelectors, waitForReady } from "../core/page-ready.js";
import { IStepHandler } from "./base.handler.js";

export class ReadyHandler implements IStepHandler {
  readonly type = StepType.Ready;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    if (resolveReadySelectors(ctx, step).length === 0) {
      throw new Error("ready 步骤缺少 params.readySelectors");
    }
    await waitForReady(ctx, step);
  }
}

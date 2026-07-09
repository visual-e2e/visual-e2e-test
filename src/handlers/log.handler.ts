import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";

export class LogHandler implements IStepHandler {
  readonly type = StepType.Log;

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const message = ctx.resolve(step.value ?? step.desc);
    const prefix = ctx.loopLabel();
    ctx.logInfo(`${prefix}[LOG] ${message}`);
    ctx.logger.info("run", `${prefix}[${ctx.scenario.id}] ${message}`);
  }
}

import type { Step } from "../types/step.types.js";
import { StepType } from "../types/step-type.enum.js";
import type { RunContext } from "./run-context.js";
import type { HandlerRegistry } from "./handler-registry.js";
import { waitBeforeStep, hasReadyConditions } from "../core/page-ready.js";
import { StepExecutionError } from "../handlers/base.handler.js";

export class StepExecutor {
  constructor(private registry: HandlerRegistry) {}

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const handler = this.registry.get(step.type);
    const timeoutMs = this.getStepTimeout(ctx, step);

    try {
      await Promise.race([
        this.runStep(ctx, step, handler),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error(`步骤超时 (${timeoutMs}ms)`)), timeoutMs),
        ),
      ]);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new StepExecutionError(message, step.stepId, step.type);
    }
  }

  private getStepTimeout(ctx: RunContext, step: Step): number {
    const stepTimeout = ctx.getDefaultTimeout(step.timeOut);
    if (step.type === StepType.Link) {
      return Math.max(stepTimeout, ctx.config.browser.timeout);
    }
    if (
      step.type === StepType.Ready ||
      step.type === StepType.Macro ||
      hasReadyConditions(ctx, step)
    ) {
      return ctx.getReadyTimeout(step.timeOut);
    }
    return stepTimeout;
  }

  private async runStep(ctx: RunContext, step: Step, handler: { execute(ctx: RunContext, step: Step): Promise<void> }): Promise<void> {
    if (step.type !== StepType.Link && step.type !== StepType.Ready) {
      await waitBeforeStep(ctx, step);
    }
    await handler.execute(ctx, step);
  }
}

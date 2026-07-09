import { join } from "node:path";
import { StepType } from "../types/step-type.enum.js";
import type { Step } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { IStepHandler } from "./base.handler.js";
import { expandMacroSteps } from "../core/macro-loader.js";
import type { HandlerRegistry } from "../engine/handler-registry.js";
import { StepExecutor } from "../engine/step-executor.js";
import { runStepList } from "../engine/step-flow.js";

export class MacroHandler implements IStepHandler {
  readonly type = StepType.Macro;
  private executor: StepExecutor;

  constructor(registry: HandlerRegistry) {
    this.executor = new StepExecutor(registry);
  }

  async execute(ctx: RunContext, step: Step): Promise<void> {
    const macroId = ctx.resolve(step.value ?? "").trim();
    if (!macroId) {
      throw new Error("macro 步骤缺少 value（宏 id）");
    }

    const macrosDir = join(ctx.config.fixturesDir, "macros");
    const params = (step.params ?? {}) as Record<string, unknown>;
    const subSteps = expandMacroSteps(ctx, macrosDir, macroId, params, step.stepId);

    ctx.logInfo(`宏: ${macroId}（${subSteps.length} 步）`);
    const prefix = `[${macroId}] `;
    await runStepList(this.executor, ctx, subSteps, ctx.logger, ctx.logName, prefix);
  }
}

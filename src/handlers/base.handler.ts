import type { Step } from "../types/step.types.js";
import type { StepType } from "../types/step-type.enum.js";
import type { RunContext } from "../engine/run-context.js";

export interface IStepHandler<T extends Step = Step> {
  readonly type: StepType;
  execute(ctx: RunContext, step: T): Promise<void>;
}

export class StepExecutionError extends Error {
  constructor(
    message: string,
    public readonly stepId: string,
    public readonly stepType: string,
  ) {
    super(message);
    this.name = "StepExecutionError";
  }
}

export class ScenarioFailedError extends Error {
  constructor(
    message: string,
    public readonly scenarioId: string,
    public readonly failedStepId?: string,
  ) {
    super(message);
    this.name = "ScenarioFailedError";
  }
}

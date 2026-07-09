import type { Page } from "playwright";
import type { AppConfig } from "../core/config.js";
import type { RunLogger } from "../core/logger.js";
import type { Scenario } from "../types/scenario.types.js";

export class RunContext {
  loopIndex = 1;
  loopCount = 1;
  /** 当前步骤产生的截图路径（由 handler 写入） */
  lastStepScreenshot?: string;

  constructor(
    public page: Page,
    public config: AppConfig,
    public scenario: Scenario,
    public variables: Record<string, string>,
    public logger: RunLogger,
    public screenshotDir: string,
    public logName: string,
  ) {}

  resolve(text: string | number | null | undefined): string {
    if (text === null || text === undefined) return "";
    let result = String(text);
    const vars = {
      ...this.variables,
      loop_index: String(this.loopIndex),
      loop_count: String(this.loopCount),
    };
    for (const [key, value] of Object.entries(vars)) {
      result = result.replace(new RegExp(`\\{${key}\\}`, "g"), String(value));
    }
    return result;
  }

  resolveUrl(routeOrUrl: string): string {
    const resolved = this.resolve(routeOrUrl);
    if (resolved.startsWith("http")) return resolved;
    const path = resolved.startsWith("/") ? resolved : `/${resolved}`;
    return `${this.config.baseUrl.replace(/\/$/, "")}${path}`;
  }

  logInfo(message: string): void {
    this.logger.info(this.logName, message);
  }

  logWarn(message: string): void {
    this.logger.warn(this.logName, message);
  }

  logError(message: string): void {
    this.logger.error(this.logName, message);
  }

  getDefaultTimeout(stepTimeout?: number): number {
    return stepTimeout ?? this.config.test.defaultStepTimeout;
  }

  getReadyTimeout(stepTimeout?: number): number {
    return stepTimeout ?? this.config.test.defaultReadyTimeout;
  }

  getDefaultDelay(stepDelay?: number): number {
    return stepDelay ?? this.config.test.defaultStepDelay;
  }

  /** 循环前缀，count=1 时为空 */
  loopLabel(): string {
    if (this.loopCount <= 1) return "";
    return `[loop ${this.loopIndex}/${this.loopCount}] `;
  }
}

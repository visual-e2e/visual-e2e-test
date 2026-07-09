import { appendFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

export class RunLogger {
  constructor(
    private logDir: string,
    private consoleOutput: boolean,
  ) {
    mkdirSync(logDir, { recursive: true });
  }

  log(name: string, level: string, message: string): void {
    const line = `${new Date().toISOString()} [${level}] ${message}`;
    appendFileSync(join(this.logDir, `${name}.log`), line + "\n", "utf-8");
    if (this.consoleOutput) {
      console.log(line);
    }
  }

  info(name: string, message: string): void {
    this.log(name, "INFO", message);
  }

  warn(name: string, message: string): void {
    this.log(name, "WARN", message);
  }

  error(name: string, message: string): void {
    this.log(name, "ERROR", message);
  }
}

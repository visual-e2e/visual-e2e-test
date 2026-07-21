import { mkdirSync } from "node:fs";
import { join } from "node:path";

export class RunSession {
  readonly runId: string;
  /** 本次运行根目录，如 projects/{id}/runs/20260707140136 */
  readonly runDir: string;
  readonly logDir: string;
  readonly screenshotDir: string;
  readonly videoDir: string;
  readonly logFile: string;
  readonly reportFile: string;

  constructor(baseDir: string, logsDir: string, videosDir: string) {
    const envRunId = process.env.RUN_ID?.trim();
    const envRunDir = process.env.RUN_DIR?.trim();
    if (envRunId && envRunDir && /^\d{14}$/.test(envRunId)) {
      this.runId = envRunId;
      this.runDir = envRunDir;
    } else {
      this.runId = formatRunId(new Date());
      this.runDir = join(baseDir, this.runId);
    }
    this.logDir = join(this.runDir, logsDir);
    this.screenshotDir = join(this.runDir, "screenshots");
    this.videoDir = join(this.runDir, videosDir);
    this.logFile = join(this.logDir, "run.log");
    this.reportFile = join(this.runDir, "report.html");
    mkdirSync(this.logDir, { recursive: true });
    mkdirSync(this.screenshotDir, { recursive: true });
    mkdirSync(this.videoDir, { recursive: true });
  }
}

function formatRunId(d: Date): string {
  const p = (n: number, len = 2) => String(n).padStart(len, "0");
  return (
    `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}` +
    `${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`
  );
}

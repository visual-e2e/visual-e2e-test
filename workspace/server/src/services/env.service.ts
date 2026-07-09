import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { checkProjectEnv } from "../project-context.js";

const REQUIRED_KEYS = ["BASE_URL", "USERNAME", "PASSWORD"];
const PASSWORD_MASK = "******";
const PASSWORD_MASK_RE = /^PASSWORD=\*{6}$/m;

export class EnvService {
  constructor(
    private readonly e2eRoot: string,
    private readonly project: ProjectContext,
  ) {}

  private envPath(): string {
    return this.project.envPath;
  }

  private examplePath(): string {
    const projectExample = join(this.project.root, ".env.example");
    if (existsSync(projectExample)) return projectExample;
    return join(this.e2eRoot, ".env.example");
  }

  check(): { ok: boolean; missing: string[] } {
    return checkProjectEnv(this.envPath());
  }

  validate(content: string): { ok: boolean; missing: string[] } {
    const missing: string[] = [];
    for (const key of REQUIRED_KEYS) {
      if (!content.match(new RegExp(`^${key}=.+`, "m"))) missing.push(key);
    }
    return { ok: missing.length === 0, missing };
  }

  getEnv(): { exists: boolean; content: string; template: string; path: string } {
    const template = existsSync(this.examplePath()) ? readFileSync(this.examplePath(), "utf-8") : "";
    const exists = existsSync(this.envPath());
    const raw = exists ? readFileSync(this.envPath(), "utf-8") : template;
    return {
      exists,
      content: this.maskSecrets(raw),
      template,
      path: `projects/${this.project.id}/.env`,
    };
  }

  saveEnv(content: string): { ok: boolean; missing: string[] } {
    const merged = this.mergeSecrets(content);
    const result = this.validate(merged);
    if (!result.ok) return result;

    const normalized = merged.endsWith("\n") ? merged : `${merged}\n`;
    writeFileSync(this.envPath(), normalized, "utf-8");
    return { ok: true, missing: [] };
  }

  private maskSecrets(content: string): string {
    return content.replace(/^PASSWORD=.*$/m, `PASSWORD=${PASSWORD_MASK}`);
  }

  private mergeSecrets(content: string): string {
    if (!PASSWORD_MASK_RE.test(content)) return content;
    if (!existsSync(this.envPath())) {
      return content.replace(PASSWORD_MASK_RE, "PASSWORD=");
    }
    const old = readFileSync(this.envPath(), "utf-8");
    const match = old.match(/^PASSWORD=(.*)$/m);
    if (!match?.[1]) {
      return content.replace(PASSWORD_MASK_RE, "PASSWORD=");
    }
    return content.replace(PASSWORD_MASK_RE, `PASSWORD=${match[1]}`);
  }
}

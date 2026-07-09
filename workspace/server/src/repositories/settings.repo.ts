import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { WorkspaceConfig } from "../config.js";
import { settingsSchema, type SettingsDefinition } from "../schemas/settings.schema.js";

export class SettingsRepository {
  private readonly path: string;

  constructor(config: WorkspaceConfig) {
    this.path = join(config.e2eRoot, "config", "settings.json");
  }

  read(): SettingsDefinition {
    if (!existsSync(this.path)) {
      throw new Error("config/settings.json 不存在");
    }
    const raw = JSON.parse(readFileSync(this.path, "utf-8"));
    return settingsSchema.parse(raw);
  }

  write(data: unknown): SettingsDefinition {
    const parsed = settingsSchema.parse(data);
    writeFileSync(this.path, `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
    return parsed;
  }
}

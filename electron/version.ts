import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { app } from "electron";
import { repoRoot } from "./paths.js";

export function getAppVersion(): string {
  try {
    const versionPath = join(repoRoot(), "version.js");
    if (existsSync(versionPath)) {
      const content = readFileSync(versionPath, "utf-8");
      const match = content.match(/VERSION\s*=\s*["']([^"']+)["']/);
      if (match) return match[1];
    }
  } catch {
    // packaged app may not ship version.js at repo root
  }
  return app.getVersion();
}

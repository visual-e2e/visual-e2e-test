import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, join, relative } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { resolveWithin } from "../utils/path-security.js";

export interface ProfileSummary {
  module: string;
  file: string;
  title: string;
  id?: string;
  converted?: boolean;
}

export class ProfileRepository {
  constructor(private readonly project: ProjectContext) {}

  listModules(): string[] {
    if (!existsSync(this.project.profilesDir)) return [];
    return readdirSync(this.project.profilesDir, { withFileTypes: true })
      .filter((e) => e.isDirectory())
      .map((e) => e.name)
      .sort();
  }

  listProfiles(module?: string): ProfileSummary[] {
    const modules = module ? [module] : this.listModules();
    const results: ProfileSummary[] = [];

    for (const mod of modules) {
      const dir = join(this.project.profilesDir, mod);
      if (!existsSync(dir)) continue;
      this.walkMd(dir, mod, results);
    }
    return results;
  }

  readProfile(module: string, filePath: string): string {
    const abs = resolveWithin(join(this.project.profilesDir, module), filePath);
    if (!abs.endsWith(".md") || !existsSync(abs)) {
      throw new Error(`画像不存在: ${module}/${filePath}`);
    }
    return readFileSync(abs, "utf-8");
  }

  writeProfile(module: string, filePath: string, content: string): void {
    const abs = resolveWithin(join(this.project.profilesDir, module), filePath);
    if (!abs.endsWith(".md")) throw new Error("画像须为 .md 文件");
    writeFileSync(abs, content, "utf-8");
  }

  deleteProfile(module: string, filePath: string): void {
    const abs = resolveWithin(join(this.project.profilesDir, module), filePath);
    if (!abs.endsWith(".md") || !existsSync(abs)) {
      throw new Error(`画像不存在: ${module}/${filePath}`);
    }
    unlinkSync(abs);
  }

  private walkMd(dir: string, module: string, out: ProfileSummary[]): void {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const abs = join(dir, entry.name);
      if (entry.isDirectory()) {
        this.walkMd(abs, module, out);
      } else if (entry.name.endsWith(".md") && entry.name !== "README.md") {
        const rel = relative(join(this.project.profilesDir, module), abs).replace(/\\/g, "/");
        const content = readFileSync(abs, "utf-8");
        const { frontmatter, title } = parseProfileMeta(content);
        out.push({
          module,
          file: rel,
          title: title ?? basename(entry.name, ".md"),
          id: frontmatter.id as string | undefined,
          converted: frontmatter.converted === true,
        });
      }
    }
  }
}

function parseProfileMeta(content: string): { frontmatter: Record<string, unknown>; title?: string } {
  let frontmatter: Record<string, unknown> = {};
  let body = content;
  if (content.startsWith("---\n")) {
    const end = content.indexOf("\n---", 4);
    if (end !== -1) {
      const yaml = content.slice(4, end);
      frontmatter = parseSimpleYaml(yaml);
      body = content.slice(end + 4);
    }
  }
  const titleMatch = body.match(/^#\s+(.+)$/m);
  return { frontmatter, title: titleMatch?.[1]?.trim() };
}

function parseSimpleYaml(yaml: string): Record<string, unknown> {
  const data: Record<string, unknown> = {};
  for (const line of yaml.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const m = trimmed.match(/^([\w]+):\s*(.*)$/);
    if (!m) continue;
    const raw = m[2].trim();
    if (raw === "true") data[m[1]] = true;
    else if (raw === "false") data[m[1]] = false;
    else if ((raw.startsWith('"') && raw.endsWith('"')) || (raw.startsWith("'") && raw.endsWith("'"))) {
      data[m[1]] = raw.slice(1, -1);
    } else data[m[1]] = raw;
  }
  return data;
}

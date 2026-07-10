import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { ProfileRepository } from "../repositories/profile.repo.js";
import { ScenarioRepository } from "../repositories/scenario.repo.js";
import { loadProfileConverter } from "../adapters/profile-converter.js";
import { isExtendsScenario, scenarioWriteSchema } from "../schemas/scenario.schema.js";
import type { Step } from "../schemas/step.schema.js";

export class ProfileService {
  private profileRepo: ProfileRepository;

  constructor(private readonly project: ProjectContext) {
    this.profileRepo = new ProfileRepository(project);
  }

  async parseToScenario(module: string, file: string): Promise<Record<string, unknown>> {
    const abs = join(this.project.profilesDir, module, file);
    const mod = await loadProfileConverter();
    const loaded = mod.loadScenarioFromMd(abs);
    if (!loaded) throw new Error("解析失败：无步骤表");
    const built = mod.buildScenario(loaded.scenario as Record<string, unknown>, module);
    return built;
  }

  saveContent(module: string, file: string, content: string): void {
    this.profileRepo.writeProfile(module, file, content);
  }

  async syncToJson(module: string, scenarioName?: string, force = false): Promise<void> {
    const mod = await loadProfileConverter();
    const prev = process.env.ACTIVE_PROJECT;
    process.env.ACTIVE_PROJECT = this.project.id;
    try {
      mod.convertModule(module, { force }, scenarioName);
    } finally {
      if (prev === undefined) delete process.env.ACTIVE_PROJECT;
      else process.env.ACTIVE_PROJECT = prev;
    }
  }

  async syncFromScenario(
    module: string,
    profileFile: string,
    scenarioRaw: unknown,
  ): Promise<void> {
    const scenario = scenarioWriteSchema.parse(scenarioRaw);
    const content = scenarioToMarkdown(scenario, profileFile);
    this.profileRepo.writeProfile(module, profileFile, content);
  }

  getStatus(module: string, file: string): {
    converted: boolean;
    jsonPath: string | null;
    jsonExists: boolean;
    diverged: boolean;
  } {
    const content = this.profileRepo.readProfile(module, file);
    const { frontmatter } = parseFrontmatter(content);
    const id = frontmatter.id as string | undefined;
    let jsonPath: string | null = null;
    let jsonExists = false;
    let diverged = false;

    if (id) {
      const candidates = [
        `${id}.json`,
        file.replace(/\.md$/, "").includes("/")
          ? `${file.replace(/\.md$/, "").split("/").slice(0, -1).join("/")}/${id}.json`
          : null,
      ].filter(Boolean) as string[];

      for (const c of candidates) {
        const abs = join(this.project.scenariosDir, module, c);
        if (existsSync(abs)) {
          jsonPath = c;
          jsonExists = true;
          break;
        }
      }

      if (!jsonPath) {
        const manifestPath = join(this.project.scenariosDir, module, "manifest.json");
        if (existsSync(manifestPath)) {
          const manifest = JSON.parse(readFileSync(manifestPath, "utf-8")) as { scenarios: string[] };
          const found = manifest.scenarios.find((s) => s.endsWith(`${id}.json`));
          if (found) {
            jsonPath = found;
            jsonExists = existsSync(join(this.project.scenariosDir, module, found));
          }
        }
      }
    }

    return {
      converted: frontmatter.converted === true,
      jsonPath,
      jsonExists,
      diverged,
    };
  }

  deleteProfile(module: string, file: string): { deletedScenario: string | null } {
    const status = this.getStatus(module, file);
    this.profileRepo.deleteProfile(module, file);

    if (status.jsonExists && status.jsonPath) {
      new ScenarioRepository(this.project).deleteScenario(module, status.jsonPath);
      return { deletedScenario: status.jsonPath };
    }
    return { deletedScenario: null };
  }
}

function parseFrontmatter(content: string): { frontmatter: Record<string, unknown>; body: string } {
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
  return { frontmatter, body };
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

function scenarioToMarkdown(
  scenario: ReturnType<typeof scenarioWriteSchema.parse>,
  _profileFile: string,
): string {
  const fm: Record<string, unknown> = {
    id: scenario.id,
    name: scenario.name,
    module: scenario.module,
    requiresLogin: scenario.setup?.requiresLogin ?? true,
    entryRoute: scenario.setup?.entryRoute ?? "",
    enabled: scenario.enabled !== false,
    converted: false,
  };
  const lines = [
    "---",
    ...Object.entries(fm).map(([k, v]) => `${k}: ${formatYaml(v)}`),
    "---",
    "",
    `# ${scenario.name}`,
    "",
  ];

  if (isExtendsScenario(scenario)) {
    lines.push(`> extends: \`${scenario.extends}\` | params: ${JSON.stringify(scenario.params ?? {})}`);
    lines.push("");
  } else {
    lines.push(
      "| 步骤 | 操作类型 | 操作 | Selector / 定位 | 值 | 就绪选择器 | 验证文案 |",
      "|------|----------|------|-----------------|-----|------------|----------|",
    );
    for (const [i, step] of scenario.steps.entries()) {
      lines.push(stepToTableRow(i + 1, step));
    }
  }
  return lines.join("\n") + "\n";
}

function formatYaml(v: unknown): string {
  if (v === true) return "true";
  if (v === false) return "false";
  const s = String(v ?? "");
  if (s === "") return '""';
  if (/[:#\n"]/.test(s) || s.includes("{")) return `"${s.replace(/"/g, '\\"')}"`;
  return s;
}

function stepToTableRow(index: number, step: Step): string {
  const ready = step.params?.readySelectors
    ? (step.params.readySelectors as string[]).join(", ")
    : "—";
  if (step.type === "verify") {
    const v = step as Step & { verifyValue?: string; expectValue?: string; matchRule?: string };
    const expect = v.expectValue ? `**${v.expectValue}** (${v.matchRule ?? "contains"})` : "—";
    return `| ${index} | verify | ${step.desc} | ${v.verifyValue ?? "—"} | — | — | ${expect} |`;
  }
  if (step.type === "macro") {
    const params = Object.entries(step.params ?? {}).map(([k, val]) => `${k}=${val}`).join("; ");
    return `| ${index} | macro | ${step.desc} | ${step.value ?? ""} | ${params || "—"} | — | — |`;
  }
  if (step.type === "link") {
    return `| ${index} | link | ${step.desc} | — | ${step.url ?? "—"} | ${ready} | — |`;
  }
  if (step.type === "ready") {
    return `| ${index} | ready | ${step.desc} | ${step.selector || "—"} | — | ${ready} | — |`;
  }
  if (step.type === "wait") {
    return `| ${index} | wait | ${step.desc} | — | ${step.value ?? "—"} | — | — |`;
  }
  return `| ${index} | ${step.type} | ${step.desc} | ${step.selector || "—"} | ${step.value ?? "—"} | ${ready} | — |`;
}

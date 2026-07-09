import { existsSync, readdirSync, readFileSync, unlinkSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import type { ProjectContext } from "../project-context.js";
import { macroSchema, ruleSchema, variablesSchema } from "../schemas/fixture.schema.js";

function normalizeSteps(steps: unknown): unknown[] {
  if (!Array.isArray(steps)) return [];
  return steps.map((step, index) => {
    if (typeof step !== "object" || step === null) return step;
    const raw = step as Record<string, unknown>;
    return raw.stepId ? raw : { ...raw, stepId: `s${index + 1}` };
  });
}

function normalizeFixture(raw: Record<string, unknown>): Record<string, unknown> {
  return { ...raw, steps: normalizeSteps(raw.steps) };
}

export class FixtureRepository {
  constructor(private readonly project: ProjectContext) {}

  readVariables(): Record<string, Record<string, string>> {
    const path = join(this.project.fixturesDir, "variables.json");
    if (!existsSync(path)) return {};
    return variablesSchema.parse(JSON.parse(readFileSync(path, "utf-8")));
  }

  writeVariables(data: Record<string, Record<string, string>>): void {
    const parsed = variablesSchema.parse(data);
    writeFileSync(
      join(this.project.fixturesDir, "variables.json"),
      `${JSON.stringify(parsed, null, 2)}\n`,
      "utf-8",
    );
  }

  listMacros(): string[] {
    return this.listMacroSummaries().map((m) => m.id);
  }

  listMacroSummaries(): Array<{ id: string; description?: string; stepCount: number }> {
    const dir = join(this.project.fixturesDir, "macros");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .map((id) => this.readMacroSummary(id));
  }

  private readMacroSummary(id: string): { id: string; description?: string; stepCount: number } {
    const raw = JSON.parse(readFileSync(join(this.project.fixturesDir, "macros", `${id}.json`), "utf-8")) as {
      description?: string;
      steps?: unknown[];
    };
    return { id, description: raw.description, stepCount: raw.steps?.length ?? 0 };
  }

  readMacro(id: string): unknown {
    const path = join(this.project.fixturesDir, "macros", `${id}.json`);
    if (!existsSync(path)) throw new Error(`宏不存在: ${id}`);
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    return macroSchema.parse(normalizeFixture(raw));
  }

  writeMacro(id: string, data: unknown): void {
    const parsed = macroSchema.parse({ ...(data as object), id });
    const dir = join(this.project.fixturesDir, "macros");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  }

  deleteMacro(id: string): void {
    const path = join(this.project.fixturesDir, "macros", `${id}.json`);
    if (!existsSync(path)) throw new Error(`宏不存在: ${id}`);
    unlinkSync(path);
  }

  listRules(): string[] {
    return this.listRuleSummaries().map((r) => r.id);
  }

  listRuleSummaries(): Array<{ id: string; description?: string; stepCount: number }> {
    const dir = join(this.project.fixturesDir, "rules");
    if (!existsSync(dir)) return [];
    return readdirSync(dir)
      .filter((f) => f.endsWith(".json"))
      .map((f) => f.replace(/\.json$/, ""))
      .sort()
      .map((id) => this.readRuleSummary(id));
  }

  private readRuleSummary(id: string): { id: string; description?: string; stepCount: number } {
    const raw = JSON.parse(readFileSync(join(this.project.fixturesDir, "rules", `${id}.json`), "utf-8")) as {
      description?: string;
      steps?: unknown[];
    };
    return { id, description: raw.description, stepCount: raw.steps?.length ?? 0 };
  }

  readRule(id: string): unknown {
    const path = join(this.project.fixturesDir, "rules", `${id}.json`);
    if (!existsSync(path)) throw new Error(`规则不存在: ${id}`);
    const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;
    return ruleSchema.parse(normalizeFixture(raw));
  }

  writeRule(id: string, data: unknown): void {
    const parsed = ruleSchema.parse({ ...(data as object), id });
    const dir = join(this.project.fixturesDir, "rules");
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${id}.json`), `${JSON.stringify(parsed, null, 2)}\n`, "utf-8");
  }

  deleteRule(id: string): void {
    const path = join(this.project.fixturesDir, "rules", `${id}.json`);
    if (!existsSync(path)) throw new Error(`规则不存在: ${id}`);
    unlinkSync(path);
  }
}

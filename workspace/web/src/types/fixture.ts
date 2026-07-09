import type { StepDraft } from "./scenario";

export interface FixtureParams {
  [key: string]: { required?: boolean };
}

export interface FixtureParamRow {
  name: string;
  required: boolean;
}

export function paramsToRows(params: FixtureParams): FixtureParamRow[] {
  return Object.entries(params).map(([name, meta]) => ({
    name,
    required: meta.required ?? false,
  }));
}

export function rowsToParams(rows: FixtureParamRow[]): FixtureParams {
  const out: FixtureParams = {};
  for (const row of rows) {
    const name = row.name.trim();
    if (!name) continue;
    out[name] = row.required ? { required: true } : {};
  }
  return out;
}

export function suggestParamName(existing: FixtureParams | FixtureParamRow[]): string {
  const names = new Set(
    Array.isArray(existing)
      ? existing.map((r) => r.name.trim()).filter(Boolean)
      : Object.keys(existing),
  );
  let i = 1;
  while (names.has(`param${i}`)) i += 1;
  return `param${i}`;
}

export interface MacroDraft {
  id: string;
  description: string;
  params: FixtureParams;
  steps: StepDraft[];
}

export type RuleDraft = MacroDraft;

export function emptyMacro(id = ""): MacroDraft {
  return {
    id,
    description: "",
    params: {},
    steps: [],
  };
}

export function emptyRule(id = ""): RuleDraft {
  return { ...emptyMacro(id) };
}

export function rawToMacroDraft(raw: Record<string, unknown>): MacroDraft {
  return {
    id: String(raw.id ?? ""),
    description: String(raw.description ?? ""),
    params: (raw.params as FixtureParams) ?? {},
    steps: (raw.steps as StepDraft[]) ?? [],
  };
}

export function rawToRuleDraft(raw: Record<string, unknown>): RuleDraft {
  return rawToMacroDraft(raw);
}

export function macroDraftToRaw(draft: MacroDraft): Record<string, unknown> {
  const base: Record<string, unknown> = {
    id: draft.id,
    description: draft.description || undefined,
    params: Object.keys(draft.params).length ? draft.params : undefined,
    steps: draft.steps,
  };
  return Object.fromEntries(Object.entries(base).filter(([, v]) => v !== undefined));
}

export function ruleDraftToRaw(draft: RuleDraft): Record<string, unknown> {
  return macroDraftToRaw(draft);
}

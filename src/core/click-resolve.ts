import type { RunContext } from "../engine/run-context.js";
import type { Step } from "../types/step.types.js";

const OPTIONAL_PROBE_MS = 2000;

export function resolveClickSelectors(ctx: RunContext, step: Step): string[] {
  const rawAny = step.params?.clickAny;
  if (Array.isArray(rawAny) && rawAny.length > 0) {
    return rawAny.map((s) => ctx.resolve(String(s)).trim()).filter(Boolean);
  }
  const sel = (step.selector ?? "").trim();
  return sel ? [ctx.resolve(sel)] : [];
}

export function isOptionalClick(step: Step): boolean {
  return step.params?.optional === true;
}

export async function clickFirstMatch(ctx: RunContext, step: Step): Promise<void> {
  const selectors = resolveClickSelectors(ctx, step);
  if (!selectors.length) {
    throw new Error("click 步骤缺少 selector 或 params.clickAny");
  }

  const optional = isOptionalClick(step);
  const timeout = ctx.getDefaultTimeout(step.timeOut);
  const probeMs = optional ? OPTIONAL_PROBE_MS : Math.max(1000, Math.floor(timeout / selectors.length));

  for (let i = 0; i < selectors.length; i++) {
    const sel = selectors[i];
    const isLast = i === selectors.length - 1;
    const waitMs = optional || !isLast ? probeMs : timeout;

    const loc = ctx.page.locator(sel).first();
    try {
      await loc.waitFor({ state: "visible", timeout: waitMs });
      ctx.logInfo(`点击: ${sel}`);
      await loc.click({ timeout });
      return;
    } catch {
      if (!optional && isLast) {
        throw new Error(`未找到可点击元素: ${selectors.join(" | ")}`);
      }
    }
  }

  if (optional) {
    ctx.logInfo(`可选点击跳过: 无匹配元素 (${selectors.join(" | ")})`);
    return;
  }

  throw new Error(`未找到可点击元素: ${selectors.join(" | ")}`);
}

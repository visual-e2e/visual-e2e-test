import type { RunContext } from "../engine/run-context.js";
import type { Step } from "../types/step.types.js";
import { StepType } from "../types/step-type.enum.js";

type PageLoadState = "load" | "domcontentloaded" | "networkidle";
type NavigationWaitUntil = PageLoadState | "commit";

const LOAD_STATES = new Set<string>(["load", "domcontentloaded", "networkidle"]);

/** 不自动合并 step.selector 的步骤类型（仅用 params.readySelectors） */
const SKIP_SELECTOR_DEFAULT = new Set<StepType>([
  StepType.Link,
  StepType.Ready,
  StepType.Wait,
  StepType.Log,
]);

function skipAutoSelectorWait(step: Step): boolean {
  if (SKIP_SELECTOR_DEFAULT.has(step.type)) return true;
  if (step.params?.optional === true) return true;
  if (Array.isArray(step.params?.clickAny) && step.params.clickAny.length > 0) return true;
  return false;
}

function navigationTimeout(ctx: RunContext, step: Step): number {
  return Math.max(ctx.getDefaultTimeout(step.timeOut), ctx.config.browser.timeout);
}

function resolveLoadState(step: Step): PageLoadState {
  const raw = step.params?.loadState;
  if (typeof raw === "string" && LOAD_STATES.has(raw)) {
    return raw as PageLoadState;
  }
  return "load";
}

function resolveWaitUntil(step: Step, fallback: string): NavigationWaitUntil {
  const raw = step.params?.waitUntil;
  if (typeof raw === "string" && (LOAD_STATES.has(raw) || raw === "commit")) {
    return raw as NavigationWaitUntil;
  }
  return fallback as NavigationWaitUntil;
}

/**
 * 解析就绪选择器（AND）：
 * - 有 selector 的步骤（click/input 等）默认先等待 selector 可见
 * - params.readySelectors 追加额外条件（可只配「除自身外」还需等待的元素）
 */
export function resolveReadySelectors(ctx: RunContext, step: Step): string[] {
  const merged: string[] = [];

  if (!skipAutoSelectorWait(step)) {
    const sel = step.selector?.trim();
    if (sel) merged.push(ctx.resolve(sel));
  }

  const raw = step.params?.readySelectors;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const resolved = ctx.resolve(String(item)).trim();
      if (resolved && !merged.includes(resolved)) {
        merged.push(resolved);
      }
    }
  }

  return merged;
}

/** 是否存在就绪等待条件 */
export function hasReadyConditions(ctx: RunContext, step: Step): boolean {
  return resolveReadySelectors(ctx, step).length > 0;
}

/** 等待就绪条件（全部 selector 可见） */
export async function waitForReady(ctx: RunContext, step: Step): Promise<void> {
  const selectors = resolveReadySelectors(ctx, step);
  if (selectors.length === 0) return;

  const timeout = ctx.getReadyTimeout(step.timeOut);
  const state = (step.params?.state as "visible" | "attached" | "hidden") ?? "visible";

  ctx.logInfo(`等待就绪: ${selectors.join(" && ")}（最多 ${timeout}ms）`);
  await Promise.all(
    selectors.map((sel) => ctx.page.locator(sel).first().waitFor({ state, timeout })),
  );
  ctx.logInfo(`已就绪: ${selectors.join(" && ")}`);
}

/** setup.readySelectors：导航/刷新后等待（支持 {变量}） */
export async function waitForSetupReady(
  ctx: RunContext,
  selectors: string[],
  stepTimeout?: number,
): Promise<void> {
  const resolved = selectors
    .map((item) => ctx.resolve(item).trim())
    .filter((sel) => sel.length > 0);
  if (resolved.length === 0) return;

  const timeout = ctx.getReadyTimeout(stepTimeout);
  ctx.logInfo(`等待就绪: ${resolved.join(" && ")}（最多 ${timeout}ms）`);
  await Promise.all(
    resolved.map((sel) => ctx.page.locator(sel).first().waitFor({ state: "visible", timeout })),
  );
  ctx.logInfo(`已就绪: ${resolved.join(" && ")}`);
}

/** 打开链接并等待页面 / 异步内容就绪 */
export async function navigateAndWait(ctx: RunContext, step: Step, url: string): Promise<void> {
  const timeout = navigationTimeout(ctx, step);
  const waitUntil = resolveWaitUntil(step, ctx.config.browser.navigationWaitUntil);

  ctx.logInfo(`打开链接: ${url}`);
  await ctx.page.goto(url, { waitUntil, timeout });

  const loadState = resolveLoadState(step);
  ctx.logInfo(`等待页面状态: ${loadState}`);
  await ctx.page.waitForLoadState(loadState, { timeout }).catch(() => {
    ctx.logWarn(`页面未在 ${timeout}ms 内达到 ${loadState}，继续等待就绪条件`);
  });

  await waitForReady(ctx, step);
}

/** 非导航步骤执行前等待就绪条件 */
export async function waitBeforeStep(ctx: RunContext, step: Step): Promise<void> {
  await waitForReady(ctx, step);
}

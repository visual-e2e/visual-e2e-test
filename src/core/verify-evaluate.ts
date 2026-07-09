import { MatchRule } from "../types/match-rule.enum.js";
import type { VerifyStep } from "../types/step.types.js";
import type { RunContext } from "../engine/run-context.js";
import { captureStepScreenshot, shouldScreenshotOnVerifyPass } from "../core/screenshot.js";

export interface EvaluateVerifyOptions {
  /**
   * 即时检查当前 DOM 状态，不等待元素出现/消失。
   * 带 branch 的 verify 默认等待；仅 params.instantVerify=true 时启用即时检查。
   */
  instant?: boolean;
}

/** 带 branch 的 verify 是否使用即时检查（默认 false；显式 instantVerify=true 时启用） */
export function isBranchVerifyInstant(step: VerifyStep): boolean {
  return step.params?.instantVerify === true;
}

/** 执行验证逻辑，返回是否通过（不抛错，供 branch 路由使用） */
export async function evaluateVerify(
  ctx: RunContext,
  step: VerifyStep,
  options: EvaluateVerifyOptions = {},
): Promise<boolean> {
  const expectValue = ctx.resolve(step.expectValue);
  const rule = step.matchRule;
  const timeout = ctx.getDefaultTimeout(step.timeOut);
  const instant = options.instant === true;

  try {
    switch (rule) {
      case MatchRule.Visible: {
        const sel = ctx.resolve(step.selector || step.verifyValue || "");
        if (!sel) return false;
        if (instant) {
          return ctx.page.locator(sel).first().isVisible();
        }
        await ctx.page.waitForSelector(sel, { state: "visible", timeout });
        return true;
      }
      case MatchRule.Hidden: {
        const sel = ctx.resolve(step.selector || step.verifyValue || "");
        if (!sel) return false;
        if (instant) {
          const loc = ctx.page.locator(sel).first();
          if ((await loc.count()) === 0) return true;
          return !(await loc.isVisible());
        }
        await ctx.page.waitForSelector(sel, { state: "hidden", timeout });
        return true;
      }
      case MatchRule.UrlContains: {
        if (!expectValue) return false;
        return ctx.page.url().includes(expectValue);
      }
      default: {
        if (!expectValue) return false;
        const actual = await readActual(ctx, step, timeout);
        return matchesRule(actual, expectValue, rule);
      }
    }
  } catch {
    return false;
  }
}

export async function captureVerifyPassScreenshot(
  ctx: RunContext,
  step: VerifyStep,
): Promise<string | undefined> {
  if (!shouldScreenshotOnVerifyPass(step)) return undefined;
  return captureStepScreenshot(ctx, step, "PASS");
}

async function readActual(ctx: RunContext, step: VerifyStep, timeout: number): Promise<string> {
  const source = step.verifyValue || step.selector || "body";
  if (source === "url") return ctx.page.url();
  if (source === "title") return await ctx.page.title();

  const sel = ctx.resolve(source);
  const loc = sel === "body" ? ctx.page.locator("body") : ctx.page.locator(sel).first();
  const readAs = step.params?.readAs as string | undefined;

  if (readAs === "inputValue") {
    return (await loc.inputValue({ timeout })).trim();
  }
  if (readAs === "innerText") {
    return (await loc.innerText({ timeout })).trim();
  }
  if (readAs === "text") {
    return (await loc.textContent({ timeout }) ?? "").trim();
  }

  const tag = await loc.evaluate((el) => el.tagName.toLowerCase()).catch(() => "");
  if (tag === "input" || tag === "textarea" || tag === "select") {
    return (await loc.inputValue({ timeout })).trim();
  }

  return (await loc.textContent({ timeout }) ?? "").trim();
}

function matchesRule(actual: string, expectValue: string, rule: MatchRule): boolean {
  switch (rule) {
    case MatchRule.Equals:
      return actual === expectValue;
    case MatchRule.Contains:
      return actual.includes(expectValue);
    case MatchRule.Regex:
      return new RegExp(expectValue).test(actual);
    default:
      return false;
  }
}

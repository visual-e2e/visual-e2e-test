import type { Page } from "playwright";
import type { AppConfig } from "./config.js";

/** 一次测试运行内的登录状态，避免每个场景重复跳转登录页 */
export class RunAuthState {
  authenticated = false;
}

export async function ensureLoggedIn(
  page: Page,
  config: AppConfig,
  authState: RunAuthState,
  log?: (msg: string) => void,
): Promise<void> {
  if (authState.authenticated) {
    log?.("复用登录会话");
    return;
  }

  // 本次运行尚未确认登录时直接登录，避免「非登录页即已登录」误判跳过
  log?.("登录...");
  await login(page, config);
  authState.authenticated = true;
}

export async function login(page: Page, config: AppConfig): Promise<void> {
  const loginPath = config.login.path.replace(/^\//, "");
  const url = `${config.baseUrl.replace(/\/$/, "")}${config.login.path}`;
  await page.goto(url, {
    waitUntil: config.browser.navigationWaitUntil,
    timeout: config.browser.timeout,
  });
  await page.waitForLoadState("load", { timeout: config.browser.timeout }).catch(() => {});
  await page
    .locator(config.login.usernameSelector)
    .first()
    .waitFor({ state: "visible", timeout: config.browser.actionTimeout });

  await page.fill(config.login.usernameSelector, config.username);
  await page.fill(config.login.passwordSelector, config.password);

  // 等登录跳转完成后再返回，避免随后 entryRoute 的 goto 与未完成导航冲突（net::ERR_ABORTED）
  await Promise.all([
    page.waitForURL(
      (u) => {
        const href = u.toString();
        return !href.includes(loginPath) && !href.includes("signin");
      },
      { timeout: config.browser.timeout },
    ),
    page.click(config.login.submitSelector),
  ]);
  await page.waitForLoadState("load", { timeout: config.browser.timeout }).catch(() => {});
}

export async function navigateTo(page: Page, config: AppConfig, route: string): Promise<void> {
  const path = route.startsWith("/") ? route : `/${route}`;
  const url = route.startsWith("http") ? route : `${config.baseUrl.replace(/\/$/, "")}${path}`;
  await page.goto(url, {
    waitUntil: config.browser.navigationWaitUntil,
    timeout: config.browser.timeout,
  });
  await page.waitForLoadState("load", { timeout: config.browser.timeout }).catch(() => {});
}

/** 刷新当前页面（保留地址栏 URL，适用于项目详情等含动态 id 的路由） */
export async function reloadPage(page: Page, config: AppConfig): Promise<void> {
  await page.reload({
    waitUntil: config.browser.navigationWaitUntil,
    timeout: config.browser.timeout,
  });
  await page.waitForLoadState("load", { timeout: config.browser.timeout }).catch(() => {});
}

/** login 模块场景通过后，标记后续场景可复用会话 */
export function markAuthenticatedFromLoginScenario(authState: RunAuthState, module: string, status: string): void {
  if (module === "login" && status === "PASSED") {
    authState.authenticated = true;
  }
}

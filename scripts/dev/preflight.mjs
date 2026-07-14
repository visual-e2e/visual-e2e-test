import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { PORTS, REPO_ROOT } from "./env.mjs";
import { currentNodePlatform } from "../pack/platform.mjs";

export async function fetchHealth(port, timeoutMs = 2000) {
  try {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const res = await fetch(`http://127.0.0.1:${port}/api/health`, { signal: ctrl.signal });
    clearTimeout(timer);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export async function preflightWorkspace() {
  const health = await fetchHealth(PORTS.workspace);
  if (!health) return;

  if (health.runtime === "client" || health.e2eRoot?.includes(".app")) {
    console.error(
      `[workspace] Port ${PORTS.workspace} is serving client runtime (${health.e2eRoot}).`,
    );
    console.error("Quit Visual E2E Test.app or stop the process on this port, then retry.");
    process.exit(1);
  }

  console.warn(`[workspace] Port ${PORTS.workspace} already has a workspace server.`);
}

function chromiumReady(platformDir) {
  if (!existsSync(platformDir)) return false;
  return readdirSync(platformDir).some((name) => name.startsWith("chromium-"));
}

function requirePlaywrightBrowsers() {
  const key = currentNodePlatform();
  const dir = join(REPO_ROOT, "playwright-browsers", key);
  if (chromiumReady(dir)) return;

  console.error(`[electron:dev] Missing Playwright Chromium: ${dir}`);
  console.error(`Run: npm run download:chromium -- ${key}`);
  console.error("Or all platforms: npm run download:chromium -- all");
  process.exit(1);
}

export async function preflightClientDev() {
  requirePlaywrightBrowsers();

  const health = await fetchHealth(PORTS.clientDev);
  if (!health) return;

  if (health.runtime === "workspace") {
    console.error(
      `[electron:dev] Port ${PORTS.clientDev} is workspace server. Stop npm run workspace first.`,
    );
    process.exit(1);
  }

  if (health.e2eRoot?.includes(".app")) {
    console.error(
      `[electron:dev] Port ${PORTS.clientDev} is used by an older .app build (before :6100).`,
    );
    console.error("Quit the old .app or install a build that uses port 6100.");
    process.exit(1);
  }

  if (health.runtime === "client") {
    console.warn(
      `[electron:dev] Port ${PORTS.clientDev} already has a client sidecar; stop it if startup fails.`,
    );
  }
}

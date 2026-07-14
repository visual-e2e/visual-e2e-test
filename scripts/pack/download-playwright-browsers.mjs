#!/usr/bin/env node
/**
 * Download Playwright Chromium into playwright-browsers/<platform>/.
 *
 *   npm run download:chromium              # current host
 *   npm run download:chromium -- all       # darwin-arm64 + darwin-x64 + win32-x64
 *   npm run download:chromium -- win32-x64
 *   npm run download:chromium -- darwin-arm64 darwin-x64
 *   npm run download:chromium -- all --force
 */
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { spawn } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { currentNodePlatform } from "./platform.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "../..");
const outRoot = join(REPO_ROOT, "playwright-browsers");

/** Bundle key → PLAYWRIGHT_HOST_PLATFORM_OVERRIDE */
const PLATFORMS = {
  "darwin-arm64": "mac15-arm64",
  "darwin-x64": "mac15",
  "win32-x64": "win64",
};

const ALIASES = {
  all: "all",
  current: "current",
  "mac-arm64": "darwin-arm64",
  "macos-arm64": "darwin-arm64",
  arm64: "darwin-arm64",
  "mac-x64": "darwin-x64",
  "macos-x64": "darwin-x64",
  intel: "darwin-x64",
  win: "win32-x64",
  windows: "win32-x64",
  "win-x64": "win32-x64",
};

function usage() {
  console.error("用法: npm run download:chromium -- [target...] [--force]");
  console.error("  无参数 / current     当前机器平台");
  console.error("  all                 三套：darwin-arm64 darwin-x64 win32-x64");
  console.error("  darwin-arm64        Apple Silicon");
  console.error("  darwin-x64          Intel Mac");
  console.error("  win32-x64           Windows");
  console.error("  --force             已存在也重新下载");
}

function chromiumReady(platformDir) {
  if (!existsSync(platformDir)) return false;
  return readdirSync(platformDir).some((name) => name.startsWith("chromium-"));
}

function resolveTargets(argv) {
  const force = argv.includes("--force") || argv.includes("-f");
  const raw = argv.filter((a) => a !== "--force" && a !== "-f" && a !== "--");

  if (raw.includes("--help") || raw.includes("-h")) {
    usage();
    process.exit(0);
  }

  let keys = [];
  if (raw.length === 0 || (raw.length === 1 && raw[0] === "current")) {
    keys = [currentNodePlatform()];
  } else if (raw.includes("all")) {
    keys = Object.keys(PLATFORMS);
  } else {
    for (const token of raw) {
      const key = ALIASES[token] ?? token;
      if (key === "all" || key === "current") {
        console.error(`不能与其它 target 混用: ${token}`);
        usage();
        process.exit(1);
      }
      if (!PLATFORMS[key]) {
        console.error(`未知平台: ${token}`);
        usage();
        process.exit(1);
      }
      keys.push(key);
    }
  }

  return { keys: [...new Set(keys)], force };
}

function runPlaywrightInstall(platformDir, hostOverride) {
  return new Promise((resolve, reject) => {
    const child = spawn(
      "npx",
      ["playwright", "install", "chromium", "--no-shell", "--no-progress"],
      {
        cwd: REPO_ROOT,
        env: {
          ...process.env,
          PLAYWRIGHT_BROWSERS_PATH: platformDir,
          PLAYWRIGHT_HOST_PLATFORM_OVERRIDE: hostOverride,
        },
        stdio: "inherit",
      },
    );
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`playwright install killed: ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function fetchPlatform(key, force) {
  const override = PLATFORMS[key];
  const platformDir = join(outRoot, key);

  if (!force && chromiumReady(platformDir)) {
    console.log(`Playwright browsers ${key} already present, skip (use --force to re-download)`);
    return;
  }

  if (existsSync(platformDir)) rmSync(platformDir, { recursive: true, force: true });
  mkdirSync(platformDir, { recursive: true });

  console.log(`Downloading Playwright Chromium for ${key} (override=${override})...`);
  const code = await runPlaywrightInstall(platformDir, override);
  if (code !== 0) {
    rmSync(platformDir, { recursive: true, force: true });
    throw new Error(`playwright install failed for ${key} (exit ${code})`);
  }
  if (!chromiumReady(platformDir)) {
    throw new Error(`Chromium missing after install: ${platformDir}`);
  }
  console.log(`Playwright browsers ${key} ready at ${platformDir}`);
}

async function main() {
  const { keys, force } = resolveTargets(process.argv.slice(2));
  console.log(`Targets: ${keys.join(", ")}${force ? " (force)" : ""}`);
  mkdirSync(outRoot, { recursive: true });
  for (const key of keys) {
    await fetchPlatform(key, force);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

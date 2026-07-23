#!/usr/bin/env node
/**
 * 统一测试入口，模块来自 projects/{project}/scenarios/ 子目录。
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { getE2eRoot, getProjectsDir, getSettingsPath, getConfigDir } from "./paths.mjs";
import { resolveLaunchEnv } from "./lib/browser-runtime.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = getE2eRoot();

function resolveNodeBinary() {
  if (process.env.E2E_RUNTIME !== "client") {
    return process.execPath || "node";
  }
  const fromEnv = process.env.BUNDLED_NODE?.trim();
  if (fromEnv && existsSync(fromEnv)) return fromEnv;
  return process.execPath || "node";
}

async function resolveBrowserEnv() {
  if (process.env.CHROMIUM_EXECUTABLE_PATH?.trim()) {
    return { CHROMIUM_EXECUTABLE_PATH: process.env.CHROMIUM_EXECUTABLE_PATH.trim() };
  }
  if (process.env.PLAYWRIGHT_BROWSERS_PATH?.trim()) {
    return { PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH.trim() };
  }

  const configDir = getConfigDir(root);
  const runtime = process.env.E2E_RUNTIME === "client" ? "client" : "workspace";
  const resolved = await resolveLaunchEnv(configDir, root, runtime);
  return resolved.ok ? resolved.env : {};
}

function resolveCliLaunch() {
  const nodeBin = resolveNodeBinary();
  const distCli = join(root, "dist/cli.js");
  if (existsSync(distCli)) {
    return { bin: nodeBin, args: [distCli] };
  }
  const tsCli = join(root, "src/cli.ts");
  if (existsSync(tsCli) && existsSync(join(root, "node_modules/tsx"))) {
    return { bin: nodeBin, args: ["--import", "tsx", tsCli] };
  }
  return { bin: "npx", args: ["tsx", "src/cli.ts"] };
}

function resolveProjectId(argv) {
  const idx = argv.indexOf("--project");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  if (process.env.ACTIVE_PROJECT) return process.env.ACTIVE_PROJECT;
  const settingsPath = getSettingsPath();
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (settings.defaultProject) return settings.defaultProject;
  }
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) {
    console.error("未找到 projects/ 目录");
    process.exit(1);
  }
  const ids = readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "project.json")))
    .map((e) => e.name);
  if (ids.length === 0) {
    console.error("未找到任何项目，请在 projects/ 下创建项目或通过工作台新建");
    process.exit(1);
  }
  if (ids.length === 1) return ids[0];
  console.error(`存在多个项目 (${ids.join(", ")})，请指定 --project`);
  process.exit(1);
}

function discoverModules(projectId) {
  const dir = join(getProjectsDir(), projectId, "scenarios");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "manifest.json")))
    .map((e) => e.name)
    .sort();
}

function discoverAllModules() {
  const projectsDir = getProjectsDir();
  if (!existsSync(projectsDir)) return [];
  const projectIds = readdirSync(projectsDir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(projectsDir, e.name, "project.json")))
    .map((e) => e.name);
  const modules = new Set();
  for (const id of projectIds) {
    for (const mod of discoverModules(id)) modules.add(mod);
  }
  return [...modules].sort();
}

function ensureModuleScripts() {
  if (process.env.CLIENT_MODE === "1" || process.env.CLIENT_MODE === "true") return;

  const pkgPath = join(root, "package.json");
  const pkg = JSON.parse(readFileSync(pkgPath, "utf-8"));
  const modules = discoverAllModules();
  const existing = pkg.scripts ?? {};

  const next = { ...existing };

  for (const key of Object.keys(next)) {
    if (key.startsWith("test:") && key !== "test:all" && !modules.includes(key.slice(5))) {
      delete next[key];
    }
  }

  next.test = "node scripts/run-test.mjs";
  next["test:all"] = "node scripts/run-test.mjs";
  for (const mod of modules) {
    next[`test:${mod}`] = "node scripts/run-test.mjs";
  }

  if (JSON.stringify(existing) !== JSON.stringify(next)) {
    try {
      writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
    } catch {
      // 只读包内目录（客户端）时跳过
    }
  }
}

function collectArgs() {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  const raw = process.argv.slice(2);

  if (lifecycle.startsWith("test:") && lifecycle.length > 5) {
    const name = lifecycle.slice(5);
    if (name === "all") return ["--all", ...raw];
    return ["--module", name, ...raw];
  }

  return raw;
}

const args = collectArgs();
const projectId = resolveProjectId(args);
ensureModuleScripts();

if (!args.includes("--project")) {
  args.unshift(projectId);
  args.unshift("--project");
}

const { bin, args: cliArgs } = resolveCliLaunch();
const piped = !process.stdout.isTTY;
const nodeBin = resolveNodeBinary();
const browserEnv = await resolveBrowserEnv();

const child = spawn(bin, [...cliArgs, ...args], {
  cwd: root,
  stdio: piped ? "pipe" : "inherit",
  env: {
    ...process.env,
    BUNDLED_NODE: nodeBin,
    ACTIVE_PROJECT: projectId,
    ...browserEnv,
  },
});

if (piped) {
  child.stdout?.on("data", (buf) => process.stdout.write(buf));
  child.stderr?.on("data", (buf) => process.stderr.write(buf));
}

function shutdownChild(signal) {
  if (!child.pid || child.killed) return;
  try {
    if (process.platform !== "win32") {
      process.kill(-child.pid, signal);
    } else {
      child.kill(signal);
    }
  } catch {
    child.kill(signal);
  }
}

for (const sig of ["SIGTERM", "SIGINT", "SIGHUP"]) {
  process.on(sig, () => {
    shutdownChild(sig);
    setTimeout(() => process.exit(sig === "SIGINT" ? 130 : 143), 500);
  });
}

child.on("exit", (code) => {
  process.exit(code ?? 1);
});

child.on("error", (err) => {
  console.error(err);
  process.exit(1);
});

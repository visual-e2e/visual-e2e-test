#!/usr/bin/env node
/**
 * 统一测试入口，模块来自 projects/{project}/scenarios/ 子目录。
 */
import { spawn } from "node:child_process";
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, "..");

function resolveProjectId(argv) {
  const idx = argv.indexOf("--project");
  if (idx >= 0 && argv[idx + 1]) return argv[idx + 1];
  if (process.env.ACTIVE_PROJECT) return process.env.ACTIVE_PROJECT;
  const settingsPath = join(root, "config", "settings.json");
  if (existsSync(settingsPath)) {
    const settings = JSON.parse(readFileSync(settingsPath, "utf-8"));
    if (settings.defaultProject) return settings.defaultProject;
  }
  const projectsDir = join(root, "projects");
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
  const dir = join(root, "projects", projectId, "scenarios");
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((e) => e.isDirectory() && existsSync(join(dir, e.name, "manifest.json")))
    .map((e) => e.name)
    .sort();
}

function discoverAllModules() {
  const projectsDir = join(root, "projects");
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
    pkg.scripts = next;
    writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);
  }
}

function normalizeSelectorArg(arg, prev) {
  const flags = new Set(["--list", "--list-projects", "--headed", "--headless", "--all", "--slow-mo", "--project"]);
  if (flags.has(arg) || prev === "--slow-mo" || prev === "--project") return arg;
  if (arg.startsWith("--") && arg.length > 2) return arg;
  if (!arg.startsWith("-") && arg.length > 0) return `--${arg}`;
  return arg;
}

function collectArgs() {
  const lifecycle = process.env.npm_lifecycle_event ?? "";
  const raw = process.argv.slice(2);

  let argv = raw;
  if (lifecycle.startsWith("test:") && lifecycle.length > 5) {
    const name = lifecycle.slice(5);
    if (name === "all") argv = ["--all", ...raw];
    else argv = [`--${name}`, ...raw];
  }

  return argv.map((arg, i) => normalizeSelectorArg(arg, argv[i - 1]));
}

const args = collectArgs();
const projectId = resolveProjectId(args);
ensureModuleScripts();

if (!args.includes("--project")) {
  args.unshift(projectId);
  args.unshift("--project");
}

const child = spawn("npx", ["tsx", "src/cli.ts", ...args], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, ACTIVE_PROJECT: projectId },
});

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

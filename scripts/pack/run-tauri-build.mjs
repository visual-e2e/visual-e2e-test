#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { REPO_ROOT } from "../dev/env.mjs";
import { copyBundlesToBuild } from "./copy-bundles.mjs";
import { buildOutputSubdir, currentNodePlatform } from "./platform.mjs";
import "./sync-version.mjs";

process.env.CARGO_TARGET_DIR = join(REPO_ROOT, "src-tauri", "target");

const WINDOWS_TARGET = "x86_64-pc-windows-msvc";
const VALID_TARGETS = new Set(["mac", "win", "all"]);

function parseTarget() {
  const arg = process.argv[2] ?? "mac";
  if (!VALID_TARGETS.has(arg)) {
    console.error(`未知打包目标: ${arg}`);
    console.error("用法: node scripts/pack/run-tauri-build.mjs [mac|win|all]");
    console.error("  mac  macOS 安装包 → build/macos/");
    console.error("  win  Windows 安装包 → build/windows/");
    console.error("  all  mac + win（macOS 上 win 为交叉编译）");
    process.exit(1);
  }
  return arg;
}

function cleanBuildOutput(target) {
  if (target === "all") {
    rmSync(join(REPO_ROOT, "build"), { recursive: true, force: true });
    console.log("已清空 build/");
    return;
  }

  const nodePlatform = target === "mac" ? currentNodePlatform() : "win32-x64";
  const subdir = buildOutputSubdir(nodePlatform);
  const outDir = join(REPO_ROOT, "build", subdir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(REPO_ROOT, "build"), { recursive: true });
  console.log(`已清空 build/${subdir}/`);
}

function cleanStaleDmgTempFiles(rustTarget) {
  const bundleMacos = rustTarget
    ? join(process.env.CARGO_TARGET_DIR, rustTarget, "release/bundle/macos")
    : join(process.env.CARGO_TARGET_DIR, "release/bundle/macos");
  if (!existsSync(bundleMacos)) return;

  for (const name of readdirSync(bundleMacos)) {
    if (!name.startsWith("rw.") || !name.endsWith(".dmg")) continue;
    rmSync(join(bundleMacos, name), { force: true });
  }
}

function warnIfMacRosettaBuild() {
  if (process.arch === "x64") {
    console.warn(
      "当前 Node 运行于 Rosetta (x64)，DMG 将命名为 _x64。建议在原生终端执行: arch -arm64 npm run tauri:build:mac",
    );
  }
}

function cleanStaleBundleResources(rustTarget) {
  const base = rustTarget
    ? join(process.env.CARGO_TARGET_DIR, rustTarget, "release/resources")
    : join(process.env.CARGO_TARGET_DIR, "release/resources");
  rmSync(base, { recursive: true, force: true });
}

function ensureCargoPath() {
  const cargoBin = join(homedir(), ".cargo", "bin");
  const parts = (process.env.PATH ?? "").split(":");
  if (!parts.includes(cargoBin)) {
    process.env.PATH = `${cargoBin}:${process.env.PATH ?? ""}`;
  }
}

function preflightCargo() {
  ensureCargoPath();
  const check = spawnSync("cargo", ["--version"], { encoding: "utf8" });
  if (check.status === 0) return;

  console.error("未找到 cargo（Rust 工具链未安装或未加入 PATH）。");
  console.error("  npm run setup:rust && source ~/.cargo/env");
  process.exit(1);
}

function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}`);
    const child = spawn(cmd, args, { cwd: REPO_ROOT, stdio: "inherit", env: process.env });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} killed: ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

function ensureLlvmRcPath() {
  if (spawnSync("llvm-rc", ["--version"], { encoding: "utf8" }).status === 0) return;

  // Homebrew 安装的 llvm 为 keg-only，不在默认 PATH 中
  for (const dir of ["/opt/homebrew/opt/llvm/bin", "/usr/local/opt/llvm/bin"]) {
    if (!existsSync(join(dir, "llvm-rc"))) continue;
    const parts = (process.env.PATH ?? "").split(":");
    if (!parts.includes(dir)) {
      process.env.PATH = `${dir}:${process.env.PATH ?? ""}`;
    }
    if (spawnSync("llvm-rc", ["--version"], { encoding: "utf8" }).status === 0) return;
  }

  console.error("Windows 交叉编译需要 llvm-rc（编译 Windows 资源文件）:");
  console.error("  HOMEBREW_NO_AUTO_UPDATE=1 brew install llvm");
  console.error('  export PATH="/opt/homebrew/opt/llvm/bin:$PATH"');
  process.exit(1);
}

function ensureWindowsCrossToolchain() {
  const targetList = spawnSync("rustup", ["target", "list", "--installed"], { encoding: "utf8" });
  if (!targetList.stdout.includes(WINDOWS_TARGET)) {
    console.log(`安装 Rust target: ${WINDOWS_TARGET}`);
    const add = spawnSync("rustup", ["target", "add", WINDOWS_TARGET], { stdio: "inherit" });
    if (add.status !== 0) process.exit(add.status ?? 1);
  }

  const xwin = spawnSync("cargo-xwin", ["--version"], { encoding: "utf8" });
  if (xwin.status !== 0) {
    console.error("Windows 交叉编译需要 cargo-xwin:");
    console.error("  cargo install cargo-xwin");
    process.exit(1);
  }

  ensureLlvmRcPath();
}

function macStep() {
  if (process.platform !== "darwin") {
    console.error("macOS 安装包只能在 macOS 上构建");
    process.exit(1);
  }
  return {
    label: "macOS 安装包",
    tauriArgs: [],
    nodePlatform: currentNodePlatform(),
  };
}

function winStep() {
  if (process.platform === "darwin") {
    return {
      label: "Windows 安装包（交叉编译）",
      tauriArgs: ["--target", WINDOWS_TARGET, "--runner", "cargo-xwin"],
      nodePlatform: "win32-x64",
      rustTarget: WINDOWS_TARGET,
    };
  }
  if (process.platform === "win32") {
    return {
      label: "Windows 安装包",
      tauriArgs: [],
      nodePlatform: "win32-x64",
    };
  }
  console.error(`不支持在此系统打包 Windows: ${process.platform}`);
  process.exit(1);
}

/** @returns {Array<{ label: string; tauriArgs: string[]; nodePlatform: string; rustTarget?: string }>} */
function buildPlan(target) {
  if (target === "mac") return [macStep()];
  if (target === "win") return [winStep()];
  if (target === "all") {
    if (process.platform === "darwin") return [macStep(), winStep()];
    if (process.platform === "win32") return [winStep()];
    console.error(`不支持在此系统打包 all: ${process.platform}`);
    process.exit(1);
  }
  return [];
}

async function downloadNodeSidecars(target) {
  const args =
    target === "all"
      ? ["scripts/pack/download-node.mjs", "--all"]
      : target === "mac"
        ? ["scripts/pack/download-node.mjs", currentNodePlatform()]
        : ["scripts/pack/download-node.mjs", "win32-x64"];

  const label = target === "all" ? "download-node --all" : `download-node ${args[1]}`;
  if ((await run("node", args, label)) !== 0) process.exit(1);
}

async function runTauriBuild(step) {
  const isMacNative = process.platform === "darwin" && !step.rustTarget;

  if (isMacNative) {
    const appCode = await run(
      "npx",
      ["tauri", "build", "--bundles", "app", ...step.tauriArgs],
      `${step.label}（.app）`,
    );
    if (appCode !== 0) return appCode;

    return run(
      "npx",
      ["tauri", "build", "--bundles", "dmg", ...step.tauriArgs],
      `${step.label}（.dmg）`,
    );
  }

  return run("npx", ["tauri", "build", ...step.tauriArgs], step.label);
}

const target = parseTarget();
const plan = buildPlan(target);

preflightCargo();
cleanBuildOutput(target);

await downloadNodeSidecars(target);

if (plan.some((s) => s.rustTarget)) {
  ensureWindowsCrossToolchain();
}

const results = [];

for (const step of plan) {
  cleanStaleBundleResources(step.rustTarget);
  if (process.platform === "darwin" && !step.rustTarget) {
    cleanStaleDmgTempFiles(step.rustTarget);
    delete process.env.CI;
    warnIfMacRosettaBuild();
  }

  const code = await runTauriBuild(step);

  let copied = [];
  let subdir = "";
  try {
    ({ subdir, copied } = copyBundlesToBuild(REPO_ROOT, step.nodePlatform, step.rustTarget));
    results.push({ subdir, copied });
  } catch (err) {
    if (code !== 0) {
      console.error(err.message);
      process.exit(code);
    }
    throw err;
  }

  if (code !== 0) {
    console.warn("\n打包未完全成功，已复制的产物仍保留在 build/");
    for (const name of copied) console.warn(`  ${name}`);
    if (process.platform === "darwin" && !step.rustTarget && !copied.some((n) => n.endsWith(".dmg"))) {
      console.warn(
        "DMG 生成失败时，请在 Terminal.app 中重试，并授予终端「控制 Finder」权限（系统设置 → 隐私与安全性 → 自动化）",
      );
    }
    if (copied.length === 0) process.exit(code);
  }
}

console.log("\n安装包已输出到 build/");
for (const { subdir, copied } of results) {
  console.log(`  build/${subdir}/`);
  for (const name of copied) console.log(`    ${name}`);
}

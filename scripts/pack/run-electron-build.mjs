#!/usr/bin/env node
import { spawn } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  renameSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { REPO_ROOT } from "../dev/env.mjs";
import { buildOutputSubdir, nodePlatformForMacArch } from "./platform.mjs";
import "./sync-version.mjs";

const VALID_TARGETS = new Set(["mac", "win", "all"]);
const VALID_MAC_ARCHS = new Set(["arm64", "x64"]);
const NODE_RESOURCES = join(REPO_ROOT, "electron/resources/node");
/** Project-managed browsers (do not prune). */
const PLAYWRIGHT_SOURCE = join(REPO_ROOT, "playwright-browsers");
/** Pack staging: only the current platform is copied here for extraResources. */
const PLAYWRIGHT_STAGE = join(REPO_ROOT, "electron/resources/playwright-browsers");

const MAC_ARCH_FLAGS = {
  arm64: "--arm64",
  x64: "--x64",
};

function usage() {
  console.error("用法: node scripts/pack/run-electron-build.mjs <target> [macArch]");
  console.error("  mac arm64   Apple Silicon → build/macos-arm64/（仅 macOS）");
  console.error("  mac x64     Intel Mac     → build/macos-x64/（仅 macOS）");
  console.error("  win         Windows       → build/windows/（macOS 可交叉编译）");
  console.error("  all         macOS 上一次打出 macos-arm64 + macos-x64 + windows");
}

function parseTarget() {
  const arg = process.argv[2] ?? "mac";
  if (!VALID_TARGETS.has(arg)) {
    console.error(`未知打包目标: ${arg}`);
    usage();
    process.exit(1);
  }
  return arg;
}

function parseMacArch(target) {
  if (target !== "mac") return null;
  const arch = process.argv[3] ?? "arm64";
  if (!VALID_MAC_ARCHS.has(arch)) {
    console.error(`未知 mac 架构: ${arch}（可选: arm64, x64）`);
    usage();
    process.exit(1);
  }
  return arch;
}

function requireMacOS(action) {
  if (process.platform !== "darwin") {
    console.error(`${action} 需在 macOS 上构建。`);
    process.exit(1);
  }
}

function cleanOutputSubdir(subdir) {
  const outDir = join(REPO_ROOT, "build", subdir);
  rmSync(outDir, { recursive: true, force: true });
  mkdirSync(join(REPO_ROOT, "build"), { recursive: true });
  console.log(`已清空 build/${subdir}/`);
}

function run(cmd, args, label) {
  return new Promise((resolve, reject) => {
    console.log(`\n>>> ${label}`);
    const child = spawn(cmd, args, {
      cwd: REPO_ROOT,
      stdio: "inherit",
      env: {
        ...process.env,
        ELECTRON_MIRROR:
          process.env.ELECTRON_MIRROR ?? "https://npmmirror.com/mirrors/electron/",
      },
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => {
      if (signal) reject(new Error(`${label} killed: ${signal}`));
      else resolve(code ?? 1);
    });
  });
}

async function downloadNodePlatform(nodePlatform) {
  const code = await run(
    "node",
    ["scripts/pack/download-node.mjs", nodePlatform],
    `download-node ${nodePlatform}`,
  );
  if (code !== 0) process.exit(1);
}

function chromiumReady(platformDir) {
  if (!existsSync(platformDir)) return false;
  return readdirSync(platformDir).some((name) => name.startsWith("chromium-"));
}

function stagePlaywrightBrowsers(nodePlatform) {
  const src = join(PLAYWRIGHT_SOURCE, nodePlatform);
  if (!chromiumReady(src)) {
    throw new Error(
      `Missing Playwright browsers: ${src}\n` +
        `Prepare under playwright-browsers/ (see README), then retry.`,
    );
  }
  rmSync(PLAYWRIGHT_STAGE, { recursive: true, force: true });
  mkdirSync(PLAYWRIGHT_STAGE, { recursive: true });
  cpSync(src, join(PLAYWRIGHT_STAGE, nodePlatform), { recursive: true });
  console.log(`Staged Playwright browsers ${nodePlatform} → electron/resources/playwright-browsers/`);
}

function prunePlatformResources(root, nodePlatform, label) {
  if (!existsSync(root)) return;
  for (const name of readdirSync(root)) {
    if (name === nodePlatform) continue;
    rmSync(join(root, name), { recursive: true, force: true });
  }
  const marker = join(root, nodePlatform);
  if (!existsSync(marker)) {
    throw new Error(`${label} missing after prune: ${marker}`);
  }
}

function electronBuilderArgs(platform, outputDir, macArch) {
  const outputFlag = `-c.directories.output=${outputDir}`;
  if (platform === "mac") {
    return ["electron-builder", "--mac", "dmg", MAC_ARCH_FLAGS[macArch], outputFlag];
  }
  return ["electron-builder", "--win", "nsis", outputFlag];
}

function collectArtifacts(outDir, platform) {
  if (!existsSync(outDir)) {
    throw new Error(`未找到安装包产物目录: ${outDir}`);
  }

  const copied = [];

  if (platform === "mac") {
    const macDir = join(outDir, "mac");
    if (existsSync(macDir)) {
      for (const name of readdirSync(macDir)) {
        if (!name.endsWith(".app")) continue;
        const dest = join(outDir, name);
        rmSync(dest, { recursive: true, force: true });
        renameSync(join(macDir, name), dest);
        copied.push(name);
      }
      rmSync(macDir, { recursive: true, force: true });
    }
  }

  for (const name of readdirSync(outDir)) {
    if (name.endsWith(".dmg") || name.endsWith(".exe") || name.endsWith(".msi")) {
      if (!copied.includes(name)) copied.push(name);
    }
  }

  for (const junk of ["builder-debug.yml", "builder-effective-config.yaml"]) {
    rmSync(join(outDir, junk), { force: true });
  }

  if (copied.length === 0) {
    throw new Error(`未找到安装包产物（${outDir}）`);
  }

  return copied;
}

function macStep(arch) {
  const nodePlatform = nodePlatformForMacArch(arch);
  return {
    label: `macOS ${arch} 安装包`,
    platform: "mac",
    macArch: arch,
    nodePlatform,
    subdir: buildOutputSubdir(nodePlatform),
  };
}

function winStep() {
  return {
    label: "Windows 安装包",
    platform: "win",
    macArch: null,
    nodePlatform: "win32-x64",
    subdir: buildOutputSubdir("win32-x64"),
  };
}

function buildPlan(target, macArch) {
  if (target === "mac") {
    requireMacOS("macOS 安装包");
    return [macStep(macArch ?? "arm64")];
  }

  if (target === "win") {
    if (process.platform !== "darwin" && process.platform !== "win32") {
      console.error("Windows 安装包需在 macOS 或 Windows 上构建。");
      process.exit(1);
    }
    return [winStep()];
  }

  if (target === "all") {
    if (process.platform === "darwin") {
      return [macStep("arm64"), macStep("x64"), winStep()];
    }
    if (process.platform === "win32") {
      console.warn("Windows 无法交叉编译 macOS 安装包，all 在此仅构建 build/windows/。");
      return [winStep()];
    }
    console.error("不支持的构建主机系统。");
    process.exit(1);
  }

  return [];
}

const target = parseTarget();
const macArch = parseMacArch(target);
const plan = buildPlan(target, macArch);

for (const step of plan) {
  cleanOutputSubdir(step.subdir);
}

if ((await run("npx", ["tsc", "-p", "electron/tsconfig.json"], "build electron")) !== 0) {
  process.exit(1);
}
if ((await run("npm", ["run", "build:client"], "build:client")) !== 0) process.exit(1);

const results = [];
for (const step of plan) {
  await downloadNodePlatform(step.nodePlatform);
  prunePlatformResources(NODE_RESOURCES, step.nodePlatform, "Node sidecar");
  stagePlaywrightBrowsers(step.nodePlatform);

  const outDir = join(REPO_ROOT, "build", step.subdir);
  const code = await run(
    "npx",
    electronBuilderArgs(step.platform, `build/${step.subdir}`, step.macArch),
    step.label,
  );

  let copied = [];
  try {
    copied = collectArtifacts(outDir, step.platform);
    results.push({ subdir: step.subdir, copied });
  } catch (err) {
    if (code !== 0) {
      console.error(err.message);
      process.exit(code);
    }
    throw err;
  }

  if (code !== 0) {
    console.warn("\n打包未完全成功，已整理的产物仍保留在 build/");
    for (const name of copied) console.warn(`  ${name}`);
    if (copied.length === 0) process.exit(code);
  }
}

console.log("\n安装包已输出到 build/");
for (const { subdir, copied } of results) {
  console.log(`  build/${subdir}/`);
  for (const name of copied) console.log(`    ${name}`);
}

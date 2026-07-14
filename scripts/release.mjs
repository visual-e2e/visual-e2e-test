#!/usr/bin/env node
/**
 * 创建发布分支：从 master 拉出 release-v{version}，bump version.js / package.json。
 *
 * 用法: node scripts/release.mjs [patch|minor|major|x.y.z]
 */
import { execSync, spawnSync } from "node:child_process";
import { confirm, input, select } from "@inquirer/prompts";
import semver from "semver";
import { REPO_ROOT } from "./dev/env.mjs";
import { readVersion, writeVersion } from "./lib/version.mjs";

const DEFAULT_BRANCH = "master";
const RELEASE_PREFIX = "release-v";

function logInfo(msg) {
  console.log(`[INFO] ${msg}`);
}

function logError(msg) {
  console.error(`[ERROR] ${msg}`);
  process.exit(1);
}

function cleanEnv() {
  const env = { ...process.env };
  delete env.npm_config_prefix;
  return env;
}

function gitOutput(...args) {
  const r = spawnSync("git", args, {
    encoding: "utf-8",
    cwd: REPO_ROOT,
    env: cleanEnv(),
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "git failed").trim());
  }
  return (r.stdout || "").trim();
}

function exec(cmd) {
  logInfo(cmd);
  execSync(cmd, { cwd: REPO_ROOT, stdio: "inherit", env: cleanEnv() });
}

function resolveVersionFromArg(current, arg) {
  if (semver.valid(arg)) {
    if (!semver.gt(arg, current)) throw new Error(`版本 ${arg} 须大于 ${current}`);
    return arg;
  }
  if (["patch", "minor", "major"].includes(arg)) {
    return semver.inc(current, arg);
  }
  throw new Error(`无效参数: ${arg}`);
}

async function pickVersion(current, arg) {
  if (arg) return resolveVersionFromArg(current, arg);
  if (!process.stdin.isTTY) return semver.inc(current, "patch");

  const bumpType = await select({
    message: "选择新版本",
    choices: [
      {
        name: `大版本 +1   ${current} => ${semver.inc(current, "major")}`,
        value: "major",
      },
      {
        name: `中间版本 +1 ${current} => ${semver.inc(current, "minor")}`,
        value: "minor",
      },
      {
        name: `小版本 +1   ${current} => ${semver.inc(current, "patch")}`,
        value: "patch",
      },
      { name: "手动输入", value: "manual" },
    ],
    default: "patch",
  });

  if (bumpType === "manual") {
    const v = await input({ message: "新版本号" });
    if (!semver.valid(v) || !semver.gt(v, current)) {
      logError(`无效版本，须大于 ${current}`);
    }
    return v;
  }

  return semver.inc(current, bumpType);
}

async function main() {
  if (gitOutput("status", "--porcelain")) {
    logError("工作区不干净，请先提交或暂存改动");
  }

  const currentBranch = gitOutput("rev-parse", "--abbrev-ref", "HEAD");
  if (currentBranch !== DEFAULT_BRANCH) {
    logError(`请在 ${DEFAULT_BRANCH} 分支执行 release（当前: ${currentBranch}）`);
  }

  const curVer = readVersion();
  const arg = process.argv[2];

  console.log(`当前分支: ${currentBranch}`);
  console.log(`当前版本: ${curVer}\n`);

  const newVer = await pickVersion(curVer, arg);
  const releaseBranch = `${RELEASE_PREFIX}${newVer}`;

  if (gitOutput("branch", "--list", releaseBranch)) {
    logError(`分支 ${releaseBranch} 已存在`);
  }

  if (process.stdin.isTTY && !arg) {
    const ok = await confirm({
      message: `将创建分支 ${releaseBranch}，版本 ${curVer} => ${newVer}，是否同意？`,
      default: true,
    });
    if (!ok) {
      logInfo("已取消");
      process.exit(0);
    }
  }

  exec(`git fetch origin ${DEFAULT_BRANCH}`);
  exec(`git checkout -b ${releaseBranch} origin/${DEFAULT_BRANCH}`);

  writeVersion(newVer);
  logInfo("已更新 version.js、package.json");

  exec("git add version.js package.json package-lock.json");
  exec(`git commit -m "chore(release): bump version to ${newVer}"`);
  exec(`git push -u origin ${releaseBranch}`);

  logInfo(`完成：分支 ${releaseBranch}，版本 ${newVer}`);
  console.log(`\n合并到 ${DEFAULT_BRANCH} 后，在本机执行:`);
  console.log("  npm run download:chromium -- all");
  console.log("  npm run electron:build:all");
  console.log("  npm run pub");
}

main().catch((err) => logError(err.message || String(err)));

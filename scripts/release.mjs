#!/usr/bin/env node
/**
 * 创建发布分支：从 main 拉出 release-v{version}，bump version.js / package.json。
 *
 * 用法: node scripts/release.mjs [patch|minor|major|x.y.z]
 */
import { spawnSync } from "node:child_process";
import { createInterface } from "node:readline/promises";
import { stdin as input, stdout as output } from "node:process";
import semver from "semver";
import { readVersion, writeVersion } from "./lib/version.mjs";

const DEFAULT_BRANCH = "main";
const RELEASE_PREFIX = "release-v";

function git(...args) {
  const r = spawnSync("git", args, { encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "git failed").trim());
  }
  return (r.stdout || "").trim();
}

function branch() {
  return git("rev-parse", "--abbrev-ref", "HEAD");
}

async function nextVersion(current, arg) {
  if (arg) {
    if (semver.valid(arg)) {
      if (!semver.gt(arg, current)) throw new Error(`版本 ${arg} 须大于 ${current}`);
      return arg;
    }
    if (["patch", "minor", "major"].includes(arg)) {
      return semver.inc(current, arg);
    }
    throw new Error(`无效参数: ${arg}`);
  }
  if (!input.isTTY) return semver.inc(current, "patch");

  const rl = createInterface({ input, output });
  try {
    console.log(`当前版本: ${current}`);
    console.log("  1. patch  2. minor  3. major  4. 手动输入");
    const pick = (await rl.question("选择 [1]: ")).trim() || "1";
    if (pick === "4") {
      const v = await rl.question("新版本号: ");
      if (!semver.valid(v) || !semver.gt(v, current)) throw new Error("无效版本");
      return v;
    }
    const map = { "1": "patch", "2": "minor", "3": "major" };
    const type = map[pick] ?? "patch";
    return semver.inc(current, type);
  } finally {
    rl.close();
  }
}

const arg = process.argv[2];
const current = branch();
if (current !== DEFAULT_BRANCH) {
  console.error(`请在 ${DEFAULT_BRANCH} 分支执行 release（当前: ${current}）`);
  process.exit(1);
}

const curVer = readVersion();
const newVer = await nextVersion(curVer, arg);
const releaseBranch = `${RELEASE_PREFIX}${newVer}`;

if (git("branch", "--list", releaseBranch)) {
  console.error(`分支 ${releaseBranch} 已存在`);
  process.exit(1);
}

console.log(`\n创建 ${releaseBranch}，版本 ${curVer} → ${newVer}`);

git("fetch", "origin", DEFAULT_BRANCH);
git("checkout", "-b", releaseBranch, `origin/${DEFAULT_BRANCH}`);

writeVersion(newVer);
console.log(`已更新 version.js、package.json`);

git("add", "version.js", "package.json", "package-lock.json");
git("commit", "-m", `chore(release): bump version to ${newVer}`);
git("push", "-u", "origin", releaseBranch);

console.log(`\n已推送 ${releaseBranch}`);
console.log(`合并到 ${DEFAULT_BRANCH} 后，在本机执行:`);
console.log(`  npm run download:chromium -- all`);
console.log(`  npm run electron:build:all`);
console.log(`  npm run pub`);

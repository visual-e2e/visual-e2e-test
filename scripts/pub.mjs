#!/usr/bin/env node
/**
 * 发包：校验本机安装包 → 推送 main → 打 tag → 用 gh 创建 GitHub Release 并上传资产。
 *
 * 发版前在本机准备：
 *   npm run download:chromium -- all
 *   npm run electron:build:all
 *
 * 用法: node scripts/pub.mjs
 */
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { readVersion } from "./lib/version.mjs";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = join(__dirname, "..");
const DEFAULT_BRANCH = "main";
const TAG_PREFIX = "v";

const ASSET_GLOBS = [
  { dir: "build/macos-arm64", ext: ".dmg" },
  { dir: "build/macos-x64", ext: ".dmg" },
  { dir: "build/windows", ext: ".exe" },
];

function git(...args) {
  const r = spawnSync("git", args, { encoding: "utf-8", cwd: REPO_ROOT });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || "git failed").trim());
  }
  return (r.stdout || "").trim();
}

function run(cmd, args, inherit = true) {
  const r = spawnSync(cmd, args, {
    encoding: "utf-8",
    cwd: REPO_ROOT,
    stdio: inherit ? "inherit" : "pipe",
  });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `${cmd} failed`).toString().trim());
  }
  return (r.stdout || "").trim();
}

function collectAssets() {
  const files = [];
  for (const { dir, ext } of ASSET_GLOBS) {
    const abs = join(REPO_ROOT, dir);
    if (!existsSync(abs)) {
      throw new Error(`缺少目录 ${dir}/。请先: npm run download:chromium -- all && npm run electron:build:all`);
    }
    const matched = readdirSync(abs).filter((n) => n.endsWith(ext));
    if (matched.length === 0) {
      throw new Error(`缺少 ${dir}/*${ext}。请先完成本机打包。`);
    }
    for (const name of matched) {
      files.push(join(abs, name));
    }
  }
  return files;
}

function requireGh() {
  const r = spawnSync("gh", ["--version"], { encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error("需要 GitHub CLI (gh)，用于创建 Release 并上传安装包");
  }
}

const current = git("rev-parse", "--abbrev-ref", "HEAD");
if (current !== DEFAULT_BRANCH) {
  console.error(`请在 ${DEFAULT_BRANCH} 分支执行 pub（当前: ${current}）`);
  process.exit(1);
}

const dirty = git("status", "--porcelain");
if (dirty) {
  console.error("工作区有未提交改动，请先提交或 stash");
  process.exit(1);
}

const version = readVersion();
const tag = `${TAG_PREFIX}${version}`;

if (git("tag", "--list", tag)) {
  console.error(`tag ${tag} 已存在`);
  process.exit(1);
}

let assets;
try {
  requireGh();
  assets = collectAssets();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

console.log(`版本: ${version}`);
console.log("安装包:");
for (const f of assets) console.log(`  ${f}`);

console.log(`推送 ${DEFAULT_BRANCH}…`);
git("push", "origin", DEFAULT_BRANCH);

console.log(`创建 tag ${tag}…`);
git("tag", "-a", tag, "-m", `chore(release): publish ${tag}`);

console.log(`推送 tag…`);
git("push", "origin", tag);

console.log(`创建 GitHub Release ${tag} 并上传资产…`);
run("gh", ["release", "create", tag, ...assets, "--title", tag, "--generate-notes"]);

console.log(`\n已发布 ${tag}（本机安装包已上传）。站点部署由 release 事件触发（若已配置 SITE_DEPLOY_TOKEN）。`);

#!/usr/bin/env node
/**
 * pub 前置：校验/构建本机安装包，再上传 CDN。
 * 供 .vetcli.js hooks.prepublish 调用。
 */
import { spawnSync } from "node:child_process";
import {
  collectReleaseAssets,
  ReleaseAssetsError,
} from "./lib/release-assets.mjs";
import { readVersion } from "./lib/version.mjs";

function run(cmd, args) {
  const r = spawnSync(cmd, args, { stdio: "inherit", encoding: "utf-8" });
  if (r.status !== 0) {
    throw new Error((r.stderr || r.stdout || `${cmd} failed`).toString().trim());
  }
}

function collectOrBuild(version) {
  try {
    return collectReleaseAssets(version);
  } catch (err) {
    if (!(err instanceof ReleaseAssetsError)) throw err;
    console.warn(`${err.message}\n将自动构建当前版本的全部安装包…`);
    run("npm", ["run", "electron:build:all"]);
    return collectReleaseAssets(version);
  }
}

const version = readVersion();
const assets = collectOrBuild(version);
console.log(`版本: ${version}`);
console.log("安装包:");
for (const a of assets) console.log(`  [${a.id}] ${a.path}`);

console.log("上传 CDN（upload:cdn）…");
run("node", ["scripts/upload-cdn.mjs"]);

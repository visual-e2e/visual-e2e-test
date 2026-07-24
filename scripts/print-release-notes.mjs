#!/usr/bin/env node
/**
 * 打印 GitHub Release notes（CDN 下载说明），供 .vetcli.js releaseNotes 使用。
 */
import { loadCdnConfig, versionManifestUrl } from "./lib/cdn-config.mjs";
import { readVersion } from "./lib/version.mjs";

const version = readVersion();
const cdnCfg = loadCdnConfig();
const manifestUrl = versionManifestUrl(cdnCfg, version);

process.stdout.write(
  [
    "## CDN downloads",
    "",
    `- Manifest: ${manifestUrl}`,
    `- CDN base: ${cdnCfg.domain}`,
    "",
    "GitHub assets are backups; the download site uses Qiniu CDN URLs.",
    "",
  ].join("\n"),
);

#!/usr/bin/env node
/** @deprecated 使用 `vet release` / `npm run release` */
import { spawnSync } from "node:child_process";

const r = spawnSync("vet", ["release", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);

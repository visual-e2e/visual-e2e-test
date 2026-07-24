#!/usr/bin/env node
/** @deprecated 使用 `vet pub` / `npm run pub` */
import { spawnSync } from "node:child_process";

const r = spawnSync("vet", ["pub", ...process.argv.slice(2)], {
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(r.status ?? 1);

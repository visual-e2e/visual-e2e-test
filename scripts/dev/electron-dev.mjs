#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { applyClientDevWebEnv, REPO_ROOT } from "./env.mjs";
import { preflightClientDev } from "./preflight.mjs";

await preflightClientDev();
applyClientDevWebEnv();

const buildEngine = spawnSync("npm", ["run", "build:engine"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});
if (buildEngine.status !== 0) process.exit(buildEngine.status ?? 1);

const tsc = spawnSync("npx", ["tsc", "-p", "electron/tsconfig.json"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});
if (tsc.status !== 0) process.exit(tsc.status ?? 1);

const buildServer = spawnSync("npm", ["run", "build:server"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});
if (buildServer.status !== 0) process.exit(buildServer.status ?? 1);

const vite = spawn("node", ["scripts/dev/electron-web.mjs"], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});

const electron = spawn("npx", ["electron", "."], {
  cwd: REPO_ROOT,
  stdio: "inherit",
  env: process.env,
});

function shutdown(signal) {
  if (!vite.killed) vite.kill(signal);
  if (!electron.killed) electron.kill(signal);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

electron.on("exit", (code) => {
  shutdown("SIGTERM");
  process.exit(code ?? 0);
});

vite.on("exit", (code) => {
  if (code && code !== 0) shutdown("SIGTERM");
});

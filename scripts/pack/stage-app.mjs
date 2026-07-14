#!/usr/bin/env node
/**
 * Stage bundled app resources for Electron extraResources (resources/app).
 */
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, "../..");
const stageRoot = join(repoRoot, "electron", "resources", "app");

const REQUIRED_BUILDS = [
  ["dist", join(repoRoot, "dist")],
  ["workspace/server/dist", join(repoRoot, "workspace/server/dist")],
  ["workspace/web/dist", join(repoRoot, "workspace/web/dist")],
];

function copyFiltered(src, dest) {
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const base = source.split(/[/\\]/).pop() ?? "";
      if (base === ".claude" || base === ".git" || base === ".DS_Store") return false;
      if (source.includes(`${join("node_modules", ".cache")}`)) return false;
      return true;
    },
  });
}

function main() {
  for (const [, path] of REQUIRED_BUILDS) {
    if (!existsSync(path)) {
      console.error(`Missing build output: ${path}`);
      console.error("Run: npm run build:engine && npm run build:server && npm run build:web");
      process.exit(1);
    }
  }

  if (existsSync(stageRoot)) rmSync(stageRoot, { recursive: true, force: true });
  mkdirSync(stageRoot, { recursive: true });

  for (const [rel, abs] of REQUIRED_BUILDS) {
    const target = join(stageRoot, rel);
    mkdirSync(dirname(target), { recursive: true });
    copyFiltered(abs, target);
    console.log(`Staged ${rel}`);
  }

  for (const rel of ["scripts", "template"]) {
    const src = join(repoRoot, rel);
    if (!existsSync(src)) continue;
    copyFiltered(src, join(stageRoot, rel));
    console.log(`Staged ${rel}/`);
  }

  const pkgSrc = join(repoRoot, "package.json");
  const serverPkgSrc = join(repoRoot, "workspace/server/package.json");
  const pkg = JSON.parse(readFileSync(pkgSrc, "utf-8"));
  const serverPkg = JSON.parse(readFileSync(serverPkgSrc, "utf-8"));
  const stagedPkg = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    dependencies: {
      ...pkg.dependencies,
      ...serverPkg.dependencies,
    },
  };
  writeFileSync(join(stageRoot, "package.json"), `${JSON.stringify(stagedPkg, null, 2)}\n`);

  const nmSrc = join(repoRoot, "node_modules");
  if (!existsSync(nmSrc)) {
    console.error("Missing node_modules. Run npm install first.");
    process.exit(1);
  }
  copyFiltered(nmSrc, join(stageRoot, "node_modules"));
  console.log("Staged node_modules/");

  const serverNmSrc = join(repoRoot, "workspace/server/node_modules");
  if (!existsSync(serverNmSrc)) {
    console.error("Missing workspace/server/node_modules. Run: npm install --prefix workspace/server");
    process.exit(1);
  }
  copyFiltered(serverNmSrc, join(stageRoot, "workspace/server/node_modules"));
  console.log("Staged workspace/server/node_modules/");

  const settingsSrc = join(repoRoot, "config", "settings.json");
  mkdirSync(join(stageRoot, "config"), { recursive: true });
  cpSync(settingsSrc, join(stageRoot, "config", "settings.json"));
  console.log("Staged config/settings.json");

  console.log(`\nSidecar app staged at: ${stageRoot}`);
}

main();

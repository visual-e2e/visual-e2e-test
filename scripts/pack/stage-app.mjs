#!/usr/bin/env node
/**
 * Stage bundled app resources for Electron extraResources (resources/app).
 */
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { execFileSync } from "node:child_process";
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

const RUNTIME_SCRIPTS = [
  "run-test.mjs",
  "paths.mjs",
  "profile-to-scenario.mjs",
  "lib/browser-runtime.mjs",
  "pack/platform.mjs",
];

function directorySize(root) {
  return readdirSync(root).reduce((total, name) => {
    const path = join(root, name);
    const stat = lstatSync(path);
    if (stat.isSymbolicLink()) return total;
    return total + (stat.isDirectory() ? directorySize(path) : stat.size);
  }, 0);
}

function verifyStagedSize() {
  const bytes = directorySize(stageRoot);
  const sizeMiB = bytes / 1024 / 1024;
  const maxMiB = Number(process.env.MAX_STAGED_APP_MIB ?? 200);
  console.log(`Staged app size: ${sizeMiB.toFixed(1)} MiB (budget: ${maxMiB} MiB)`);
  if (!Number.isFinite(maxMiB) || maxMiB <= 0) {
    throw new Error(`Invalid MAX_STAGED_APP_MIB: ${process.env.MAX_STAGED_APP_MIB}`);
  }
  if (sizeMiB > maxMiB) {
    throw new Error(`Staged app exceeds size budget: ${sizeMiB.toFixed(1)} MiB > ${maxMiB} MiB`);
  }
}

function copyFiltered(src, dest, { excludeDeclarations = false } = {}) {
  cpSync(src, dest, {
    recursive: true,
    filter: (source) => {
      const base = source.split(/[/\\]/).pop() ?? "";
      if (base === ".claude" || base === ".git" || base === ".DS_Store") return false;
      if (source.includes(`${join("node_modules", ".cache")}`)) return false;
      if (excludeDeclarations && (source.endsWith(".d.ts") || source.endsWith(".d.ts.map"))) {
        return false;
      }
      return true;
    },
  });
}

function stageRuntimeScripts() {
  for (const rel of RUNTIME_SCRIPTS) {
    const src = join(repoRoot, "scripts", rel);
    if (!existsSync(src)) {
      console.error(`Missing runtime script: scripts/${rel}`);
      process.exit(1);
    }
    const dest = join(stageRoot, "scripts", rel);
    mkdirSync(dirname(dest), { recursive: true });
    cpSync(src, dest);
  }
  console.log(`Staged ${RUNTIME_SCRIPTS.length} runtime scripts`);
}

function stageProductionDependencies(sourceRoot, destinationRoot, label) {
  const packagePath = join(sourceRoot, "package.json");
  const lockPath = join(sourceRoot, "package-lock.json");
  const nodeModulesPath = join(sourceRoot, "node_modules");

  for (const required of [packagePath, lockPath, nodeModulesPath]) {
    if (!existsSync(required)) {
      console.error(`Missing ${label} dependency input: ${required}`);
      process.exit(1);
    }
  }

  mkdirSync(destinationRoot, { recursive: true });
  cpSync(packagePath, join(destinationRoot, "package.json"));
  cpSync(lockPath, join(destinationRoot, "package-lock.json"));
  copyFiltered(nodeModulesPath, join(destinationRoot, "node_modules"));

  const npm = process.platform === "win32" ? "npm.cmd" : "npm";
  execFileSync(npm, ["prune", "--omit=dev", "--no-audit", "--no-fund"], {
    cwd: destinationRoot,
    env: {
      ...process.env,
      PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD: "1",
    },
    stdio: "inherit",
  });
  rmSync(join(destinationRoot, "package-lock.json"), { force: true });
  console.log(`Staged ${label} production dependencies`);
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
    copyFiltered(abs, target, { excludeDeclarations: true });
    console.log(`Staged ${rel}`);
  }

  stageRuntimeScripts();
  const templateRoot = join(repoRoot, "template");
  if (existsSync(templateRoot)) {
    copyFiltered(templateRoot, join(stageRoot, "template"));
    console.log("Staged template/");
  }

  const pkgSrc = join(repoRoot, "package.json");
  const pkg = JSON.parse(readFileSync(pkgSrc, "utf-8"));
  const stagedPkg = {
    name: pkg.name,
    version: pkg.version,
    type: pkg.type,
    dependencies: pkg.dependencies,
  };
  writeFileSync(join(stageRoot, "package.json"), `${JSON.stringify(stagedPkg, null, 2)}\n`);

  stageProductionDependencies(repoRoot, stageRoot, "root");
  writeFileSync(join(stageRoot, "package.json"), `${JSON.stringify(stagedPkg, null, 2)}\n`);
  stageProductionDependencies(
    join(repoRoot, "workspace/server"),
    join(stageRoot, "workspace/server"),
    "workspace server",
  );

  const settingsSrc = join(repoRoot, "config", "settings.json");
  mkdirSync(join(stageRoot, "config"), { recursive: true });
  cpSync(settingsSrc, join(stageRoot, "config", "settings.json"));
  console.log("Staged config/settings.json");

  stageTools(repoRoot, stageRoot);

  verifyStagedSize();
  console.log(`\nSidecar app staged at: ${stageRoot}`);
}

function stageTools(repoRoot, stageRoot) {
  // Business tools are installed at runtime into {userData}/tools — not staged into the app bundle.
  if (process.env.STAGE_BUNDLED_TOOLS === "1") {
    console.warn("STAGE_BUNDLED_TOOLS=1 is deprecated; bundled tools were removed from this repo");
  }
  console.log("Skipping bundled tools stage (use Tools hub to install .vettool.zip packages)");
}

main();

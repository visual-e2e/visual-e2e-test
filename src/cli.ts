import { BrowserManager } from "./core/browser.js";
import { loadConfig, rootDir } from "./core/config.js";
import { listModules, resolveExecutionTargets } from "./core/modules.js";
import { listProjectIds } from "./core/project-context.js";
import { ModuleRunner } from "./runner/module-runner.js";

const RUN_FLAGS = new Set(["--list", "--list-projects", "--headed", "--headless", "--all", "--project", "--slow-mo"]);

function parseArgs(argv: string[]) {
  const modules: string[] = [];
  const scenarioNames: string[] = [];
  let list = false;
  let listProjects = false;
  let all = false;
  let headed = false;
  let headless = false;
  let slowMo: number | undefined;
  let projectId: string | undefined;

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === "--list") {
      list = true;
      continue;
    }
    if (arg === "--list-projects") {
      listProjects = true;
      continue;
    }
    if (arg === "--all") {
      all = true;
      continue;
    }
    if (arg === "--headed") {
      headed = true;
      continue;
    }
    if (arg === "--headless") {
      headless = true;
      continue;
    }
    if (arg === "--project") {
      projectId = argv[++i];
      continue;
    }
    if (arg === "--slow-mo") {
      slowMo = parseInt(argv[++i] ?? "0", 10);
      continue;
    }

    const name = arg.startsWith("--") ? arg.slice(2) : arg;
    if (!name || RUN_FLAGS.has(arg)) continue;

    if (name.includes("/")) {
      scenarioNames.push(name);
      continue;
    }

    if (modules.length === 0) {
      modules.push(name);
    } else {
      scenarioNames.push(name);
    }
  }

  return { modules, scenarioNames, list, listProjects, all, headed, headless, slowMo, projectId };
}

function printProjects(): void {
  const ids = listProjectIds(rootDir);
  console.log("\n可用项目（projects/ 目录）:");
  console.log("-".repeat(50));
  if (ids.length === 0) {
    console.log("  （暂无项目）");
  } else {
    for (const id of ids) {
      console.log(`  --project ${id}`);
    }
  }
  console.log("-".repeat(50));
}

function printHelp(scenariosDir: string, projectId: string, fixturesDir: string): void {
  const modules = listModules(scenariosDir, fixturesDir);
  console.log(`\n当前项目: ${projectId}`);
  console.log("\n可用模块:");
  console.log("-".repeat(50));
  if (modules.length === 0) {
    console.log("  （暂无模块）");
  } else {
    for (const m of modules) {
      console.log(`  --${m.module.padEnd(14)} ${m.description ?? ""}`);
      for (const s of m.scenarios) {
        console.log(`      --${s.name}  ${s.scenario.name}`);
      }
    }
  }
  console.log("-".repeat(50));
  console.log("\n用法:");
  console.log("  npm run test -- --project <id> --login");
  console.log("  npm run test -- --project <id> --login --login_success");
  console.log("  npm run test -- --project <id> --all");
  console.log("  npm run test -- --list-projects");
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));

  if (args.listProjects) {
    printProjects();
    return;
  }

  const headlessOverride = args.headed ? false : args.headless ? true : undefined;
  const config = loadConfig({ projectId: args.projectId, headless: headlessOverride, slowMo: args.slowMo });
  const browser = new BrowserManager(config.browser);
  const runner = new ModuleRunner(config, browser);

  const hasTarget = args.all || args.modules.length > 0 || args.scenarioNames.length > 0;

  if (args.list || !hasTarget) {
    printHelp(config.scenariosDir, config.projectId, config.fixturesDir);
    if (!hasTarget && !args.list) {
      process.exit(1);
    }
    return;
  }

  const { refs, unknownModules, unknownScenarios } = resolveExecutionTargets(
    config.scenariosDir,
    {
      modules: args.modules,
      scenarioNames: args.scenarioNames,
      all: args.all,
    },
    config.fixturesDir,
  );

  if (unknownModules.length) {
    console.error(`未知模块: ${unknownModules.map((m) => `--${m}`).join(", ")}`);
    console.error(`可用: ${listModules(config.scenariosDir, config.fixturesDir).map((m) => `--${m.module}`).join(" | ")}`);
    process.exit(1);
  }
  if (unknownScenarios.length) {
    console.error(`未知场景: ${unknownScenarios.map((s) => `--${s}`).join(", ")}`);
    process.exit(1);
  }
  if (refs.length === 0) {
    console.error("没有可执行的场景");
    process.exit(1);
  }

  const { session, results, runVideoPath } = await runner.runScenarios(refs);

  console.log(`\n✓ 完成`);
  console.log(`  项目: ${config.projectId}`);
  console.log(`  运行: ${session.runDir}`);
  console.log(`  报告: ${session.reportFile}`);
  console.log(`  日志: ${session.logFile}`);
  if (runVideoPath) {
    console.log(`  录屏: ${runVideoPath}`);
  }

  const hasFailure = results.some((r) => r.status !== "PASSED");
  if (hasFailure) process.exit(1);
}

main().catch((err) => {
  console.error("执行失败:", err);
  process.exit(1);
});

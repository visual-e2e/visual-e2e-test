import { RunAuthState, markAuthenticatedFromLoginScenario } from "../core/auth.js";
import { readFileSync, existsSync } from "node:fs";
import { join } from "node:path";
import type { BrowserManager } from "../core/browser.js";
import type { AppConfig } from "../core/config.js";
import { discoverModules, type ScenarioRef } from "../core/modules.js";
import { getModuleVariables, getRuntimeVariables, loadVariables } from "../core/config.js";
import { RunLogger } from "../core/logger.js";
import { saveRunVideo } from "../core/video.js";
import { createHandlerRegistry } from "../engine/handler-registry.js";
import { ScenarioRunner } from "../engine/scenario-runner.js";
import { parseManifest, parseScenario, type Scenario, type ScenarioResult } from "../types/scenario.types.js";
import { RunSession } from "./run-session.js";
import { generateHtmlReport } from "../report/html-report.js";

interface ScenarioRunItem {
  scenario: Scenario;
  module: string;
  name: string;
}

interface RunOutcome {
  session: RunSession;
  results: ScenarioResult[];
  runVideoPath?: string;
}

export class ModuleRunner {
  private registry = createHandlerRegistry();
  private scenarioRunner: ScenarioRunner;

  constructor(
    private config: AppConfig,
    private browser: BrowserManager,
  ) {
    this.scenarioRunner = new ScenarioRunner(this.registry, config);
  }

  async runScenarios(
    refs: ScenarioRef[],
  ): Promise<RunOutcome> {
    const session = new RunSession(
      this.config.output.baseDir,
      this.config.output.logsDir,
      this.config.output.videosDir,
    );
    const logger = new RunLogger(session.logDir, this.config.logging.consoleOutput);

    logger.info("run", "=".repeat(60));
    logger.info("run", `测试运行开始 | runId=${session.runId}`);
    const runScope = process.env.RUN_SCOPE?.trim();
    if (runScope) logger.info("run", `运行范围: ${runScope}`);
    logger.info("run", `场景: ${refs.map((r) => r.name).join(", ")}`);
    logger.info("run", `输出: ${session.runDir}`);
    logger.info("run", `日志: ${session.logFile}`);
    if (this.config.output.recordVideo) {
      logger.info("run", `录屏目录: ${session.videoDir}`);
    }
    logger.info("run", "=".repeat(60));

    const items: ScenarioRunItem[] = refs
      .filter((ref) => ref.scenario.enabled)
      .map((ref) => ({
        scenario: ref.scenario,
        module: ref.module,
        name: ref.name,
      }));

    return this.executeRun(session, logger, items);
  }

  /** @deprecated 使用 runScenarios；保留模块批量运行 */
  async runModules(
    moduleNames: string[],
    options?: { scenarioFilter?: string },
  ): Promise<RunOutcome> {
    const session = new RunSession(
      this.config.output.baseDir,
      this.config.output.logsDir,
      this.config.output.videosDir,
    );
    const logger = new RunLogger(session.logDir, this.config.logging.consoleOutput);

    logger.info("run", "=".repeat(60));
    logger.info("run", `测试运行开始 | runId=${session.runId}`);
    logger.info("run", `模块: ${moduleNames.join(", ")}`);
    logger.info("run", `输出: ${session.runDir}`);
    logger.info("run", `日志: ${session.logFile}`);
    if (this.config.output.recordVideo) {
      logger.info("run", `录屏目录: ${session.videoDir}`);
    }
    logger.info("run", "=".repeat(60));

    const items: ScenarioRunItem[] = [];
    for (const moduleName of moduleNames) {
      const scenarios = this.loadModuleScenarios(moduleName, options?.scenarioFilter);
      logger.info("run", `\n--- 模块: ${moduleName} (${scenarios.length} 场景) ---`);
      for (const scenario of scenarios) {
        if (!scenario.enabled) continue;
        items.push({ scenario, module: moduleName, name: scenario.name });
      }
    }

    return this.executeRun(session, logger, items);
  }

  private async executeRun(
    session: RunSession,
    logger: RunLogger,
    items: ScenarioRunItem[],
  ): Promise<RunOutcome> {
    const allVars = loadVariables(this.config.variablesPath);
    const results: ScenarioResult[] = [];
    const recordVideo = this.config.output.recordVideo;

    if (recordVideo) {
      this.browser.setVideoDir(session.videoDir);
    }

    await this.browser.start();
    const page = await this.browser.newPage();
    const video = recordVideo ? page.video() : null;
    const authState = new RunAuthState();

    try {
      let stopRun = false;
      for (let i = 0; i < items.length; i++) {
        if (stopRun) break;
        const item = items[i];

        logger.info("run", `\n--- 场景: ${item.name} [${item.module}] ---`);

        const variables = {
          ...getRuntimeVariables(this.config),
          ...getModuleVariables(allVars, item.module),
        };

        const scenarioResults = await this.scenarioRunner.run(
          page,
          item.scenario,
          item.module,
          variables,
          logger,
          {
            logDir: session.logDir,
            screenshotDir: session.screenshotDir,
          },
          authState,
        );

        for (const result of scenarioResults) {
          results.push(result);
          markAuthenticatedFromLoginScenario(authState, item.module, result.status);
          if (result.status !== "PASSED" && !this.config.test.continueOnScenarioFailure) {
            logger.error("run", "continueOnScenarioFailure=false，终止运行");
            stopRun = true;
            break;
          }
        }

        if (i < items.length - 1 && !stopRun) {
          const interval = this.config.test.intervalBetweenScenariosMs;
          if (interval > 0) {
            logger.info("run", `等待 ${interval}ms...`);
            await page.waitForTimeout(interval);
          }
        }
      }
    } finally {
      try {
        await page.close();
      } catch {
        /* ignore */
      }
      await this.browser.stop();
    }

    let runVideoPath: string | undefined;
    if (recordVideo && video) {
      runVideoPath = await saveRunVideo(video, session.videoDir, session.runId);
      if (runVideoPath) {
        logger.info("run", `录屏已保存: ${runVideoPath}`);
      }
    }

    const reportPath = generateHtmlReport(session.runDir, results, {
      runId: session.runId,
      logPath: session.logFile,
      runVideoPath,
    });
    const passed = results.filter((r) => r.status === "PASSED").length;
    const failed = results.filter((r) => r.status === "FAILED").length;
    const errors = results.filter((r) => r.status === "ERROR").length;

    logger.info("run", "\n" + "=".repeat(60));
    logger.info("run", `运行完成 | 总计 ${results.length} | 通过 ${passed} | 失败 ${failed} | 错误 ${errors}`);
    logger.info("run", `报告: ${reportPath}`);
    logger.info("run", `日志: ${session.logFile}`);
    if (runVideoPath) {
      logger.info("run", `录屏: ${runVideoPath}`);
    }
    logger.info("run", "=".repeat(60));

    return { session, results, runVideoPath };
  }

  loadModuleScenarios(moduleName: string, scenarioFilter?: string) {
    const manifestPath = join(this.config.scenariosDir, moduleName, "manifest.json");
    if (!existsSync(manifestPath)) {
      throw new Error(`模块 manifest 不存在: ${manifestPath}`);
    }
    const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));

    return manifest.scenarios
      .map((file) => {
        const scenarioPath = join(this.config.scenariosDir, moduleName, file);
        if (!existsSync(scenarioPath)) {
          throw new Error(`场景文件不存在: ${scenarioPath}`);
        }
        return parseScenario(JSON.parse(readFileSync(scenarioPath, "utf-8")), this.config.fixturesDir);
      })
      .filter((s) => {
        if (!scenarioFilter) return true;
        return s.id.includes(scenarioFilter) || s.id.endsWith(scenarioFilter);
      });
  }

  listModules(): { module: string; description?: string; scenarios: string[] }[] {
    const modules = discoverModules(this.config.scenariosDir);
    return modules.map((module) => {
      const manifestPath = join(this.config.scenariosDir, module, "manifest.json");
      if (!existsSync(manifestPath)) {
        return { module, scenarios: [] };
      }
      const manifest = parseManifest(JSON.parse(readFileSync(manifestPath, "utf-8")));
      return {
        module,
        description: manifest.description,
        scenarios: manifest.scenarios.map((f) => f.replace(".json", "")),
      };
    });
  }
}

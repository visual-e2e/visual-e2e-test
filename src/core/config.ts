import { readFileSync, existsSync } from "node:fs";
import { resolve, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { config as loadDotenv } from "dotenv";
import settingsJson from "../../config/settings.json" with { type: "json" };
import {
  resolveDefaultProjectId,
  resolveProjectContext,
  type ProjectContext,
} from "./project-context.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const rootDir = resolve(__dirname, "../..");

function loadEnvFiles(projectEnvPath: string): void {
  const rootEnv = resolve(rootDir, ".env");
  const rootExample = resolve(rootDir, ".env.example");
  if (existsSync(projectEnvPath)) {
    loadDotenv({ path: projectEnvPath });
  } else if (existsSync(rootEnv)) {
    loadDotenv({ path: rootEnv });
  } else if (existsSync(rootExample)) {
    loadDotenv({ path: rootExample });
  }
}

export interface AppConfig {
  projectId: string;
  projectRoot: string;
  baseUrl: string;
  username: string;
  password: string;
  login: {
    path: string;
    usernameSelector: string;
    passwordSelector: string;
    submitSelector: string;
  };
  browser: {
    headless: boolean;
    slowMo: number;
    devtools: boolean;
    channel: string;
    timeout: number;
    actionTimeout: number;
    navigationWaitUntil: "load" | "domcontentloaded" | "networkidle" | "commit";
    viewport: { width: number; height: number };
  };
  test: {
    defaultStepDelay: number;
    defaultStepTimeout: number;
    defaultReadyTimeout: number;
    intervalBetweenScenariosMs: number;
    continueOnScenarioFailure: boolean;
  };
  output: {
    baseDir: string;
    logsDir: string;
    videosDir: string;
    recordVideo: boolean;
  };
  logging: {
    level: string;
    consoleOutput: boolean;
  };
  scenariosDir: string;
  fixturesDir: string;
  variablesPath: string;
  profilesDir: string;
}

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v === undefined) return fallback;
  return v === "true" || v === "1";
}

function envInt(key: string, fallback: number): number {
  const v = process.env[key];
  if (v === undefined || v === "") return fallback;
  return parseInt(v, 10);
}

const LOGIN_DEFAULTS: AppConfig["login"] = {
  path: "/signin",
  usernameSelector: 'input[name="userAccount"]',
  passwordSelector: 'input[type="password"]',
  submitSelector: 'button:has-text("登录")',
};

function loadLoginConfig(variablesPath: string): AppConfig["login"] {
  const loginVars = loadVariables(variablesPath).login ?? {};
  return {
    path: loginVars.login_path ?? LOGIN_DEFAULTS.path,
    usernameSelector: loginVars.login_username_selector ?? LOGIN_DEFAULTS.usernameSelector,
    passwordSelector: loginVars.login_password_selector ?? LOGIN_DEFAULTS.passwordSelector,
    submitSelector: loginVars.login_submit_selector ?? LOGIN_DEFAULTS.submitSelector,
  };
}

export function loadConfig(overrides?: {
  projectId?: string;
  headless?: boolean;
  slowMo?: number;
}): AppConfig {
  const projectId = resolveDefaultProjectId(rootDir, overrides?.projectId);
  const project = resolveProjectContext(rootDir, projectId);
  loadEnvFiles(project.envPath);

  const s = settingsJson as {
    browser: AppConfig["browser"];
    test: AppConfig["test"];
    output: AppConfig["output"];
    logging: AppConfig["logging"];
  };

  const outputBase = join(project.root, s.output.baseDir);

  return {
    projectId: project.id,
    projectRoot: project.root,
    baseUrl: process.env.BASE_URL ?? "https://your-test-site.com",
    username: process.env.USERNAME ?? "",
    password: process.env.PASSWORD ?? "",
    login: loadLoginConfig(project.variablesPath),
    browser: {
      headless: overrides?.headless ?? envBool("HEADLESS", s.browser.headless),
      slowMo: overrides?.slowMo ?? envInt("SLOW_MO", s.browser.slowMo),
      devtools: s.browser.devtools,
      channel: process.env.BROWSER_CHANNEL ?? s.browser.channel,
      timeout: s.browser.timeout,
      actionTimeout: s.browser.actionTimeout,
      navigationWaitUntil: s.browser.navigationWaitUntil,
      viewport: s.browser.viewport,
    },
    test: s.test,
    output: {
      ...s.output,
      baseDir: outputBase,
      recordVideo: envBool("RECORD_VIDEO", (s.output as { recordVideo?: boolean }).recordVideo ?? true),
    },
    logging: s.logging,
    scenariosDir: project.scenariosDir,
    fixturesDir: project.fixturesDir,
    variablesPath: project.variablesPath,
    profilesDir: project.profilesDir,
  };
}

export function loadVariables(variablesPath?: string): Record<string, Record<string, string>> {
  const path = variablesPath ?? resolve(rootDir, "projects", resolveDefaultProjectId(rootDir), "fixtures", "variables.json");
  if (!existsSync(path)) return { global: {} };
  return JSON.parse(readFileSync(path, "utf-8")) as Record<string, Record<string, string>>;
}

export function getModuleVariables(
  allVars: Record<string, Record<string, string>>,
  module: string,
): Record<string, string> {
  return { ...(allVars.global ?? {}), ...(allVars[module] ?? {}) };
}

/** 从 .env / variables.json 注入的运行时变量，供场景 JSON 中的 {username} 等占位符使用 */
export function getRuntimeVariables(config: AppConfig): Record<string, string> {
  const loginVars = loadVariables(config.variablesPath).login ?? {};
  const displayName = loginVars.display_name?.trim() || config.username;
  return {
    username: config.username,
    display_name: displayName,
    password: config.password,
    login_path: config.login.path,
    login_username_selector: config.login.usernameSelector,
    login_password_selector: config.login.passwordSelector,
    login_submit_selector: config.login.submitSelector,
    base_url: config.baseUrl,
  };
}

export function toAppProjectPaths(project: ProjectContext) {
  return {
    projectId: project.id,
    projectRoot: project.root,
    scenariosDir: project.scenariosDir,
    fixturesDir: project.fixturesDir,
    variablesPath: project.variablesPath,
    profilesDir: project.profilesDir,
    envPath: project.envPath,
    runsDir: project.runsDir,
  };
}

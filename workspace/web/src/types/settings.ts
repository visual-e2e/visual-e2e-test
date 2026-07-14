export interface SettingsDraft {
  browser: {
    headless: boolean;
    slowMo: number;
    devtools: boolean;
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
}

export function defaultSettings(): SettingsDraft {
  return {
    browser: {
      headless: false,
      slowMo: 0,
      devtools: false,
      timeout: 30000,
      actionTimeout: 10000,
      navigationWaitUntil: "load",
      viewport: { width: 1280, height: 720 },
    },
    test: {
      defaultStepDelay: 2000,
      defaultStepTimeout: 10000,
      defaultReadyTimeout: 30000,
      intervalBetweenScenariosMs: 2000,
      continueOnScenarioFailure: true,
    },
    output: {
      baseDir: "runs",
      logsDir: "logs",
      videosDir: "videos",
      recordVideo: true,
    },
    logging: {
      level: "info",
      consoleOutput: true,
    },
  };
}

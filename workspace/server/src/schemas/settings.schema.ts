import { z } from "zod";

export const settingsSchema = z.object({
  browser: z.object({
    headless: z.boolean(),
    slowMo: z.number().int().min(0),
    devtools: z.boolean(),
    channel: z.string(),
    timeout: z.number().int().positive(),
    actionTimeout: z.number().int().positive(),
    navigationWaitUntil: z.enum(["load", "domcontentloaded", "networkidle", "commit"]),
    viewport: z.object({
      width: z.number().int().positive(),
      height: z.number().int().positive(),
    }),
  }),
  test: z.object({
    defaultStepDelay: z.number().int().min(0),
    defaultStepTimeout: z.number().int().positive(),
    defaultReadyTimeout: z.number().int().positive(),
    intervalBetweenScenariosMs: z.number().int().min(0),
    continueOnScenarioFailure: z.boolean(),
  }),
  output: z.object({
    baseDir: z.string().min(1),
    logsDir: z.string().min(1),
    videosDir: z.string().min(1),
    recordVideo: z.boolean(),
  }),
  logging: z.object({
    level: z.string().min(1),
    consoleOutput: z.boolean(),
  }),
});

export type SettingsDefinition = z.infer<typeof settingsSchema>;

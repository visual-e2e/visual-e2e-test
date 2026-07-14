import path from "node:path";
import { fileURLToPath } from "node:url";
import type { BrowserWindowConstructorOptions, WebPreferences } from "electron";

const ELECTRON_DIST_DIR = path.dirname(fileURLToPath(import.meta.url));

export function preloadPath(): string {
  return path.join(ELECTRON_DIST_DIR, "..", "preload.js");
}

function baseWebPreferences(): WebPreferences {
  return {
    contextIsolation: true,
    nodeIntegration: false,
  };
}

export function mainWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    center: true,
    title: "Visual E2E Test",
    webPreferences: {
      ...baseWebPreferences(),
      preload: preloadPath(),
    },
  };
}

export function reportWindowOptions(): BrowserWindowConstructorOptions {
  return {
    width: 1280,
    height: 900,
    center: true,
    title: "测试报告",
    webPreferences: baseWebPreferences(),
  };
}

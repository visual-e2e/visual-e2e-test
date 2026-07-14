import { app, Menu, type BrowserWindow } from "electron";
import { cleanupIfNeeded } from "./installer-cleanup.js";
import { registerIpcHandlers } from "./ipc/handlers.js";
import { buildApplicationMenu } from "./menu/application-menu.js";
import { startSidecar, stopSidecar } from "./sidecar.js";
import type { StorageLayout } from "./storage.js";
import { createMainWindow } from "./windows/create-window.js";

const isDev = !app.isPackaged;

let mainWindow: BrowserWindow | null = null;
let targetUrl = "";
let storageLayout: StorageLayout | null = null;
const reportWindows = new Set<BrowserWindow>();

async function bootstrap(): Promise<void> {
  registerIpcHandlers({ reportWindows });

  const { layout, baseUrl } = await startSidecar(isDev, process.resourcesPath, app.getPath("userData"));
  storageLayout = layout;
  cleanupIfNeeded(isDev, layout);

  targetUrl = isDev ? "http://localhost:5173" : baseUrl;
  mainWindow = createMainWindow(targetUrl, (win) => {
    if (mainWindow === win) mainWindow = null;
  });
  Menu.setApplicationMenu(buildApplicationMenu(layout));
}

app.whenReady().then(bootstrap).catch((err) => {
  console.error(err);
  app.exit(1);
});

app.on("before-quit", () => {
  stopSidecar();
  for (const win of reportWindows) {
    if (!win.isDestroyed()) win.destroy();
  }
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.focus();
    return;
  }
  if (targetUrl && storageLayout) {
    mainWindow = createMainWindow(targetUrl, (win) => {
      if (mainWindow === win) mainWindow = null;
    });
    Menu.setApplicationMenu(buildApplicationMenu(storageLayout));
  }
});

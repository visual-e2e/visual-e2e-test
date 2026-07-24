import { writeFileSync } from "node:fs";
import path from "node:path";
import {
  app, BrowserWindow, dialog, ipcMain, shell, type BrowserWindow as BrowserWindowType,
} from "electron";
import { createReportWindow } from "../windows/create-window.js";
import { ensureToolRunning, stopTool } from "../tools/tool-manager.js";

export interface IpcContext {
  reportWindow: BrowserWindowType | null;
  isDev: boolean;
  appRoot: string;
  nodeBinary: string;
}

export function registerIpcHandlers(ctx: IpcContext): void {
  ipcMain.handle("save-file", async (_event, defaultName: string, data: ArrayBuffer) => {
    const { filePath, canceled } = await dialog.showSaveDialog({
      title: "保存运行报告",
      defaultPath: path.join(app.getPath("downloads"), defaultName),
      filters: [{ name: "ZIP 压缩包", extensions: ["zip"] }],
    });
    if (canceled || !filePath) return null;
    writeFileSync(filePath, Buffer.from(data));
    return filePath;
  });

  ipcMain.handle("pick-executable", async () => {
    const isMac = process.platform === "darwin";
    const isWin = process.platform === "win32";
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "选择 Chrome 或 Chromium",
      message: isMac
        ? "可选择 .app 应用包，或 Contents/MacOS 下的可执行文件"
        : undefined,
      properties: isMac ? ["openFile", "openDirectory"] : ["openFile"],
      filters: isWin
        ? [{ name: "浏览器", extensions: ["exe"] }]
        : undefined,
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0] ?? null;
  });

  ipcMain.handle("pick-folder", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      properties: ["openDirectory"],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0] ?? null;
  });

  ipcMain.handle("show-item-in-folder", (_event, targetPath: string) => {
    if (!targetPath?.trim()) throw new Error("path 不能为空");
    shell.showItemInFolder(path.resolve(targetPath));
  });

  ipcMain.handle("open-report", async (_event, url: string) => {
    const existing = ctx.reportWindow;
    if (existing && !existing.isDestroyed()) {
      await existing.loadURL(url);
      if (existing.isMinimized()) existing.restore();
      existing.focus();
      return;
    }

    const win = createReportWindow(url, () => {
      if (ctx.reportWindow === win) ctx.reportWindow = null;
    });
    ctx.reportWindow = win;
  });

  ipcMain.handle("open-external-tool", async (_event, url: string, title?: string) => {
    const win = new BrowserWindow({
      width: 1280,
      height: 900,
      center: true,
      title: title?.trim() || "外部工具",
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
      },
    });
    let closed = false;
    win.once("closed", () => {
      closed = true;
    });
    try {
      await win.loadURL(url);
    } catch (error) {
      if (closed || win.isDestroyed()) return;
      throw error;
    }
  });

  ipcMain.handle("pick-tool-package", async () => {
    const { canceled, filePaths } = await dialog.showOpenDialog({
      title: "选择工具安装包",
      properties: ["openFile"],
      filters: [
        { name: "Visual E2E Tool", extensions: ["vettool.zip", "zip"] },
      ],
    });
    if (canceled || filePaths.length === 0) return null;
    return filePaths[0] ?? null;
  });

  ipcMain.handle("ensure-builtin-tool", async (_event, toolId: string) => {
    if (!toolId?.trim()) {
      throw new Error("toolId 不能为空");
    }
    return ensureToolRunning(toolId, ctx.isDev, ctx.appRoot, ctx.nodeBinary);
  });

  ipcMain.handle("ensure-tool", async (_event, toolId: string) => {
    if (!toolId?.trim()) {
      throw new Error("toolId 不能为空");
    }
    return ensureToolRunning(toolId, ctx.isDev, ctx.appRoot, ctx.nodeBinary);
  });

  ipcMain.handle("stop-tool", async (_event, toolId: string) => {
    if (!toolId?.trim()) {
      throw new Error("toolId 不能为空");
    }
    stopTool(toolId);
    return { ok: true };
  });
}

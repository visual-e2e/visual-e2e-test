import { writeFileSync } from "node:fs";
import path from "node:path";
import { app, dialog, ipcMain, type BrowserWindow } from "electron";
import { createReportWindow } from "../windows/create-window.js";

export interface IpcContext {
  reportWindow: BrowserWindow | null;
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
}

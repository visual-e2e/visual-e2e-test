import { writeFileSync, mkdirSync } from "node:fs";
import path from "node:path";
import {
  app, BrowserWindow, dialog, ipcMain, shell, type BrowserWindow as BrowserWindowType,
} from "electron";
import { createReportWindow } from "../windows/create-window.js";
import { ensureToolRunning, stopToolAndWait } from "../tools/tool-manager.js";

export interface IpcContext {
  reportWindow: BrowserWindowType | null;
  isDev: boolean;
  appRoot: string;
  nodeBinary: string;
}

function assertHttpUrl(url: string): URL {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("无效的下载地址");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("仅支持 http/https 下载");
  }
  return parsed;
}

async function downloadToTemp(url: string, filenameHint?: string): Promise<string> {
  const parsed = assertHttpUrl(url);
  const response = await fetch(parsed.href, {
    redirect: "follow",
    signal: AbortSignal.timeout(120_000),
  });
  if (!response.ok) {
    throw new Error(`下载失败 HTTP ${response.status}`);
  }

  const hint =
    filenameHint?.trim() ||
    path.basename(parsed.pathname) ||
    `tool-${Date.now()}.vettool.zip`;
  const safeName = hint.replace(/[^\w.\-]+/g, "_");
  const dir = path.join(app.getPath("temp"), "visual-e2e-tool-downloads");
  mkdirSync(dir, { recursive: true });
  const dest = path.join(dir, `${Date.now()}-${safeName}`);
  const buf = Buffer.from(await response.arrayBuffer());
  writeFileSync(dest, buf);
  return dest;
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

  ipcMain.handle(
    "download-tool-package",
    async (_event, url: string, filename?: string) => {
      if (!url?.trim()) throw new Error("url 不能为空");
      return downloadToTemp(url.trim(), filename);
    },
  );

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
    await stopToolAndWait(toolId);
    return { ok: true };
  });
}

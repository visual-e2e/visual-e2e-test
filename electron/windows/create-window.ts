import { BrowserWindow } from "electron";
import { attachEditSupport } from "../web-contents/edit-support.js";
import { mainWindowOptions, reportWindowOptions } from "./defaults.js";

export function createMainWindow(
  url: string,
  onClosed?: (win: BrowserWindow) => void,
): BrowserWindow {
  const win = new BrowserWindow(mainWindowOptions());
  attachEditSupport(win.webContents);
  void win.loadURL(url);
  win.on("closed", () => onClosed?.(win));
  return win;
}

export function createReportWindow(
  url: string,
  onClosed?: (win: BrowserWindow) => void,
): BrowserWindow {
  const win = new BrowserWindow(reportWindowOptions());
  attachEditSupport(win.webContents);
  win.webContents.setWindowOpenHandler(({ url: targetUrl }) => {
    void win.loadURL(targetUrl);
    return { action: "deny" };
  });
  win.on("closed", () => onClosed?.(win));
  void win.loadURL(url);
  return win;
}

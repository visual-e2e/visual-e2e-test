import { BrowserWindow, type MenuItemConstructorOptions } from "electron";

function focusedWebContents() {
  return BrowserWindow.getFocusedWindow()?.webContents;
}

export function buildViewMenu(): MenuItemConstructorOptions {
  const fullscreenAccel =
    process.platform === "darwin" ? "Ctrl+Command+F" : "F11";
  const devtoolsAccel =
    process.platform === "darwin" ? "Alt+Command+I" : "F12";

  return {
    label: "视图",
    submenu: [
      {
        label: "刷新",
        accelerator: "CmdOrCtrl+R",
        click: () => focusedWebContents()?.reload(),
      },
      { type: "separator" },
      {
        label: "全屏",
        accelerator: fullscreenAccel,
        role: "togglefullscreen",
      },
      { type: "separator" },
      {
        label: "开发者工具",
        accelerator: devtoolsAccel,
        click: () => focusedWebContents()?.toggleDevTools(),
      },
      { type: "separator" },
      { role: "resetZoom", label: "实际大小", accelerator: "CmdOrCtrl+0" },
      { role: "zoomIn", label: "放大", accelerator: "CmdOrCtrl+=" },
      { role: "zoomOut", label: "缩小", accelerator: "CmdOrCtrl+-" },
    ],
  };
}

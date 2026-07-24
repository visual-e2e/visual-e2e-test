import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  saveFile: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("save-file", defaultName, data) as Promise<string | null>,
  openReport: (url: string) => ipcRenderer.invoke("open-report", url) as Promise<void>,
  pickFolder: () => ipcRenderer.invoke("pick-folder") as Promise<string | null>,
  pickExecutable: () => ipcRenderer.invoke("pick-executable") as Promise<string | null>,
  pickToolPackage: () => ipcRenderer.invoke("pick-tool-package") as Promise<string | null>,
  downloadToolPackage: (url: string, filename?: string) =>
    ipcRenderer.invoke("download-tool-package", url, filename) as Promise<string>,
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke("show-item-in-folder", path) as Promise<void>,
  openExternalTool: (url: string, title?: string) =>
    ipcRenderer.invoke("open-external-tool", url, title) as Promise<void>,
  ensureBuiltinTool: (toolId: string) =>
    ipcRenderer.invoke("ensure-builtin-tool", toolId) as Promise<number>,
  ensureTool: (toolId: string) =>
    ipcRenderer.invoke("ensure-tool", toolId) as Promise<number>,
  stopTool: (toolId: string) =>
    ipcRenderer.invoke("stop-tool", toolId) as Promise<{ ok: boolean }>,
});

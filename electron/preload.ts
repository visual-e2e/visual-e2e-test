import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("electronAPI", {
  isElectron: true,
  saveFile: (defaultName: string, data: ArrayBuffer) =>
    ipcRenderer.invoke("save-file", defaultName, data) as Promise<string | null>,
  openReport: (url: string) => ipcRenderer.invoke("open-report", url) as Promise<void>,
  pickFolder: () => ipcRenderer.invoke("pick-folder") as Promise<string | null>,
  pickExecutable: () => ipcRenderer.invoke("pick-executable") as Promise<string | null>,
  showItemInFolder: (path: string) =>
    ipcRenderer.invoke("show-item-in-folder", path) as Promise<void>,
  openExternalTool: (url: string, title?: string) =>
    ipcRenderer.invoke("open-external-tool", url, title) as Promise<void>,
  ensureBuiltinTool: (toolId: string) =>
    ipcRenderer.invoke("ensure-builtin-tool", toolId) as Promise<number>,
});

import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inventoryApi", {
  openInventory: () =>
    ipcRenderer.invoke("inventory:open") as Promise<{ filePath: string; content: string } | null>,

  saveInventory: (payload: { filePath?: string; content: string }) =>
    ipcRenderer.invoke("inventory:save", payload) as Promise<{ filePath: string } | null>,

  minimizeWindow: () =>
    ipcRenderer.invoke("window:minimize") as Promise<void>,

  toggleMaximizeWindow: () =>
    ipcRenderer.invoke("window:toggleMaximize") as Promise<void>,

  closeWindow: () =>
    ipcRenderer.invoke("window:close") as Promise<void>,

  setWindowSize: (payload: { width: number; height: number }) =>
    ipcRenderer.invoke("window:setSize", payload) as Promise<void>
});

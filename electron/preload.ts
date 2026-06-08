import { contextBridge, ipcRenderer } from "electron";

contextBridge.exposeInMainWorld("inventoryApi", {
  openInventory: () => ipcRenderer.invoke("inventory:open"),
  saveInventory: (payload: { filePath?: string; content: string }) =>
    ipcRenderer.invoke("inventory:save", payload),
  minimizeWindow: () => ipcRenderer.invoke("window:minimize"),
  toggleMaximizeWindow: () => ipcRenderer.invoke("window:toggle-maximize"),
  closeWindow: () => ipcRenderer.invoke("window:close"),
  setWindowSize: (payload: { width: number; height: number }) =>
    ipcRenderer.invoke("window:set-size", payload)
});
// lol what else i supposed to be here?
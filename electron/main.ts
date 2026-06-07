import { app, BrowserWindow, dialog, ipcMain, shell } from "electron";
import { readFileSync, writeFileSync } from "fs";
import { join } from "path";

const isDev = !app.isPackaged;

function createWindow() {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    frame: false,
    backgroundColor: "#111820",
    icon: join(__dirname, "../src/assets/icon.ico"),
    webPreferences: {
      // vite-plugin-electron builds the preload as preload.mjs
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    }
  });

  if (isDev) {
    win.loadURL("http://localhost:5173");
    win.webContents.openDevTools();
  } else {
    win.loadFile(join(__dirname, "../dist/index.html"));
  }

  // Open external links in the system browser instead of Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  return win;
}

app.whenReady().then(() => {
  const win = createWindow();

  // Window controls
  ipcMain.handle("window:minimize", () => {
    win.minimize();
  });

  ipcMain.handle("window:toggleMaximize", () => {
    if (win.isMaximized()) {
      win.unmaximize();
    } else {
      win.maximize();
    }
  });

  ipcMain.handle("window:close", () => {
    win.close();
  });

  ipcMain.handle("window:setSize", (_event, { width, height }: { width: number; height: number }) => {
    win.setSize(width, height, true);
    win.center();
  });

  // Inventory file I/O
  ipcMain.handle("inventory:open", async () => {
    const result = await dialog.showOpenDialog(win, {
      title: "Open Inventory File",
      filters: [
        { name: "Text / KV Files", extensions: ["txt", "kv", "*"] },
        { name: "All Files", extensions: ["*"] }
      ],
      properties: ["openFile"]
    });

    if (result.canceled || result.filePaths.length === 0) return null;

    const filePath = result.filePaths[0];
    const content = readFileSync(filePath, "utf-8");
    return { filePath, content };
  });

  ipcMain.handle("inventory:save", async (_event, { filePath, content }: { filePath?: string; content: string }) => {
    let targetPath = filePath;

    if (!targetPath) {
      const result = await dialog.showSaveDialog(win, {
        title: "Save Inventory File",
        defaultPath: "inventory.txt",
        filters: [
          { name: "Text / KV Files", extensions: ["txt", "kv"] },
          { name: "All Files", extensions: ["*"] }
        ]
      });

      if (result.canceled || !result.filePath) return null;
      targetPath = result.filePath;
    }

    writeFileSync(targetPath, content, "utf-8");
    return { filePath: targetPath };
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  // On macOS apps stay alive until Cmd+Q; on all other platforms quit normally
  if (process.platform !== "darwin") app.quit();
});

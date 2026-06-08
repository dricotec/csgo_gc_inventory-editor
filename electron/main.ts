import { app, BrowserWindow, dialog, ipcMain, shell, type IpcMainInvokeEvent } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const isDev = !app.isPackaged;
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

let mainWindow: BrowserWindow | null = null;

const createWindow = async () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 960,
    minHeight: 640,
    resizable: true,
    maximizable: true,
    fullscreenable: true,
    frame: false,
    titleBarStyle: "hidden",
    backgroundColor: "#0b0f19",
    webPreferences: {
      preload: join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      devTools: false
    }
  });

  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url);
    return { action: "deny" };
  });

  mainWindow.webContents.on("will-navigate", (event, url) => {
    if (url !== mainWindow?.webContents.getURL()) {
      event.preventDefault();
      void shell.openExternal(url);
    }
  });

  mainWindow.webContents.on("before-input-event", (event, input) => {
    const isDevtools =
      input.key === "F12" ||
      (input.control && input.shift && ["I", "J", "C"].includes(input.key));
    if (isDevtools) {
      event.preventDefault();
    }
  });

  if (isDev && process.env.VITE_DEV_SERVER_URL) {
    await mainWindow.loadURL(process.env.VITE_DEV_SERVER_URL);
  } else {
    await mainWindow.loadFile(join(__dirname, "../dist/index.html"));
  }
};

ipcMain.handle("window:minimize", () => {
  mainWindow?.minimize();
});

ipcMain.handle("window:toggle-maximize", () => {
  if (!mainWindow) return;
  if (mainWindow.isMaximized()) {
    mainWindow.unmaximize();
  } else {
    mainWindow.maximize();
  }
});

ipcMain.handle("window:close", () => {
  mainWindow?.close();
});

ipcMain.handle("window:set-size", (_event, payload: { width: number; height: number }) => {
  if (!mainWindow) return;
  mainWindow.setSize(payload.width, payload.height);
  mainWindow.center();
});

ipcMain.handle("inventory:open", async () => {
  const result = await dialog.showOpenDialog({
    title: "Open inventory.txt",
    defaultPath: "inventory.txt",
    filters: [{ name: "Inventory (.txt)", extensions: ["txt"] }],
    properties: ["openFile"]
  });

  if (result.canceled || result.filePaths.length === 0) {
    return null;
  }

  const filePath = result.filePaths[0];
  const content = await readFile(filePath, "utf-8");
  return { filePath, content };
});

ipcMain.handle(
  "inventory:save",
  async (_event: IpcMainInvokeEvent, payload: { filePath?: string; content: string }) => {
  let filePath = payload.filePath;

  if (!filePath) {
    const result = await dialog.showSaveDialog({
      title: "Save inventory.txt",
      filters: [{ name: "Inventory", extensions: ["txt", "vdf"] }]
    });

    if (result.canceled || !result.filePath) {
      return null;
    }

    filePath = result.filePath;
  }

  await writeFile(filePath, payload.content, "utf-8");
    return { filePath };
  }
);

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});

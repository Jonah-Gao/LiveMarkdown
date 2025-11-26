import { app, BrowserWindow, ipcMain } from "electron";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "fs";
import * as pty from "@lydell/node-pty";
import os from "os";
const __dirname$1 = path.dirname(fileURLToPath(import.meta.url));
const shell = os.platform() === "win32" ? "powershell.exe" : "bash";
const ptyProcess = pty.spawn(shell, [], {
  name: "xterm-color",
  cols: 80,
  rows: 30,
  cwd: process.env.HOME,
  env: process.env
});
process.env.APP_ROOT = path.join(__dirname$1, "..");
const VITE_DEV_SERVER_URL = process.env["VITE_DEV_SERVER_URL"];
const RENDERER_DIST = path.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, "public") : RENDERER_DIST;
let win;
async function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname$1, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false
    },
    icon: path.join(process.env.VITE_PUBLIC ?? "", "electron-vite.svg")
  });
  win.webContents.on("did-finish-load", () => {
    win == null ? void 0 : win.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  });
  if (VITE_DEV_SERVER_URL) {
    await win.loadURL(VITE_DEV_SERVER_URL);
  } else {
    await win.loadFile(path.join(RENDERER_DIST, "index.html"));
  }
}
app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
    win = null;
  }
});
app.on("activate", async () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    await createWindow();
  }
});
ipcMain.handle("read-dir", async (_event, dirPath) => {
  try {
    const entries = await fs.promises.readdir(dirPath, { withFileTypes: true });
    const nodes = [];
    for (const entry of entries) {
      const fullPath = path.join(dirPath, entry.name);
      try {
        const node = {
          name: entry.name,
          path: fullPath,
          isDirectory: entry.isDirectory(),
          expanded: false
        };
        nodes.push(node);
      } catch (e) {
        console.error("Error processing file:", fullPath, e);
      }
    }
    return nodes.sort((a, b) => {
      if (a.isDirectory && !b.isDirectory) return -1;
      if (!a.isDirectory && b.isDirectory) return 1;
      return a.name.localeCompare(b.name);
    });
  } catch (err) {
    console.error("Error reading directory:", dirPath, err);
    return [];
  }
});
ipcMain.handle("create-tab", async (_event, name, path2) => {
  const content = await fs.promises.readFile(path2, "utf-8");
  return {
    id: `file-${Date.now()}`,
    name,
    path: path2,
    content,
    isDirty: false
  };
});
ipcMain.on("terminal-input", (_event, data) => {
  console.log("[debug] terminal input:", data);
  ptyProcess.write(data);
});
ptyProcess.onData((data) => {
  console.log("[debug] terminal output:", data.toString());
  win == null ? void 0 : win.webContents.send("terminal-output", data);
});
ptyProcess.onData((data) => {
  win == null ? void 0 : win.webContents.send("terminal-output", data);
});
ipcMain.on("terminal-resize", (_event, size) => {
  ptyProcess.resize(size.cols, size.rows);
});
app.whenReady().then(createWindow);
export {
  RENDERER_DIST,
  VITE_DEV_SERVER_URL
};

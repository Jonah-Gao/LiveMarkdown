import { app as p, BrowserWindow as w, ipcMain as a } from "electron";
import { fileURLToPath as v } from "node:url";
import r from "node:path";
import u from "fs";
import * as E from "@lydell/node-pty";
import R from "os";
const h = r.dirname(v(import.meta.url));
let s;
process.env.APP_ROOT = r.join(h, "..");
const d = process.env.VITE_DEV_SERVER_URL, y = r.join(process.env.APP_ROOT, "dist");
process.env.VITE_PUBLIC = d ? r.join(process.env.APP_ROOT, "public") : y;
let o;
async function _() {
  o = new w({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: r.join(h, "preload.mjs"),
      contextIsolation: !0,
      nodeIntegration: !1,
      sandbox: !1
    },
    icon: r.join(process.env.VITE_PUBLIC ?? "", "electron-vite.svg")
  }), o.webContents.on("did-finish-load", () => {
    o == null || o.webContents.send("main-process-message", (/* @__PURE__ */ new Date()).toLocaleString());
  }), d ? await o.loadURL(d) : await o.loadFile(r.join(y, "index.html"));
}
p.on("window-all-closed", () => {
  process.platform !== "darwin" && (p.quit(), o = null);
});
p.on("activate", async () => {
  w.getAllWindows().length === 0 && await _();
});
a.handle("read-dir", async (c, e) => {
  try {
    const n = await u.promises.readdir(e, { withFileTypes: !0 }), l = [];
    for (const t of n) {
      const i = r.extname(t.name).slice(1), f = r.join(e, t.name);
      try {
        const m = {
          name: t.name,
          path: f,
          extension: i,
          isDirectory: t.isDirectory(),
          expanded: !1
        };
        l.push(m);
      } catch (m) {
        console.error("Error processing file:", f, m);
      }
    }
    return l.sort((t, i) => t.isDirectory && !i.isDirectory ? -1 : !t.isDirectory && i.isDirectory ? 1 : t.name.localeCompare(i.name));
  } catch (n) {
    return console.error("Error reading directory:", e, n), [];
  }
});
a.handle("create-tab", async (c, e, n) => {
  const l = await u.promises.readFile(n, "utf-8");
  return {
    id: `file-${Date.now()}`,
    name: e,
    path: n,
    content: l,
    isDirty: !1
  };
});
a.on("terminal-init", (c) => {
  const e = R.platform() === "win32" ? "powershell.exe" : "bash";
  s = E.spawn(e, [], {
    name: "xterm-color",
    cols: 80,
    rows: 30,
    cwd: process.env.HOME,
    env: process.env
  }), s.onData((n) => {
    console.log("[debug] terminal output:", n.toString()), o == null || o.webContents.send("terminal-output", n);
  });
});
a.on("terminal-input", (c, e) => {
  console.log("[debug] terminal input:", e), s && s.write(e);
});
a.on("terminal-resize", (c, e) => {
  s && s.resize(e.cols, e.rows);
});
p.whenReady().then(_);
export {
  y as RENDERER_DIST,
  d as VITE_DEV_SERVER_URL
};

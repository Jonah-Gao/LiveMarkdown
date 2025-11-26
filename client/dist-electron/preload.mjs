import { contextBridge, ipcRenderer } from "electron";
import path from "node:path";
contextBridge.exposeInMainWorld("ipcRenderer", {
  on(...args) {
    const [channel, listener] = args;
    return ipcRenderer.on(channel, (event, ...args2) => listener(event, ...args2));
  },
  off(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.off(channel, ...omit);
  },
  send(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.send(channel, ...omit);
  },
  invoke(...args) {
    const [channel, ...omit] = args;
    return ipcRenderer.invoke(channel, ...omit);
  }
  // You can expose other APTs you need here.
  // ...
});
contextBridge.exposeInMainWorld("fileAPI", {
  readDir: (dir) => ipcRenderer.invoke("read-dir", dir),
  createTab: (name, path2) => ipcRenderer.invoke("create-tab", name, path2)
});
contextBridge.exposeInMainWorld("nodePath", {
  join: (...args) => path.join(...args),
  dirname: (p) => path.dirname(p),
  basename: (p, ext) => path.basename(p, ext)
});
contextBridge.exposeInMainWorld("terminal", {
  input: (data) => ipcRenderer.send("terminal-input", data),
  onOutput: (callback) => ipcRenderer.on("terminal-output", (_event, data) => callback(data))
});

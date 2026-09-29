const { contextBridge, ipcRenderer } = require('electron');
contextBridge.exposeInMainWorld('owDesktop', {
  saveKey: (provider, value) => ipcRenderer.invoke('ow:save-key', provider, value),
});

const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('whatsbot', {
  loadSettings: () => ipcRenderer.invoke('settings:load'),
  saveSettings: data => ipcRenderer.invoke('settings:save', data),
});

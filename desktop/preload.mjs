import { contextBridge, ipcRenderer } from 'electron';

// The renderer stays isolated from Node. Only the small, user-facing update
// controls are exposed to the workbench page.
contextBridge.exposeInMainWorld('summerDesktop', {
  isDesktop: true,
  checkForUpdates: () => ipcRenderer.invoke('desktop-update-check'),
  downloadUpdate: () => ipcRenderer.invoke('desktop-update-download'),
  restartAndInstall: () => ipcRenderer.send('desktop-update-install'),
  onUpdateAvailable: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-available', listener);
    return () => ipcRenderer.removeListener('desktop-update-available', listener);
  },
  onUpdateProgress: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-progress', listener);
    return () => ipcRenderer.removeListener('desktop-update-progress', listener);
  },
  onUpdateDownloaded: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-downloaded', listener);
    return () => ipcRenderer.removeListener('desktop-update-downloaded', listener);
  },
  onUpdateError: callback => {
    const listener = (_event, payload) => callback(payload);
    ipcRenderer.on('desktop-update-error', listener);
    return () => ipcRenderer.removeListener('desktop-update-error', listener);
  },
});

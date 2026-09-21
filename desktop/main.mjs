import { app, BrowserWindow, dialog, ipcMain } from 'electron';
// electron-updater is published as CommonJS. Import its default export so the
// packaged ESM entry point also works in Electron's production runtime.
import updater from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer } from './local-server.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
const { autoUpdater } = updater;
let mainWindow;
let localServer;

function sendUpdateEvent(channel, payload = {}) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}

function workbenchRoot() {
  return app.isPackaged
    ? join(process.resourcesPath, 'workbench')
    : join(here, '.build', 'workbench');
}

async function startWorkbench() {
  const root = workbenchRoot();
  if (!existsSync(join(root, 'index.html'))) throw new Error('工作台界面文件不存在，请重新安装。');
  const dataPath = join(app.getPath('userData'), 'workspace.json');
  localServer = await startLocalServer({ root, dataPath });
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 960,
    minWidth: 980,
    minHeight: 720,
    title: 'Summer 工作台',
    backgroundColor: '#f7efd9',
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(here, 'preload.mjs'),
    },
  });
  await mainWindow.loadURL(localServer.url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function enableAutomaticUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-available', info => {
    sendUpdateEvent('desktop-update-available', { version: info?.version || '' });
  });
  autoUpdater.on('download-progress', progress => {
    sendUpdateEvent('desktop-update-progress', { percent: Math.round(progress?.percent || 0) });
  });
  autoUpdater.on('update-downloaded', info => {
    sendUpdateEvent('desktop-update-downloaded', { version: info?.version || '' });
  });
  autoUpdater.on('error', error => {
    sendUpdateEvent('desktop-update-error', { message: error instanceof Error ? error.message : '更新失败' });
  });

  ipcMain.handle('desktop-update-check', async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      const version = result?.updateInfo?.version || '';
      if (version) sendUpdateEvent('desktop-update-available', { version });
      return { available: Boolean(version), version };
    } catch (error) {
      sendUpdateEvent('desktop-update-error', { message: error instanceof Error ? error.message : '更新检查失败' });
      return { available: false };
    }
  });
  ipcMain.handle('desktop-update-download', async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (error) {
      sendUpdateEvent('desktop-update-error', { message: error instanceof Error ? error.message : '下载更新失败' });
      return { ok: false };
    }
  });
  ipcMain.on('desktop-update-install', () => autoUpdater.quitAndInstall(false, true));

}

app.whenReady().then(async () => {
  try {
    await startWorkbench();
    enableAutomaticUpdates();
  } catch (error) {
    await dialog.showMessageBox({
      type: 'error',
      title: 'Summer 工作台无法启动',
      message: error instanceof Error ? error.message : '本地服务启动失败。',
      detail: '请先关闭已经打开的旧版工作台，再重新打开桌面图标。记录不会被删除。',
    });
    app.quit();
  }
});

app.on('before-quit', () => {
  localServer?.server.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

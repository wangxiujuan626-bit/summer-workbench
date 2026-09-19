import { app, BrowserWindow, dialog } from 'electron';
import { autoUpdater } from 'electron-updater';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { startLocalServer } from './local-server.mjs';

const here = fileURLToPath(new URL('.', import.meta.url));
let mainWindow;
let localServer;

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
    },
  });
  await mainWindow.loadURL(localServer.url);
  mainWindow.on('closed', () => { mainWindow = null; });
}

function enableAutomaticUpdates() {
  if (!app.isPackaged) return;
  autoUpdater.autoDownload = true;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.on('update-downloaded', async () => {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: 'info',
      title: '工作台已准备好更新',
      message: '新版本已经下载完成，重启后即可完成更新。你的记录和头像会保留。',
      buttons: ['立即重启更新', '稍后更新'],
      defaultId: 0,
      cancelId: 1,
    });
    if (choice.response === 0) autoUpdater.quitAndInstall(false, true);
  });
  autoUpdater.checkForUpdatesAndNotify().catch(() => {});
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


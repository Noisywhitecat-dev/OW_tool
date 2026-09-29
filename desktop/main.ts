import { app, BrowserWindow, dialog, ipcMain, safeStorage, shell } from 'electron';
import { randomBytes } from 'node:crypto';
import { join } from 'node:path';
import type { Server } from 'node:http';
import { Store } from '../server/store';
import { createApp } from '../server/app';
import { KeyVault } from './vault';

let window: BrowserWindow | null = null;
let server: Server | null = null;
let quitting = false;
const qaDirectory = process.env.OW_COMPASS_QA_DATA_DIR;
if (qaDirectory) app.setPath('userData', qaDirectory);
app.setName('OW Compass');
if (!app.requestSingleInstanceLock()) app.quit();
else {
  app.on('second-instance', () => { if (window?.isMinimized()) window.restore(); window?.focus(); });
  void app.whenReady().then(async () => {
    // Do not silently import credentials from the launching shell or another app.
    delete process.env.GEMINI_API_KEY; delete process.env.OPENAI_API_KEY;
    const vault = new KeyVault(join(app.getPath('userData'), 'credentials.enc.json'), {
      available: () => process.platform === 'win32' && safeStorage.isEncryptionAvailable(),
      encrypt: value => safeStorage.encryptString(value), decrypt: value => safeStorage.decryptString(value),
    });
    try { await vault.load(); }
    catch { dialog.showErrorBox('키를 읽을 수 없습니다', '이 Windows 계정에서 저장한 키를 읽지 못했습니다. 설정에서 키를 다시 저장해 주세요.'); }
    const store = new Store(join(app.getPath('userData'), 'data'));
    await store.initialize();
    const token = randomBytes(32).toString('hex');
    const backend = createApp(store, {}, join(app.getAppPath(), 'dist'), token);
    server = await new Promise<Server>((resolve, reject) => {
      const listener = backend.listen(0, '127.0.0.1', () => resolve(listener)); listener.once('error', reject);
    });
    const address = server.address(); if (!address || typeof address === 'string') throw new Error('Local server unavailable');
    const origin = `http://127.0.0.1:${address.port}`;
    window = new BrowserWindow({ width: 1360, height: 920, minWidth: 900, minHeight: 650, show: false, title: 'OW Compass', backgroundColor: '#10151c',
      autoHideMenuBar: true, webPreferences: { preload: join(__dirname, 'preload.cjs'), contextIsolation: true, nodeIntegration: false, sandbox: true } });
    const contents = window.webContents;
    contents.session.webRequest.onBeforeSendHeaders({ urls: [origin + '/*'] }, (details, callback) => callback({ requestHeaders: { ...details.requestHeaders, 'X-OW-Session': token } }));
    contents.session.setPermissionRequestHandler((_contents, _permission, callback) => callback(false));
    contents.setWindowOpenHandler(({ url }) => { if (/^https:\/\//.test(url)) void shell.openExternal(url); return { action: 'deny' }; });
    contents.on('will-navigate', (event, url) => { if (new URL(url).origin !== origin) event.preventDefault(); });
    ipcMain.handle('ow:save-key', async (event, provider: unknown, value: unknown) => {
      if (event.sender !== contents || event.senderFrame !== contents.mainFrame || new URL(event.senderFrame.url).origin !== origin) return { ok: false, error: '허용되지 않은 요청입니다.' };
      if (backend.locals.isBusy()) return { ok: false, error: '추천 요청 또는 저장이 끝난 뒤 키를 변경해 주세요.' };
      try { await vault.set(provider, value); return { ok: true }; }
      catch { return { ok: false, error: '키를 암호화하여 저장하지 못했습니다. 입력값과 Windows 계정을 확인해 주세요.' }; }
    });
    let closingDialog = false;
    window.on('close', event => {
      if (!quitting && backend.locals.isBusy()) {
        event.preventDefault(); if (closingDialog) return; closingDialog = true;
        void dialog.showMessageBox(window!, { type: 'question', title: '진행 중인 작업', message: '현재 추천 요청 또는 저장이 진행 중입니다.', detail: '지금 종료하면 진행 중인 작업은 중단됩니다. 이미 저장된 메타는 유지되며, 완료하지 못한 API 요청도 사용량에 포함될 수 있습니다.', buttons: ['계속 기다리기', '작업을 중단하고 종료'], defaultId: 0, cancelId: 0 }).then(result => { closingDialog = false; if (result.response === 1) { quitting = true; app.quit(); } });
      }
    });
    window.once('ready-to-show', () => { if (process.env.OW_COMPASS_SMOKE_TEST !== '1') window?.show(); });
    window.on('closed', () => { window = null; });
    await window.loadURL(origin);
    console.log('OW Compass desktop ready; local window loaded; encrypted storage available: ' + safeStorage.isEncryptionAvailable());
    if (process.env.OW_COMPASS_SMOKE_TEST === '1') {
      if (!qaDirectory) throw new Error('Smoke test requires isolated QA directory');
      const value = 'ow-compass-test-placeholder'; const encrypted = safeStorage.encryptString(value);
      if (safeStorage.decryptString(encrypted) !== value) throw new Error('DPAPI roundtrip failed');
      console.log('DESKTOP_SMOKE_OK: window loaded, loopback server started, Windows DPAPI roundtrip passed');
      quitting = true; app.quit();
    }
  }).catch(error => { console.error('Desktop startup failed: ' + (error instanceof Error ? error.message : 'unknown')); dialog.showErrorBox('실행 실패', '앱 데이터를 읽거나 로컬 실행 환경을 준비하지 못했습니다. 앱을 다시 실행해 주세요.'); app.quit(); });
  app.on('window-all-closed', () => app.quit());
  app.on('before-quit', () => { if (quitting || !window) { server?.closeAllConnections(); server?.close(); } });
}

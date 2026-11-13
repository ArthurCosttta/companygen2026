import { app, BrowserWindow, ipcMain, session, shell, webContents } from 'electron';
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = process.env.COMPANYGEN_URL || 'http://127.0.0.1:1245/';
const whatsappOrigin = 'https://web.whatsapp.com';
let serverProcess;
let quitting = false;

app.setName('CompanyGen');
app.setPath('userData', process.env.COMPANYGEN_USER_DATA || path.join(app.getPath('appData'), 'CompanyGen'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
// Some Windows/driver combinations render Electron as a completely black
// surface. CompanyGen does not need GPU acceleration, and disabling it keeps
// the shell and the embedded WhatsApp Web observable and interactive.
app.disableHardwareAcceleration();

async function serverAvailable() {
  try {
    const response = await fetch(appUrl, { method: 'HEAD', signal: AbortSignal.timeout(1200) });
    return response.ok;
  } catch {
    return false;
  }
}

async function ensureServer() {
  if (await serverAvailable()) return;
  const windows = process.platform === 'win32';
  const command = windows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = windows
    ? ['/d', '/s', '/c', 'npm run dev -- --host 127.0.0.1 --port 1245 --strictPort']
    : ['run', 'dev', '--', '--host', '127.0.0.1', '--port', '1245', '--strictPort'];
  serverProcess = spawn(command, args, {
    cwd: projectRoot,
    windowsHide: true,
    stdio: 'ignore',
    env: { ...process.env },
  });
  for (let attempt = 0; attempt < 60; attempt++) {
    await new Promise(resolve => setTimeout(resolve, 500));
    if (await serverAvailable()) return;
    if (serverProcess.exitCode !== null) break;
  }
  throw new Error('O servidor CompanyGen não iniciou na porta 1245.');
}

function chromeUserAgent() {
  return `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${process.versions.chrome} Safari/537.36`;
}

function configureWhatsappContents(contents) {
  contents.setUserAgent(chromeUserAgent());
  contents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  contents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== whatsappOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
  });
}

function validWhatsappPhone(raw) {
  const digits = String(raw || '').replace(/\D/g, '');
  return digits.length >= 10 && digits.length <= 15 ? digits : '';
}

async function readEmbeddedWhatsappIdentity() {
  const guests = webContents.getAllWebContents().filter(contents => {
    if (contents.getType() !== 'webview') return false;
    try { return new URL(contents.getURL()).origin === whatsappOrigin; } catch { return false; }
  });

  for (const guest of guests) {
    try {
      const identity = await guest.executeJavaScript(`(() => {
        const preferredKeys = ['last-wid-md', 'last-wid', 'last-wid-deprecated'];
        const values = preferredKeys.map(key => localStorage.getItem(key)).filter(Boolean);
        for (const value of values) {
          const text = String(value);
          const jid = text.match(/(\\d{10,15})(?::\\d+)?@(?:c\\.us|s\\.whatsapp\\.net)/i);
          if (jid) return { connected: true, phoneE164: jid[1], source: 'webview-storage' };
          try {
            const parsed = JSON.parse(text);
            const serialized = String(parsed?.wid?._serialized || parsed?.wid || parsed?.serialized || parsed?.user || '');
            const parsedJid = serialized.match(/(\\d{10,15})(?::\\d+)?@(?:c\\.us|s\\.whatsapp\\.net)/i);
            if (parsedJid) return { connected: true, phoneE164: parsedJid[1], source: 'webview-storage' };
          } catch {}
        }
        return { connected: false, phoneE164: '', source: 'webview-storage' };
      })()`, true);
      const phoneE164 = validWhatsappPhone(identity?.phoneE164);
      if (phoneE164) return { connected: true, phoneE164, source: 'webview' };
    } catch {}
  }

  return { connected: false, phoneE164: '', source: 'webview' };
}

function createWindow() {
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    title: 'CompanyGen',
    backgroundColor: '#f4f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(projectRoot, 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
    },
  });

  window.webContents.on('will-attach-webview', (event, webPreferences, params) => {
    const validPartition = /^persist:companygen-wa-[a-zA-Z0-9-]+$/.test(params.partition || '');
    let validUrl = false;
    try { validUrl = new URL(params.src).origin === whatsappOrigin; } catch {}
    if (!validPartition || !validUrl) {
      event.preventDefault();
      return;
    }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    webPreferences.webSecurity = true;
    const isolated = session.fromPartition(params.partition);
    isolated.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'notifications'));
    isolated.setPermissionCheckHandler((_contents, permission) => permission === 'notifications');
  });

  window.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https:\/\//i.test(url)) void shell.openExternal(url);
    return { action: 'deny' };
  });
  window.webContents.on('did-fail-load', (_event, code, description, url) => {
    console.error('[companygen:did-fail-load]', code, description, url);
  });
  window.webContents.on('render-process-gone', (_event, details) => {
    console.error('[companygen:render-process-gone]', details);
  });
  window.webContents.on('console-message', (_event, level, message, line, sourceId) => {
    if (level >= 2) console.error('[companygen:renderer]', message, sourceId, line);
  });
  void window.loadURL(appUrl);
  return window;
}

app.on('web-contents-created', (_event, contents) => {
  if (contents.getType() === 'webview') configureWhatsappContents(contents);
});

ipcMain.handle('companygen:open-whatsapp', () => shell.openExternal('https://web.whatsapp.com/'));
ipcMain.handle('companygen:whatsapp-identity', () => readEmbeddedWhatsappIdentity());

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    const window = BrowserWindow.getAllWindows()[0];
    if (!window) return;
    if (window.isMinimized()) window.restore();
    window.show();
    window.focus();
  });

  app.whenReady().then(async () => {
    await ensureServer();
    createWindow();
    app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
  }).catch(error => {
    console.error(error);
    app.quit();
  });
}

app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
app.on('before-quit', () => {
  if (quitting) return;
  quitting = true;
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});

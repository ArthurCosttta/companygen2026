import { app, BrowserWindow, clipboard, ipcMain, Menu, nativeImage, Notification, session, shell, Tray, webContents } from 'electron';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildWebviewCheckMediaPreviewScript,
  buildWebviewClickMediaSendScript,
  buildWebviewClickSendScript,
  buildWebviewFocusComposerScript,
  buildWebviewIdentityScript,
  buildWebviewPollScript,
  buildWebviewSendScript,
} from './whatsapp-webview-script.mjs';

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const appUrl = process.env.COMPANYGEN_URL || 'http://127.0.0.1:1245/';
const whatsappOrigin = 'https://web.whatsapp.com';
const exitOnClose = process.env.COMPANYGEN_EXIT_ON_CLOSE === '1';
let serverProcess;
let mainWindow = null;
let tray = null;
let allowQuit = false;
let quitting = false;
let trayStatusState = {
  active: false,
  phase: 'idle',
  summary: 'Sofia IA — pronta',
  repliedCount: 0,
  notifiedHide: false,
};

app.setName('CompanyGen');
app.setPath('userData', process.env.COMPANYGEN_USER_DATA || path.join(app.getPath('appData'), 'CompanyGen'));
const hasSingleInstanceLock = app.requestSingleInstanceLock();
if (!hasSingleInstanceLock) app.quit();
// Some Windows/driver combinations render Electron as a completely black
// surface. CompanyGen does not need GPU acceleration, and disabling it keeps
// the shell and the embedded WhatsApp Web observable and interactive.
app.disableHardwareAcceleration();
app.commandLine.appendSwitch('disable-background-timer-throttling');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');

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
  const hasBuiltDist = fs.existsSync(path.join(projectRoot, 'dist', 'index.html'));
  const npmScript = hasBuiltDist && process.env.COMPANYGEN_DEV !== '1' ? 'preview' : 'dev';
  const windows = process.platform === 'win32';
  const command = windows ? (process.env.ComSpec || 'cmd.exe') : 'npm';
  const args = windows
    ? ['/d', '/s', '/c', `npm run ${npmScript} -- --host 127.0.0.1 --port 1245 --strictPort`]
    : ['run', npmScript, '--', '--host', '127.0.0.1', '--port', '1245', '--strictPort'];
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
  try { contents.setBackgroundThrottling?.(false); } catch {}
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

function getWhatsappWebviews() {
  return webContents.getAllWebContents().filter(contents => {
    if (contents.getType() !== 'webview' || contents.isDestroyed()) return false;
    try { return new URL(contents.getURL()).origin === whatsappOrigin; } catch { return false; }
  });
}

async function readEmbeddedWhatsappIdentity() {
  const guests = getWhatsappWebviews();
  const script = buildWebviewIdentityScript();

  for (const guest of guests) {
    try {
      const identity = await guest.executeJavaScript(script, true);
      const phoneE164 = validWhatsappPhone(identity?.phoneE164);
      if (phoneE164 && identity?.loggedIn !== false) {
        return { connected: true, loggedIn: Boolean(identity?.loggedIn), phoneE164, source: 'webview' };
      }
      if (identity?.loggedIn) {
        return { connected: true, loggedIn: true, phoneE164: '', source: 'webview' };
      }
    } catch {}
  }

  return { connected: false, loggedIn: false, phoneE164: '', source: 'webview' };
}

async function pollEmbeddedWhatsappInbox() {
  const guests = getWhatsappWebviews();
  const guest = guests[0];
  if (!guest) return { loggedIn: false, connected: false, action: 'no_webview' };

  try {
    const first = await guest.executeJavaScript(buildWebviewPollScript(), true);
    if (first?.action === 'opened_unread_chat') {
      await new Promise(resolve => setTimeout(resolve, 550));
      let second = await guest.executeJavaScript(buildWebviewPollScript(), true);
      if (second?.action === 'idle') {
        await new Promise(resolve => setTimeout(resolve, 450));
        second = await guest.executeJavaScript(buildWebviewPollScript(), true);
      }
      return second || first;
    }
    return first || { loggedIn: false, connected: false, action: 'empty' };
  } catch (err) {
    return { loggedIn: false, connected: false, action: 'error', error: err?.message || 'poll_failed' };
  }
}

const sentReplyJobs = new Set();

function randomDelayMs(minMs, maxMs) {
  const low = Math.max(0, Math.min(minMs, maxMs));
  const high = Math.max(low, maxMs);
  return Math.round(low + Math.random() * (high - low));
}

function isPrivateOrBlockedHost(hostname = '') {
  let host = String(hostname || '').toLowerCase().trim();
  if (!host) return true;
  if (host.startsWith('[') && host.endsWith(']')) {
    host = host.slice(1, -1);
  }
  const zoneIdx = host.indexOf('%');
  if (zoneIdx !== -1) host = host.slice(0, zoneIdx);

  if (host === 'localhost' || host.endsWith('.localhost')) return true;
  if (host === '0.0.0.0' || host === '::' || host === '::1') return true;
  if (host === '0:0:0:0:0:0:0:0' || host === '0:0:0:0:0:0:0:1') return true;
  if (host.startsWith('::ffff:')) {
    const mapped = host.slice('::ffff:'.length);
    if (mapped.includes('.')) return isPrivateOrBlockedHost(mapped);
    return true;
  }
  if (host.startsWith('127.') || host.startsWith('10.') || host.startsWith('192.168.') || host.startsWith('169.254.')) {
    return true;
  }
  if (/^172\.(?:1[6-9]|2\d|3[01])\./.test(host)) return true;
  if (/^f[cd][0-9a-f]{2}:/i.test(host)) return true;
  if (/^fe[89ab][0-9a-f]:/i.test(host)) return true;
  return false;
}

function resolveSafeMediaUrl(rawUrl = '') {
  const trimmed = String(rawUrl || '').trim();
  if (!trimmed) return null;
  if (/^data:image\/(?:png|jpeg|jpg|webp|gif);base64,/i.test(trimmed)) {
    return { type: 'data', url: trimmed };
  }
  const appOrigin = new URL(appUrl).origin;
  if (trimmed.startsWith('/media/')) {
    return { type: 'http', url: `${appOrigin}${trimmed}` };
  }
  try {
    const parsed = new URL(trimmed);
    if (parsed.origin === appOrigin && parsed.pathname.startsWith('/media/')) {
      return { type: 'http', url: parsed.toString() };
    }
    if (parsed.protocol === 'https:' && !isPrivateOrBlockedHost(parsed.hostname)) {
      return { type: 'http', url: parsed.toString() };
    }
  } catch {}
  return null;
}

async function decodeImageBufferViaWebviewCanvas(guest, buf, contentType = 'image/webp') {
  if (!guest || guest.isDestroyed?.()) return null;
  try {
    const mime = /^image\/[a-z0-9.+-]+$/i.test(contentType) ? contentType : 'image/webp';
    const dataUrl = `data:${mime};base64,${buf.toString('base64')}`;
    const pngDataUrl = await guest.executeJavaScript(
      `new Promise((resolve) => {
        const img = new Image();
        const timer = setTimeout(() => resolve(''), 3000);
        img.onload = () => {
          clearTimeout(timer);
          try {
            const canvas = document.createElement('canvas');
            canvas.width = img.naturalWidth || img.width || 600;
            canvas.height = img.naturalHeight || img.height || 600;
            const ctx = canvas.getContext('2d');
            if (!ctx) return resolve('');
            ctx.drawImage(img, 0, 0);
            resolve(canvas.toDataURL('image/png'));
          } catch {
            resolve('');
          }
        };
        img.onerror = () => { clearTimeout(timer); resolve(''); };
        img.src = ${JSON.stringify(dataUrl)};
      })`,
      true,
    );
    if (typeof pngDataUrl === 'string' && pngDataUrl.startsWith('data:image/png;base64,')) {
      const converted = nativeImage.createFromDataURL(pngDataUrl);
      return converted && !converted.isEmpty() ? converted : null;
    }
  } catch {}
  return null;
}

async function loadNativeImageFromUrl(rawUrl = '', guest = null) {
  const resolved = resolveSafeMediaUrl(rawUrl);
  if (!resolved) return null;
  try {
    if (resolved.type === 'data') {
      const b64 = resolved.url.split(',')[1] || '';
      const buf = Buffer.from(b64, 'base64');
      if (buf.length === 0 || buf.length > 8 * 1024 * 1024) return null;
      const img = nativeImage.createFromBuffer(buf);
      if (img && !img.isEmpty()) return img;
      return guest ? decodeImageBufferViaWebviewCanvas(guest, buf, 'image/webp') : null;
    }
    const res = await fetch(resolved.url, {
      headers: { 'User-Agent': chromeUserAgent(), Accept: 'image/jpeg,image/png,image/*;q=0.7' },
      redirect: 'error',
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return null;
    const contentType = String(res.headers.get('content-type') || '').toLowerCase();
    if (contentType && !contentType.startsWith('image/')) return null;
    const arr = await res.arrayBuffer();
    if (arr.byteLength === 0 || arr.byteLength > 8 * 1024 * 1024) return null;
    const buf = Buffer.from(arr);
    const img = nativeImage.createFromBuffer(buf);
    if (img && !img.isEmpty()) return img;
    return guest ? decodeImageBufferViaWebviewCanvas(guest, buf, contentType || 'image/webp') : null;
  } catch {
    return null;
  }
}

const graphemeSegmenter =
  typeof Intl !== 'undefined' && Intl.Segmenter
    ? new Intl.Segmenter('pt-BR', { granularity: 'grapheme' })
    : null;

function splitGraphemes(text = '') {
  const str = String(text || '');
  if (!str) return [];
  if (graphemeSegmenter) {
    return Array.from(graphemeSegmenter.segment(str), (part) => part.segment);
  }
  return Array.from(str);
}

async function typeTextHumanLike(guest, text, options = {}) {
  const fastCaption = Boolean(options?.fastCaption);
  const onProgress = typeof options?.onProgress === 'function' ? options.onProgress : null;
  const fullText = String(text || '');
  const lines = fullText.split(/\r?\n/);
  const totalChars = Math.max(1, splitGraphemes(fullText).length);

  // Pausa inicial orgânica simulando leitura e reação humana antes de tocar o teclado
  await new Promise(resolve =>
    setTimeout(resolve, fastCaption ? randomDelayMs(180, 340) : randomDelayMs(650, 1250)),
  );

  // Mantém digitação real letra a letra; só comprime levemente acima de 240 grafemas
  const scale = fastCaption ? 0.55 : totalChars > 240 ? Math.max(0.55, 240 / totalChars) : 1;
  let typedChars = 0;
  let burstRemaining = 0;

  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i]) {
      const graphemes = splitGraphemes(lines[i]);
      for (let g = 0; g < graphemes.length; g += 1) {
        const ch = graphemes[g];
        const isSpace = /^\s+$/.test(ch);
        const isEmoji = /\p{Extended_Pictographic}/u.test(ch);

        if (isEmoji) {
          await new Promise(resolve => setTimeout(resolve, Math.round(randomDelayMs(140, 260) * scale)));
        }

        await guest.insertText(ch);
        typedChars += 1;

        if (onProgress && (typedChars % 4 === 0 || typedChars === totalChars)) {
          try {
            onProgress({ typedChars, totalChars });
          } catch {}
        }

        if (g < graphemes.length - 1) {
          let delayMs;
          if (isSpace) {
            delayMs = randomDelayMs(85, 175) + (Math.random() < 0.08 ? randomDelayMs(140, 290) : 0);
            burstRemaining = Math.random() < 0.65 ? randomDelayMs(2, 5) : 0;
          } else if (isEmoji) {
            delayMs = randomDelayMs(130, 230);
          } else if (/[.!?,;:]/.test(ch)) {
            delayMs = randomDelayMs(185, 390);
            burstRemaining = 0;
          } else if (burstRemaining > 0) {
            burstRemaining -= 1;
            delayMs = randomDelayMs(36, 74);
          } else {
            delayMs = randomDelayMs(52, 108);
            if (Math.random() < 0.04) delayMs += randomDelayMs(120, 260);
          }
          await new Promise(resolve => setTimeout(resolve, Math.max(18, Math.round(delayMs * scale))));
        }
      }
    }

    if (i < lines.length - 1) {
      guest.sendInputEvent({ type: 'keyDown', keyCode: 'Return', modifiers: ['shift'] });
      guest.sendInputEvent({ type: 'keyUp', keyCode: 'Return', modifiers: ['shift'] });
      typedChars += 1;
      onProgress?.({ typedChars, totalChars });
      await new Promise(resolve => setTimeout(resolve, Math.round(randomDelayMs(260, 520) * scale)));
    }
  }

  onProgress?.({ typedChars: totalChars, totalChars });
  await new Promise(resolve =>
    setTimeout(resolve, fastCaption ? randomDelayMs(180, 320) : randomDelayMs(300, 600)),
  );
}

async function sendEmbeddedWhatsappMediaItems(guest, mediaItems = []) {
  const candidates = Array.isArray(mediaItems) ? mediaItems.slice(0, 8) : [];
  let mediaSentCount = 0;
  const maxPhotosToSend = 3;

  for (const item of candidates) {
    if (mediaSentCount >= maxPhotosToSend) break;
    const img = await loadNativeImageFromUrl(item?.url || '', guest);
    if (!img) continue;

    try {
      clipboard.writeImage(img);
      guest.focus();
      await guest.executeJavaScript(buildWebviewFocusComposerScript(), true);
      await new Promise(resolve => setTimeout(resolve, randomDelayMs(160, 300)));
      guest.paste();

      let preview = { isOpen: false, hasCaptionInput: false, hasSendButton: false };
      for (let poll = 0; poll < 22; poll += 1) {
        await new Promise(resolve => setTimeout(resolve, 160));
        preview = await guest.executeJavaScript(buildWebviewCheckMediaPreviewScript(), true);
        if (preview?.isOpen) break;
      }
      if (!preview?.isOpen) continue;

      await new Promise(resolve => setTimeout(resolve, randomDelayMs(280, 520)));
      const caption = String(item?.caption || '').trim();
      if (caption && preview.hasCaptionInput) {
        await typeTextHumanLike(guest, caption, { fastCaption: true });
        await new Promise(resolve => setTimeout(resolve, randomDelayMs(240, 440)));
      }

      let clicked = await guest.executeJavaScript(buildWebviewClickMediaSendScript(), true);
      if (!clicked?.ok) {
        guest.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        guest.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        await new Promise(resolve => setTimeout(resolve, 220));
        clicked = { ok: true, method: 'media_native_return' };
      }
      if (clicked?.ok) {
        mediaSentCount += 1;
        // Aguarda a prévia da foto atual fechar antes de colar a próxima foto
        for (let closePoll = 0; closePoll < 16; closePoll += 1) {
          await new Promise(resolve => setTimeout(resolve, 160));
          const stillOpen = await guest.executeJavaScript(buildWebviewCheckMediaPreviewScript(), true);
          if (!stillOpen?.isOpen) break;
        }
        await new Promise(resolve => setTimeout(resolve, randomDelayMs(650, 1250)));
      }
    } catch {}
  }

  return mediaSentCount;
}

async function sendEmbeddedWhatsappReply(payload) {
  const chatTitle = String(payload?.chatTitle || '');
  const text = String(payload?.text || '');
  const mediaItems = Array.isArray(payload?.mediaItems) ? payload.mediaItems : [];
  const typingDurationMs = Math.max(0, Math.min(45000, Number(payload?.typingDurationMs) || 0));
  const replyJobId = String(payload?.replyJobId || '');
  if (!text.trim()) return { ok: false, error: 'Resposta vazia.' };
  if (replyJobId && sentReplyJobs.has(replyJobId)) {
    return { ok: true, method: 'ipc_dedup_job_id' };
  }

  const guests = getWhatsappWebviews();
  const guest = guests[0];
  if (!guest) return { ok: false, error: 'WhatsApp Web não carregado no Electron.' };
  try { guest.setBackgroundThrottling?.(false); } catch {}

  const emitProgress = (progress) => {
    if (!mainWindow || mainWindow.isDestroyed()) return;
    try {
      mainWindow.webContents.send('companygen:wa-typing-progress', {
        chatTitle,
        replyJobId,
        typedChars: progress.typedChars,
        totalChars: progress.totalChars,
        phase: 'typing',
      });
    } catch {}
  };

  try {
    let result = await guest.executeJavaScript(
      buildWebviewSendScript({ chatTitle, text, typingDurationMs, replyJobId, preferNativeHumanTyping: true }),
      true,
    );
    if (result?.switchedChat) {
      await new Promise(resolve => setTimeout(resolve, 500));
      result = await guest.executeJavaScript(
        buildWebviewSendScript({ chatTitle, text, typingDurationMs, replyJobId, preferNativeHumanTyping: true }),
        true,
      );
    }
    if (result?.needsNativeInsert) {
      guest.focus();
      const composerState = await guest.executeJavaScript(`(() => {
        const footer = document.querySelector('#main footer') || document;
        const c = footer.querySelector('div[contenteditable="true"][data-lexical-editor="true"], [role="textbox"][contenteditable="true"], div[contenteditable="true"]');
        if (!c) return { found: false, text: '' };
        c.click();
        c.focus();
        return { found: true, text: String(c.innerText || c.textContent || '').trim() };
      })()`, true);
      await new Promise(resolve => setTimeout(resolve, 100));

      const alreadyHasDraft = Boolean(
        composerState?.text &&
        composerState.text.length >= Math.min(16, text.trim().length) &&
        composerState.text.slice(0, 20).toLowerCase() === text.trim().slice(0, 20).toLowerCase(),
      );

      if (!alreadyHasDraft) {
        if (composerState?.text) {
          guest.sendInputEvent({ type: 'keyDown', keyCode: 'A', modifiers: ['control'] });
          guest.sendInputEvent({ type: 'keyUp', keyCode: 'A', modifiers: ['control'] });
          guest.sendInputEvent({ type: 'keyDown', keyCode: 'Backspace' });
          guest.sendInputEvent({ type: 'keyUp', keyCode: 'Backspace' });
          await new Promise(resolve => setTimeout(resolve, 80));
        }
        await typeTextHumanLike(guest, text, { onProgress: emitProgress });
      }

      for (let attempt = 0; attempt < 6; attempt += 1) {
        result = await guest.executeJavaScript(buildWebviewClickSendScript(replyJobId), true);
        if (result?.ok) break;
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      if (!result?.ok && (result?.hasComposerText || alreadyHasDraft)) {
        guest.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        guest.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        await new Promise(resolve => setTimeout(resolve, 160));
        result = { ok: true, method: 'native_return_key' };
      }
    } else if (result?.composerAlreadyHasText) {
      guest.focus();
      for (let attempt = 0; attempt < 4; attempt += 1) {
        result = await guest.executeJavaScript(buildWebviewClickSendScript(replyJobId), true);
        if (result?.ok) break;
        await new Promise(resolve => setTimeout(resolve, 120));
      }
      if (!result?.ok) {
        guest.sendInputEvent({ type: 'keyDown', keyCode: 'Return' });
        guest.sendInputEvent({ type: 'keyUp', keyCode: 'Return' });
        await new Promise(resolve => setTimeout(resolve, 160));
        result = { ok: true, method: 'native_return_key' };
      }
    }
    if (result?.ok && replyJobId) {
      sentReplyJobs.add(replyJobId);
      if (sentReplyJobs.size > 400) {
        const first = sentReplyJobs.values().next().value;
        if (first) sentReplyJobs.delete(first);
      }
    }
    if (result?.ok && mediaItems.length > 0) {
      await new Promise(resolve => setTimeout(resolve, randomDelayMs(550, 950)));
      const mediaSentCount = await sendEmbeddedWhatsappMediaItems(guest, mediaItems);
      return { ...result, mediaSentCount };
    }
    return result || { ok: false, error: 'Sem resposta do WebView.' };
  } catch (err) {
    return { ok: false, error: err?.message || 'Falha ao enviar no WhatsApp Web.' };
  }
}

async function logoutEmbeddedWhatsappWebview() {
  const guests = getWhatsappWebviews();
  for (const guest of guests) {
    try {
      await guest.session.clearStorageData();
      await guest.loadURL('https://web.whatsapp.com/');
    } catch {}
  }
  return { ok: true };
}

function createTrayIconImage() {
  try {
    const trayIconPath = path.join(projectRoot, 'public', 'brand', 'favicon-32.png');
    if (fs.existsSync(trayIconPath)) {
      const img = nativeImage.createFromPath(trayIconPath);
      if (img && !img.isEmpty()) return img;
    }
  } catch {
    // Fallback para bitmap gerado em memória abaixo
  }
  const size = 16;
  const buf = Buffer.alloc(size * size * 4);
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const idx = (y * size + x) * 4;
      const dx = x - 7.5;
      const dy = y - 7.5;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist <= 7.2) {
        // Borda/círculo esmeralda #10B981 (BGRA no Windows bitmap)
        const isCenterMark = (dx * dx + dy * dy <= 7.5) && (Math.abs(dx) <= 2.3 && Math.abs(dy) <= 2.3);
        if (isCenterMark) {
          buf[idx] = 255;
          buf[idx + 1] = 255;
          buf[idx + 2] = 255;
          buf[idx + 3] = 255;
        } else {
          buf[idx] = 129; // B
          buf[idx + 1] = 185; // G
          buf[idx + 2] = 16; // R
          buf[idx + 3] = 255; // A
        }
      } else {
        buf[idx + 3] = 0;
      }
    }
  }
  return nativeImage.createFromBitmap(buf, { width: size, height: size });
}

function showAndFocusMainWindow(targetTab = '') {
  const win = mainWindow && !mainWindow.isDestroyed() ? mainWindow : BrowserWindow.getAllWindows()[0];
  if (!win) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
  if (targetTab) {
    win.webContents.send('companygen:wa-typing-progress', { navigateTab: String(targetTab) });
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  const label = String(trayStatusState.summary || 'Sofia IA — pronta').slice(0, 64);
  tray.setToolTip(`CompanyGen — ${label}`);
  const menu = Menu.buildFromTemplate([
    { label, enabled: false },
    { type: 'separator' },
    { label: 'Abrir CompanyGen', click: () => showAndFocusMainWindow() },
    { label: 'Abrir Painel WhatsApp', click: () => showAndFocusMainWindow('whatsapp') },
    { type: 'separator' },
    {
      label: 'Encerrar CompanyGen (Sair)',
      click: () => {
        allowQuit = true;
        app.quit();
      },
    },
  ]);
  tray.setContextMenu(menu);
}

function ensureTray() {
  if (tray) return tray;
  try {
    tray = new Tray(createTrayIconImage());
    tray.on('double-click', () => showAndFocusMainWindow());
    tray.on('click', () => showAndFocusMainWindow());
    refreshTrayMenu();
  } catch {
    tray = null;
  }
  return tray;
}

function showDesktopNotification({ title = 'CompanyGen Sofia IA', body = '' } = {}) {
  try {
    if (!Notification.isSupported() || !body) return false;
    const notif = new Notification({ title: String(title).slice(0, 64), body: String(body).slice(0, 200) });
    notif.on('click', () => showAndFocusMainWindow('whatsapp'));
    notif.show();
    return true;
  } catch {
    return false;
  }
}

function createWindow() {
  const winIconPath = path.join(projectRoot, 'public', 'brand', 'app-icon-512.png');
  const window = new BrowserWindow({
    width: 1480,
    height: 940,
    minWidth: 1024,
    minHeight: 700,
    title: 'CompanyGen',
    ...(fs.existsSync(winIconPath) ? { icon: winIconPath } : {}),
    backgroundColor: '#f4f7f5',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(projectRoot, 'desktop', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      webviewTag: true,
      backgroundThrottling: false,
    },
  });
  mainWindow = window;

  window.on('close', (event) => {
    if (!allowQuit && !exitOnClose && tray && !window.isDestroyed()) {
      event.preventDefault();
      window.hide();
      if (!trayStatusState.notifiedHide) {
        trayStatusState.notifiedHide = true;
        showDesktopNotification({
          title: 'Sofia IA ativa na bandeja',
          body: 'A janela foi recolhida, mas o WhatsApp continua sendo respondido em 2º plano.',
        });
      }
    }
  });
  window.on('closed', () => {
    if (mainWindow === window) mainWindow = null;
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
    webPreferences.backgroundThrottling = false;
    const isolated = session.fromPartition(params.partition);
    isolated.setPermissionRequestHandler((_contents, permission, callback) => callback(permission === 'notifications'));
    isolated.setPermissionCheckHandler((_contents, permission) => permission === 'notifications');
  });

  const appOrigin = new URL(appUrl).origin;
  window.webContents.on('will-navigate', (event, url) => {
    try {
      if (new URL(url).origin !== appOrigin) event.preventDefault();
    } catch {
      event.preventDefault();
    }
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
ipcMain.handle('companygen:whatsapp-poll-inbox', () => pollEmbeddedWhatsappInbox());
ipcMain.handle('companygen:whatsapp-send-reply', (_event, payload) => sendEmbeddedWhatsappReply(payload));
ipcMain.handle('companygen:whatsapp-logout', () => logoutEmbeddedWhatsappWebview());
ipcMain.handle('companygen:show-window', (_event, tab) => {
  showAndFocusMainWindow(typeof tab === 'string' ? tab : '');
  return { ok: true };
});
ipcMain.handle('companygen:quit-app', () => {
  allowQuit = true;
  app.quit();
  return { ok: true };
});
ipcMain.handle('companygen:notify-desktop', (_event, payload) => ({
  ok: showDesktopNotification(payload || {}),
}));
ipcMain.handle('companygen:set-tray-status', (_event, payload) => {
  trayStatusState = {
    ...trayStatusState,
    active: Boolean(payload?.active),
    phase: String(payload?.phase || 'idle'),
    summary: String(payload?.summary || 'Sofia IA — pronta'),
    repliedCount: Math.max(0, Number(payload?.repliedCount) || 0),
  };
  refreshTrayMenu();
  return { ok: true };
});

if (hasSingleInstanceLock) {
  app.on('second-instance', () => {
    showAndFocusMainWindow();
  });

  app.whenReady().then(async () => {
    await ensureServer();
    ensureTray();
    createWindow();
    app.on('activate', () => {
      if (BrowserWindow.getAllWindows().length === 0) createWindow();
      else showAndFocusMainWindow();
    });
  }).catch(error => {
    console.error(error);
    app.quit();
  });
}

app.on('window-all-closed', () => {
  if (allowQuit || !tray) {
    if (process.platform !== 'darwin') app.quit();
  }
});
app.on('before-quit', () => {
  allowQuit = true;
  if (quitting) return;
  quitting = true;
  try { tray?.destroy(); tray = null; } catch {}
  if (serverProcess && serverProcess.exitCode === null) serverProcess.kill();
});

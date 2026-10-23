'use strict';
/**
 * Главный процесс Electron (Palad1n).
 * Встроенные чаты (<webview>) и этот файл в проверочной среде не запускались: первая проверка на Windows.
 */
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, ipcMain, shell, clipboard, session, safeStorage } = require('electron');
const { AppService } = require('./service');
const { buildHandlers } = require('./ipc');
const { createElectronEngine } = require('../core/src/electron-engine');

app.setName('Palad1n');
// Если до переименования была база в папке lead-finder, продолжаем работать с ней, чтобы ничего не потерять.
const legacyDir = path.join(app.getPath('appData'), 'lead-finder');
if (fs.existsSync(path.join(legacyDir, 'leads.db'))) app.setPath('userData', legacyDir);

// Куда можно заходить внутри встроенных чатов. Всё остальное открывается в обычном браузере.
const CHAT_HOSTS = ['telegram.org', 't.me', 'telegram.me', 'whatsapp.com', 'whatsapp.net', 'wa.me', 'vk.com', 'vk.ru', 'max.ru'];
// у каждого аккаунта свой раздел: persist:chat-telegram, persist:chat-telegram-2 и т. д.
const CHAT_PARTITION_RE = /^persist:chat-(telegram|whatsapp|vk)(-\d{1,2})?$/;
const hostAllowed = (url) => {
  try {
    const u = new URL(url);
    return u.protocol === 'https:' && CHAT_HOSTS.some((h) => u.hostname === h || u.hostname.endsWith('.' + h));
  } catch (e) { return false; }
};
const openOutside = (url) => { if (/^https:\/\//i.test(url)) shell.openExternal(url); };

let win = null;
let service = null;

function send(channel, data) {
  if (win && !win.isDestroyed()) win.webContents.send(channel, data);
}

function createWindow() {
  win = new BrowserWindow({
    width: 1360, height: 860, minWidth: 1000, minHeight: 640,
    backgroundColor: '#0a0a0b', autoHideMenuBar: true, title: 'Palad1n',
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, sandbox: true, nodeIntegration: false, spellcheck: false,
      webviewTag: true, // нужен для встроенных чатов
    },
  });
  win.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));

  win.webContents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
  win.webContents.on('will-navigate', (e) => e.preventDefault());

  // Пауза анимации, когда окно свёрнуто или скрыто.
  const vis = (v) => send('app:visibility', v);
  win.on('minimize', () => vis(false));
  win.on('restore', () => vis(true));
  win.on('hide', () => vis(false));
  win.on('show', () => vis(true));
}

// Защита встроенных чатов: только свои разделы сессий и только известные сайты; никакого доступа к Node.
app.on('web-contents-created', (_e, contents) => {
  contents.on('will-attach-webview', (event, webPreferences, params) => {
    if (!CHAT_PARTITION_RE.test(String(params.partition)) || !hostAllowed(params.src)) { event.preventDefault(); return; }
    delete webPreferences.preload;
    webPreferences.nodeIntegration = false;
    webPreferences.contextIsolation = true;
    webPreferences.sandbox = true;
    // Веб-версии мессенджеров не любят приписку Electron в идентификаторе браузера, поэтому для чатов она убирается.
    const ses = session.fromPartition(params.partition);
    ses.setUserAgent(ses.getUserAgent().replace(/\sElectron\/\S+/i, '').replace(/\spalad1n\/\S+/i, '').replace(/\slead-finder\/\S+/i, ''));
  });
  if (contents.getType() === 'webview') {
    contents.setWindowOpenHandler(({ url }) => { openOutside(url); return { action: 'deny' }; });
    contents.on('will-navigate', (e, url) => { if (!hostAllowed(url)) { e.preventDefault(); openOutside(url); } });
  }
});

app.whenReady().then(() => {
  service = new AppService({
    dataDir: app.getPath('userData'),
    createEngine: () => createElectronEngine(BrowserWindow),
    openExternal: (url) => shell.openExternal(url),
    openPath: (p) => shell.openPath(p),
    // печать предложения в PDF: скрытое окно без доступа к сети и Node
    renderPdf: async (html) => {
      const w = new BrowserWindow({ show: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false, javascript: false } });
      try {
        await w.loadURL('data:text/html;charset=utf-8,' + encodeURIComponent(html));
        return await w.webContents.printToPDF({ pageSize: 'A4', printBackground: true, margins: { marginType: 'default' } });
      } finally { w.destroy(); }
    },
    // ключи нейросетей шифруются средствами Windows (DPAPI); если шифрование недоступно, ключи не сохраняются
    secrets: {
      available: () => safeStorage.isEncryptionAvailable(),
      encrypt: (t) => safeStorage.encryptString(t).toString('base64'),
      decrypt: (b) => safeStorage.decryptString(Buffer.from(b, 'base64')),
    },
    writeClipboard: (t) => clipboard.writeText(t),
    emit: send,
  });
  const handlers = buildHandlers(service);
  for (const [channel, fn] of Object.entries(handlers)) {
    ipcMain.handle(channel, async (_e, payload) => {
      try { return { ok: true, data: await fn(payload) }; }
      catch (err) { return { ok: false, error: err.message || String(err) }; }
    });
  }
  createWindow();
  app.on('activate', () => { if (BrowserWindow.getAllWindows().length === 0) createWindow(); });
});

app.on('window-all-closed', () => app.quit());

'use strict';
/**
 * Адаптер движка для Electron: скрытое окно с 2gis.ru на компьютере пользователя.
 * ВНИМАНИЕ: этот файл ещё не запускался в Electron (проверяется на этапе интерфейса).
 * Логика движка при этом проверена тестами на подмене страницы и на живом 2ГИС.
 */
const { Engine } = require('./engine');

function createElectronEngine(BrowserWindow, { proxy } = {}) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'persist:2gis', contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });

  // Обычный браузерный User-Agent без слов Electron и названия приложения: с «чужим» адресом 2ГИС чаще показывает проверку или режет доступ.
  const ua = win.webContents.getUserAgent().replace(/\s?(Electron|palad1n)\/\S+/gi, '');
  win.webContents.setUserAgent(ua);

  // Свой прокси (если задан в настройках) применяется только к окну 2ГИС; иначе используются настройки Windows.
  const ready = proxy
    ? win.webContents.session.setProxy({ proxyRules: proxy }).catch(() => {})
    : win.webContents.session.setProxy({ mode: 'system' }).catch(() => {});

  const navigate = (url) => ready.then(() => new Promise((resolve, reject) => {
    const wc = win.webContents;
    const timer = setTimeout(() => { cleanup(); reject(new Error('load failed: ERR_TIMED_OUT')); }, 45000);
    const cleanup = () => { clearTimeout(timer); wc.removeListener('did-finish-load', onOk); wc.removeListener('did-fail-load', onFail); };
    const onFail = (e, code, desc, validatedUrl, isMainFrame) => {
      if (!isMainFrame || code === -3) return; // -3: переход заменён другим (редирект), это не ошибка
      cleanup();
      reject(new Error('load failed: ' + desc + ' (' + code + ')'));
    };
    const onOk = () => {
      cleanup();
      setTimeout(resolve, 1500); // даём приложению 2ГИС дорисовать выдачу
    };
    wc.on('did-finish-load', onOk);
    wc.on('did-fail-load', onFail);
    win.loadURL(url).catch(() => {}); // ошибка придёт событием did-fail-load
  }));

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  const engine = new Engine({ navigate, evaluate });
  engine.window = win; // нужен интерфейсу: показать окно, если 2ГИС просит пройти проверку
  engine.close = () => { if (!win.isDestroyed()) win.destroy(); };
  return engine;
}

module.exports = { createElectronEngine };

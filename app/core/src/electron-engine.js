'use strict';
/**
 * Адаптер движка для Electron: скрытое окно с 2gis.ru на компьютере пользователя.
 * ВНИМАНИЕ: этот файл ещё не запускался в Electron (проверяется на этапе интерфейса).
 * Логика движка при этом проверена тестами на подмене страницы и на живом 2ГИС.
 */
const { Engine } = require('./engine');

function createElectronEngine(BrowserWindow) {
  const win = new BrowserWindow({
    show: false,
    webPreferences: { partition: 'persist:2gis', contextIsolation: true, sandbox: true, backgroundThrottling: false },
  });

  const navigate = (url) => new Promise((resolve, reject) => {
    const wc = win.webContents;
    const onFail = (e, code, desc, validatedUrl, isMainFrame) => {
      if (!isMainFrame) return;
      wc.removeListener('did-finish-load', onOk);
      reject(new Error('load failed: ' + desc));
    };
    const onOk = () => {
      wc.removeListener('did-fail-load', onFail);
      setTimeout(resolve, 1500); // даём приложению 2ГИС дорисовать выдачу
    };
    wc.once('did-finish-load', onOk);
    wc.once('did-fail-load', onFail);
    win.loadURL(url);
  });

  const evaluate = (code) => win.webContents.executeJavaScript(code, true);
  const engine = new Engine({ navigate, evaluate });
  engine.window = win; // нужен интерфейсу: показать окно, если 2ГИС просит пройти проверку
  engine.close = () => { if (!win.isDestroyed()) win.destroy(); };
  return engine;
}

module.exports = { createElectronEngine };

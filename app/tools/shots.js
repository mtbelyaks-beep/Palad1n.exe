'use strict';
/**
 * Стенд для проверки интерфейса без Electron: настоящий AppService + настоящие IPC-обработчики,
 * страница открывается в Chromium по file://. Подменено только окно с 2ГИС (вымышленные организации).
 * Делает скриншоты в tools/out и проверяет сценарии; при любой ошибке в консоли страницы завершается с кодом 1.
 */
const path = require('node:path');
const fs = require('node:fs');
const assert = require('node:assert/strict');
const { chromium } = require(process.env.PLAYWRIGHT_PATH || '/opt/npm-tools/node_modules/playwright');
const { AppService } = require('../main/service');
const { buildHandlers } = require('../main/ipc');
const { Engine } = require('../core/src/engine');

const OUT = path.join(__dirname, 'out');
fs.mkdirSync(OUT, { recursive: true });

/* ---------- вымышленные данные ---------- */
let seed = 7;
const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
const pick = (a) => a[Math.floor(rnd() * a.length)];
const DISTRICTS = ['Центральный район', 'Адмиралтейский район', 'Петроградский район', 'Московский район', 'Выборгский район', 'Приморский район'];
const NAMES = {
  'Барбершопы': ['Борода и Ножницы', 'Black Fox', 'Стрижка №1', 'Хмель Barber', 'Мастер Фёдор', 'Бритва', 'Усы и Виски', 'Северный барбер', 'Старый Мастер', 'Кастет', 'Лезвие', 'Чёрный Кот', 'Бархат', 'Три Топора', 'Вилка Barber', 'Дядя Миша', 'Фаренгейт', 'Респект', 'Мужской клуб Орёл', 'Ножницы&Ко'],
  'Автосервисы': ['Гараж 47', 'Мотор-Сервис', 'Шестерёнка', 'АвтоДок', 'Масло и Гайки', 'Ключ на 19', 'Колесо', 'Тормоз Центр', 'Диагност', 'Левша Авто', 'Подкова', 'СТО на Лиговском'],
  'Салоны красоты': ['Белая Орхидея', 'Лён', 'Студия Анны', 'Пион', 'Нежность', 'Ноготки Плюс', 'Глянец', 'Мята', 'Лотос', 'Жемчуг'],
};
function makeCards() {
  const cards = {}; const ids = [];
  let n = 1000;
  for (const [rubric, names] of Object.entries(NAMES)) {
    names.forEach((name, i) => {
      const id = String(n++); ids.push(id);
      const phone = { type: 'phone', value: '+7999' + String(1000000 + Math.floor(rnd() * 8999999)), text: '' };
      const handle = 'lf_' + id;
      const kind = i % 5;
      const contacts = [phone];
      if (kind === 0) contacts.push({ type: 'website', text: id + '.ru', url: 'http://studio' + id + '.ru' });
      if (kind === 1) contacts.push({ type: 'telegram', text: '', url: 'https://t.me/' + handle });
      if (kind === 3) contacts.push({ type: 'whatsapp', text: '', url: 'https://wa.me/7999' + (2000000 + Number(id)) }, { type: 'website', text: 'yclients', url: 'https://n' + id + '.yclients.com' });
      if (kind === 4) contacts.push({ type: 'vkontakte', text: '', url: 'https://vk.com/club' + id }, { type: 'website', text: 'tilda', url: 'https://' + handle + '.tilda.ws' });
      if (i % 7 === 2) contacts.push({ type: 'telegram', text: '', url: 'https://t.me/' + handle }); // часть «без сайта» тоже в Telegram
      cards[id] = {
        id, name: (rubric === 'Барбершопы' ? 'Барбершоп «' : rubric === 'Автосервисы' ? 'Автосервис «' : 'Студия «') + name + '»', shortName: name,
        address: 'Санкт-Петербург, ул. Выдуманная, ' + (3 + Math.floor(rnd() * 90)), district: pick(DISTRICTS),
        lat: 59.9, lon: 30.3, rubrics: [rubric], rating: Math.round((3.6 + rnd() * 1.4) * 10) / 10, reviews: 3 + Math.floor(rnd() * 180),
        orgId: 'org' + id, branchCount: i % 11 === 6 ? 7 : 1, updatedAt: '2026-10-01T00:00:00Z', contacts,
      };
    });
  }
  return { cards, ids };
}

function engineFor(cards, ids) {
  return () => {
    const e = new Engine({
      navigate: async () => {},
      evaluate: async (code) => {
        if (code.includes('window.__lc = ')) return true;
        if (code.includes('getResultsState()')) return { page: 1, ids, count: ids.length, hasNext: false };
        const m = code.match(/fetchFirm\("(\w+)"/);
        if (m) return cards[m[1]];
        throw new Error('unexpected');
      },
    });
    e.open = async () => {};
    e.close = () => {};
    return e;
  };
}

/* ---------- запуск ---------- */
(async () => {
  const { cards, ids } = makeCards();
  let page = null;
  const dataDir = require('fs').mkdtempSync(path.join(require('os').tmpdir(), 'palad1n-stand-'));
  const svc = new AppService({
    dataDir, dbFile: ':memory:',
    pickFile: async () => '/tmp/claude-0/media/test.webm',
    createEngine: engineFor(cards, ids), cardDelayMs: 1,
    emit: (ch, data) => { if (page) page.evaluate(([c, d]) => window.__dispatch(c, d), [ch, data]).catch(() => {}); },
    openExternal: async (u) => { global.__opened = (global.__opened || []).concat(u); },
    writeClipboard: (t) => { global.__clip = t; },
    openPath: async (d) => { global.__openedPath = d; },
    // печать в PDF для проверки берём из того же Chromium, что показывает интерфейс
    checkNet: async ({ proxy }) => ({ results: { '2gis.ru': { ok: false, code: 'ERR_CONNECTION_RESET' }, '2gis.com': { ok: true, ms: 800 } }, proxy: 'DIRECT', customProxy: !!proxy }),
    renderPdf: async (html) => { const pg = await browser.newPage(); await pg.setContent(html); const buf = await pg.pdf({ format: 'A4', printBackground: true }); await pg.close(); return buf; },
    secrets: { available: () => true, encrypt: (t) => 'ENC:' + Buffer.from(t).toString('base64'), decrypt: (b) => Buffer.from(b.slice(4), 'base64').toString() },
    // подменный сервис нейросети: global.__ai.mode = 'ok' | 'limit' | 'badkey'
    http: async (req) => {
      const m = (global.__ai && global.__ai.mode) || 'ok';
      global.__ai.calls = (global.__ai.calls || 0) + 1;
      const auth = String(req.headers.authorization || '');
      if (m === 'badkey' || (global.__ai.badKeys || []).some((k) => auth.includes(k))) return { status: 401, headers: {}, text: 'bad' };
      if (m === 'limit' || (global.__ai.limitKeys || []).some((k) => auth.includes(k))) return { status: 429, headers: { 'retry-after': '900' }, text: 'limit' };
      await new Promise((r) => setTimeout(r, 250));
      return { status: 200, headers: {}, text: JSON.stringify({ choices: [{ message: { content: 'Здравствуйте! Это вариант от нейросети: Матвей делает сайты и хочет бесплатно показать вам пример. Удобно ли посмотреть?' } }] }) };
    },
  });
  global.__ai = { mode: 'ok' };
  svc.setSettings({ senderName: 'Матвей', dailyLimits: { telegram: 10, whatsapp: 15, vk: 15 } });
  const handlers = buildHandlers(svc);

  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 });
  page = await ctx.newPage();
  const problems = [];
  page.on('pageerror', (e) => { problems.push('pageerror: ' + e.message); if (process.env.STAND_DEBUG) console.error('pageerror:', e.message); });
  page.on('console', (m) => { if (m.type() === 'error') { problems.push('console: ' + m.text()); if (process.env.STAND_DEBUG) console.error('console:', m.text()); } });
  await page.exposeFunction('__invoke', async (channel, payload) => {
    try { return { ok: true, data: await handlers[channel](payload) }; } catch (e) { return { ok: false, error: e.message }; }
  });
  await page.addInitScript(() => {
    const L = {};
    window.api = { invoke: (c, p) => window.__invoke(c, p), on: (ch, cb) => { (L[ch] = L[ch] || []).push(cb); return () => {}; } };
    window.__dispatch = (ch, d) => (L[ch] || []).forEach((cb) => cb(d));
    try { localStorage.clear(); } catch (e) { /* ok */ }
  });
  const shot = async (name) => {
    await page.waitForTimeout(350);
    const txt = await page.evaluate(() => document.body.innerText);
    assert.ok(!/\[object |undefined|NaN|(^|\n)null(\n|$)/.test(txt), 'на экране «' + name + '» мусор в тексте: ' + (txt.match(/.{0,30}(\[object |undefined|NaN).{0,30}/) || [''])[0]);
    await page.screenshot({ path: path.join(OUT, name + '.png') });
  };
  const waitSearchDone = () => page.waitForFunction(() => !document.querySelector('#runbtn') || document.querySelector('#runbtn').textContent.includes('Начать'), null, { timeout: 15000 });

  await page.goto('file://' + path.join(__dirname, '..', 'renderer', 'index.html'));
  await page.waitForSelector('#runbtn', { timeout: 8000 }).catch(async (e) => { console.error('BODY:', await page.evaluate(() => { try { LF.views.parser(document.createElement('div')); return 'ok'; } catch (x) { return x.stack; } })); throw e; });

  // 0. пустая база, оформление по умолчанию
  assert.equal(await page.evaluate(() => document.body.dataset.theme), 'paldark', 'по умолчанию красно-чёрная тема');
  assert.equal(await page.title(), 'Palad1n');
  await shot('01-parser-empty');

  // 1. первый сбор через интерфейс
  await page.click('.chip:has-text("барбершоп")');
  await page.click('.seg button:has-text("Средне")');
  await page.click('#runbtn');
  await waitSearchDone();
  await page.waitForSelector('.lead');
  const nCards = await page.locator('.lead').count();
  assert.ok(nCards > 10, 'карточки должны появиться, их ' + nCards);
  await shot('02-parser-results');

  // 2. ПРОКРУТКА на маленьком окне: Парсер и Настройки должны листаться колесом мыши
  await page.setViewportSize({ width: 1280, height: 640 });
  await page.waitForTimeout(300);
  const fits = await page.evaluate(() => document.getElementById('main').getBoundingClientRect().bottom <= window.innerHeight + 1);
  assert.ok(fits, 'контейнер не должен быть выше окна (из-за этого пропадала прокрутка)');
  await page.mouse.move(800, 400);
  await page.mouse.wheel(0, 700);
  await page.waitForTimeout(300);
  const st1 = await page.evaluate(() => document.getElementById('view').scrollTop);
  assert.ok(st1 > 100, 'Парсер должен прокручиваться колесом мыши, scrollTop=' + st1);
  await shot('03-parser-scrolled');
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('.settings');
  await page.waitForTimeout(500);
  await page.mouse.move(700, 400);
  await page.mouse.wheel(0, 1500);
  await page.waitForTimeout(300);
  const st2 = await page.evaluate(() => { const v = document.getElementById('view'); return [v.scrollTop, v.scrollHeight, v.clientHeight]; });
  assert.ok(st2[0] > 300 && st2[1] > st2[2], 'Настройки должны прокручиваться, ' + st2);
  await shot('04-settings-scrolled');
  await page.setViewportSize({ width: 1440, height: 900 });

  // 3. анимации: переход между вкладками и сдвиг плашки в боковой панели
  await page.evaluate(() => { window.__enters = 0; new MutationObserver((m) => m.forEach((r) => { if (r.target.classList.contains('enter')) window.__enters++; })).observe(document.getElementById('view'), { attributes: true, attributeFilter: ['class'] }); });
  const pillBefore = await page.evaluate(() => document.getElementById('pill').style.transform);
  await page.click('.nav[data-id=parser]');
  await page.waitForSelector('.lead');
  const pillAfter = await page.evaluate(() => document.getElementById('pill').style.transform);
  assert.notEqual(pillBefore, pillAfter, 'плашка в боковой панели должна переехать');
  assert.ok(await page.evaluate(() => window.__enters) >= 1, 'при переходе вкладки должна запускаться анимация появления');

  // 4. ход сбора: медленный прогон по новым id
  svc.cardDelayMs = 250;
  const more = makeCards2();
  Object.assign(cards, more.cards);
  ids.length = 0; ids.push(...more.ids);
  await page.fill('.panel input[placeholder^="Например"]', 'шиномонтаж');
  await page.click('#runbtn');
  await page.waitForTimeout(1600);
  await shot('05-parser-running');
  await page.click('#runbtn'); // остановка
  await waitSearchDone();
  const doneText = await page.locator('#progress .notice').innerText();
  assert.match(doneText, /остановлен/i);

  // 5. панель лида: «Написать» открывает чат внутри приложения
  await page.locator('.lead', { hasText: 'Black Fox' }).first().click();
  await page.waitForSelector('#drawer.on');
  await page.fill('#drawer textarea', 'позвонить во вторник');
  await page.locator('#drawer textarea').blur();
  await page.waitForTimeout(500);
  await shot('06-drawer');
  global.__clip = '';
  await page.click('#drawer button:has-text("Написать")');
  await page.waitForSelector('#chatdock.on');
  assert.ok(await page.evaluate(() => document.body.classList.contains('chat-open')), 'при открытом чате содержимое сдвигается');
  assert.ok(global.__clip.includes('Матвей'), 'текст сообщения должен быть в буфере');
  const dockTitle = await page.locator('#chatdock .title').innerText();
  assert.match(dockTitle, /Black Fox/);
  assert.equal(await page.locator('#chatdock webview').getAttribute('partition'), 'persist:chat-telegram');
  assert.match(await page.locator('#chatdock webview').getAttribute('src'), /^https:\/\/web\.telegram\.org\//);
  await page.waitForTimeout(450);
  await shot('07-chat-dock');
  await page.click('#chatdock button[aria-label="Закрыть чат"]');
  await page.waitForTimeout(400);
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('chat-open'))));
  await page.keyboard.press('Escape');

  // 6. База: этапы и перетаскивание
  await page.click('.nav[data-id=base]');
  await page.waitForSelector('.kanban');
  await shot('08-base-board');
  const first = page.locator('.col[data-status=new] .kc').first();
  const firstName = await first.locator('b').innerText();
  await first.dragTo(page.locator('.col[data-status=replied] .list'));
  await page.waitForTimeout(500);
  assert.ok((await page.locator('.col[data-status=replied] .kc b', { hasText: firstName }).count()) >= 1, 'карточка должна оказаться в «Ответил»');
  await shot('09-base-after-drag');
  await page.click('.seg button:has-text("Список")');
  await page.waitForSelector('.table');
  await shot('10-base-table');

  // 7. Сообщения: очередь, чат в приложении, отправка, лимит, браузер
  await page.click('.nav[data-id=queue]');
  await page.waitForSelector('.qcard');
  await shot('11-queue');
  const sentBefore = await page.locator('.quota .q b').first().innerText();
  global.__clip = '';
  await page.click('button:has-text("Написать здесь")');
  await page.waitForSelector('#chatdock.on');
  assert.ok(global.__clip.includes('Матвей'), 'текст должен лежать в буфере');
  await page.waitForTimeout(450);
  await shot('12-queue-with-chat');
  await page.click('button:has-text("Я отправил")');
  await page.waitForTimeout(500);
  assert.notEqual(sentBefore, await page.locator('.quota .q b').first().innerText(), 'счётчик должен измениться');
  await page.click('#chatdock button[aria-label="Закрыть чат"]');
  await page.click('button:has-text("В браузере")');
  await page.waitForTimeout(300);
  assert.ok(/^https:\/\//.test(global.__opened[global.__opened.length - 1]), 'должна открыться https-ссылка');
  const nameBefore = await page.locator('.qcard h2').innerText();
  await page.click('button:has-text("Не писать")');
  await page.waitForTimeout(500);
  assert.notEqual(await page.locator('.qcard h2').innerText(), nameBefore);
  await page.click('.nav[data-id=base]');
  await page.click('.seg button:has-text("Не писать")');
  await page.waitForSelector('.bl-row');
  await shot('13-blacklist');


  // 7b. Нейросеть: добавление ключей, бейдж источника, цепочка, лимит и возврат
  await page.click('.nav[data-id=queue]');
  await page.waitForSelector('.qcard');
  assert.equal((await page.locator('[data-testid=srcbadge]').innerText()).trim(), 'шаблон', 'без ключей текст из шаблона');
  assert.ok(await page.locator('.ainote:has-text("не подключена")').count(), 'подсказка про подключение нейросети');
  await shot('19-queue-no-ai');
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('#aigroup');
  await page.waitForSelector('#aigroup .empty2');
  await page.click('#aigroup button:has-text("Добавить ключ нейросети")');
  await page.waitForSelector('#aigroup .aiadd');
  assert.ok(await page.locator('#aigroup .steps li').count() >= 3, 'есть пошаговая инструкция');
  assert.ok(await page.locator('#aigroup a[href^="https://"]').count(), 'есть ссылка на страницу ключей');
  await page.click('#aigroup .seg button:has-text("GigaChat")');
  assert.ok(await page.locator('#aigroup .notice:has-text("Минцифры")').count(), 'у GigaChat есть подсказка про сертификат');
  await page.click('#aigroup button:has-text("Открыть папку сертификатов")');
  await page.waitForTimeout(200);
  assert.ok(/certs$/.test(global.__openedPath || ''), 'папка сертификатов открывается');
  await page.click('#aigroup .seg button:has-text("Groq")');
  await page.fill('#aigroup input[aria-label="Ключ"]', 'gsk_FIRSTKEYFIRSTKEY');
  await page.fill('#aigroup input[aria-label="Название"]', 'Groq основной');
  await shot('20-settings-ai-add');
  await page.click('#aigroup button:has-text("Добавить и проверить")');
  await page.waitForSelector('#aigroup .aikey');
  await page.click('#aigroup button:has-text("Добавить ключ нейросети")');
  await page.click('#aigroup .seg button:has-text("OpenRouter")');
  await page.fill('#aigroup input[aria-label="Ключ"]', 'sk-or-SECONDKEYSECONDKEY');
  await page.click('#aigroup button:has-text("Добавить и проверить")');
  await page.waitForFunction(() => document.querySelectorAll('#aigroup .aikey').length === 2);
  const stored = require('fs').readFileSync(path.join(dataDir, 'ai.json'), 'utf8');
  assert.ok(!/FIRSTKEYFIRSTKEY|SECONDKEYSECONDKEY/.test(stored) || /ENC:/.test(stored), 'проверка файла ключей');
  assert.ok(!stored.includes('gsk_FIRSTKEYFIRSTKEY'), 'ключ в файле лежит только зашифрованным');
  assert.ok(!(await page.evaluate(() => document.body.innerText)).includes('FIRSTKEYFIRSTKEY'), 'ключ не показывается на экране');
  assert.equal(await page.locator('#aigroup .chip2.ok').count(), 2, 'оба ключа работают');
  await shot('21-settings-ai-keys');
  // порядок: поднять второй ключ вверх
  await page.locator('#aigroup .aikey').nth(1).locator('button[aria-label="Выше"]').click();
  await page.waitForFunction(() => document.querySelector('#aigroup .aikey .ttl').textContent.includes('OpenRouter'));
  // перетаскивание: вернуть Groq наверх
  await page.locator('#aigroup .aikey').nth(1).dragTo(page.locator('#aigroup .aikey').nth(0));
  await page.waitForFunction(() => document.querySelector('#aigroup .aikey .ttl').textContent.includes('Groq'));
  // очередь: нейросетевой текст и бейдж
  global.__ai.calls = 0;
  await page.click('.nav[data-id=queue]');
  await page.waitForSelector('.qcard');
  await page.waitForSelector('.srcbadge.busy');
  await shot('22-queue-ai-busy');
  await page.waitForSelector('.srcbadge.ai');
  assert.match(await page.locator('[data-testid=srcbadge]').innerText(), /нейросеть · Groq основной/);
  assert.ok((await page.locator('.qtext').inputValue()).includes('от нейросети'), 'текст пришёл от нейросети');
  await shot('23-queue-ai-text');
  // правка помечается
  await page.fill('.qtext', 'Мой текст. ' + (await page.locator('.qtext').inputValue()));
  assert.match(await page.locator('[data-testid=srcbadge]').innerText(), /правлено/);
  // первый ключ упёрся в лимит: пишет второй
  global.__ai.limitKeys = ['gsk_FIRSTKEY'];
  await page.click('button:has-text("Другой вариант")');
  await page.waitForSelector('.srcbadge.ai');
  assert.match(await page.locator('[data-testid=srcbadge]').innerText(), /нейросеть · OpenRouter/, 'при лимите первого берётся второй ключ');
  // оба в лимите: уведомление и шаблоны
  global.__ai.mode = 'limit';
  await page.click('button:has-text("Другой вариант")');
  await page.waitForSelector('.srcbadge:not(.busy)');
  await page.waitForSelector('.ainote:has-text("Лимиты нейросетей закончились")');
  await page.waitForSelector('.toast:has-text("Лимиты нейросетей закончились")');
  assert.ok(await page.locator('button:has-text("Другой вариант")').isDisabled(), 'нельзя просить нейросеть, когда лимиты кончились');
  await shot('24-queue-ai-exhausted');
  // шаблонный режим продолжает работать: можно отправить и записать
  await page.click('button:has-text("Из шаблона")');
  assert.equal((await page.locator('[data-testid=srcbadge]').innerText()).trim(), 'шаблон');
  await page.click('button:has-text("Написать здесь")');
  await page.waitForSelector('#chatdock.on');
  await page.waitForTimeout(450);
  await page.click('button:has-text("Я отправил")');
  await page.waitForTimeout(400);
  await page.click('#chatdock button[aria-label="Закрыть чат"]');
  const logged = svc.db.prepare('SELECT source FROM message_log ORDER BY id DESC LIMIT 1').get();
  assert.equal(logged.source, 'template', 'в журнале источник «шаблон»');
  // неверный ключ показывается в настройках
  global.__ai.mode = 'ok'; global.__ai.limitKeys = []; global.__ai.badKeys = ['sk-or-SECONDKEY'];
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('#aigroup .aikey');
  await page.locator('#aigroup .aikey').nth(1).locator('button:has-text("Проверить")').click();
  await page.waitForSelector('#aigroup .chip2.badkey');
  await shot('25-settings-ai-badkey');
  await page.locator('#aigroup .aikey').nth(1).locator('button[aria-label="Удалить ключ"]').click();
  await page.waitForFunction(() => document.querySelectorAll('#aigroup .aikey').length === 1);
  global.__ai.badKeys = [];


  // 7c. «Входящие»: несколько аккаунтов, счётчики непрочитанных, выбор канала и аккаунта
  svc.db.prepare(`INSERT INTO leads (id, name, short_name, city, rubric, site_class, channel, channel_target, telegram, whatsapp, status, tier, score, first_seen, last_seen)
    VALUES ('DUAL','Студия «Двойной контакт»','Двойной контакт','spb','Барбершопы','none','telegram','https://t.me/dual_studio','dual_studio','+79995550123','new','hot',999,'2026-10-01','2026-10-01')`).run();
  await page.click('.nav[data-id=inbox]');
  await page.waitForSelector('.inbox .acc', { timeout: 5000 }).catch(async () => { console.error('VIEW:', await page.evaluate(() => document.getElementById('view').innerText.slice(0, 300) + ' | TOASTS: ' + document.getElementById('toasts').innerText)); throw new Error('inbox не отрисовался'); });
  assert.equal(await page.locator('.inbox .acc').count(), 3, 'по аккаунту на мессенджер');
  await page.locator('.inbox .row button:has-text("Telegram")').click();
  await page.waitForFunction(() => document.querySelectorAll('.inbox .acc').length === 4);
  const second = page.locator('.acc[data-id="telegram-2"]');
  await second.locator('input[aria-label="Название аккаунта"]').fill('Рабочий Telegram');
  await second.locator('input[aria-label="Название аккаунта"]').press('Tab');
  await page.waitForFunction(() => document.querySelector('.acc[data-id="telegram-2"] input').value === 'Рабочий Telegram');
  await second.locator('input[aria-label="Лимит в день"]').fill('5');
  await second.locator('input[aria-label="Лимит в день"]').press('Tab');
  await page.waitForSelector('.acc[data-id="telegram-2"] .nums:has-text("из 5")');
  // непрочитанные: заголовок страницы мессенджера «(3) Telegram Web»
  await page.evaluate(() => LF.chat.openAccount('telegram-1'));
  await page.evaluate(() => LF.chat.openAccount('whatsapp-1'));
  await page.evaluate(() => {
    const send = (part, title) => { const wv = document.querySelector('#chatdock webview[partition="' + part + '"]'); const e = new Event('page-title-updated'); e.title = title; wv.dispatchEvent(e); };
    send('persist:chat-telegram', '(3) Telegram Web'); send('persist:chat-whatsapp', '(2) WhatsApp');
  });
  await page.waitForSelector('.nav[data-id=inbox] .ub:has-text("5")');
  assert.equal((await page.locator('.acc[data-id="telegram-1"] .ub').innerText()).trim(), '3');
  assert.equal((await page.locator('.acc[data-id="whatsapp-1"] .ub').innerText()).trim(), '2');
  assert.ok(await page.locator('#chatdock .seg button .ub').count() >= 2, 'счётчики есть и во вкладках чата');
  await page.evaluate(() => { const wv = document.querySelector('#chatdock webview[partition="persist:chat-telegram"]'); const e = new Event('page-title-updated'); e.title = 'Telegram Web'; wv.dispatchEvent(e); });
  await page.waitForSelector('.acc[data-id="telegram-1"] .ub', { state: 'hidden' });
  await shot('26-inbox');
  await page.click('#chatdock button[aria-label="Закрыть чат"]');
  // очередь: у организации два канала, предлагается лучший по порядку, можно переключить и выбрать аккаунт
  await page.click('.nav[data-id=queue]');
  await page.waitForSelector('.qcard');
  assert.match(await page.locator('.qcard h2').innerText(), /Двойной контакт/);
  await page.waitForSelector('[data-testid=chanseg]');
  assert.equal(await page.locator('[data-testid=chanseg] button[aria-pressed=true]').innerText(), 'Telegram');
  assert.ok(await page.locator('select[aria-label="Аккаунт"]').count(), 'выбор аккаунта при нескольких аккаунтах');
  await shot('27-queue-channels');
  // панель «Очередь по соцсетям»: порядок, включение, режим
  await page.waitForSelector('[data-testid=queueplan]');
  assert.equal(await page.locator('[data-testid=queueplan] .plan-row').count(), 3);
  await page.locator('[data-testid=queueplan] .plan-row').nth(1).locator('input[type=checkbox]').click(); // выключить вторую соцсеть
  await page.waitForTimeout(500);
  assert.equal((await page.evaluate(() => window.LF.settings.queueOff)).length, 1, 'выключение сохранилось в настройках');
  assert.equal(await page.locator('[data-testid=queueplan] .plan-row.off').count(), 1, 'выключенная соцсеть помечена');
  await page.locator('[data-testid=queueplan] .plan-row').nth(0).locator('button[aria-label="Позже"]').click(); // порядок
  await page.waitForTimeout(500);
  await page.click('[data-testid=planmode] button:has-text("По оценке")');
  await page.waitForTimeout(400);
  assert.equal(await page.evaluate(() => window.LF.settings.queueMode), 'score');
  await shot('27b-queue-plan');
  await page.click('[data-testid=planmode] button:has-text("Сначала по соцсетям")');
  await page.waitForTimeout(300);
  await page.locator('[data-testid=queueplan] .plan-row.off input[type=checkbox]').click(); // включить обратно
  await page.waitForTimeout(300);
  await page.locator('[data-testid=queueplan] .plan-row').nth(1).locator('button[aria-label="Раньше"]').click();
  await page.waitForTimeout(500);
  assert.equal(await page.evaluate(() => window.LF.settings.queueOff.length), 0);
  assert.equal((await page.evaluate(() => window.LF.settings.channelOrder))[0], 'telegram', 'порядок вернулся');
  await page.waitForSelector('[data-testid=chanseg]');
  await page.click('[data-testid=chanseg] button:has-text("WhatsApp")');
  await page.click('button:has-text("Написать здесь")');
  await page.waitForSelector('#chatdock.on');
  const wa = await page.evaluate(() => { const v = document.querySelector('#chatdock webview.active'); return { part: v.getAttribute('partition'), src: v.getAttribute('src') }; });
  assert.equal(wa.part, 'persist:chat-whatsapp');
  assert.match(wa.src, /web\.whatsapp\.com\/send\?phone=79995550123/);
  await page.waitForTimeout(400);
  await page.click('button:has-text("Я отправил")');
  await page.waitForTimeout(400);
  const lg = svc.db.prepare("SELECT channel, account FROM message_log WHERE lead_id='DUAL'").get();
  assert.deepEqual({ ...lg }, { channel: 'whatsapp', account: 'whatsapp-1' }, 'в журнале канал и аккаунт');
  await page.click('#chatdock button[aria-label="Закрыть чат"]');
  // в «Входящих» диалог виден; смена этапа
  await page.click('.nav[data-id=inbox]');
  await page.waitForSelector('.dlg[data-id=DUAL]');
  await page.locator('.dlg[data-id=DUAL] select').selectOption('replied');
  await page.waitForTimeout(400);
  assert.equal(svc.getLead('DUAL').status, 'replied');
  await shot('28-inbox-dialogs');
  // порядок каналов в настройках
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('[data-testid=chorder]');
  await page.locator('[data-testid=chorder] button[aria-label="Позже"]').first().click();
  await page.waitForFunction(() => document.querySelector('[data-testid=chorder]').innerText.indexOf('WhatsApp') < document.querySelector('[data-testid=chorder]').innerText.indexOf('Telegram'));
  assert.equal(svc.getSettings().channelOrder[0], 'whatsapp');
  await page.locator('[data-testid=chorder] button[aria-label="Раньше"]').nth(1).click();
  await page.waitForFunction(() => document.querySelector('[data-testid=chorder]').innerText.indexOf('Telegram') < document.querySelector('[data-testid=chorder]').innerText.indexOf('WhatsApp'));
  // убираем второй аккаунт
  await page.click('.nav[data-id=inbox]');
  await page.waitForSelector('.acc[data-id="telegram-2"]');
  await page.locator('.acc[data-id="telegram-2"] button[aria-label="Убрать аккаунт"]').click();
  await page.waitForFunction(() => document.querySelectorAll('.inbox .acc').length === 3, null, { timeout: 5000 }).catch(async () => { console.error('ACC:', await page.evaluate(() => [...document.querySelectorAll('.inbox .acc')].map((a) => a.dataset.id).join(',') + ' | ' + document.getElementById('toasts').innerText)); throw new Error('аккаунт не убрался'); });


  // 7d. «Сайты»: галерея из шести стилей, блоки, тексты, сохранение, промпт
  await page.click('.nav[data-id=sites]');
  await page.waitForSelector('[data-testid=gallery] .gcard');
  assert.equal(await page.locator('[data-testid=gallery] .gcard').count(), 6, 'шесть стилей в галерее');
  await page.waitForSelector('.bigprev iframe.bf');
  const frameText = async () => page.frameLocator('.bigprev iframe.bf').locator('body').innerText();
  const leadName = await page.locator('select[aria-label="Организация"] option:checked').innerText();
  assert.ok((await frameText()).length > 100, 'превью сайта отрисовано (CSP не мешает srcdoc)');
  await page.waitForTimeout(500);
  await shot('29-sites-gallery');
  const bg1 = await page.frameLocator('.bigprev iframe.bf').locator('body').evaluate((b) => getComputedStyle(b).backgroundColor);
  await page.click('.gcard[data-style=dark]');
  await page.waitForFunction(() => document.querySelector('.gcard[data-style=dark]').getAttribute('aria-pressed') === 'true');
  await page.waitForTimeout(400);
  const bg2 = await page.frameLocator('.bigprev iframe.bf').locator('body').evaluate((b) => getComputedStyle(b).backgroundColor);
  assert.notEqual(bg1, bg2, 'смена стиля меняет страницу');
  // превью тянется к размеру ячейки, а не торчит за её границы
  const sc = await page.locator('.gcard').first().locator('.tf').evaluate((f) => f.style.transform);
  assert.match(sc, /scale\(0\.\d+/, 'миниатюра уменьшена');
  // блоки: выключаем отзывы и карту
  await page.locator('.sitectl label.switch:has-text("Отзывы") input').uncheck();
  await page.locator('.sitectl label.switch:has-text("Карта") input').uncheck();
  await page.waitForTimeout(500);
  assert.ok(!(await frameText()).includes('Здесь появится отзыв'), 'блок отзывов убран');
  await page.locator('.sitectl label.switch:has-text("Отзывы") input').check();
  await page.locator('.sitectl label.switch:has-text("Карта") input').check();
  // телефон
  await page.click('.seg button:has-text("Телефон")');
  assert.equal(await page.locator('.bigprev').getAttribute('data-vp'), 'phone');
  assert.ok((await page.locator('.bigprev iframe.bf').evaluate((f) => f.getBoundingClientRect().width)) < 420, 'превью узкое, как телефон');
  await page.click('.seg button:has-text("Компьютер")');
  // тексты от нейросети (в стенде у ключей ответ про сообщение, не JSON: должен сработать запасной вариант)
  await page.click('button:has-text("Написать тексты нейросетью")');
  await page.waitForFunction(() => /Тексты: /.test(document.querySelector('.sitectl').innerText));
  assert.ok(await page.locator('.sitectl').innerText().then((t) => /Тексты: (тексты ниши|нейросеть)/.test(t)));
  // сохранить и скопировать промпт
  global.__openedPath = '';
  await page.click('button:has-text("Сохранить сайт")');
  await page.waitForFunction(() => /Сайт сохранён/.test(document.getElementById('toasts').innerText));
  assert.ok(/sites/.test(global.__openedPath), 'папка с сайтом открыта');
  assert.ok(require('fs').existsSync(path.join(global.__openedPath, 'index.html')), 'index.html создан');
  assert.ok(require('fs').readFileSync(path.join(global.__openedPath, 'index.html'), 'utf8').includes('<!doctype html>'));
  await page.click('button:has-text("Копировать промпт для нейросети")');
  await page.waitForTimeout(300);
  // вход из карточки организации
  await page.click('.nav[data-id=parser]');
  await page.waitForSelector('.lead');
  await page.locator('.lead').nth(2).click();
  await page.waitForSelector('#drawer.on');
  const drawerName = await page.locator('#drawer h2').first().innerText();
  await page.click('#drawer button:has-text("Сайт")');
  await page.waitForSelector('[data-testid=gallery] .gcard');
  await page.waitForTimeout(500);
  assert.ok((await page.locator('select[aria-label="Организация"] option:checked').innerText()).includes(drawerName.slice(0, 8)), 'из карточки открывается сайт именно этой организации');
  void leadName;


  // 7e. Предложение в PDF
  await page.click('.nav[data-id=sites]');
  await page.waitForSelector('[data-testid=modeseg]');
  await page.click('[data-testid=modeseg] button:has-text("Предложение")');
  await page.waitForSelector('.offerprev iframe.of');
  assert.ok(await page.locator('.notice:has-text("примерные")').count(), 'пока цены не подтверждены, есть предупреждение');
  await page.waitForTimeout(400);
  const offerText = await page.frameLocator('.offerprev iframe.of').locator('body').innerText();
  assert.ok(offerText.includes('Сайт-визитка') && offerText.includes('Коммерческое предложение'), 'предложение отрисовано');
  await shot('30-offer-preview');
  await page.locator('.sitectl label.switch:has-text("Telegram-бот") input').uncheck();
  await page.waitForTimeout(400);
  assert.ok(!(await page.frameLocator('.offerprev iframe.of').locator('body').innerText()).includes('Telegram-бот'), 'снятый вариант исчезает из предложения');
  global.__openedPath = '';
  await page.click('button:has-text("Сохранить PDF")');
  await page.waitForFunction(() => /PDF сохранён/.test(document.getElementById('toasts').innerText), null, { timeout: 15000 });
  assert.ok(/\.pdf$/.test(global.__openedPath), 'PDF открыт');
  const pdfBytes = require('fs').readFileSync(global.__openedPath);
  assert.equal(pdfBytes.slice(0, 5).toString(), '%PDF-', 'файл настоящий PDF');
  assert.ok(pdfBytes.length > 2000);
  require('fs').copyFileSync(global.__openedPath, path.join(OUT, 'offer-sample.pdf'));
  // настройки предложения: подтверждение цен убирает предупреждение
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('.settings');
  await page.click('summary:has-text("Коммерческое предложение")');
  await page.waitForSelector('details.more[open] label.switch:has-text("Цены мои")');
  await shot('31-offer-settings');
  await page.locator('details.more[open] label.switch:has-text("Цены мои") input').check();
  await page.waitForFunction(() => document.querySelector('details.more[open] .notice') === null || !/взяты с потолка/.test(document.body.innerText));
  assert.equal(svc.getSettings().offer.pricesConfirmed, true);
  await page.locator('details.more[open] input[aria-label="Название варианта"]').first().fill('Сайт-визитка Плюс');
  await page.locator('details.more[open] input[aria-label="Название варианта"]').first().press('Tab');
  await page.waitForTimeout(300);
  assert.equal(svc.getSettings().offer.packages[0].name, 'Сайт-визитка Плюс');
  await page.click('.nav[data-id=sites]');
  await page.click('[data-testid=modeseg] button:has-text("Предложение")').catch(() => {});
  await page.waitForSelector('.offerprev iframe.of');
  await page.waitForTimeout(300);
  assert.ok(!(await page.locator('.notice:has-text("примерные")').count()), 'после подтверждения цен предупреждения нет');
  assert.ok((await page.frameLocator('.offerprev iframe.of').locator('body').innerText()).includes('Сайт-визитка Плюс'));

  // 7f. Ползунки, фильтры и проверка соединения
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('.settings');
  await page.click('.seg button:has-text("Выключены")');
  assert.equal(await page.evaluate(() => document.body.dataset.motion), 'off', 'кнопка «Выключены» меняет настройку');
  assert.equal(await page.locator('.seg button[aria-pressed=true]:has-text("Выключены")').count(), 1, 'нажатая кнопка подсвечивается сразу');
  await page.click('.seg button:has-text("Полные")');
  assert.equal(await page.evaluate(() => document.body.dataset.motion), 'full');
  assert.equal(await page.locator('.seg button[aria-pressed=true]:has-text("Полные")').count(), 1);
  const lite = page.locator('.switch:has-text("слабого компьютера") input');
  await lite.check();
  assert.ok(await page.evaluate(() => document.body.classList.contains('lite')), 'переключатель «слабый компьютер» включается');
  assert.ok(await lite.isChecked());
  await lite.uncheck();
  assert.ok(!(await page.evaluate(() => document.body.classList.contains('lite'))));
  await page.fill('input[placeholder^="например 127"]', 'localhost:8080');
  await page.locator('input[placeholder^="например 127"]').dispatchEvent('change');
  await page.waitForTimeout(200);
  assert.equal((await page.evaluate(() => window.api.invoke('settings:get'))).data.netProxy, 'http://localhost:8080');
  await page.click('button:has-text("Проверить соединение")');
  await page.waitForSelector('.netrow.bad');
  assert.ok((await page.locator('.netout').innerText()).includes('ERR_CONNECTION_RESET'), 'код ошибки виден пользователю');
  await shot('13a-net-check');
  await page.fill('input[placeholder^="например 127"]', '');
  await page.locator('input[placeholder^="например 127"]').dispatchEvent('change');
  // видео-обои и анимации
  await page.click('.seg button:has-text("Видео")');
  await page.waitForSelector('#bg video');
  assert.ok((await page.getAttribute('#bg video', 'src')).startsWith('file://'), 'видео подключено');
  assert.equal(await page.evaluate(() => document.body.dataset.bg), 'video');
  await page.waitForFunction(() => { const v = document.querySelector('#bg video'); return v && v.readyState >= 2 && !v.paused; }, null, { timeout: 8000 });
  await page.evaluate(() => window.__dispatch('app:visibility', false));
  assert.ok(await page.evaluate(() => document.querySelector('#bg video').paused), 'при сворачивании видео на паузе');
  await page.evaluate(() => window.__dispatch('app:visibility', true));
  await shot('13c-video-bg');
  await page.click('button:has-text("Убрать видео")');
  await page.waitForFunction(() => !document.querySelector('#bg video'));
  await page.click('.seg button:has-text("Живой")');
  const anim = async (motion) => {
    await page.evaluate((m) => window.api.invoke('settings:set', { motion: m }), motion);
    await page.reload(); await page.waitForSelector('#view .panel, #view .sgroup, #view .filters');
    return page.evaluate(() => { const e = document.querySelector('.rv-in'); return e ? getComputedStyle(e).animationName : 'нет'; });
  };
  assert.equal(await anim('full'), 'riseIn', 'в «Полных» вид появляется волной');
  assert.equal(await anim('calm'), 'fadeIn', 'в «Спокойных» проще');
  assert.equal(await anim('off'), 'нет', 'в «Выключены» анимации нет');
  await anim('full');
  await page.click('.nav[data-id=parser]');
  // фильтры парсера
  await page.click('.nav[data-id=parser]');
  await page.waitForSelector('input[list=placelist]');
  await page.fill('input[list=placelist]', 'питер, Пушкин');
  await page.waitForFunction(() => document.querySelector('.panel .help b') && document.querySelector('.panel .help b').textContent.includes('Санкт-Петербург, Пушкин'));
  await page.fill('input[list=placelist]', 'Ханты-Мансийск');
  await page.waitForSelector('.panel .help .warn');
  await page.fill('input[list=placelist]', 'Санкт-Петербург');
  await page.waitForFunction(() => document.querySelector('.panel .help b') && document.querySelector('.panel .help b').textContent === 'Санкт-Петербург');
  await page.click('.panel .chip:has-text("ВКонтакте")');
  assert.equal(await page.locator('.panel .chip[aria-pressed=true]:has-text("ВКонтакте")').count(), 1, 'выбор соцсети для поиска подсвечивается');
  await page.click('.panel .chip:has-text("ВКонтакте")');
  await page.click('.nav[data-id=parser]');
  await page.waitForSelector('.filters .chip');
  const chipsPressed = () => page.locator('.filters .chip[aria-pressed=true]').count();
  const shown = async () => Number((await page.locator('.fstat').innerText()).match(/Показано (\d+)/)[1]);
  const before = await shown();
  await page.click('.filters .chip:has-text("Есть сайт")');
  assert.ok(await shown() >= before, 'включили «Есть сайт»: организаций не меньше');
  await page.click('.filters .chip:has-text("Нет сайта")');
  await page.click('.filters .chip:has-text("Только соцсети")');
  await page.click('.filters .chip:has-text("Слабый сайт")');
  await page.click('.filters .chip:has-text("Есть сайт")');
  await page.waitForSelector('.empty');
  await page.click('.filters button:has-text("Сбросить")');
  await page.waitForSelector('.lead');
  assert.equal(await shown(), before, 'сброс возвращает исходный показ');
  await page.click('.filters .chip:has-text("Telegram")');
  await page.waitForTimeout(300);
  const tgShown = await shown();
  assert.ok(tgShown <= before, 'фильтр по Telegram сужает список');
  assert.ok((await page.locator('.filters .chip:has-text("Telegram") .n').innerText()).trim() !== '', 'у кнопки есть число');
  await shot('13b-filters');
  await page.click('.filters button:has-text("Сбросить")');

  // 8. Настройки и темы
  await page.click('.nav[data-id=settings]');
  await page.waitForSelector('.settings');
  await shot('14-settings');
  await page.click('summary:has-text("Тексты сообщений")');
  await page.waitForTimeout(300);
  assert.ok(await page.locator('details.more[open] .tpl').count() > 3, 'тексты сообщений раскрываются');
  await page.evaluate(() => window.api.invoke('settings:set', { glassK: 1.4, radius: 8, font: 'bahn', leadView: 'rows', motion: 'calm', rail: 'icons' }));
  for (const [theme, file] of [['pal', '15-theme-red-white'], ['glass', '16-theme-glass'], ['neon', '17-theme-neon']]) {
    await page.evaluate((t) => window.api.invoke('settings:set', { theme: t }), theme);
    await page.click('.nav[data-id=parser]').catch(() => {});
    await page.reload();
    await page.waitForSelector('.lead');
    await shot(file);
  }
  await page.evaluate(() => window.api.invoke('settings:set', { theme: 'paldark', glassK: 1, radius: 16, font: 'segoe', leadView: 'cards', motion: 'full', rail: 'labels', lite: true }));
  await page.reload(); await page.waitForSelector('.lead');
  assert.ok(await page.evaluate(() => document.body.classList.contains('lite')), 'лёгкий режим включается');
  await shot('18-lite');
  await page.evaluate(() => window.api.invoke('settings:set', { lite: false }));
  await page.reload(); await page.waitForSelector('.lead');

  // 9. пауза анимации
  await page.evaluate(() => window.__dispatch('app:visibility', false));
  assert.ok(await page.evaluate(() => document.body.classList.contains('paused')), 'при скрытии окна анимация встаёт на паузу');

  await browser.close();
  if (problems.length) { console.error('ОШИБКИ В КОНСОЛИ СТРАНИЦЫ:\n' + problems.join('\n')); process.exit(1); }
  console.log('OK: сценарии пройдены, ошибок в консоли нет. Скриншоты:', OUT);
})().catch((e) => { console.error('СТЕНД УПАЛ:', e); process.exit(1); });

function makeCards2() {
  const cards = {}; const ids = [];
  for (let i = 0; i < 30; i++) {
    const id = String(5000 + i); ids.push(id);
    cards[id] = {
      id, name: 'Шиномонтаж «Резина ' + i + '»', shortName: 'Резина ' + i, address: 'ул. Вымышленная, ' + i, district: 'Московский район', lat: 59.9, lon: 30.3,
      rubrics: ['Шиномонтаж'], rating: 4.3, reviews: 20 + i, orgId: 'o' + id, branchCount: 1, updatedAt: '2026-10-01T00:00:00Z',
      contacts: [{ type: 'phone', value: '+79990' + (100000 + i), text: '' }],
    };
  }
  return { cards, ids };
}

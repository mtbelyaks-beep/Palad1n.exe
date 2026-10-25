'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppService } = require('../main/service');
const { buildHandlers } = require('../main/ipc');
const { pickTemplate, renderTemplate, DEFAULT_TEMPLATES } = require('../main/templates');
const { Engine } = require('../core/src/engine');

const TG = (u) => ({ type: 'telegram', text: '', url: 'https://t.me/' + u });
const WA = (n) => ({ type: 'whatsapp', text: '', url: 'https://wa.me/' + n });
const VK = (u) => ({ type: 'vkontakte', text: '', url: 'https://vk.com/' + u });
const PH = { type: 'phone', value: '+79990001122', text: '' };
const SITE = { type: 'website', text: 'a.ru', url: 'http://a.ru' };

const rec = (id, contacts, extra = {}) => ({
  id, name: 'Бизнес ' + id, shortName: 'Бизнес ' + id, address: 'ул. Тестовая, ' + id, district: 'Центральный район',
  lat: 59.9, lon: 30.3, rubrics: ['Барбершопы'], rating: 4.7, reviews: 40, orgId: 'o' + id, branchCount: 1,
  updatedAt: '2026-10-01T00:00:00Z', contacts, ...extra,
});

function fakeEngineFactory(cards, ids) {
  return () => {
    let closed = false;
    const evaluate = async (code) => {
      if (code.includes('window.__lc = ')) return true;
      if (code.includes('getResultsState()')) return { page: 1, ids, count: ids.length, hasNext: false };
      const m = code.match(/fetchFirm\("(\w+)"/);
      if (m) return cards[m[1]] || { id: m[1], error: 'http_404' };
      throw new Error('unexpected');
    };
    const e = new Engine({ navigate: async () => {}, evaluate });
    e.open = async () => {};                  // не ждём выдачу 15 секунд: страница подменена
    e.close = () => { closed = true; };
    e.isClosed = () => closed;
    return e;
  };
}

function waitEvent(events, name, ms = 3000) {
  return new Promise((resolve, reject) => {
    const t0 = Date.now();
    const tick = () => {
      const hit = events.find((e) => e.name === name);
      if (hit) return resolve(hit.data);
      if (Date.now() - t0 > ms) return reject(new Error('нет события ' + name));
      setTimeout(tick, 10);
    };
    tick();
  });
}

function makeService(cards = {}, ids = [], extra = {}) {
  const events = []; const opened = []; const clip = [];
  const svc = new AppService({
    createEngine: fakeEngineFactory(cards, ids),
    emit: (name, data) => events.push({ name, data }),
    cardDelayMs: 1,
    openExternal: async (u) => opened.push(u),
    writeClipboard: (t) => clip.push(t),
    ...extra,
  });
  svc.setSettings({ senderName: 'Матвей' });
  return { svc, events, opened, clip };
}

test('сбор: карточки попадают в базу, приходят события, окно закрывается', async () => {
  const cards = { 1: rec('1', [PH, TG('barber1')]), 2: rec('2', [PH, SITE]), 3: rec('3', [PH]) };
  const { svc, events } = makeService(cards, ['1', '2', '3']);
  const r = await svc.startSearch({ city: 'spb', query: 'барбершоп' });
  assert.equal(r.started, true);
  const done = await waitEvent(events, 'search:done');
  assert.equal(done.stat.cards, 3);
  assert.equal(done.stat.newLeads, 3);
  assert.ok(events.some((e) => e.name === 'search:progress'));
  const { total } = svc.listLeads({});
  assert.equal(total, 3);
  await new Promise((r2) => setTimeout(r2, 20));
  assert.equal(svc.searchStatus().running, false);
});

test('сбор: плохие данные отклоняются понятным текстом, второй запуск не стартует', async () => {
  const { svc, events } = makeService({ 1: rec('1', [PH]) }, ['1']);
  await assert.rejects(svc.startSearch({ city: '!!!', query: 'x' }), /Не понял, какой город/);
  await assert.rejects(svc.startSearch({ city: 'spb', query: '  ' }), /кого искать/);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await assert.rejects(svc.startSearch({ city: 'spb', query: 'y' }), /уже идёт/);
  await waitEvent(events, 'search:done');
});

test('сбор: пустая выдача даёт подсказку про проверку «я не робот»', async () => {
  const { svc, events } = makeService({}, []);
  await svc.startSearch({ city: 'spb', query: 'x' });
  const done = await waitEvent(events, 'search:done');
  assert.match(done.message, /Выдача пустая/);
});

test('сбор: ошибка загрузки превращается в человеческий текст', async () => {
  const svc = new AppService({
    createEngine: () => new Engine({ navigate: async () => { throw new Error('load failed: ERR_INTERNET_DISCONNECTED'); }, evaluate: async () => true, retryDelayMs: 0 }),
    emit: (n, d) => events.push({ name: n, data: d }),
  });
  const events = [];
  await svc.startSearch({ city: 'spb', query: 'x' });
  const err = await waitEvent(events, 'search:error');
  assert.match(err.message, /Не удалось открыть 2ГИС \(ERR_INTERNET_DISCONNECTED\).*проверь соединение/);
});

test('сети отсеиваются по порогу из настроек, без пересбора', async () => {
  const cards = { 1: rec('1', [PH]), 2: rec('2', [PH], { branchCount: 5 }) };
  const { svc, events } = makeService(cards, ['1', '2']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  assert.equal(svc.listLeads({}).total, 1);               // по умолчанию сети скрыты (порог 4)
  svc.setSettings({ chainThreshold: 6 });
  assert.equal(svc.listLeads({}).total, 2);               // порог выше - сеть из 5 филиалов уже не сеть
  assert.equal(svc.listLeads({ excludeChains: false }).total, 2);
});

test('фильтры: класс сайта, рейтинг, текстовый поиск', async () => {
  const cards = {
    1: rec('1', [PH, TG('a')], { rating: 4.9, name: 'Борода' }),
    2: rec('2', [PH, SITE], { rating: 3.5 }),
    3: rec('3', [PH], { rating: 4.2, address: 'Невский 1' }),
  };
  const { svc, events } = makeService(cards, ['1', '2', '3']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  assert.deepEqual(svc.listLeads({ siteClasses: ['none'] }).rows.map((r) => r.id), ['3']);
  assert.equal(svc.listLeads({ minRating: 4.5 }).rows.length, 1);
  assert.deepEqual(svc.listLeads({ q: 'невский' }).rows.map((r) => r.id), ['3']);
  const st = svc.stats('spb');
  assert.equal(st.total, 3);
  assert.equal(st.hot, 2);
  assert.equal(st.cold, 1);
});

test('очередь: берёт только новых с мессенджером, лимит считается по каналам, статус меняется', async () => {
  const cards = {
    1: rec('1', [PH, TG('t1')], { reviews: 90 }),
    2: rec('2', [PH, TG('t2')], { reviews: 80 }),
    3: rec('3', [PH, WA('79991112233')], { reviews: 10 }),
    4: rec('4', [PH]),                        // только телефон: в очередь не попадает
    5: rec('5', [PH, SITE, TG('t5')]),        // нормальный сайт: cold, не попадает
  };
  const { svc, events } = makeService(cards, ['1', '2', '3', '4', '5']);
  svc.setSettings({ dailyLimits: { telegram: 1, whatsapp: 5, vk: 5 } });
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');

  let q = svc.queueNext({});
  assert.equal(q.lead.id, '1');
  assert.equal(q.waiting, 3);
  assert.match(q.text, /Матвей/);
  assert.equal(q.counters.telegram.left, 1);

  const c = svc.markSent({ leadId: '1', templateId: q.templateId, text: q.text });
  assert.equal(c.telegram.left, 0);
  assert.equal(svc.getLead('1').status, 'contacted');

  q = svc.queueNext({});                       // Telegram исчерпан: берём WhatsApp-лид
  assert.equal(q.lead.id, '3');
  svc.markSent({ leadId: '3', templateId: q.templateId, text: q.text });

  q = svc.queueNext({});                       // остался только лид 2, но лимит Telegram кончился
  assert.equal(q.lead, null);
  assert.equal(q.reason, 'limit');
  assert.equal(q.waiting, 1);

  svc.setSettings({ dailyLimits: { telegram: 3 } });
  assert.equal(svc.queueNext({}).lead.id, '2');
  assert.equal(svc.queueNext({ skipIds: ['2'] }).reason, 'empty');
});


test('очередь: порядок соцсетей, выключение WhatsApp и выбор из нескольких каналов', async () => {
  const cards = {
    1: rec('1', [PH, WA('79991112233')], { reviews: 90 }),                    // только WhatsApp, лучшая оценка
    2: rec('2', [PH, TG('t2'), WA('79991112244')], { reviews: 50 }),          // Telegram и WhatsApp
    3: rec('3', [PH, VK('club3')], { reviews: 5 }),                           // только ВКонтакте, оценка ниже
  };
  const { svc, events } = makeService(cards, ['1', '2', '3']);
  svc.setSettings({ dailyLimits: { telegram: 5, whatsapp: 5, vk: 5 } });
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');

  // по умолчанию: сначала по порядку соцсетей (Telegram, WhatsApp, ВК)
  let q = svc.queueNext({});
  assert.equal(q.lead.id, '2');
  assert.equal(q.lead.channel, 'telegram');
  assert.deepEqual(q.channels.map((c) => c.id), ['telegram', 'whatsapp'], 'у организации видны обе соцсети');
  assert.equal(q.plan.whatsapp.leads, 2);
  assert.equal(q.plan.whatsapp.only, 1);

  // ВК первым: сначала организации, куда можно написать во ВК
  svc.setSettings({ channelOrder: ['vk', 'telegram', 'whatsapp'] });
  assert.equal(svc.queueNext({}).lead.id, '3');

  // выключен WhatsApp: организация только с WhatsApp не предлагается совсем
  svc.setSettings({ queueOff: ['whatsapp'] });
  q = svc.queueNext({ skipIds: ['3'] });
  assert.equal(q.lead.id, '2');
  assert.equal(q.lead.channel, 'telegram');
  assert.equal(q.channels.find((c) => c.id === 'whatsapp').off, true, 'выключенный канал в карточке всё равно можно выбрать');
  assert.equal(q.waiting, 1);
  q = svc.queueNext({ skipIds: ['3', '2'] });
  assert.equal(q.lead, null);
  assert.equal(q.reason, 'empty');

  // режим «по оценке»: идёт лид 2 (оценка выше, чем у 3), а не ВК-лид из начала списка
  svc.setSettings({ queueOff: [], queueMode: 'score', channelOrder: ['vk', 'telegram', 'whatsapp'] });
  assert.equal(svc.queueNext({}).lead.id, '1');

  // выключить все три нельзя
  svc.setSettings({ queueOff: ['telegram', 'whatsapp', 'vk', 'мусор'] });
  assert.equal(svc.getSettings().queueOff.length, 2);
});

test('дневной счётчик сбрасывается со следующим днём', async () => {
  let day = new Date(2026, 9, 23, 12, 0, 0);
  const { svc, events } = makeService({ 1: rec('1', [PH, TG('t1')]) }, ['1'], { now: () => day });
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  svc.markSent({ leadId: '1', templateId: 'x', text: 'привет' });
  assert.equal(svc.counters().telegram.used, 1);
  day = new Date(2026, 9, 24, 9, 0, 0);
  assert.equal(svc.counters().telegram.used, 0);
});

test('открытие чата: текст всегда в буфере, WhatsApp с подстановкой, чужие ссылки блокируются', async () => {
  const cards = { 1: rec('1', [PH, TG('t1')]), 2: rec('2', [PH, WA('79991112233')]), 3: rec('3', [PH, { type: 'vkontakte', url: 'javascript:alert(1)' }]) };
  const { svc, events, opened, clip } = makeService(cards, ['1', '2', '3']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  const r1 = await svc.openChat('1', 'привет 1');
  assert.deepEqual([r1.opened, r1.copied, r1.prefilled], [true, true, false]);
  assert.equal(opened[0], 'https://t.me/t1');
  const r2 = await svc.openChat('2', 'привет мир');
  assert.equal(r2.prefilled, true);
  assert.equal(opened[1], 'https://wa.me/79991112233?text=' + encodeURIComponent('привет мир'));
  assert.deepEqual(clip, ['привет 1', 'привет мир']);
  assert.equal(svc.chatUrl({ channel: 'vk', channel_target: 'javascript:alert(1)' }, 'x').url, '');
  assert.equal(svc.chatUrl({ channel: 'vk', channel_target: 'https://evil.example/x' }, 'x').url, '');
  assert.equal(svc.chatUrl({ channel: 'vk', channel_target: 'http://vk.com/x' }, 'x').url, '');
  assert.equal(svc.chatUrl({ channel: 'vk', channel_target: 'https://vk.com/x' }, 'x').url, 'https://vk.com/x');
});

test('чёрный список: добавить из карточки, увидеть в списке с названием, вернуть обратно', async () => {
  const cards = { 1: rec('1', [PH, TG('t1')]), 2: rec('2', [{ type: 'phone', value: '+79995554433' }, TG('t2')]) };
  const { svc, events } = makeService(cards, ['1', '2']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  svc.blacklistLead('1', 'phone');
  assert.deepEqual(svc.listLeads({}).rows.map((r) => r.id), ['2']);
  const bl = svc.listBlacklist();
  assert.equal(bl.length, 1);
  assert.equal(bl[0].label, 'Бизнес 1');
  assert.equal(svc.queueNext({}).lead.id, '2');
  svc.removeBlacklist(bl[0].kind, bl[0].value);
  assert.equal(svc.listLeads({}).total, 2);
});

test('заметки и теги сохраняются и переживают повторный сбор', async () => {
  const cards = { 1: rec('1', [PH]) };
  const { svc, events } = makeService(cards, ['1']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  svc.updateLead('1', { notes: 'звонить после 12', tags: 'приоритет', status: 'paid', name: 'взлом' });
  const l = svc.getLead('1');
  assert.equal(l.notes, 'звонить после 12');
  assert.equal(l.name, 'Бизнес 1');            // посторонние поля не меняются
  assert.equal(l.status, 'new');
});

test('шаблоны: подбор под класс сайта и рубрику, подстановка переменных', () => {
  const barber = { site_class: 'none', rubric: 'Барбершопы', short_name: 'Борода', district: 'Центральный район' };
  assert.equal(pickTemplate(barber, DEFAULT_TEMPLATES).id, 'barber');
  assert.equal(pickTemplate({ site_class: 'social', rubric: 'Кафе' }, DEFAULT_TEMPLATES).id, 'social');
  assert.equal(pickTemplate({ site_class: 'booking', rubric: 'Кафе' }, DEFAULT_TEMPLATES).id, 'booking');
  const txt = renderTemplate('Привет, {me}! {name}, {district}, {niche}', barber, { senderName: 'Матвей' });
  assert.equal(txt, 'Привет, Матвей! Борода, Центральный, барбершопы');
});

test('настройки: сохраняются в файл и читаются при следующем запуске', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-'));
  const a = new AppService({ dataDir: dir });
  a.setSettings({ theme: 'neon', accent: '#ff00aa', dailyLimits: { telegram: 12 } });
  const b = new AppService({ dataDir: dir });
  assert.equal(b.getSettings().theme, 'neon');
  assert.equal(b.getSettings().dailyLimits.telegram, 12);
  assert.equal(b.getSettings().dailyLimits.whatsapp, 15);   // остальные лимиты остались по умолчанию
  fs.rmSync(dir, { recursive: true, force: true });
});

test('таблица IPC покрывает все методы, на которые опирается окно', () => {
  const { svc } = makeService();
  const h = buildHandlers(svc);
  for (const ch of ['settings:get', 'search:start', 'leads:list', 'queue:next', 'queue:open', 'queue:sent', 'blacklist:list']) {
    assert.equal(typeof h[ch], 'function', ch);
  }
});

test('старые настройки (тёмная тема v1) заменяются красно-чёрными, имя и лимиты остаются', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ theme: 'glass', accent: '#8b7cff', bg: 'static', senderName: 'Матвей', dailyLimits: { telegram: 7 } }));
  const s = new AppService({ dataDir: dir });
  assert.equal(s.getSettings().theme, 'paldark');
  assert.equal(s.getSettings().accent, '#e5232e');
  assert.equal(s.getSettings().bg, 'animated');
  assert.equal(s.getSettings().senderName, 'Матвей');
  assert.equal(s.getSettings().dailyLimits.telegram, 7);
  s.setSettings({ theme: 'neon' });
  assert.equal(new AppService({ dataDir: dir }).getSettings().theme, 'neon'); // новый выбор уже не сбрасывается
  fs.rmSync(dir, { recursive: true, force: true });
});

test('встроенный чат: адрес по каналу, текст всегда в буфере, чужие адреса не открываются', async () => {
  const cards = {
    1: rec('1', [PH, TG('t_one')]),
    2: rec('2', [PH, WA('79991112233')]),
    3: rec('3', [PH, { type: 'vkontakte', url: 'https://vk.com/club77' }]),
    4: rec('4', [PH, { type: 'vkontakte', url: 'https://evil.example/club77' }]),
    5: rec('5', [PH]),
  };
  const { svc, events, clip } = makeService(cards, ['1', '2', '3', '4', '5']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  const t1 = svc.chatTarget('1', 'текст 1');
  assert.deepEqual([t1.service, t1.url, t1.prefilled, t1.partition], ['telegram', 'https://web.telegram.org/k/#@t_one', false, 'persist:chat-telegram']);
  const t2 = svc.chatTarget('2', 'привет мир');
  assert.equal(t2.url, 'https://web.whatsapp.com/send?phone=79991112233&text=' + encodeURIComponent('привет мир'));
  assert.equal(t2.prefilled, true);
  assert.equal(svc.chatTarget('3', 'x').url, 'https://vk.com/club77');
  assert.equal(svc.chatTarget('4', 'x').url, '');       // vk с чужого домена не открываем
  assert.equal(svc.chatTarget('5', 'x').service, '');   // только телефон: чата нет
  assert.equal(clip[clip.length - 1], 'x');
  assert.equal(clip[0], 'текст 1');
});

test('чёрный список: «Не писать» скрывает человека и номера, в списке одна строка, возврат убирает всё', async () => {
  const cards = { 1: rec('1', [PH, TG('t1')]), 2: rec('2', [{ type: 'phone', value: '+79995554433' }, TG('t2')]) };
  const { svc, events } = makeService(cards, ['1', '2']);
  await svc.startSearch({ city: 'spb', query: 'x' });
  await waitEvent(events, 'search:done');
  svc.blacklistLead('1');
  assert.deepEqual(svc.listLeads({}).rows.map((r) => r.id), ['2']);
  const bl = svc.listBlacklist();
  assert.equal(bl.length, 1);                            // номер отдельной строкой не показывается
  assert.equal(bl[0].label, 'Бизнес 1');
  assert.equal(svc.db.prepare("SELECT COUNT(*) AS n FROM blacklist WHERE kind = 'phone'").get().n, 1); // но в базе он есть
  svc.removeBlacklist(bl[0].kind, bl[0].value);
  assert.equal(svc.listLeads({}).total, 2);
  assert.equal(svc.db.prepare('SELECT COUNT(*) AS n FROM blacklist').get().n, 0);
});

test('настройки версии 2 (красно-белая по умолчанию): тема сбрасывается на красно-чёрную, остальное остаётся', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lf-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ settingsVersion: 2, theme: 'pal', accent: '#e5232e', radius: 8, font: 'bahn', senderName: 'Матвей' }));
  const s = new AppService({ dataDir: dir });
  assert.equal(s.getSettings().theme, 'paldark');
  assert.equal(s.getSettings().radius, 8);          // его кастомизация не теряется
  assert.equal(s.getSettings().font, 'bahn');
  assert.equal(s.getSettings().senderName, 'Матвей');
  fs.rmSync(dir, { recursive: true, force: true });
});

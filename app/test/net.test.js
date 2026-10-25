'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeProxy, AppService } = require('../main/service');
const { Engine } = require('../core/src/engine');

test('прокси: принимаются только понятные адреса', () => {
  assert.equal(normalizeProxy('localhost:8080'), 'http://localhost:8080');
  assert.equal(normalizeProxy('socks5://10.0.0.1:1080'), 'socks5://10.0.0.1:1080');
  assert.equal(normalizeProxy('  '), '');
  assert.equal(normalizeProxy('javascript:alert(1)'), '');
  assert.equal(normalizeProxy('http://a b:80'), '');
});

test('движок: после неудач на основном адресе пробует запасной', async () => {
  const urls = [];
  const e = new Engine({ navigate: async (u) => { urls.push(u); if (u.includes('2gis.ru')) throw new Error('load failed: ERR_CONNECTION_RESET'); }, evaluate: async () => true, retryDelayMs: 0 });
  await e.load('/spb/search/x');
  assert.equal(urls.filter((u) => u.includes('2gis.ru')).length, 2, 'две попытки на основном адресе');
  assert.ok(urls[urls.length - 1].startsWith('https://2gis.com/'));
  assert.equal(e.host, '2gis.com');
});

test('движок: не сетевая ошибка не повторяется', async () => {
  let n = 0;
  const e = new Engine({ navigate: async () => { n++; throw new Error('другое'); }, evaluate: async () => true, retryDelayMs: 0 });
  await assert.rejects(e.load('/x'), /другое/);
  assert.equal(n, 1);
});

function svc() {
  const s = new AppService({ dbFile: ':memory:', checkNet: async (o) => ({ results: {}, customProxy: !!o.proxy }) });
  const ins = s.db.prepare(`INSERT INTO leads (id, name, city, rubric, site_class, channel, status, tier, score, rating, vk, telegram, whatsapp, first_seen, last_seen)
    VALUES (?,?,?,?,?,?, 'new','hot',80,?,?,?,?, '2026-10-01','2026-10-01')`);
  ins.run('1', 'А', 'spb', 'Бар', 'none', 'vk', 4.5, 'https://vk.com/a', '', '');
  ins.run('2', 'Б', 'spb', 'Бар', 'social', 'telegram', 3.9, '', 'bbbb', '');
  ins.run('3', 'В', 'spb', 'Бар', 'builder', 'whatsapp', 4.2, 'https://vk.com/c', '', '+79990001122');
  ins.run('4', 'Г', 'spb', 'Бар', 'own', '', 4.8, '', '', '');
  return s;
}

test('фильтр по соцсетям: подходит любая из выбранных', () => {
  const s = svc();
  const ids = (networks) => s.listLeads({ networks, excludeChains: false }).rows.map((r) => r.id).sort();
  assert.deepEqual(ids(['vk']), ['1', '3']);
  assert.deepEqual(ids(['telegram']), ['2']);
  assert.deepEqual(ids(['vk', 'telegram']), ['1', '2', '3']);
  assert.deepEqual(ids([]), ['1', '2', '3', '4']);
});

test('счётчики фильтров совпадают с данными', () => {
  const f = svc().facets('spb');
  assert.equal(f.total, 4);
  assert.deepEqual(f.plates, { none: 1, social: 1, weak: 1, own: 1 });
  assert.deepEqual(f.networks, { vk: 2, telegram: 1, whatsapp: 1 });
  assert.equal(f.rating4, 3);
});

test('настройки: прокси чистится при сохранении; проверка соединения использует его', async () => {
  const s = svc();
  s.setSettings({ netProxy: 'evil;rm' });
  assert.equal(s.getSettings().netProxy, '');
  s.setSettings({ netProxy: '127.0.0.1:3128' });
  assert.equal((await s.netCheck()).customProxy, true);
  await assert.rejects(new AppService({ dbFile: ':memory:' }).netCheck(), /недоступна/);
});

const geo = require('../main/geo');
test('город и район вводятся обычными словами', () => {
  const r = (t) => geo.resolvePlace(t);
  assert.equal(r('Санкт-Петербург, Пушкин').slug, 'spb');
  assert.equal(r('Санкт-Петербург, Пушкин').district, 'Пушкин');
  assert.equal(r('питер колпино').district, 'Колпино');
  assert.equal(r('Пушкин').slug, 'spb');
  assert.equal(r('московский район спб').district, 'Московский');
  assert.equal(r('московский район спб').scope, 'district');
  assert.equal(r('Москва Арбат').slug, 'moscow');
  assert.equal(r('Нижний Новгород').slug, 'n_novgorod');
  assert.equal(r('ростов на дону').slug, 'rostov');
  assert.equal(r('Ханты-Мансийск').known, false);
  assert.equal(r('Ханты-Мансийск').slug, 'khanty_mansiysk');
  assert.equal(r('kazan').slug, 'kazan');
  assert.equal(r('   '), null);
});

test('район: «Московский» ищется в поле района, «Пушкин» ещё и в адресе', () => {
  const m = r0();
  function r0() { return { pushkin: geo.resolvePlace('Пушкин'), mosk: geo.resolvePlace('Московский район спб') }; }
  assert.ok(geo.matchesDistrict({ address: 'г. Пушкин, ул. Ленина', district: 'Пушкинский район' }, m.pushkin.term, m.pushkin.scope));
  assert.ok(!geo.matchesDistrict({ address: 'Московский пр., 5', district: 'Адмиралтейский район' }, m.mosk.term, m.mosk.scope));
  assert.ok(geo.matchesDistrict({ address: 'ул. Типанова', district: 'Московский район' }, m.mosk.term, m.mosk.scope));
});

test('поиск: фильтр по соцсети и району отсеивает лишнее и сообщает об этом', async () => {
  const ph = { type: 'phone', value: '+79990001122', text: '' };
  const vk = (u) => ({ type: 'vkontakte', text: '', url: 'https://vk.com/' + u });
  const mk = (id, contacts, address, district) => ({ id, name: 'Б' + id, shortName: 'Б' + id, address, district, lat: 59.9, lon: 30.3, rubrics: ['Бар'], rating: 4.5, reviews: 10, orgId: 'o' + id, branchCount: 1, updatedAt: '2026-10-01T00:00:00Z', contacts });
  const cards = {
    1: mk('1', [ph, vk('a1')], 'г. Пушкин, ул. А', 'Пушкинский район'),
    2: mk('2', [ph], 'г. Пушкин, ул. Б', 'Пушкинский район'),
    3: mk('3', [ph, vk('c3')], 'ул. В', 'Невский район'),
  };
  const events = [];
  const svc = new AppService({
    dbFile: ':memory:', cardDelayMs: 0,
    createEngine: () => {
      const e = new Engine({
        navigate: async () => {},
        evaluate: async (code) => {
          if (code.includes('getResultsState()')) return { page: 1, ids: ['1', '2', '3'], count: 3, hasNext: false };
          const m = /fetchFirm\("(\w+)"/.exec(code);
          return m ? cards[m[1]] : true;
        },
      });
      e.open = async () => {};
      return e;
    },
    emit: (n, d) => events.push({ n, d }),
  });
  await svc.startSearch({ place: 'Санкт-Петербург, Пушкин', query: 'бар', networks: ['vk'] });
  const done = await new Promise((res, rej) => { const t0 = Date.now(); const t = setInterval(() => { const e = events.find((x) => x.n === 'search:done'); if (e) { clearInterval(t); res(e.d); } else if (Date.now() - t0 > 4000) { clearInterval(t); rej(new Error('нет search:done: ' + JSON.stringify(events.map((x) => x.n)))); } }, 20); });
  assert.equal(done.stat.newLeads, 1, 'только организация со ВК в районе Пушкин');
  assert.equal(done.stat.filtered, 2);
  assert.deepEqual(svc.listLeads({ excludeChains: false }).rows.map((r) => r.id), ['1']);
});

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
test('видео-обои: файл копируется, подключается, удаляется; плохие файлы отклоняются', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-vid-'));
  const src = path.join(dir, 'клип.webm'); fs.writeFileSync(src, Buffer.from('webm'));
  const bad = path.join(dir, 'x.exe'); fs.writeFileSync(bad, 'x');
  let next = src;
  const s = new AppService({ dataDir: dir, dbFile: ':memory:', pickFile: async () => next });
  const r = await s.pickBgVideo();
  assert.equal(r.picked, true);
  assert.equal(s.getSettings().bg, 'video');
  assert.ok(fs.existsSync(path.join(dir, 'wallpaper', 'bg-video.webm')));
  assert.ok(s.bgVideoUrl().startsWith('file://'));
  next = bad; await assert.rejects(s.pickBgVideo(), /mp4 или webm/);
  next = ''; assert.equal((await s.pickBgVideo()).picked, false);
  s.clearBgVideo();
  assert.equal(s.getSettings().bg, 'animated');
  assert.equal(s.bgVideoUrl(), '');
  assert.ok(!fs.existsSync(path.join(dir, 'wallpaper')));
  // нельзя включить видео без файла и подсунуть чужой путь
  s.setSettings({ bg: 'video', bgVideo: '../../etc/passwd' });
  assert.equal(s.getSettings().bg, 'animated');
  assert.equal(s.getSettings().bgVideo, '');
});

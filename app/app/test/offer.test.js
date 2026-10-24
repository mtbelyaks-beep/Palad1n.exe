'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renderOffer, normalizeOffer, DEFAULT_OFFER } = require('../main/offer');
const { AppService } = require('../main/service');

const LEAD = { id: 'S1', name: 'Барбершоп «Борода»', short_name: 'Борода', rubric: 'Барбершопы', district: 'Центральный район', site_class: 'social' };

test('предложение содержит организацию, отправителя, пакеты с ценами и срок действия', () => {
  const html = renderOffer(LEAD, DEFAULT_OFFER, { sender: 'Матвей', now: new Date('2026-10-23T10:00:00Z') });
  for (const x of ['Борода', 'Матвей', 'Сайт-визитка', 'от 15 000 ₽', 'Telegram-бот', 'только страницы в соцсетях', '23 октября 2026', 'до 6 ноября 2026']) assert.ok(html.includes(x), x);
});

test('можно выбрать только часть пакетов', () => {
  const html = renderOffer(LEAD, DEFAULT_OFFER, { packageIds: ['bot'], sender: 'М' });
  assert.ok(html.includes('Telegram-бот'));
  assert.ok(!html.includes('Сайт-визитка'));
});

test('всё экранируется: вредный текст из 2ГИС и из настроек не попадает в разметку', () => {
  const o = { ...DEFAULT_OFFER, contacts: '<script>x</script>\n+7 999', packages: [{ id: 'a', name: '<img src=x onerror=1>', price: '"><b>1</b>', items: ['<script>1</script>'] }] };
  const html = renderOffer({ ...LEAD, name: '<script>bad</script>', short_name: '<script>bad</script>' }, o, { sender: '<b>я</b>' });
  assert.ok(!/<script/i.test(html));
  assert.ok(!/<img src=x/i.test(html));
  assert.ok(!/<b>я<\/b>/.test(html));
});

test('цена не задана: пишется «по договорённости», а не пустота', () => {
  const html = renderOffer(LEAD, { ...DEFAULT_OFFER, packages: [{ id: 'a', name: 'Вариант', price: '', items: [] }] }, {});
  assert.ok(html.includes('по договорённости'));
});

test('настройки предложения приводятся к безопасному виду', () => {
  const n = normalizeOffer({ accent: 'red;}', validDays: 9999, packages: Array.from({ length: 20 }, (_, i) => ({ id: 'x', name: 'N' + i, items: Array(30).fill('пункт') })) });
  assert.equal(n.accent, DEFAULT_OFFER.accent);
  assert.equal(n.validDays, 90);
  assert.equal(n.packages.length, 6);
  assert.equal(new Set(n.packages.map((p) => p.id)).size, 6, 'идентификаторы уникальны');
  assert.ok(n.packages.every((p) => p.items.length <= 10));
  assert.deepEqual(normalizeOffer(null).packages.map((p) => p.id), DEFAULT_OFFER.packages.map((p) => p.id));
});

function svc(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-offer-'));
  const opened = [];
  const s = new AppService({ dataDir: dir, dbFile: ':memory:', openPath: async (p) => opened.push(p), ...extra });
  s.db.prepare(`INSERT INTO leads (id, name, short_name, city, rubric, site_class, channel, status, tier, score, first_seen, last_seen)
    VALUES ('S1','Барбершоп «Борода»','Борода','spb','Барбершопы','social','telegram','new','hot',90,'2026-10-01','2026-10-01')`).run();
  return { s, dir, opened };
}

test('сервис: предпросмотр помнит про имя и подтверждение цен; настройки сохраняются и чистятся', () => {
  const { s } = svc();
  let p = s.offerPreview({ leadId: 'S1' });
  assert.equal(p.pricesConfirmed, false);
  assert.equal(p.needsName, true);
  s.setSettings({ senderName: 'Матвей', offer: { ...s.getSettings().offer, pricesConfirmed: true, accent: 'javascript:1' } });
  p = s.offerPreview({ leadId: 'S1' });
  assert.equal(p.pricesConfirmed, true);
  assert.equal(p.needsName, false);
  assert.equal(s.getSettings().offer.accent, DEFAULT_OFFER.accent);
  assert.throws(() => s.offerPreview({ leadId: 'нет' }), /не найдена/);
});

test('сервис: PDF создаётся из подменной печати, лежит в папке offers и открывается', async () => {
  let got = '';
  const { s, dir, opened } = svc({ renderPdf: async (html) => { got = html; return Buffer.from('%PDF-1.4 test'); } });
  const r = await s.offerPdf({ leadId: 'S1', packageIds: ['card'] });
  assert.ok(r.file.startsWith(path.join(dir, 'offers')));
  assert.ok(r.file.endsWith('.pdf'));
  assert.equal(fs.readFileSync(r.file, 'utf8'), '%PDF-1.4 test');
  assert.ok(got.includes('Сайт-визитка') && !got.includes('Telegram-бот'));
  assert.equal(opened[0], r.file);
});

test('сервис: без печати или с пустым результатом PDF не создаётся и причина понятна', async () => {
  await assert.rejects(svc().s.offerPdf({ leadId: 'S1' }), /недоступна/);
  await assert.rejects(svc({ renderPdf: async () => Buffer.alloc(0) }).s.offerPdf({ leadId: 'S1' }), /Не удалось/);
});

test('старые настройки без предложения получают предложение по умолчанию', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-offold-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ settingsVersion: 3, senderName: 'Матвей' }));
  const s = new AppService({ dataDir: dir, dbFile: ':memory:' });
  assert.equal(s.getSettings().offer.packages.length, 3);
  assert.equal(s.getSettings().offer.pricesConfirmed, false);
});

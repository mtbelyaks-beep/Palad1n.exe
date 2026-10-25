'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const db = require('../src/db');
const { Engine, runSearch } = require('../src/engine');
const { buildLead } = require('../src/classify');

const rec = (id, contacts, extra = {}) => ({
  id, name: 'Бизнес ' + id, shortName: id, address: 'ул. Тестовая, ' + id, district: 'Центральный район',
  lat: 59.9, lon: 30.3, rubrics: ['Барбершопы'], rating: 4.7, reviews: 40, orgId: 'o' + id, branchCount: 1,
  updatedAt: '2026-10-01T00:00:00Z', contacts, ...extra,
});
const NONE = [{ type: 'phone', value: '+79990001122', text: '' }];
const OWN = [{ type: 'phone', value: '+79990003344', text: '' }, { type: 'website', text: 'a.ru', url: 'http://a.ru' }];

test('upsert не затирает статус и заметки пользователя', () => {
  const d = db.openDb();
  const lead = buildLead(rec('1', NONE));
  assert.equal(db.upsertLead(d, 'spb', lead), 'new');
  db.setStatus(d, '1', 'contacted');
  d.prepare("UPDATE leads SET notes = 'позвонить в пн' WHERE id = '1'").run();
  assert.equal(db.upsertLead(d, 'spb', { ...lead, reviews: 99 }), 'updated');
  const row = d.prepare('SELECT * FROM leads WHERE id = ?').get('1');
  assert.equal(row.status, 'contacted');
  assert.equal(row.notes, 'позвонить в пн');
  assert.equal(row.reviews, 99);
});

test('чёрный список скрывает по телефону, id и организации', () => {
  const d = db.openDb();
  db.upsertLead(d, 'spb', buildLead(rec('1', NONE)));
  db.upsertLead(d, 'spb', buildLead(rec('2', OWN)));
  assert.equal(db.listLeads(d, { city: 'spb' }).length, 2);
  db.addBlacklist(d, 'phone', '+79990001122');
  assert.deepEqual(db.listLeads(d, { city: 'spb' }).map((r) => r.id), ['2']);
  db.addBlacklist(d, 'org', 'o2');
  assert.equal(db.listLeads(d, { city: 'spb' }).length, 0);
});

test('фильтры: tier, сети, статус, достижимость', () => {
  const d = db.openDb();
  db.upsertLead(d, 'spb', buildLead(rec('1', NONE)));
  db.upsertLead(d, 'spb', buildLead(rec('2', OWN)));
  db.upsertLead(d, 'spb', buildLead(rec('3', NONE, { branchCount: 9 })));
  assert.deepEqual(db.listLeads(d, { tiers: ['hot'] }).map((r) => r.id).sort(), ['1', '3']);
  assert.deepEqual(db.listLeads(d, { tiers: ['hot'], excludeChains: true }).map((r) => r.id), ['1']);
  assert.throws(() => db.setStatus(d, '1', 'oops'));
});

// Подмена страницы 2ГИС: 3 страницы выдачи по 2 организации, повторный id на 2-й странице (реклама).
function fakePage(cards) {
  const pages = [['1', '2'], ['2', '3'], ['4', '5']];
  let cur = 0;
  const calls = { cards: [] };
  const evaluate = async (code) => {
    if (code.includes('window.__lc = ')) return true;
    if (code.includes('getResultsState()')) return { page: cur + 1, ids: pages[cur], count: 5, hasNext: cur < pages.length - 1 };
    if (code.includes('clickNext()')) { if (cur < pages.length - 1) { cur++; return true; } return false; }
    const m = code.match(/fetchFirm\("(\d+)"/);
    if (m) { calls.cards.push(m[1]); return cards[m[1]] || { id: m[1], error: 'http_404' }; }
    throw new Error('unexpected: ' + code.slice(0, 40));
  };
  return { evaluate, navigate: async () => {}, calls };
}

test('движок: листает страницы, убирает дубли, считает ошибки, пишет в базу', async () => {
  const d = db.openDb();
  const page = fakePage({ 1: rec('1', NONE), 2: rec('2', OWN), 3: rec('3', NONE), 4: rec('4', NONE) }); // 5 -> ошибка
  const stat = await runSearch({ engine: new Engine(page), db: d, city: 'spb', query: 'барбершоп', cardDelayMs: 1 });
  assert.deepEqual(page.calls.cards.sort(), ['1', '2', '3', '4', '5']); // id 2 запрошен один раз
  assert.equal(stat.pages, 3);
  assert.equal(stat.cards, 5);
  assert.equal(stat.errors, 1);
  assert.equal(stat.newLeads, 4);
  assert.equal(d.prepare('SELECT COUNT(*) AS n FROM runs').get().n, 1);
});

test('движок: недавно собранные карточки не запрашиваются повторно (кэш)', async () => {
  const d = db.openDb();
  const cards = { 1: rec('1', NONE), 2: rec('2', OWN), 3: rec('3', NONE), 4: rec('4', NONE), 5: rec('5', NONE) };
  await runSearch({ engine: new Engine(fakePage(cards)), db: d, city: 'spb', query: 'x', cardDelayMs: 1 });
  const page2 = fakePage(cards);
  const stat = await runSearch({ engine: new Engine(page2), db: d, city: 'spb', query: 'x', cardDelayMs: 1 });
  assert.equal(page2.calls.cards.length, 0);
  assert.equal(stat.skippedCached, 5);
  assert.equal(stat.newLeads, 0);
});

test('движок: maxCards и отмена останавливают сбор', async () => {
  const d = db.openDb();
  const cards = Object.fromEntries(['1', '2', '3', '4', '5'].map((i) => [i, rec(i, NONE)]));
  const s1 = await runSearch({ engine: new Engine(fakePage(cards)), db: d, city: 'spb', query: 'x', maxCards: 2, cardDelayMs: 1 });
  assert.equal(s1.cards, 2);
  const ac = new AbortController();
  ac.abort();
  const s2 = await runSearch({ engine: new Engine(fakePage(cards)), db: db.openDb(), city: 'spb', query: 'x', cardDelayMs: 1, signal: ac.signal });
  assert.equal(s2.cards, 0);
});

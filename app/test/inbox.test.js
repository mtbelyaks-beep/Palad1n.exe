'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { AppService } = require('../main/service');
const { buildHandlers } = require('../main/ipc');

function make(extra = {}) {
  const dir = extra.dir || fs.mkdtempSync(path.join(os.tmpdir(), 'pal-inbox-'));
  const clip = []; let t = Date.parse('2026-10-23T10:00:00Z');
  const svc = new AppService({ dataDir: dir, dbFile: ':memory:', writeClipboard: (x) => clip.push(x), now: () => new Date(t), ...extra });
  const add = (id, o = {}) => svc.db.prepare(`INSERT INTO leads (id, name, short_name, city, rubric, site_class, channel, channel_target, telegram, whatsapp, vk, status, tier, score, first_seen, last_seen)
    VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)`).run(id, 'Орг ' + id, 'Орг ' + id, 'spb', 'Барбершопы', 'none', o.channel || 'telegram', o.target || '', o.tg || null, o.wa || null, o.vk || null, o.status || 'new', 'hot', o.score || 90, '2026-10-01', '2026-10-01');
  return { svc, clip, add, dir, tick: (ms) => { t += ms; } };
}

test('по умолчанию по аккаунту на мессенджер; у первого раздел сессии прежний (вход не теряется)', () => {
  const { svc } = make();
  const a = svc.getSettings().accounts;
  assert.deepEqual(a.map((x) => x.id), ['telegram-1', 'whatsapp-1', 'vk-1']);
  assert.deepEqual(a.map((x) => x.partition), ['persist:chat-telegram', 'persist:chat-whatsapp', 'persist:chat-vk']);
});

test('старые настройки без аккаунтов получают аккаунты по умолчанию, лимиты берутся из dailyLimits', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pal-old-'));
  fs.writeFileSync(path.join(dir, 'settings.json'), JSON.stringify({ settingsVersion: 3, dailyLimits: { telegram: 7 } }));
  const { svc } = make({ dir });
  assert.equal(svc.counters().telegram.limit, 7);
  assert.equal(svc.getSettings().accounts.length, 3);
});

test('второй аккаунт: свой раздел, лимит складывается, названия и лимиты правятся', () => {
  const { svc } = make();
  svc.accountAdd('telegram');
  const acc = svc.getSettings().accounts.find((x) => x.id === 'telegram-2');
  assert.equal(acc.partition, 'persist:chat-telegram-2');
  assert.equal(svc.counters().telegram.limit, 20); // 10 + 10
  svc.accountUpdate({ id: 'telegram-2', patch: { name: 'Рабочий', limit: 5 } });
  assert.equal(svc.counters().telegram.limit, 15);
  assert.equal(svc.getSettings().accounts.find((x) => x.id === 'telegram-2').name, 'Рабочий');
  svc.accountUpdate({ id: 'telegram-2', patch: { limit: 9999 } });
  assert.equal(svc.counters().telegram.accounts[1].limit, 200);
  svc.accountRemove('telegram-2');
  assert.equal(svc.counters().telegram.accounts.length, 1);
  assert.throws(() => svc.accountRemove('nope'), /нет/);
  assert.throws(() => svc.accountAdd('icq'), /Неизвестный/);
});

test('больше шести аккаунтов одного мессенджера не добавить', () => {
  const { svc } = make();
  for (let i = 0; i < 5; i++) svc.accountAdd('vk');
  assert.throws(() => svc.accountAdd('vk'), /Достаточно/);
});

test('отправка записывается на аккаунт; счётчики и рекомендуемый аккаунт считаются по ним', () => {
  const { svc, add } = make();
  svc.accountAdd('telegram');
  svc.accountUpdate({ id: 'telegram-1', patch: { limit: 2 } });
  svc.accountUpdate({ id: 'telegram-2', patch: { limit: 3 } });
  for (let i = 0; i < 3; i++) add('L' + i, { tg: 'user' + i, target: 'https://t.me/user' + i });
  assert.equal(svc.pickAccount('telegram').id, 'telegram-2'); // свободных больше
  svc.markSent({ leadId: 'L0', text: 'x', channel: 'telegram', accountId: 'telegram-2' });
  svc.markSent({ leadId: 'L1', text: 'x', channel: 'telegram', accountId: 'telegram-2' });
  let c = svc.counters().telegram;
  assert.equal(c.used, 2);
  assert.equal(c.accounts.find((x) => x.id === 'telegram-2').left, 1);
  assert.equal(svc.pickAccount('telegram').id, 'telegram-1'); // 2 свободных против 1
  assert.equal(svc.markSent({ leadId: 'L2', text: 'x', channel: 'telegram', accountId: 'telegram-1' }).telegram.accounts[0].used, 1);
});

test('старые записи журнала без аккаунта относятся к первому аккаунту', () => {
  const { svc, add } = make();
  add('L0', { tg: 'user0', target: 'https://t.me/user0' });
  svc.db.prepare("INSERT INTO message_log (lead_id, channel, template_id, text, sent_at) VALUES ('L0','telegram','','x',?)").run(new Date(Date.parse('2026-10-23T09:00:00Z')).toISOString());
  assert.equal(svc.counters().telegram.accounts[0].used, 1);
});

test('лучший канал выбирается по порядку пользователя; если лимит канала кончился, предлагается следующий', () => {
  const { svc, add } = make();
  add('A', { channel: 'telegram', tg: 'orgA', wa: '+79990001122', target: 'https://t.me/orgA' });
  svc.setSettings({ dailyLimits: { telegram: 1, whatsapp: 5, vk: 5 } });
  let q = svc.queueNext();
  assert.equal(q.lead.channel, 'telegram');
  assert.deepEqual(q.channels.map((x) => x.id), ['telegram', 'whatsapp']);
  // порядок: сначала WhatsApp
  svc.setSettings({ channelOrder: ['whatsapp', 'telegram', 'vk'] });
  q = svc.queueNext();
  assert.equal(q.lead.channel, 'whatsapp');
  assert.equal(q.lead.channel_target, 'https://wa.me/79990001122');
  // WhatsApp исчерпан: берётся Telegram
  svc.setSettings({ dailyLimits: { telegram: 1, whatsapp: 0, vk: 5 } });
  q = svc.queueNext();
  assert.equal(q.lead.channel, 'telegram');
  // всё исчерпано
  svc.setSettings({ dailyLimits: { telegram: 0, whatsapp: 0, vk: 0 } });
  q = svc.queueNext();
  assert.equal(q.lead, null);
  assert.equal(q.reason, 'limit');
});

test('порядок каналов: лишнее отбрасывается, недостающее добавляется', () => {
  const { svc } = make();
  svc.setSettings({ channelOrder: ['vk', 'мусор', 'vk'] });
  assert.deepEqual(svc.getSettings().channelOrder, ['vk', 'telegram', 'whatsapp', 'telegramPhone', 'phone']);
});

test('chatTarget: аккаунт, раздел сессии, привязка к лиду; без текста буфер не трогается', () => {
  const { svc, add, clip } = make();
  svc.accountAdd('whatsapp');
  add('W', { channel: 'whatsapp', wa: '+79991112233', target: 'https://wa.me/79991112233' });
  const t = svc.chatTarget('W', 'Привет', { accountId: 'whatsapp-2' });
  assert.equal(t.service, 'whatsapp');
  assert.equal(t.accountId, 'whatsapp-2');
  assert.equal(t.partition, 'persist:chat-whatsapp-2');
  assert.match(t.url, /text=/);
  assert.equal(clip.length, 1);
  const bare = svc.chatTarget('W', '', {});
  assert.ok(!bare.url.includes('text='));
  assert.equal(clip.length, 1, 'пустой текст не затирает буфер');
  assert.equal(svc.db.prepare("SELECT account_id FROM chat_bind WHERE lead_id='W'").get().account_id, bare.accountId);
  // чужой или несуществующий аккаунт не принимается: берётся подходящий
  assert.match(svc.chatTarget('W', '', { accountId: 'telegram-1' }).accountId, /^whatsapp-/);
});

test('chatTarget по выбранному каналу, а не только по основному', () => {
  const { svc, add } = make();
  add('M', { channel: 'telegram', tg: 'orgM', wa: '+79990000011', target: 'https://t.me/orgM' });
  assert.equal(svc.chatTarget('M', 'x', { channel: 'whatsapp' }).service, 'whatsapp');
  assert.equal(svc.chatTarget('M', 'x', {}).service, 'telegram');
  assert.equal(svc.chatTarget('M', 'x', { channel: 'vk' }).service, '', 'нет ВК у организации — нет чата');
});

test('«Входящие»: диалоги с последним каналом и аккаунтом, у ответивших статус виден', () => {
  const { svc, add, tick } = make();
  add('A', { tg: 'a1', target: 'https://t.me/a1' });
  add('B', { channel: 'whatsapp', wa: '+79990000022', target: 'https://wa.me/79990000022' });
  add('C', { tg: 'c1', target: 'https://t.me/c1' });
  svc.markSent({ leadId: 'A', text: 'x', channel: 'telegram', accountId: 'telegram-1' });
  tick(60e3);
  svc.markSent({ leadId: 'B', text: 'x', channel: 'whatsapp', accountId: 'whatsapp-1' });
  svc.setStatus('A', 'replied');
  const list = svc.inboxList();
  assert.deepEqual(list.map((x) => x.id), ['B', 'A']); // свежие сверху, C ещё не писали
  assert.equal(list[1].status, 'replied');
  assert.equal(list[0].accountId, 'whatsapp-1');
  assert.equal(list[0].channel, 'whatsapp');
});

test('каналы IPC для аккаунтов и входящих подключены', () => {
  const { svc } = make();
  const h = buildHandlers(svc);
  for (const k of ['accounts:add', 'accounts:update', 'accounts:remove', 'inbox:list', 'chat:target', 'queue:open']) assert.equal(typeof h[k], 'function', k);
});

test('настройки аккаунтов переживают перезапуск', () => {
  const { svc, dir } = make();
  svc.accountAdd('vk');
  svc.accountUpdate({ id: 'vk-2', patch: { name: 'Запасной' } });
  const again = new AppService({ dataDir: dir, dbFile: ':memory:' });
  assert.equal(again.getSettings().accounts.find((x) => x.id === 'vk-2').name, 'Запасной');
});

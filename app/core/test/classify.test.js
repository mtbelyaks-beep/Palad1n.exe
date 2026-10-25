'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { classifyContacts, buildLead, pickChannel, hostOf, normPhone } = require('../src/classify');

// Формы контактов взяты из реальных карточек 2ГИС (Санкт-Петербург, барбершопы, октябрь 2026).
// Пометка (synthetic): форма воспроизведена по виду других карточек, адрес вымышленный.

const NERO = [ // реальная: свой сайт + WhatsApp + два Telegram
  { type: 'phone', text: '+7‒921‒637‒63‒77', value: '+79216376377' },
  { type: 'website', text: 'ne-ro.ru', url: 'http://ne-ro.ru' },
  { type: 'whatsapp', text: 'https://wa.me/79216376377?text=%D0%97', url: 'https://wa.me/79216376377?text=%D0%97' },
  { type: 'telegram', text: 'https://t.me/+79216376377', url: 'https://t.me/+79216376377' },
  { type: 'telegram', text: 'https://t.me/NEROBARBERSHOP', url: 'https://t.me/NEROBARBERSHOP' },
];
const KVARTAL = [ // реальная: только два телефона и почта
  { type: 'phone', text: '+7‒950‒030‒51‒29', value: '+79500305129' },
  { type: 'phone', text: '+7 (812) 855‒55‒13', value: '+78128555513' },
  { type: 'email', text: 'kvartal13barbershop@yandex.ru' },
];
const DIKIDI_ONLY = [ // реальная: только виджет записи dikidi + соцсети
  { type: 'phone', text: '+7‒921‒900‒94‒62', value: '+79219009462' },
  { type: 'website', text: 'Онлайн-запись', url: 'http://dikidi.ru/1377778?utm_source=2gis' },
  { type: 'vkontakte', text: 'https://vk.com/x', url: 'https://vk.com/x' },
];
const WRAPPED = [ // реальная форма: ссылка 2ГИС-обёртка, внутри реальный адрес
  { type: 'website', text: 'Онлайн-запись', url: 'http://link.2gis.ru/1.2/AAA/online/2026/x/70000/null/fyz?http://dikidi.ru/1377778?utm_source=2gis' },
];
const SOCIAL_ONLY = [ // (synthetic)
  { type: 'phone', text: '+7 911 111-22-33', value: '+79111112233' },
  { type: 'vkontakte', text: 'https://vk.com/club1', url: 'https://vk.com/club1' },
  { type: 'telegram', text: 'https://t.me/rector_bs', url: 'https://t.me/rector_bs' },
];
const TAPLINK = [{ type: 'website', text: 'taplink.cc/etika', url: 'https://taplink.cc/etika' }, { type: 'phone', value: '+79990001122', text: '' }]; // (synthetic)
const TG_CHANNEL_AS_SITE = [{ type: 'website', text: 'Перейти в Telegram-канал', url: 'https://t.me/trud_barber' }]; // (synthetic)
const TILDA = [{ type: 'website', text: 'x.tilda.ws', url: 'http://x.tilda.ws' }]; // (synthetic)
const IDN = [{ type: 'website', text: 'головнойофис.рф', url: 'http://головнойофис.рф' }]; // реальная форма

test('собственный сайт -> cold, домен сохраняется', () => {
  const c = classifyContacts(NERO);
  assert.equal(c.siteClass, 'own');
  assert.equal(c.tier, 'cold');
  assert.equal(c.ownDomain, 'ne-ro.ru');
  assert.equal(c.whatsapp, '+79216376377');
  assert.equal(c.telegram, 'NEROBARBERSHOP');
  assert.equal(c.telegramPhone, '+79216376377');
});

test('нет сайта вообще -> none/hot', () => {
  const c = classifyContacts(KVARTAL);
  assert.equal(c.siteClass, 'none');
  assert.equal(c.tier, 'hot');
  assert.deepEqual(c.phones, ['+79500305129', '+78128555513']);
  assert.deepEqual(c.mobilePhones, ['+79500305129']);
  assert.equal(c.hasMessenger, false);
});

test('только виджет записи (dikidi) -> booking/warm, а не «есть сайт»', () => {
  const c = classifyContacts(DIKIDI_ONLY);
  assert.equal(c.siteClass, 'booking');
  assert.equal(c.tier, 'warm');
});

test('обёртка link.2gis.ru разворачивается в реальный адрес', () => {
  assert.equal(hostOf(WRAPPED[0].url), 'dikidi.ru');
  assert.equal(classifyContacts(WRAPPED).siteClass, 'booking');
});

test('только соцсети -> social/hot', () => {
  const c = classifyContacts(SOCIAL_ONLY);
  assert.equal(c.siteClass, 'social');
  assert.equal(c.tier, 'hot');
  assert.equal(c.telegram, 'rector_bs');
});

test('Taplink -> multilink/warm', () => {
  const c = classifyContacts(TAPLINK);
  assert.equal(c.siteClass, 'multilink');
  assert.equal(c.tier, 'warm');
});

test('ссылка на Telegram-канал в поле «сайт» не считается сайтом', () => {
  const c = classifyContacts(TG_CHANNEL_AS_SITE);
  assert.equal(c.siteClass, 'social');
  assert.equal(c.ownDomain, '');
});

test('конструктор (tilda.ws) -> builder/warm', () => {
  const c = classifyContacts(TILDA);
  assert.equal(c.siteClass, 'builder');
  assert.equal(c.tier, 'warm');
});

test('кириллический домен считается своим сайтом', () => {
  assert.equal(classifyContacts(IDN).siteClass, 'own');
});

test('если есть и виджет записи, и свой сайт -> own', () => {
  const c = classifyContacts([...DIKIDI_ONLY, { type: 'website', text: 'a.ru', url: 'https://www.a.ru/x' }]);
  assert.equal(c.siteClass, 'own');
  assert.equal(c.ownDomain, 'a.ru');
});

test('пустые и странные данные не роняют разбор', () => {
  assert.equal(classifyContacts([]).siteClass, 'none');
  assert.equal(classifyContacts(undefined).siteClass, 'none');
  assert.equal(classifyContacts([{ type: 'website', url: '' }, { type: 'phone', value: 'abc' }]).siteClass, 'none');
});

test('нормализация телефонов', () => {
  assert.equal(normPhone('8 (921) 637-63-77'), '+79216376377');
  assert.equal(normPhone('+7‒812‒855‒55‒13'), '+78128555513');
  assert.equal(normPhone(''), '');
});

test('канал связи выбирается по порядку предпочтений', () => {
  const c = classifyContacts(NERO);
  assert.deepEqual(pickChannel(c), { channel: 'telegram', target: 'https://t.me/NEROBARBERSHOP' });
  assert.equal(pickChannel(c, ['whatsapp']).target, 'https://wa.me/79216376377');
  assert.equal(pickChannel(classifyContacts(KVARTAL)).channel, 'phone');
  assert.equal(pickChannel(classifyContacts([])).channel, '');
});

test('оценка: сеть при прочих равных получает штраф, порог сети настраивается', () => {
  const base = { id: '1', name: 'A', rating: 4.8, reviews: 80, contacts: SOCIAL_ONLY };
  const single = buildLead({ ...base, branchCount: 1 });
  const chain = buildLead({ ...base, id: '2', branchCount: 6 });
  assert.equal(single.score - chain.score, 30); // +5 против -25
  assert.equal(chain.isChain, true);
  const relaxed = buildLead({ ...base, id: '3', branchCount: 6 }, { chainThreshold: 10 });
  assert.equal(relaxed.isChain, false);
  assert.equal(relaxed.score, single.score);
});

test('оценка: живой бизнес без сайта выше, чем сеть с сайтом', () => {
  const base = { id: '1', name: 'A', rating: 4.8, reviews: 80, branchCount: 1 };
  const hot = buildLead({ ...base, contacts: SOCIAL_ONLY });
  const chain = buildLead({ ...base, id: '2', branchCount: 12, contacts: NERO });
  assert.ok(hot.score > chain.score + 30, `${hot.score} vs ${chain.score}`);
  assert.equal(chain.isChain, true);
  assert.equal(hot.isChain, false);
  assert.ok(hot.score >= 0 && hot.score <= 100);
});

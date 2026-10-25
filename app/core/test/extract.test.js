'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { extractFirm } = require('../src/page-scripts');

/** Собирает похожий на настоящий HTML: чужие JSON-куски со скобками, затем объект организации. */
function pageWith(firm, { rawReplace } = {}) {
  let obj = JSON.stringify(firm);
  if (rawReplace) obj = obj.split(rawReplace[0]).join(rawReplace[1]);
  const noise = JSON.stringify({ menu: { items: [{ t: 'a {b} c', id: '1' }] }, other: { id: '999', contact_groups: [] } });
  return `<html><head><title>x</title></head><body><script>var s=${noise};var firm=${obj};</script></body></html>`;
}

const FIRM = {
  id: '70000001033905353',
  name: "Hardy's Fight",
  name_ex: { primary: "Hardy's Fight", extension: 'барбершоп' },
  address_name: 'Улица Тестовая, 4',
  adm_div: [{ name: 'Центральный район', type: 'district' }],
  point: { lat: 59.94, lon: 30.36 },
  rubrics: [{ name: 'Барбершопы' }],
  reviews: { general_rating: 4.9, general_review_count: 49 },
  org: { id: '70000001033905352', branch_count: 3 },
  dates: { updated_at: '2026-10-15T13:32:10Z' },
  contact_groups: [
    { contacts: [{ type: 'phone', text: '+7‒921‒637‒63‒77', value: '+79216376377' }] },
    { contacts: [{ type: 'website', text: 'hardys.one', url: 'http://hardys.one' }, { type: 'vkontakte', text: 'https://vk.com/h' }] },
  ],
};

test('обычная карточка разбирается в компактную запись', () => {
  const r = extractFirm(pageWith(FIRM), FIRM.id);
  assert.equal(r.id, FIRM.id);
  assert.equal(r.district, 'Центральный район');
  assert.equal(r.branchCount, 3);
  assert.equal(r.reviews, 49);
  assert.equal(r.contacts.length, 3);
  assert.equal(r.contacts[0].value, '+79216376377');
});

test('РЕГРЕССИЯ: апостроф в названии приходит как \\\' (не JSON) и не должен терять организацию', () => {
  const html = pageWith(FIRM, { rawReplace: ["Hardy's", "Hardy\\'s"] });
  assert.ok(html.includes("Hardy\\'s Fight"), 'в тестовой странице должен быть \\\'');
  assert.throws(() => JSON.parse(`{"n":"Hardy\\'s"}`)); // убеждаемся, что строгий JSON это не принимает
  const r = extractFirm(html, FIRM.id);
  assert.equal(r.error, undefined);
  assert.equal(r.name, "Hardy's Fight");
  assert.equal(r.contacts.length, 3);
});

test('чётное число слэшей перед апострофом не портится', () => {
  const firm = { ...FIRM, name: "a\\'b" }; // в значении: a, обратная косая, апостроф, b
  const r = extractFirm(pageWith(firm), FIRM.id);
  assert.equal(r.name, "a\\'b");
});

test('скобки и кавычки внутри строк не ломают поиск границ объекта', () => {
  const firm = { ...FIRM, name: 'Кафе {Центр} "Люкс" }{' };
  const r = extractFirm(pageWith(firm), FIRM.id);
  assert.equal(r.name, 'Кафе {Центр} "Люкс" }{');
  assert.equal(r.contacts.length, 3);
});

test('чужой объект с contact_groups не подходит: id должен совпасть', () => {
  const r = extractFirm(pageWith(FIRM), '70000001000000000');
  assert.deepEqual(r, { id: '70000001000000000', error: 'no_object' });
});

test('организация без блока контактов находится по адресу, контакты пустые', () => {
  const { contact_groups, ...noContacts } = FIRM;
  const r = extractFirm(pageWith(noContacts), FIRM.id);
  assert.equal(r.error, undefined);
  assert.deepEqual(r.contacts, []);
});

test('мусор вместо страницы даёт no_object, а не исключение', () => {
  assert.equal(extractFirm('', '1').error, 'no_object');
  assert.equal(extractFirm('<html>captcha</html>', '1').error, 'no_object');
  assert.equal(extractFirm('"contact_groups": {{{{', '1').error, 'no_object');
});

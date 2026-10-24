'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { getResultsState, clickNext } = require('../src/page-scripts');

/** Минимальная подмена DOM: переключатель страниц и ссылки на организации. */
function fakeDom({ path, pager, ids = ['111', '222'], count = 1075 }) {
  const mk = (tag, text, href, parent) => ({
    tagName: tag, textContent: text, parentElement: parent || null, clicked: false,
    getAttribute: (n) => (n === 'href' ? href : null),
    scrollIntoView() {}, click() { this.clicked = true; },
  });
  const box = { children: [] };
  const els = pager.map(([tag, text, href]) => { const e = mk(tag, text, href, box); box.children.push(e); return e; });
  const firms = ids.map((id) => mk('A', id, `/spb/firm/${id}`));
  global.location = { pathname: path };
  global.document = {
    body: { innerText: `Места${count}\n...` },
    querySelectorAll: (sel) => (sel.includes('/firm/') ? firms : els.filter((e) => e.tagName === 'A' && e.getAttribute('href') && e.getAttribute('href').includes('/page/'))),
  };
  return { els, firms };
}

test('страница 1: номер из переключателя, следующая ссылка найдена', () => {
  fakeDom({ path: '/spb/search/x', pager: [['DIV', '1'], ['A', '2', '/spb/search/x/page/2'], ['A', '3', '/spb/search/x/page/3']] });
  const st = getResultsState();
  assert.equal(st.page, 1);
  assert.equal(st.hasNext, true);
  assert.deepEqual(st.ids, ['111', '222']);
  assert.equal(st.count, 1075);
});

test('РЕГРЕССИЯ: с 7-й страницы в переключателе есть «…», страница определяется по адресу', () => {
  // Структура снята с живого 2ГИС: A:1, DIV:…, A:6, DIV:7, A:8, A:9, A:10
  const d = fakeDom({
    path: '/spb/search/x/page/7',
    pager: [['A', '1', '/spb/search/x'], ['DIV', '…'], ['A', '6', '/spb/search/x/page/6'], ['DIV', '7'],
      ['A', '8', '/spb/search/x/page/8'], ['A', '9', '/spb/search/x/page/9'], ['A', '10', '/spb/search/x/page/10']],
  });
  const st = getResultsState();
  assert.equal(st.page, 7);
  assert.equal(st.hasNext, true);
  assert.equal(clickNext(), true);
  assert.equal(d.els.find((e) => e.textContent === '8').clicked, true);
  assert.equal(d.els.find((e) => e.textContent === '6').clicked, false);
});

test('если адрес без номера, а в переключателе «…» первой, берётся числовой элемент', () => {
  fakeDom({ path: '/spb/search/x', pager: [['DIV', '…'], ['DIV', '3'], ['A', '4', '/spb/search/x/page/4']] });
  assert.equal(getResultsState().page, 3);
});

test('последняя страница: следующей нет, нажимать нечего', () => {
  fakeDom({ path: '/spb/search/x/page/9', pager: [['A', '8', '/spb/search/x/page/8'], ['DIV', '9']] });
  assert.equal(getResultsState().hasNext, false);
  assert.equal(clickNext(), false);
});

test('выдача без переключателя (одна страница)', () => {
  fakeDom({ path: '/spb/search/x', pager: [] });
  const st = getResultsState();
  assert.equal(st.page, 1);
  assert.equal(st.hasNext, false);
});

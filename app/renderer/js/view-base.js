'use strict';
// Вкладка «База»: воронка (канбан), таблица и чёрный список.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const S = LF.baseState = { mode: 'board', city: '', q: '' };
  const KANBAN_CAP = 60;
  const TABLE_CAP = 300;
  let host = null;

  function seg(items, current, onPick) {
    return h('div', { class: 'seg', role: 'group' }, items.map(([k, label, ic]) =>
      h('button', { 'aria-pressed': String(current === k), onclick: () => onPick(k) }, ic ? icon(ic, 'sm') : null, label)));
  }

  async function draw() {
    if (!host) return;
    clear(host);
    const st = await LF.call('stats:get').catch(() => ({ cities: [] }));
    const bar = h('div', { class: 'subtabs' },
      seg([['board', ' Этапы', 'board'], ['table', ' Список', 'table'], ['blacklist', ' Не писать', 'ban']], S.mode, (k) => { S.mode = k; draw(); }),
      S.mode !== 'blacklist' ? h('input', { type: 'search', style: { width: '290px' }, placeholder: 'Поиск по названию или адресу', value: S.q, oninput: LF.debounce((e) => { S.q = e.target.value; drawBody(); }, 250) }) : null,
      S.mode !== 'blacklist' && st.cities.length > 1 ? h('select', { style: { width: 'auto' }, onchange: (e) => { S.city = e.target.value; drawBody(); } },
        h('option', { value: '' }, 'Все города'), st.cities.map((c) => h('option', { value: c, selected: S.city === c }, c))) : null,
      S.mode !== 'blacklist' ? h('label', { class: 'switch muted' }, h('input', { type: 'checkbox', checked: LF.settings.excludeChains,
        onchange: async (e) => { await LF.saveSettings({ excludeChains: e.target.checked }); drawBody(); LF.changed(); } }), 'Скрыть сети') : null);
    host.append(bar, h('div', { id: 'basebody' }));
    drawBody();
  }

  async function drawBody() {
    const body = document.getElementById('basebody');
    if (!body) return;
    clear(body);
    if (S.mode === 'blacklist') return drawBlacklist(body);
    let data;
    try { data = await LF.call('leads:list', { city: S.city || undefined, q: S.q, limit: 5000 }); } catch (e) { return LF.toast(e.message, 'err'); }
    if (!data.total) {
      body.append(h('div', { class: 'empty glass' }, h('h3', {}, 'База пока пуста'), 'Запусти поиск на вкладке «Парсер»: найденные организации появятся здесь.'));
      return;
    }
    if (S.mode === 'board') drawBoard(body, data.rows); else drawTable(body, data.rows);
  }

  /* ---------- воронка ---------- */
  function drawBoard(body, rows) {
    const cols = LF.STATUSES.map(([k, name]) => ({ k, name, rows: rows.filter((r) => r.status === k) }));
    const board = h('div', { class: 'kanban' });
    for (const c of cols) {
      const list = h('div', { class: 'list' });
      c.rows.slice(0, KANBAN_CAP).forEach((r) => list.append(kcard(r)));
      if (c.rows.length > KANBAN_CAP) list.append(h('div', { class: 'moremark' }, `ещё ${c.rows.length - KANBAN_CAP}: открой «Список»`));
      if (!c.rows.length) list.append(h('div', { class: 'muted', style: { textAlign: 'center', padding: '14px 4px', fontSize: '12.5px' } }, c.k === 'new' ? 'Пусто' : 'Перетащи карточку сюда'));
      const col = h('section', { class: 'col glass', 'data-status': c.k },
        h('header', {}, c.name, h('span', { class: 'n' }, c.rows.length)), list);
      col.addEventListener('dragover', (e) => { e.preventDefault(); col.classList.add('over'); });
      col.addEventListener('dragleave', (e) => { if (!col.contains(e.relatedTarget)) col.classList.remove('over'); });
      col.addEventListener('drop', async (e) => {
        e.preventDefault(); col.classList.remove('over');
        const id = e.dataTransfer.getData('text/plain');
        if (!id) return;
        try { LF.lastMoved = id; await LF.call('leads:setStatus', { id, status: c.k }); LF.changed(); } catch (err) { LF.toast(err.message, 'err'); }
      });
      board.append(col);
    }
    body.append(board);
  }

  function kcard(r) {
    const el = h('article', { class: 'kc ' + r.tier, draggable: 'true', tabindex: 0, onclick: () => LF.openLead(r.id),
      onkeydown: (e) => { if (e.key === 'Enter') LF.openLead(r.id); } },
    h('b', {}, r.short_name || r.name),
    h('div', { class: 'meta' }, LF.plate(r), h('span', { class: 'muted rate' }, r.score), LF.channels(r)));
    if (LF.lastMoved === r.id) { el.classList.add('pop'); LF.lastMoved = null; }
    el.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', r.id); e.dataTransfer.effectAllowed = 'move'; el.classList.add('dragging'); });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
    return el;
  }

  /* ---------- таблица ---------- */
  function drawTable(body, rows) {
    const shown = rows.slice(0, TABLE_CAP);
    const head = ['Оценка', 'Организация', 'Рубрика', 'Район', 'Рейтинг', 'Сайт', 'Каналы', 'Статус'];
    const table = h('table', { class: 'table' },
      h('thead', {}, h('tr', {}, head.map((t) => h('th', {}, t)))),
      h('tbody', {}, shown.map((r) => h('tr', { class: 'r', onclick: () => LF.openLead(r.id) },
        h('td', {}, LF.scoreRing(r)),
        h('td', { class: 'name' }, r.short_name || r.name),
        h('td', {}, r.rubric), h('td', {}, (r.district || '').replace(/\s*район$/i, '')),
        h('td', {}, LF.rating(r)), h('td', {}, LF.plate(r)), h('td', {}, LF.channels(r)),
        h('td', { onclick: (e) => e.stopPropagation() }, h('select', {
          onchange: async (e) => { try { await LF.call('leads:setStatus', { id: r.id, status: e.target.value }); LF.changed(); } catch (err) { LF.toast(err.message, 'err'); } },
        }, LF.STATUSES.map(([k, n]) => h('option', { value: k, selected: k === r.status }, n))))))));
    body.append(h('div', { class: 'tablewrap glass' }, table));
    if (rows.length > TABLE_CAP) body.append(h('div', { class: 'moremark' }, `Показаны первые ${TABLE_CAP} из ${rows.length}. Сузь поиск или город.`));
  }

  /* ---------- чёрный список ---------- */
  const KIND = { id: 'Организация', org: 'Сеть', phone: 'Номер' };
  async function drawBlacklist(body) {
    const list = await LF.call('blacklist:list').catch(() => []);
    body.append(
      h('div', { class: 'glass' }, list.length ? list.map((b) => h('div', { class: 'bl-row' },
        h('span', { class: 'kind' }, KIND[b.kind]), h('div', { class: 'grow' }, h('b', {}, b.label || b.value), b.label ? h('div', { class: 'muted' }, b.value) : null),
        h('button', { class: 'btn sm ghost', title: 'Вернуть в базу', onclick: async () => { await LF.call('blacklist:remove', { kind: b.kind, value: b.value }); LF.changed(); drawBody(); } }, icon('undo', 'sm'), 'Вернуть')))
        : h('div', { class: 'empty' }, h('h3', {}, 'Пока никого'), 'Сюда попадают те, кому ты решил не писать. Они не показываются нигде и не попадают в очередь.')));
  }

  LF.views = LF.views || {};
  LF.views.base = (root) => { host = root; draw(); };
  LF.views.base.unmount = () => { host = null; };
  LF.views.base.refresh = () => { if (host) drawBody(); };
})();

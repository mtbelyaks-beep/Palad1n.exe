'use strict';
// Вкладка «Парсер»: форма поиска, ход сбора, фильтры и карточки найденных организаций.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const CITIES = [['spb', 'Санкт-Петербург'], ['moscow', 'Москва'], ['novosibirsk', 'Новосибирск'], ['ekaterinburg', 'Екатеринбург'], ['kazan', 'Казань']];
  const NICHES = ['барбершоп', 'автосервис', 'шиномонтаж', 'салон красоты', 'ногти маникюр', 'стоматология'];
  const AMOUNTS = [[50, 'Немного'], [150, 'Средне'], [500, 'Много']];
  const PLATES = [['none', 'Нет сайта', ['none']], ['social', 'Только соцсети', ['social']], ['weak', 'Слабый сайт', ['booking', 'multilink', 'builder']], ['own', 'Есть сайт', ['own']]];
  const PAGE = 60;

  // состояние переживает переключение вкладок
  const S = LF.parserState = {
    form: { city: null, custom: false, query: '', maxCards: 150 },
    filt: { plates: ['none', 'social', 'weak'], q: '', rating4: false },
    run: { running: false, stat: null, message: '', kind: '' },
    cap: PAGE, seen: new Set(),
  };
  let mounted = false;

  /* ---------- события сбора ---------- */
  let lastRefresh = 0;
  LF.on('search:progress', (p) => {
    S.run.running = true; S.run.stat = p; S.run.message = ''; S.run.kind = '';
    paintProgress();
    if (Date.now() - lastRefresh > 5000) { lastRefresh = Date.now(); refresh(); }
  });
  LF.on('search:done', ({ stat, stopped, message }) => {
    S.run.running = false; S.run.stat = stat;
    S.run.message = message || (stopped ? 'Сбор остановлен. Всё найденное сохранено.' : `Готово: новых организаций ${stat.newLeads}.` + (stat.skippedCached ? ` Ещё ${stat.skippedCached} уже были в базе.` : ''));
    S.run.kind = message ? '' : 'ok';
    paintProgress(); refresh(); LF.changed();
  });
  LF.on('search:error', ({ message }) => {
    S.run.running = false; S.run.message = message; S.run.kind = 'err';
    paintProgress();
  });

  function paintProgress() {
    const box = document.getElementById('progress');
    const btn = document.getElementById('runbtn');
    if (!box || !btn) return;
    const { running, stat, message, kind } = S.run;
    clear(box);
    if (stat && (running || message)) {
      const done = stat.cards + stat.skippedCached;
      const target = Math.min(S.form.maxCards, stat.total || S.form.maxCards);
      const indet = running && !done;
      box.append(
        h('div', { class: 'bar' + (indet ? ' indet' : '') }, h('i', { style: { width: indet ? '' : Math.min(100, Math.round(done / Math.max(1, target) * 100)) + '%' } })),
        h('div', { class: 'stats' }, [['Просмотрено', stat.cards], ['Новых', stat.newLeads], ['Не открылось', stat.errors]].map(([n, v]) => h('div', {}, h('b', {}, v), h('span', {}, n)))));
    }
    if (message) box.append(h('div', { class: 'notice ' + kind }, message));
    if (running) box.append(h('button', { class: 'btn sm ghost', title: 'Если поиск завис, возможно, 2ГИС просит пройти проверку «я не робот». Окно покажется, и ты сможешь её пройти.',
      onclick: async () => { await LF.call('search:reveal').catch(() => {}); } }, icon('eye', 'sm'), 'Проверить окно 2ГИС'));
    clear(btn).append(...(running ? [icon('stop', 'sm'), 'Остановить'] : [icon('play', 'sm'), 'Начать поиск']));
    btn.classList.toggle('primary', !running);
  }

  async function startOrStop() {
    if (S.run.running) { await LF.call('search:stop'); return; }
    try {
      S.run = { running: true, stat: { pages: 0, cards: 0, newLeads: 0, errors: 0, skippedCached: 0, total: null }, message: '', kind: '' };
      paintProgress();
      await LF.call('search:start', { city: S.form.city, query: S.form.query, maxCards: S.form.maxCards, maxPages: 100 });
      await LF.saveSettings({ city: S.form.city });
    } catch (e) {
      S.run = { running: false, stat: null, message: e.message, kind: 'err' };
      paintProgress();
    }
  }

  /* ---------- результаты ---------- */
  async function refresh() {
    const box = document.getElementById('results');
    if (!box) return;
    const f = S.filt;
    const classes = PLATES.filter((p) => f.plates.includes(p[0])).flatMap((p) => p[2]);
    let data;
    try {
      data = await LF.call('leads:list', { city: S.form.city, siteClasses: classes, q: f.q, minRating: f.rating4 ? 4 : 0, limit: S.cap });
    } catch (e) { return LF.toast(e.message, 'err'); }
    if (!document.getElementById('results')) return;
    clear(box);
    box.classList.toggle('rows', LF.settings.leadView === 'rows');
    if (!data.rows.length) {
      const any = (await LF.call('stats:get', S.form.city).catch(() => ({ total: 0 }))).total;
      box.append(h('div', { class: 'empty glass', style: { gridColumn: '1 / -1' } },
        h('h3', {}, any ? 'Под такие настройки никого нет' : 'Здесь появятся найденные организации'),
        any ? 'Включи фильтр «Есть сайт» или убери «Рейтинг 4+».' : 'Выбери город, напиши, кого ищешь, и нажми «Начать поиск». Первые результаты появятся через минуту.'));
      return;
    }
    let i = 0;
    data.rows.forEach((r) => {
      const fresh = !S.seen.has(r.id);
      box.append(LF.leadCard(r, { enter: fresh, i: fresh ? i++ : 0 }));
      S.seen.add(r.id);
    });
    if (data.total > data.rows.length) {
      box.append(h('div', { class: 'moremark' }, `Показано ${data.rows.length} из ${data.total}. `,
        h('button', { class: 'btn sm', onclick: () => { S.cap += PAGE; refresh(); } }, 'Показать ещё')));
    }
  }

  /* ---------- сборка вида ---------- */
  LF.views = LF.views || {};
  LF.views.parser = function mountParser(root) {
    mounted = true;
    if (!S.form.city) { S.form.city = LF.settings.city || 'spb'; S.form.custom = !CITIES.some((c) => c[0] === S.form.city); }
    const f = S.filt;

    const customIn = h('input', { type: 'text', placeholder: 'Код города, например kazan', value: S.form.custom ? S.form.city : '', spellcheck: 'false',
      style: { display: S.form.custom ? '' : 'none' }, oninput: (e) => { S.form.city = e.target.value.trim().toLowerCase(); S.cap = PAGE; refresh(); } });
    const cityHelp = h('div', { class: 'help', style: { display: S.form.custom ? '' : 'none' } }, 'Открой 2gis.ru, выбери город и скопируй слово из адреса: 2gis.ru/это-слово');
    const citySel = h('select', { onchange: (e) => {
      const custom = e.target.value === '__custom';
      S.form.custom = custom;
      customIn.style.display = custom ? '' : 'none'; cityHelp.style.display = custom ? '' : 'none';
      S.form.city = custom ? customIn.value.trim().toLowerCase() : e.target.value;
      S.cap = PAGE; refresh();
    } }, CITIES.map(([k, n]) => h('option', { value: k, selected: !S.form.custom && S.form.city === k }, n)), h('option', { value: '__custom', selected: S.form.custom }, 'Другой город…'));

    const queryIn = h('input', { type: 'text', placeholder: 'Например: барбершоп', value: S.form.query, oninput: (e) => { S.form.query = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') startOrStop(); } });
    const amountSeg = h('div', { class: 'seg' }, AMOUNTS.map(([n, label]) => h('button', { 'aria-pressed': String(S.form.maxCards === n), title: 'Примерно ' + n + ' организаций',
      onclick: (e) => { S.form.maxCards = n; amountSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, label)));

    const form = h('div', { class: 'panel glass' },
      h('h2', {}, 'Найти организации в 2ГИС'),
      h('label', { class: 'field' }, h('span', {}, 'Город'), citySel, customIn, cityHelp),
      h('label', { class: 'field' }, h('span', {}, 'Кого ищем'), queryIn),
      h('div', { class: 'chips' }, NICHES.map((n) => h('button', { class: 'chip', onclick: () => { queryIn.value = n; S.form.query = n; queryIn.focus(); } }, n))),
      h('div', { class: 'field' }, h('span', {}, 'Сколько собрать'), amountSeg),
      h('button', { id: 'runbtn', class: 'btn primary', style: { justifyContent: 'center' }, onclick: startOrStop }),
      h('div', { id: 'progress', class: 'progress', 'aria-live': 'polite' }),
      h('div', { class: 'help' }, 'Организации, собранные за последние 7 дней, второй раз не запрашиваются.'));

    const toggle = (label, get, set, title) => h('button', { class: 'chip', title, 'aria-pressed': String(get()),
      onclick: async (e) => { const btn = e.currentTarget; await set(!get()); btn.setAttribute('aria-pressed', String(get())); S.cap = PAGE; refresh(); } }, label);

    const plateChips = PLATES.map(([k, label]) => toggle(label, () => f.plates.includes(k),
      (on) => { f.plates = on ? [...f.plates, k] : f.plates.filter((x) => x !== k); }, (LF.SITE_CLASSES[k === 'weak' ? 'builder' : k] || {}).hint));

    const filters = h('div', { class: 'filters glass' },
      ...plateChips,
      toggle('Рейтинг 4+', () => f.rating4, (v) => { f.rating4 = v; }, 'Только организации с рейтингом от 4'),
      toggle('Скрыть сети', () => LF.settings.excludeChains, async (v) => { await LF.saveSettings({ excludeChains: v }); LF.changed(); }, 'Сети и франшизы редко покупают сайты'),
      h('input', { class: 'search', type: 'search', placeholder: 'Поиск по названию или адресу', value: f.q, oninput: LF.debounce((e) => { f.q = e.target.value; S.cap = PAGE; refresh(); }, 250) }));

    root.append(h('div', { class: 'parser' }, form,
      h('div', {}, filters, h('div', { id: 'results', class: 'cards' }))));
    paintProgress();
    refresh();
  };
  LF.views.parser.unmount = () => { mounted = false; };
  LF.views.parser.refresh = () => { if (mounted) refresh(); };
})();

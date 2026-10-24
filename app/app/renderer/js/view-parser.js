'use strict';
// Вкладка «Парсер»: форма поиска, ход сбора, фильтры и карточки найденных организаций.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const NICHES = ['барбершоп', 'автосервис', 'шиномонтаж', 'салон красоты', 'ногти маникюр', 'стоматология'];
  const AMOUNTS = [[50, 'Немного'], [150, 'Средне'], [500, 'Много']];
  const PLATES = [['none', 'Нет сайта', ['none']], ['social', 'Только соцсети', ['social']], ['weak', 'Слабый сайт', ['booking', 'multilink', 'builder']], ['own', 'Есть сайт', ['own']]];
  const NETS = [['vk', 'ВКонтакте'], ['telegram', 'Telegram'], ['whatsapp', 'WhatsApp']];
  const PAGE = 60;

  // состояние переживает переключение вкладок
  const S = LF.parserState = {
    form: { city: null, place: '', geo: null, networks: [], query: '', maxCards: 150 },
    filt: { plates: ['none', 'social', 'weak'], networks: [], q: '', rating4: false },
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
        h('div', { class: 'stats' }, [['Просмотрено', stat.cards], ['Новых', stat.newLeads], ...(S.form.networks.length || (S.form.geo && S.form.geo.term) ? [['Не подошло', stat.filtered || 0]] : []), ['Не открылось', stat.errors]].map(([n, v]) => h('div', {}, h('b', {}, v), h('span', {}, n)))));
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
      await LF.call('search:start', { place: S.form.place, city: S.form.city, query: S.form.query, networks: S.form.networks, maxCards: S.form.maxCards, maxPages: 100 });
      await LF.saveSettings({ city: S.form.city, place: S.form.place });
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
      data = await LF.call('leads:list', { city: S.form.city, district: S.form.place, siteClasses: classes.length ? classes : ['-'], networks: f.networks, q: f.q, minRating: f.rating4 ? 4 : 0, limit: S.cap });
    } catch (e) { return LF.toast(e.message, 'err'); }
    if (!document.getElementById('results')) return;
    if (LF.views.parser.setStat) LF.views.parser.setStat(Math.min(data.rows.length, data.total), data.total);
    if (LF.views.parser.paintFacets) LF.views.parser.paintFacets();
    clear(box);
    box.classList.toggle('rows', LF.settings.leadView === 'rows');
    if (!data.rows.length) {
      const any = (await LF.call('stats:get', S.form.city).catch(() => ({ total: 0 }))).total;
      box.append(h('div', { class: 'empty glass', style: { gridColumn: '1 / -1' } },
        h('h3', {}, any ? 'Под такие настройки никого нет' : 'Здесь появятся найденные организации'),
        any ? (f.plates.length ? 'Нажми «Сбросить»' : 'В строке «Сайт» ничего не выбрано. Включи хотя бы один вариант или нажми «Сбросить»') + (f.plates.length ? ' под фильтрами или включи больше вариантов в строках «Сайт» и «Соцсеть».' : '') : 'Выбери город, напиши, кого ищешь, и нажми «Начать поиск». Первые результаты появятся через минуту.'));
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
    const f = S.filt;
    if (!S.form.place) { S.form.place = LF.settings.place || ''; S.form.city = LF.settings.city || 'spb'; }
    const hint = h('div', { class: 'help' });
    const dl = h('datalist', { id: 'placelist' });
    LF.call('geo:list').then((list) => { clear(dl).append(...list.map((x) => h('option', { value: x }))); }).catch(() => {});
    const resolve = LF.debounce(async () => {
      let g = null;
      try { g = S.form.place.trim() ? await LF.call('geo:resolve', S.form.place) : null; } catch (e) { /* подсказка не нужна */ }
      S.form.geo = g;
      if (g) S.form.city = g.slug;
      clear(hint);
      if (!S.form.place.trim()) hint.append('Напиши город, а при желании и район: «Санкт-Петербург, Пушкин» или «Москва, Арбат».');
      else if (!g) hint.append('Не понял, какой город. Напиши его название.');
      else if (!g.known) hint.append(h('span', { class: 'warn' }, `Города «${g.city}» нет в моём списке. Пробую код «${g.slug}», он подобран по названию. Если ничего не найдётся, проверь написание.`));
      else hint.append('Ищу: ', h('b', {}, g.label), g.district ? (g.scope === 'district' ? ' (район города)' : ' (в адресе)') : '');
      S.cap = PAGE; refresh();
    }, 250);
    const placeIn = h('input', { type: 'text', list: 'placelist', placeholder: 'Город, например: Санкт-Петербург, Пушкин', value: S.form.place, spellcheck: 'false', autocomplete: 'off',
      oninput: (e) => { S.form.place = e.target.value; resolve(); } });
    if (!S.form.place) LF.call('geo:resolve', S.form.city).then((g) => { if (g && !S.form.place) { S.form.place = g.label; placeIn.value = g.label; resolve(); } }).catch(() => {});
    resolve();
    const netChoose = h('div', { class: 'chips' }, NETS.map(([k, label]) => {
      const b = h('button', { class: 'chip', title: 'Сохранять только организации, у которых есть эта соцсеть. Выбери несколько: подойдёт любая.', 'aria-pressed': String(S.form.networks.includes(k)),
        onclick: () => { S.form.networks = S.form.networks.includes(k) ? S.form.networks.filter((x) => x !== k) : [...S.form.networks, k]; b.setAttribute('aria-pressed', String(S.form.networks.includes(k))); netHint(); } }, label);
      return b;
    }));
    const netHintEl = h('div', { class: 'help' });
    const netHint = () => { netHintEl.textContent = S.form.networks.length ? 'В базу попадут только организации с выбранной соцсетью, остальные отсеются. Поиск может занять больше времени.' : 'Не выбрано: сохраняются все организации.'; };
    netHint();

    const queryIn = h('input', { type: 'text', placeholder: 'Например: барбершоп', value: S.form.query, oninput: (e) => { S.form.query = e.target.value; },
      onkeydown: (e) => { if (e.key === 'Enter') startOrStop(); } });
    const amountSeg = h('div', { class: 'seg' }, AMOUNTS.map(([n, label]) => h('button', { 'aria-pressed': String(S.form.maxCards === n), title: 'Примерно ' + n + ' организаций',
      onclick: (e) => { S.form.maxCards = n; amountSeg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); } }, label)));

    const form = h('div', { class: 'panel glass' },
      h('h2', {}, 'Найти организации в 2ГИС'),
      h('label', { class: 'field' }, h('span', {}, 'Город или район'), placeIn, dl, hint),
      h('label', { class: 'field' }, h('span', {}, 'Кого ищем'), queryIn),
      h('div', { class: 'chips' }, NICHES.map((n) => h('button', { class: 'chip plain', onclick: () => { queryIn.value = n; S.form.query = n; queryIn.focus(); } }, n))),
      h('div', { class: 'field' }, h('span', {}, 'Искать только с соцсетью'), netChoose, netHintEl),
      h('div', { class: 'field' }, h('span', {}, 'Сколько собрать'), amountSeg),
      h('button', { id: 'runbtn', class: 'btn primary', style: { justifyContent: 'center' }, onclick: startOrStop }),
      h('div', { id: 'progress', class: 'progress', 'aria-live': 'polite' }),
      h('div', { class: 'help' }, 'Организации, собранные за последние 7 дней, второй раз не запрашиваются.'));

    // Фильтры: каждая кнопка показывает, сколько организаций ей соответствует. Нажатая кнопка залита цветом.
    let fx = null;
    const fstat = h('span', {});
    const countOf = { };
    const toggle = (label, key, get, set, title) => {
      const num = h('span', { class: 'n' }, '');
      countOf[key] = num;
      const btn = h('button', { class: 'chip', title, 'aria-pressed': String(get()),
        onclick: async () => { await set(!get()); btn.setAttribute('aria-pressed', String(get())); S.cap = PAGE; refresh(); } }, label, num);
      return btn;
    };
    const plateChips = PLATES.map(([k, label]) => toggle(label, 'plate:' + k, () => f.plates.includes(k),
      (on) => { f.plates = on ? [...f.plates, k] : f.plates.filter((x) => x !== k); }, (LF.SITE_CLASSES[k === 'weak' ? 'builder' : k] || {}).hint));
    const netChips = NETS.map(([k, label]) => toggle(label, 'net:' + k, () => f.networks.includes(k),
      (on) => { f.networks = on ? [...f.networks, k] : f.networks.filter((x) => x !== k); }, 'Показывать организации, у которых есть эта соцсеть. Выбери несколько: подойдёт любая из них.'));
    const otherChips = [
      toggle('Рейтинг от 4', 'rating4', () => f.rating4, (v) => { f.rating4 = v; }, 'Только организации с рейтингом от 4'),
      toggle('Скрыть сети', 'chains', () => LF.settings.excludeChains, async (v) => { await LF.saveSettings({ excludeChains: v }); LF.changed(); }, 'Сети и франшизы редко покупают сайты'),
    ];
    const reset = h('button', { class: 'btn sm ghost', onclick: async () => {
      f.plates = ['none', 'social', 'weak']; f.networks = []; f.rating4 = false; f.q = '';
      await LF.saveSettings({ excludeChains: true }); S.cap = PAGE; LF.views.parser.rebuild();
    } }, 'Сбросить');
    const filters = h('div', { class: 'filters glass' },
      h('div', { class: 'fgroup' }, h('span', { class: 'lab' }, 'Сайт'), ...plateChips),
      h('div', { class: 'fgroup' }, h('span', { class: 'lab', title: 'Если ничего не выбрано, показываются все организации' }, 'Соцсеть'), ...netChips),
      h('div', { class: 'fgroup' }, h('span', { class: 'lab' }, 'Ещё'), ...otherChips),
      h('div', { class: 'fgroup' }, h('input', { class: 'search', type: 'search', placeholder: 'Поиск по названию или адресу', value: f.q, oninput: LF.debounce((e) => { f.q = e.target.value; S.cap = PAGE; refresh(); }, 250) })),
      h('div', { class: 'fstat' }, fstat, reset));
    LF.views.parser.paintFacets = async () => {
      try { fx = await LF.call('leads:facets', S.form.city); } catch (e) { return; }
      const set = (k, v) => { if (countOf[k]) countOf[k].textContent = v; };
      for (const [k] of PLATES) set('plate:' + k, fx.plates[k]);
      for (const [k] of NETS) set('net:' + k, fx.networks[k]);
      set('rating4', fx.rating4); set('chains', fx.chains);
    };
    LF.views.parser.setStat = (shown, total) => { fstat.textContent = `Показано ${shown} из ${total} подходящих. Всего в городе: ${fx ? fx.total : '…'}.`; };
    LF.views.parser.paintFacets();

    root.append(h('div', { class: 'parser' }, form,
      h('div', {}, filters, h('div', { id: 'results', class: 'cards' }))));
    paintProgress();
    refresh();
  };
  LF.views.parser.rebuild = () => { const r = document.getElementById('view'); if (r && mounted) { clear(r); LF.views.parser(r); } };
  LF.views.parser.unmount = () => { mounted = false; };
  LF.views.parser.refresh = () => { if (mounted) refresh(); };
})();

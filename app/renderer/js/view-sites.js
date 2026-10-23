'use strict';
// Вкладка «Сайты»: выбираешь организацию, видишь её сайт в шести стилях, правишь блоки и тексты, сохраняешь.
// Превью строится из данных организации. Скриптов на странице нет: превью открывается в «песочнице».
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const S = LF.siteState = { leadId: null, leads: [], opts: null, style: null, niche: null, blocks: null, accent: '', content: null, textSource: '', viewport: 'desktop', busy: '', mode: 'site', pkgIds: null, offer: null };
  let host = null;
  let galleryBox = null; let bigBox = null; let infoEl = null;
  let token = 0;

  /** Открыть вкладку с готовой организацией (из карточки или из очереди). */
  LF.siteFor = (leadId) => { S.leadId = leadId; S.content = null; S.textSource = ''; S.niche = null; LF.closeLead(); LF.go('sites'); if (host) load(); };

  const args = (extra) => Object.assign({ leadId: S.leadId, style: S.style, niche: S.niche, blocks: [...S.blocks], accent: S.accent || undefined, content: S.content || undefined }, extra || {});

  async function load() {
    if (!host) return;
    try {
      if (!S.opts) S.opts = await LF.call('site:options');
      if (!S.blocks) S.blocks = new Set(S.opts.blocks.map((b) => b.id));
      if (!S.style) S.style = S.opts.styles[0].id;
      const r = await LF.call('leads:list', { limit: 300 });
      S.leads = r.rows;
      if (!S.leadId || !S.leads.some((l) => l.id === S.leadId)) {
        // организация могла быть не в первых 300, тогда она всё равно доступна по id
        if (!S.leadId && S.leads[0]) S.leadId = S.leads[0].id;
      }
    } catch (e) { return LF.toast(e.message, 'err'); }
    paint();
    renderAll();
  }

  const currentLead = () => S.leads.find((l) => l.id === S.leadId);

  const modeSeg = () => h('div', { class: 'seg', 'data-testid': 'modeseg' }, [['site', 'Сайт'], ['offer', 'Предложение (PDF)']].map(([k, n]) =>
    h('button', { 'aria-pressed': String(S.mode === k), onclick: () => { S.mode = k; paint(); renderAll(); } }, n)));

  function offerControls(leadSel) {
    const o = LF.settings.offer;
    const pkgs = o.packages.map((p) => h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: !S.pkgIds || S.pkgIds.includes(p.id), onchange: (e) => {
        const cur = new Set(S.pkgIds || o.packages.map((x) => x.id));
        e.target.checked ? cur.add(p.id) : cur.delete(p.id);
        S.pkgIds = [...cur]; renderAll();
      } }), h('span', {}, p.name, ' ', h('span', { class: 'muted' }, p.price || 'по договорённости'))));
    return h('div', { class: 'panel glass sitectl' },
      modeSeg(),
      h('h2', {}, 'Коммерческое предложение'),
      h('label', { class: 'field' }, h('span', {}, 'Организация'), leadSel),
      h('div', { class: 'field' }, h('span', {}, 'Какие варианты показать'), h('div', { class: 'grid1' }, pkgs)),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', disabled: S.busy === 'pdf', onclick: async () => {
          S.busy = 'pdf'; paint(); renderAll();
          try { const r = await LF.call('offer:pdf', { leadId: S.leadId, packageIds: S.pkgIds || undefined }); LF.toast('PDF сохранён и открыт: ' + r.file); } catch (e) { LF.toast(e.message, 'err'); }
          S.busy = ''; paint(); renderAll();
        } }, icon('check', 'sm'), S.busy === 'pdf' ? 'Создаю PDF…' : 'Сохранить PDF'),
        h('button', { class: 'btn', onclick: () => LF.go('settings') }, icon('gear', 'sm'), 'Цены и пакеты')),
      h('div', { class: 'help' }, 'Предложение собирается из твоих пакетов, цен и контактов (настройки → «Коммерческое предложение»). Файл лежит в папке «offers» рядом с базой.'));
  }

  function controls() {
    const lead = currentLead();
    const leadSel = h('select', { 'aria-label': 'Организация', onchange: (e) => { S.leadId = e.target.value; S.content = null; S.textSource = ''; S.niche = null; paint(); renderAll(); } },
      (S.leadId && !lead ? [h('option', { value: S.leadId, selected: true }, 'Выбранная организация')] : []).concat(
        S.leads.map((l) => h('option', { value: l.id, selected: l.id === S.leadId }, `${l.short_name || l.name} · ${l.rubric || ''}`))));
    const nicheSel = h('select', { 'aria-label': 'Ниша', onchange: (e) => { S.niche = e.target.value; S.content = null; S.textSource = ''; paint(); renderAll(); } },
      S.opts.niches.map((n) => h('option', { value: n.id, selected: n.id === (S.niche || (infoEl && infoEl.dataset.niche)) }, n.label)));
    if (S.mode === 'offer') return offerControls(leadSel);
    const aiBtn = h('button', { class: 'btn', disabled: S.busy === 'ai', onclick: async () => {
      S.busy = 'ai'; paint();
      try {
        const r = await LF.call('site:texts', { leadId: S.leadId, niche: S.niche || undefined });
        S.content = r.content;
        S.textSource = r.source === 'ai' ? 'нейросеть · ' + r.label : 'тексты ниши';
        if (r.source !== 'ai') LF.toast(r.reason === 'off' ? 'Нейросеть не подключена: подставлены тексты ниши. Ключ можно добавить в настройках.' : r.reason === 'exhausted' ? 'Лимиты нейросетей закончились: подставлены тексты ниши.' : 'Подставлены тексты ниши.', r.reason === 'off' || r.reason === 'disabled' ? undefined : 'err');
      } catch (e) { LF.toast(e.message, 'err'); }
      S.busy = ''; paint(); renderAll();
    } }, icon('reload', 'sm'), S.busy === 'ai' ? 'Нейросеть пишет…' : 'Написать тексты нейросетью');
    const blocks = S.opts.blocks.map((b) => h('label', { class: 'switch' },
      h('input', { type: 'checkbox', checked: S.blocks.has(b.id), disabled: b.id === 'contacts', onchange: (e) => { e.target.checked ? S.blocks.add(b.id) : S.blocks.delete(b.id); renderAll(); } }), b.name));
    return h('div', { class: 'panel glass sitectl' },
      modeSeg(),
      h('h2', {}, 'Сайт для организации'),
      h('label', { class: 'field' }, h('span', {}, 'Организация'), leadSel),
      h('label', { class: 'field' }, h('span', {}, 'Ниша (определена по рубрике, можно поменять)'), nicheSel),
      h('div', { class: 'field' }, h('span', {}, 'Блоки на странице'), h('div', { class: 'row' }, blocks)),
      h('div', { class: 'field' }, h('span', {}, 'Главный цвет'),
        h('div', { class: 'row' }, h('input', { type: 'color', value: S.accent || '#2f6bff', 'aria-label': 'Цвет', onchange: (e) => { S.accent = e.target.value; renderAll(); } }),
          h('button', { class: 'btn sm ghost', onclick: () => { S.accent = ''; paint(); renderAll(); } }, 'Как в стиле'))),
      h('div', { class: 'field' }, h('span', {}, 'Тексты' + (S.textSource ? ': ' + S.textSource : ': из базы ниши')),
        h('div', { class: 'row' }, aiBtn, S.content ? h('button', { class: 'btn sm ghost', onclick: () => { S.content = null; S.textSource = ''; paint(); renderAll(); } }, icon('undo', 'sm'), 'Вернуть тексты ниши') : null)),
      h('div', { class: 'row' },
        h('button', { class: 'btn primary', onclick: async () => {
          try { const r = await LF.call('site:export', args()); LF.toast('Сайт сохранён и папка открыта: ' + r.dir); } catch (e) { LF.toast(e.message, 'err'); }
        } }, icon('check', 'sm'), 'Сохранить сайт'),
        h('button', { class: 'btn', onclick: async () => { try { const r = await LF.call('site:preview', args()); LF.copy(r.html, 'Код страницы скопирован'); } catch (e) { LF.toast(e.message, 'err'); } } }, icon('copy', 'sm'), 'Копировать код'),
        h('button', { class: 'btn', title: 'Готовое задание для любой нейросети: она сделает сайт под эту организацию', onclick: async () => { try { const r = await LF.call('site:prompt', { leadId: S.leadId, style: S.style, niche: S.niche || undefined }); LF.copy(r.text, 'Промпт скопирован'); } catch (e) { LF.toast(e.message, 'err'); } } }, icon('copy', 'sm'), 'Копировать промпт для нейросети')),
      h('div', { class: 'help' }, 'Сайт сохраняется как одна страница index.html в папке «sites» рядом с базой: её можно открыть в браузере или выложить на хостинг. Отзывы не выдумываются: показан только настоящий рейтинг из 2ГИС и пустые места под отзывы клиентов.'),
      h('div', { class: 'help' }, 'Показывай макет владельцу как пример. Перед публикацией замени заготовки: услуги, цены, фото и часы работы нужно уточнить у него.'));
  }

  function paint() {
    if (!host) return;
    const top = document.getElementById('view') ? document.getElementById('view').scrollTop : 0;
    galleryBox = h('div', { class: 'gallery', 'data-testid': 'gallery' });
    bigBox = h('div', { class: 'bigprev' });
    infoEl = h('div', { class: 'help', 'data-testid': 'siteinfo' });
    const offerPane = h('div', { class: 'panel glass' }, h('h2', {}, 'Так будет выглядеть предложение'), S.offer ? S.offer : null, h('div', { class: 'offerprev', 'data-testid': 'offerprev' }));
    infoEl = h('div', { class: 'help', 'data-testid': 'siteinfo' });
    clear(host).append(h('div', { class: 'sites' }, controls(),
      S.mode === 'offer' ? offerPane : h('div', { class: 'panel glass' },
        h('h2', {}, 'Выбери стиль'), galleryBox, infoEl,
        h('div', { class: 'row' }, h('h2', { style: { marginRight: 'auto' } }, 'Так будет выглядеть'),
          h('div', { class: 'seg' }, [['desktop', 'Компьютер'], ['phone', 'Телефон']].map(([k, n]) => h('button', { 'aria-pressed': String(S.viewport === k), onclick: (e) => { S.viewport = k; e.currentTarget.parentElement.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); bigBox.dataset.vp = k; } }, n)))),
        bigBox)));
    bigBox.dataset.vp = S.viewport;
    const v = document.getElementById('view'); if (v) v.scrollTop = top;
  }

  const frame = (html, cls) => h('iframe', { class: cls, sandbox: '', srcdoc: html, title: 'Превью сайта', tabindex: '-1' });

  async function renderAll() {
    if (!host || !S.leadId) return;
    const my = ++token;
    if (S.mode === 'offer') {
      try {
        const r = await LF.call('offer:preview', { leadId: S.leadId, packageIds: S.pkgIds || undefined });
        if (my !== token || !host) return;
        const box = host.querySelector('.offerprev');
        if (!box) return;
        const notes = [];
        if (!r.pricesConfirmed) notes.push(h('div', { class: 'notice' }, 'Цены в предложении пока примерные. Поставь свои в настройках и включи «Цены мои», тогда это предупреждение пропадёт. Примерные цены клиенту отправлять нельзя.'));
        if (r.needsName) notes.push(h('div', { class: 'notice' }, 'В предложении нет твоего имени. Впиши его в настройках.'));
        const pane = box.parentElement;
        pane.querySelectorAll(':scope > .notice').forEach((n) => n.remove());
        notes.forEach((n) => pane.insertBefore(n, box));
        clear(box).append(frame(r.html, 'of'));
      } catch (e) { LF.toast(e.message, 'err'); }
      return;
    }
    try {
      const pages = await Promise.all(S.opts.styles.map((st) => LF.call('site:preview', args({ style: st.id, noMap: true }))));
      const big = await LF.call('site:preview', args());
      if (my !== token || !galleryBox) return;
      if (!S.niche) { infoEl.dataset.niche = big.niche; const sel = host.querySelector('select[aria-label="Ниша"]'); if (sel) sel.value = big.niche; }
      const bestStyle = (S.opts.niches.find((n) => n.id === big.niche) || {}).best;
      clear(galleryBox).append(...S.opts.styles.map((st, i) => h('button', { class: 'gcard', 'data-style': st.id, 'aria-pressed': String(st.id === S.style), title: st.desc,
        onclick: () => { S.style = st.id; galleryBox.querySelectorAll('.gcard').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.style === st.id))); renderAll(); showInfo(); } },
      h('div', { class: 'thumb' }, frame(pages[i].html, 'tf')),
      h('div', { class: 'gname' }, h('span', { class: 'sw3' }, st.swatch.map((c) => h('i', { style: { background: c } }))), st.name, bestStyle === st.id ? h('span', { class: 'rec' }, 'для этой ниши') : null))));
      clear(bigBox).append(frame(big.html, 'bf'));
      scaleThumbs();
      showInfo();
    } catch (e) { LF.toast(e.message, 'err'); }
  }
  function scaleThumbs() {
    if (!galleryBox) return;
    galleryBox.querySelectorAll('.thumb').forEach((t) => { const f = t.querySelector('.tf'); if (f && t.clientWidth) f.style.transform = `scale(${t.clientWidth / 1200})`; });
  }
  window.addEventListener('resize', LF.debounce(scaleThumbs, 120));
  function showInfo() {
    const st = S.opts.styles.find((x) => x.id === S.style);
    if (infoEl && st) infoEl.textContent = st.desc;
  }

  LF.views = LF.views || {};
  LF.views.sites = (root) => { host = root; load(); };
  LF.views.sites.unmount = () => { host = null; galleryBox = bigBox = infoEl = null; token++; };
  LF.views.sites.refresh = () => {};
})();

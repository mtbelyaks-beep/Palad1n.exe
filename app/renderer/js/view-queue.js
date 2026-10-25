'use strict';
// Вкладка «Сообщения»: очередь «по одному». Приложение ничего не отправляет само: отправляешь ты.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const CH_NAME = { telegram: 'Telegram', whatsapp: 'WhatsApp', vk: 'ВКонтакте' };
  const S = LF.queueState = { skip: [], cur: null, first: true, gen: 0 };
  let host = null;

  // Уведомления о переходе на шаблоны и возврате к нейросети (первое включение первого ключа не в счёт).
  LF.on('ai:state', (st) => {
    if (!st || st.from === 'off') return;
    if (st.mode === 'exhausted') LF.toast('Лимиты нейросетей закончились: пока тексты берутся из шаблонов. Нейросеть вернётся сама, когда лимит обновится.', 'err');
    else if (st.mode === 'ready' && st.from === 'exhausted') LF.toast('Нейросеть снова доступна.');
    if (host && S.cur) { S.cur.ai = Object.assign({}, S.cur.ai, { mode: st.mode, nextRetryAt: st.nextRetryAt }); }
  });

  const fmtTime = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }); } catch (e) { return ''; } };

  async function load() {
    if (!host) return;
    let q;
    try { q = await LF.call('queue:next', { skipIds: S.skip }); } catch (e) { return LF.toast(e.message, 'err'); }
    S.cur = q;
    paint();
    S.first = false;
  }

  function quotaPanel(counters) {
    return h('aside', { class: 'quota glass' },
      h('h2', { style: { margin: 0, fontSize: '15px' } }, 'Можно написать сегодня'),
      ['telegram', 'whatsapp', 'vk'].map((ch) => {
        const c = counters[ch];
        const cls = c.left === 0 ? 'zero' : c.left <= Math.ceil(c.limit * 0.25) ? 'low' : '';
        return h('div', { class: 'q ' + cls },
          h('div', { class: 'top' }, h('span', {}, CH_NAME[ch]), h('b', {}, `ещё ${c.left} из ${c.limit}`)),
          h('div', { class: 'bar' }, h('i', { style: { width: (c.limit ? Math.round(c.left / c.limit * 100) : 0) + '%' } })),
          c.accounts && c.accounts.length > 1 ? h('div', { class: 'help', style: { marginTop: '4px' } }, c.accounts.map((a) => `${a.name}: ${a.left}`).join(' · ')) : null);
      }),
      h('p', { class: 'help', style: { margin: 0 } },
        'Если писать много незнакомым людям, аккаунт могут заблокировать. Начинай с малого. Лимит можно поменять в настройках.'));
  }

  /** Какие соцсети показывать в очереди и в каком порядке. Хранится в настройках (тот же порядок, что в «Настройки → Сообщения»). */
  function planPanel(q) {
    const order = q.order || ['telegram', 'whatsapp', 'vk'];
    const off = q.off || [];
    const plan = q.plan || {};
    const move = async (i, d) => {
      const o = order.slice(); const [x] = o.splice(i, 1); o.splice(i + d, 0, x);
      await LF.saveSettings({ channelOrder: [...o, ...LF.settings.channelOrder.filter((k) => !CH_NAME[k])] });
      S.first = false; load();
    };
    const toggle = async (ch, on) => {
      const next = on ? off.filter((k) => k !== ch) : off.concat(ch);
      if (next.length >= order.length) { LF.toast('Хотя бы одна соцсеть должна остаться включённой.', 'err'); return load(); }
      await LF.saveSettings({ queueOff: next });
      S.first = false; load();
    };
    const setMode = async (m) => { await LF.saveSettings({ queueMode: m }); S.first = false; load(); };
    return h('aside', { class: 'quota plan glass', 'data-testid': 'queueplan' },
      h('h2', { style: { margin: 0, fontSize: '15px' } }, 'Очередь по соцсетям'),
      h('div', { class: 'plan-rows' }, order.map((ch, i) => {
        const p = plan[ch] || { leads: 0, only: 0 };
        const on = !off.includes(ch);
        return h('div', { class: 'plan-row' + (on ? '' : ' off') },
          h('label', { class: 'switch', title: on ? 'Выключить: организации не будут предлагаться через эту соцсеть' : 'Включить' },
            h('input', { type: 'checkbox', checked: on, 'aria-label': CH_NAME[ch], onchange: (e) => toggle(ch, e.target.checked) }),
            h('span', { class: 'grow' }, h('b', {}, (i + 1) + '. ' + CH_NAME[ch]),
              h('span', { class: 'muted plan-n' }, `${p.leads} орг.` + (p.only ? `, только она: ${p.only}` : '')))),
          h('button', { class: 'btn sm ghost', 'aria-label': 'Раньше', disabled: i === 0, onclick: () => move(i, -1) }, '▲'),
          h('button', { class: 'btn sm ghost', 'aria-label': 'Позже', disabled: i === order.length - 1, onclick: () => move(i, 1) }, '▼'));
      })),
      h('div', { class: 'seg', 'data-testid': 'planmode' },
        h('button', { 'aria-pressed': String(q.mode !== 'score'), title: 'Сначала все, кому можно написать через первую соцсеть, потом через вторую и так далее', onclick: () => setMode('network') }, 'Сначала по соцсетям'),
        h('button', { 'aria-pressed': String(q.mode === 'score'), title: 'Организации идут по оценке, соцсеть выбирается по порядку', onclick: () => setMode('score') }, 'По оценке')),
      h('p', { class: 'help', style: { margin: 0 } }, 'Выключи соцсеть, в которой уже написал много (например, WhatsApp): организации, у которых есть только она, не будут предлагаться. У организации с несколькими соцсетями выбрать любую можно прямо в карточке.'));
  }

  const side = (q) => h('div', { class: 'qside' }, planPanel(q), quotaPanel(q.counters));

  function paint() {
    if (!host) return;
    clear(host);
    const q = S.cur;
    const layout = h('div', { class: 'queue' });
    host.append(layout);

    if (!q.lead) {
      layout.append(h('div', { class: 'empty glass' },
        q.reason === 'limit'
          ? [h('h3', {}, 'На сегодня хватит'), `Лимит исчерпан, а в очереди ещё ${q.waiting}. Продолжишь завтра или увеличь лимит в настройках.`]
          : [h('h3', {}, 'Писать пока некому'), (q.off && q.off.length ? 'Выключено: ' + q.off.map((k) => CH_NAME[k]).join(', ') + '. Включи соцсеть справа, если хочешь писать и туда. ' : '') + 'Сюда попадают организации без сайта или со слабым сайтом, у которых есть Telegram, WhatsApp или ВКонтакте. Найди больше на вкладке «Парсер».']),
      side(q));
      return;
    }

    const lead = q.lead;
    const tplSel = h('select', { style: { width: 'auto' }, onchange: (e) => fill(e.target.value) }, LF.settings.templates.map((t) => h('option', { value: t.id, selected: t.id === q.templateId }, t.name)));
    const text = h('textarea', { class: 'qtext', rows: 7, 'aria-label': 'Текст сообщения', oninput: () => { cur.dirty = true; badge(); } }, q.text);
    // откуда сейчас текст: шаблон или нейросеть (какая)
    const cur = { source: 'template', provider: '', label: '', dirty: false, busy: false };
    const badgeEl = h('span', { class: 'srcbadge tpl', 'data-testid': 'srcbadge' });
    function badge() {
      const ai = cur.source === 'ai';
      badgeEl.className = 'srcbadge ' + (cur.busy ? 'busy' : ai ? 'ai' : 'tpl');
      badgeEl.textContent = cur.busy ? 'нейросеть пишет…' : (ai ? 'нейросеть · ' + cur.label : 'шаблон') + (cur.dirty ? ' (правлено)' : '');
      regen.disabled = cur.busy || !(q.ai && q.ai.enabled && q.ai.mode === 'ready');
    }
    const regen = h('button', { class: 'btn sm', title: 'Попросить нейросеть написать другой вариант', onclick: () => fill(tplSel.value, true) }, icon('reload', 'sm'), 'Другой вариант');
    const backTpl = h('button', { class: 'btn sm ghost', title: 'Вернуть текст из шаблона', onclick: async () => {
      S.gen++; cur.busy = false;
      const r = await LF.call('queue:render', { leadId: lead.id, templateId: tplSel.value });
      text.value = r.text; q.templateId = r.templateId; Object.assign(cur, { source: 'template', provider: '', label: '', dirty: false }); badge();
    } }, icon('undo', 'sm'), 'Из шаблона');
    async function fill(templateId, force, auto) {
      const my = ++S.gen;
      if (!force) { const r = await LF.call('queue:render', { leadId: lead.id, templateId }); if (my !== S.gen) return; text.value = r.text; q.templateId = r.templateId; Object.assign(cur, { source: 'template', provider: '', label: '', dirty: false }); }
      if (!(q.ai && q.ai.enabled && q.ai.mode === 'ready')) { badge(); return; }
      cur.busy = true; badge();
      let r;
      try { r = await LF.call('queue:generate', { leadId: lead.id, templateId }); } catch (e) { r = null; }
      if (my !== S.gen) return; // человек уже ушёл дальше
      cur.busy = false;
      if (r && r.source === 'ai') {
        if (auto && cur.dirty) { LF.toast('Нейросеть написала вариант, но ты уже правил текст. Нажми «Другой вариант», если нужен новый.'); }
        else { text.value = r.text; Object.assign(cur, { source: 'ai', provider: r.provider, label: r.label, dirty: false }); }
      } else if (r && r.reason === 'exhausted') { q.ai = Object.assign({}, q.ai, { mode: 'exhausted', nextRetryAt: r.nextRetryAt }); }
      badge();
      if (q.ai.mode === 'exhausted' || !r) paintAiNote();
    }
    const aiNote = h('div', { class: 'ainote' });
    function paintAiNote() {
      clear(aiNote);
      const ai = q.ai || {};
      if (!ai.enabled) return;
      if (ai.mode === 'off') aiNote.append('Нейросеть не подключена, тексты из шаблонов. ', h('a', { href: '#', class: 'linkbtn', onclick: (e) => { e.preventDefault(); LF.go('settings'); } }, 'Подключить в настройках'));
      else if (ai.mode === 'exhausted') aiNote.append('Лимиты нейросетей закончились, тексты из шаблонов.' + (ai.nextRetryAt ? ' Попробую снова примерно в ' + fmtTime(ai.nextRetryAt) + '.' : ''));
    }

    // канал и аккаунт, с которых будем писать (по умолчанию лучшие по порядку из настроек)
    const chosen = { ch: lead.channel, acc: q.account ? q.account.id : '' };
    const bestAcc = (ch) => { const a = (((q.counters[ch] || {}).accounts) || []).filter((x) => x.left > 0).sort((x, y) => y.left - x.left)[0]; return a ? a.id : ''; };
    const chanBox = h('div', { class: 'row', style: { gap: '8px' } });
    function paintChan() {
      clear(chanBox);
      const chs = q.channels && q.channels.length ? q.channels : [{ id: lead.channel, left: 1 }];
      if (chs.length > 1) {
        chanBox.append(h('span', { class: 'muted' }, 'Писать через:'),
          h('div', { class: 'seg', 'data-testid': 'chanseg' }, chs.map((c) => h('button', { 'aria-pressed': String(c.id === chosen.ch), disabled: c.left === 0,
            title: c.left === 0 ? 'Лимит на сегодня исчерпан' : c.off ? 'Выключена в очереди, но написать через неё можно' : '',
            onclick: () => { chosen.ch = c.id; chosen.acc = bestAcc(c.id); paintChan(); } }, CH_NAME[c.id] + (c.off ? ' (выкл.)' : '')))));
      } else chanBox.append(h('span', { class: 'src' }, 'Написать в: ' + (CH_NAME[chosen.ch] || chosen.ch)),
        h('span', { class: 'muted' }, 'других соцсетей у организации не нашли'));
      const accs = ((q.counters[chosen.ch] || {}).accounts) || [];
      if (accs.length > 1) chanBox.append(h('select', { 'aria-label': 'Аккаунт', style: { width: 'auto' }, onchange: (e) => { chosen.acc = e.target.value; } },
        accs.map((a) => h('option', { value: a.id, selected: a.id === chosen.acc }, `${a.name} · ещё ${a.left}`))));
    }
    paintChan();

    const markReady = () => { sentBtn.disabled = false; sentBtn.classList.add('primary'); };
    const external = async (silent) => {
      try {
        const r = await LF.call('queue:open', { leadId: lead.id, text: text.value, channel: chosen.ch });
        markReady();
        if (!silent) LF.toast(!r.opened ? 'Ссылки на чат нет. Текст скопирован: найди человека сам.' : r.prefilled ? 'Чат открыт в браузере, текст уже подставлен.' : 'Чат открыт в браузере. Текст скопирован: вставь его через Ctrl+V.');
      } catch (e) { LF.toast(e.message, 'err'); }
    };
    const writeBtn = h('button', { class: 'btn primary', onclick: async () => {
      const ok = await LF.chat.open({ leadId: lead.id, text: text.value, title: lead.short_name || lead.name, channel: chosen.ch, accountId: chosen.acc });
      if (ok) { markReady(); writeBtn.classList.remove('primary'); } else await external(true);
    } }, icon('chat', 'sm'), 'Написать здесь');

    const sentBtn = h('button', { class: 'btn', disabled: true, title: 'Нажми, когда сам отправил сообщение в чате: этап станет «Написал»', onclick: async () => {
      try {
        await LF.call('queue:sent', { leadId: lead.id, templateId: q.templateId, text: text.value, source: cur.source, provider: cur.provider, channel: chosen.ch, accountId: chosen.acc });
        LF.toast('Записано: этап «Написал»'); LF.changed(); load();
      } catch (e) { LF.toast(e.message, 'err'); }
    } }, icon('check', 'sm'), 'Я отправил');

    const card = h('div', { class: 'qcard glass' + (S.first ? '' : ' next') },
      h('div', { class: 'qhead' },
        h('div', { class: 'grow' },
          h('h2', {}, lead.short_name || lead.name),
          h('div', { class: 'muted' }, [lead.rubric, (lead.district || '').replace(/\s*район$/i, ''), lead.address].filter(Boolean).join(' · '))),
        LF.scoreRing(lead)),
      h('div', { class: 'row' }, LF.plate(lead), LF.rating(lead),
        h('button', { class: 'btn ghost sm', style: { marginLeft: 'auto' }, onclick: () => LF.openLead(lead.id) }, 'Подробнее')),
      q.needsName ? h('div', { class: 'notice' }, 'В тексте нет твоего имени. ', h('a', { href: '#', class: 'linkbtn', onclick: (e) => { e.preventDefault(); LF.go('settings'); } }, 'Впиши его в настройках.')) : null,
      h('div', { class: 'row' }, h('span', { class: 'muted' }, 'Готовый текст'), tplSel, badgeEl, regen, backTpl,
        h('span', { class: 'muted', style: { marginLeft: 'auto' } }, `Ждут своей очереди: ${q.waiting}`)),
      chanBox,
      aiNote,
      text,
      h('div', { class: 'qactions' }, writeBtn, sentBtn,
        h('button', { class: 'btn ghost', title: 'Открыть чат в обычном браузере', onclick: () => external(false) }, icon('ext', 'sm'), 'В браузере'),
        h('button', { class: 'btn ghost', onclick: () => { S.skip.push(lead.id); load(); } }, icon('skip', 'sm'), 'Пропустить'),
        h('button', { class: 'btn ghost danger', style: { marginLeft: 'auto' }, title: 'Скрыть и больше не предлагать', onclick: async () => {
          await LF.call('leads:blacklist', { id: lead.id }); LF.toast('Больше не покажется'); LF.changed(); load();
        } }, icon('ban', 'sm'), 'Не писать')));
    layout.append(card, side(q));
    badge(); paintAiNote();
    fill(q.templateId, true, true);
  }

  LF.views = LF.views || {};
  LF.views.queue = (root) => { host = root; S.first = true; load(); };
  LF.views.queue.unmount = () => { host = null; };
  LF.views.queue.refresh = () => {}; // очередь сама перечитывается после своих действий
})();

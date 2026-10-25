'use strict';
// Вкладка «Входящие»: все аккаунты мессенджеров, сколько в каждом непрочитанных, сколько можно написать сегодня,
// и диалоги с организациями, которым уже писали. Сами переписки читаются в панели чата справа.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const CH_NAME = { telegram: 'Telegram', whatsapp: 'WhatsApp', vk: 'ВКонтакте' };
  let host = null;
  let badgeEls = {};
  let state = { counters: null, dialogs: [] };

  const when = (iso) => {
    if (!iso) return '';
    const d = new Date(iso); const now = new Date();
    const day = (x) => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
    const hm = d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
    const diff = Math.round((day(now) - day(d)) / 864e5);
    if (diff === 0) return 'сегодня, ' + hm;
    if (diff === 1) return 'вчера, ' + hm;
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  };

  async function reload() {
    if (!host) return;
    try {
      [state.counters, state.dialogs] = await Promise.all([LF.call('queue:counters'), LF.call('inbox:list')]);
      await LF.reloadSettings();
    } catch (e) { return LF.toast(e.message, 'err'); }
    paint();
  }

  async function mutate(fn) {
    try { await fn(); await LF.reloadSettings(); LF.chat.sync(); } catch (e) { LF.toast(e.message, 'err'); }
    await reload();
  }

  function usage(a) {
    const per = state.counters && state.counters[a.service] && state.counters[a.service].accounts.find((x) => x.id === a.id);
    return per || { used: 0, limit: 0, left: 0 };
  }

  function accountCard(a) {
    const u = usage(a);
    const badge = h('i', { class: 'ub', style: { display: (LF.unread.map[a.id] || 0) ? '' : 'none' } }, String(LF.unread.map[a.id] || 0));
    badgeEls[a.id] = badge;
    return h('div', { class: 'acc', 'data-id': a.id },
      h('div', { class: 'top' },
        h('input', { type: 'text', value: a.name, maxlength: 30, 'aria-label': 'Название аккаунта', onchange: (e) => mutate(() => LF.call('accounts:update', { id: a.id, patch: { name: e.target.value } })) }),
        badge,
        h('button', { class: 'btn sm ghost danger', title: 'Убрать аккаунт из списка (вход в мессенджере не удаляется)', 'aria-label': 'Убрать аккаунт', onclick: () => mutate(() => LF.call('accounts:remove', a.id)) }, icon('trash', 'sm'))),
      h('div', { class: 'svc' }, CH_NAME[a.service]),
      h('div', { class: 'nums' },
        h('span', {}, `Сегодня: ${u.used} из ${u.limit}`),
        h('label', { class: 'row', style: { gap: '6px' } }, 'Лимит в день',
          h('input', { type: 'number', min: 0, max: 200, value: a.limit === null ? '' : a.limit, placeholder: String(LF.settings.dailyLimits[a.service]), 'aria-label': 'Лимит в день',
            onchange: (e) => mutate(() => LF.call('accounts:update', { id: a.id, patch: { limit: e.target.value === '' ? null : Number(e.target.value) } })) }))),
      h('div', {}, h('button', { class: 'btn sm primary', onclick: () => LF.chat.openAccount(a.id) }, icon('chat', 'sm'), 'Открыть чат')));
  }

  function dialogRow(d) {
    const a = LF.settings.accounts.find((x) => x.id === d.accountId);
    return h('div', { class: 'dlg', 'data-id': d.id },
      h('div', { class: 'grow' },
        h('div', { class: 't' }, d.name),
        h('div', { class: 'muted' }, [d.rubric, (a && a.name !== CH_NAME[d.channel] ? a.name : (CH_NAME[d.channel] || d.channel)), when(d.sentAt)].filter(Boolean).join(' · '))),
      h('select', { style: { width: 'auto' }, 'aria-label': 'Этап', onchange: async (e) => {
        try { await LF.call('leads:setStatus', { id: d.id, status: e.target.value }); LF.changed(); await reload(); } catch (er) { LF.toast(er.message, 'err'); }
      } }, LF.STATUSES.filter(([k]) => k !== 'new').map(([k, n]) => h('option', { value: k, selected: k === d.status }, n))),
      h('button', { class: 'btn sm', onclick: async () => {
        const ok = await LF.chat.open({ leadId: d.id, text: '', title: d.name, channel: d.channel, accountId: d.accountId });
        if (!ok) LF.toast('Для этой организации чат внутри приложения открыть нельзя.', 'err');
      } }, icon('chat', 'sm'), 'Открыть чат'));
  }

  function paint() {
    if (!host) return;
    badgeEls = {};
    const top = document.getElementById('view') ? document.getElementById('view').scrollTop : 0;
    const accs = LF.settings.accounts;
    const total = LF.unread.total();
    const left = h('div', { class: 'panel glass' },
      h('h2', {}, 'Аккаунты'),
      h('div', { class: 'help' }, 'Можно держать несколько аккаунтов одного мессенджера: у каждого свой вход и свой дневной лимит. Приложение подсказывает, с какого писать, пока у него есть свободные сообщения.'),
      accs.length ? accs.map(accountCard) : h('div', { class: 'empty2' }, 'Аккаунтов нет. Добавь первый кнопкой ниже.'),
      h('div', { class: 'row' }, ['telegram', 'whatsapp', 'vk'].map((sv) => h('button', { class: 'btn sm', onclick: () => mutate(() => LF.call('accounts:add', sv)) }, icon('plus', 'sm'), CH_NAME[sv]))),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: !!LF.settings.inboxWatch, onchange: async (e) => {
        await LF.saveSettings({ inboxWatch: e.target.checked });
        if (e.target.checked) LF.chat.warmup(); else LF.toast('Фоновое слежение выключится после перезапуска приложения.');
      } }), h('span', {}, 'Считать новые сообщения в фоне ', h('span', { class: 'muted' }, '(страницы мессенджеров открыты скрыто: счётчики живые, но компьютер нагружается сильнее)'))),
      h('div', { class: 'help' }, 'Число непрочитанных берётся из заголовка страницы мессенджера. Если страница закрыта или мессенджер не пишет число в заголовок, счётчик покажет 0.'));

    const right = h('div', { class: 'panel glass' },
      h('h2', {}, 'Диалоги', total ? h('span', { class: 'ub', style: { marginLeft: '8px' } }, String(total)) : null),
      h('div', { class: 'help' }, 'Организации, которым ты уже написал. Когда они отвечают, смени этап: он попадёт в воронку на вкладке «База».'),
      state.dialogs.length ? state.dialogs.map(dialogRow) : h('div', { class: 'empty2' }, 'Пока никому не писал. Напиши первому на вкладке «Сообщения».'));

    clear(host).append(h('div', { class: 'inbox' }, left, right));
    const v = document.getElementById('view');
    if (v) v.scrollTop = top;
  }

  document.addEventListener('lf:unread', () => {
    for (const [id, el] of Object.entries(badgeEls)) {
      const n = LF.unread.map[id] || 0;
      el.textContent = String(n); el.style.display = n ? '' : 'none';
    }
  });

  LF.views = LF.views || {};
  LF.views.inbox = (root) => { host = root; state = { counters: null, dialogs: [] }; reload(); };
  LF.views.inbox.unmount = () => { host = null; badgeEls = {}; };
  LF.views.inbox.refresh = () => { reload(); };
})();

'use strict';
// Чат прямо в приложении: панель справа с веб-версиями Telegram, WhatsApp и ВКонтакте.
// У каждого аккаунта своя сессия (вход хранится только на этом компьютере).
// Приложение ничего не отправляет: текст подставляется или копируется, а «Отправить» нажимаешь ты.
// Число непрочитанных берётся из заголовка страницы мессенджера: «(3) WhatsApp».
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const SERVICES = {
    telegram: { name: 'Telegram', home: 'https://web.telegram.org/k/' },
    whatsapp: { name: 'WhatsApp', home: 'https://web.whatsapp.com/' },
    vk: { name: 'ВКонтакте', home: 'https://vk.com/im' },
  };
  const dock = () => document.getElementById('chatdock');
  const S = { accId: null, views: {}, ready: {}, current: null, built: false, msg: null };
  const accounts = () => (LF.settings && LF.settings.accounts) || [];
  const acc = (id) => accounts().find((a) => a.id === id);

  /* ---------- непрочитанные ---------- */
  const unread = LF.unread = {
    map: {},
    total() { return Object.values(this.map).reduce((n, v) => n + v, 0); },
    set(id, n) {
      if ((this.map[id] || 0) === n) return;
      this.map[id] = n;
      document.dispatchEvent(new CustomEvent('lf:unread'));
    },
  };
  /** «(3) WhatsApp» -> 3; без числа в начале заголовка -> 0 */
  LF.parseUnread = (title) => {
    const m = /^\s*[([](\d{1,4})\+?[)\]]/.exec(String(title || ''));
    return m ? Number(m[1]) : 0;
  };

  function build() {
    if (S.built) return;
    S.built = true;
    const d = clear(dock());
    S.title = h('div', { class: 'title grow' }, 'Чат');
    S.seg = h('div', { class: 'seg' });
    S.copyBtn = h('button', { class: 'btn sm', onclick: () => S.current && LF.copy(S.current.text, 'Текст скопирован') }, icon('copy', 'sm'), 'Копировать текст');
    S.extBtn = h('button', { class: 'btn sm ghost', title: 'Открыть в обычном браузере', onclick: openOutside }, icon('ext', 'sm'));
    const reload = h('button', { class: 'btn sm ghost', title: 'Обновить страницу', 'aria-label': 'Обновить', onclick: () => { const v = S.views[S.accId]; if (v && typeof v.reload === 'function' && S.ready[S.accId]) v.reload(); } }, icon('reload', 'sm'));
    const close = h('button', { class: 'btn sm ghost', title: 'Закрыть чат', 'aria-label': 'Закрыть чат', onclick: LF.chat.close }, icon('x', 'sm'));
    S.body = h('div', { class: 'dockbody' });
    S.hint = h('div', { class: 'dockhint' });
    d.append(h('div', { class: 'dockbar' }, h('div', { class: 'dockrow' }, S.title, S.copyBtn, S.extBtn, reload, close), h('div', { class: 'dockrow' }, S.seg)), S.body, S.hint);
    paintSeg();
  }

  function paintSeg() {
    if (!S.seg) return;
    clear(S.seg).append(...accounts().map((a) => {
      const n = unread.map[a.id] || 0;
      return h('button', { 'data-s': a.id, 'aria-pressed': String(a.id === S.accId), title: a.name, onclick: () => showAccount(a.id, true) },
        a.name, n ? h('i', { class: 'ub' }, n > 99 ? '99+' : String(n)) : null);
    }));
  }

  async function openOutside() {
    const c = S.current;
    if (!c || !c.leadId) return;
    try { await LF.call('queue:open', { leadId: c.leadId, text: c.text, channel: c.channel }); } catch (e) { LF.toast(e.message, 'err'); }
  }

  function hideMsg() { if (S.msg) { S.msg.remove(); S.msg = null; } }
  function showMsg(title, text) {
    hideMsg();
    S.msg = h('div', { class: 'dockmsg' }, h('h3', {}, title), h('div', {}, text),
      h('div', { class: 'row', style: { justifyContent: 'center' } },
        h('button', { class: 'btn', onclick: () => { hideMsg(); const v = S.views[S.accId]; if (v && typeof v.reload === 'function') v.reload(); } }, 'Повторить'),
        S.current && S.current.leadId ? h('button', { class: 'btn', onclick: openOutside }, 'Открыть в браузере') : null));
    S.body.append(S.msg);
  }

  function ensureView(a, url) {
    if (S.views[a.id]) return S.views[a.id];
    const wv = h('webview', { src: url || SERVICES[a.service].home, partition: a.partition });
    wv.addEventListener('dom-ready', () => { S.ready[a.id] = true; });
    wv.addEventListener('page-title-updated', (e) => unread.set(a.id, LF.parseUnread(e.title)));
    wv.addEventListener('did-start-loading', () => { if (a.id === S.accId) hideMsg(); });
    wv.addEventListener('did-fail-load', (e) => {
      if (e.isMainFrame === false || e.errorCode === -3) return; // -3: загрузку прервала сама страница
      if (a.id === S.accId) showMsg('Страница не открылась', 'Возможно, сервис недоступен из твоей сети или пропал интернет.');
    });
    S.views[a.id] = wv;
    S.body.append(wv);
    return wv;
  }

  function activate(id) {
    S.accId = id;
    Object.entries(S.views).forEach(([k, v]) => v.classList.toggle('active', k === id));
    paintSeg();
  }

  function showAccount(id, home) {
    const a = acc(id);
    if (!a) return;
    hideMsg();
    const wv = ensureView(a);
    activate(id);
    if (home && S.current) { S.current = null; refreshChrome(); }
    if (home && S.ready[id] && typeof wv.loadURL === 'function') wv.loadURL(SERVICES[a.service].home);
  }

  function refreshChrome() {
    const c = S.current;
    const a = acc(S.accId);
    S.title.textContent = c ? c.title : (a ? a.name : 'Чат');
    S.copyBtn.style.display = c && c.text ? '' : 'none';
    S.extBtn.style.display = c && c.leadId ? '' : 'none';
    S.hint.textContent = c
      ? (!c.text ? 'Чат открыт. Текст не подставлялся.' : c.prefilled ? 'Текст уже в поле сообщения. Проверь его и нажми отправку в чате сам.' : 'Текст скопирован. Вставь его в поле сообщения (Ctrl+V) и отправь сам.')
      : 'Войди в аккаунт один раз: вход сохранится на этом компьютере.';
  }

  function openDock() { dock().classList.add('on'); document.body.classList.add('chat-open'); }

  LF.chat = {
    isOpen: () => dock().classList.contains('on'),
    /** Открывает чат с лидом через выбранный аккаунт. Возвращает false, если для лида нет ссылки внутри приложения. */
    async open({ leadId, text, title, channel, accountId }) {
      let t;
      try { t = await LF.call('chat:target', { leadId, text, channel, accountId }); } catch (e) { LF.toast(e.message, 'err'); return false; }
      if (!t.url || !acc(t.accountId)) { LF.toast('Для этого контакта чат внутри приложения недоступен.' + (text ? ' Текст скопирован.' : ''), 'err'); return false; }
      build();
      const a = acc(t.accountId);
      S.current = { leadId, text, channel, title: title || a.name, prefilled: t.prefilled };
      const existed = !!S.views[a.id];
      const wv = ensureView(a, t.url);
      hideMsg();
      activate(a.id);
      if (existed) { if (S.ready[a.id] && typeof wv.loadURL === 'function') wv.loadURL(t.url); else wv.setAttribute('src', t.url); }
      refreshChrome();
      openDock();
      return true;
    },
    /** Просто открыть панель с аккаунтом (первый вход, просмотр входящих). */
    openAccount(id) {
      build();
      S.current = null;
      showAccount(id, false);
      refreshChrome();
      openDock();
    },
    close() {
      dock().classList.remove('on');
      document.body.classList.remove('chat-open');
    },
    /** Список аккаунтов изменился: убрать лишние страницы, перерисовать вкладки. */
    sync() {
      const ids = new Set(accounts().map((a) => a.id));
      for (const [id, v] of Object.entries(S.views)) if (!ids.has(id)) { v.remove(); delete S.views[id]; delete S.ready[id]; unread.set(id, 0); delete unread.map[id]; }
      if (S.accId && !ids.has(S.accId)) S.accId = null;
      paintSeg();
      document.dispatchEvent(new CustomEvent('lf:unread'));
    },
    /** Фоновое слежение: страницы всех аккаунтов грузятся заранее, чтобы считать новые сообщения. */
    warmup() {
      if (!(LF.settings && LF.settings.inboxWatch)) return;
      build();
      for (const a of accounts()) ensureView(a);
      paintSeg();
    },
  };
  document.addEventListener('lf:unread', paintSeg);
})();

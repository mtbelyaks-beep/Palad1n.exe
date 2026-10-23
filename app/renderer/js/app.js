'use strict';
// Каркас: боковая панель, заголовок со счётчиками, плавное переключение вкладок.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const TABS = [
    ['parser', 'Парсер', 'search', 'Парсер'],
    ['base', 'База', 'db', 'База'],
    ['queue', 'Сообщения', 'chat', 'Сообщения'],
    ['inbox', 'Входящие', 'inbox', 'Входящие'],
    ['sites', 'Сайты', 'site', 'Сайты'],
    ['settings', 'Настройки', 'gear', 'Настройки'],
  ];
  let current = null;
  let token = 0;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const animated = () => document.body.dataset.motion !== 'off' && !document.body.classList.contains('lite');

  function movePill() {
    const pill = document.getElementById('pill');
    const btn = document.querySelector('.nav[aria-current="page"]');
    if (!pill || !btn) return;
    pill.style.transform = `translateY(${btn.offsetTop}px)`;
    pill.classList.add('on');
  }

  LF.go = async function go(id) {
    if (id === current) return;
    const my = ++token;
    const view = document.getElementById('view');
    if (current && animated()) { view.classList.remove('enter'); view.classList.add('leave'); await sleep(130); if (my !== token) return; }
    if (current && LF.views[current] && LF.views[current].unmount) LF.views[current].unmount();
    current = id;
    try { localStorage.setItem('lf-tab', id); } catch (e) { /* без сохранения вкладки тоже работает */ }
    const t = TABS.find((x) => x[0] === id);
    document.getElementById('title').textContent = t[3];
    document.querySelectorAll('.nav').forEach((b) => (b.dataset.id === id ? b.setAttribute('aria-current', 'page') : b.removeAttribute('aria-current')));
    movePill();
    LF.closeLead();
    clear(view);
    view.scrollTop = 0;
    LF.views[id](view);
    view.classList.remove('leave');
    if (animated()) { void view.offsetWidth; view.classList.add('enter'); setTimeout(() => view.classList.remove('enter'), 450); }
  };

  const counterEls = {};
  async function paintCounters() {
    const box = document.getElementById('counters');
    let st;
    try { st = await LF.call('stats:get'); } catch (e) { return; }
    const items = [['total', st.total, 'в базе', null], ['hot', st.hot, 'лучших', 'hot'], ['reachable', st.reachable, 'можно написать', null]];
    if (!counterEls.built) {
      counterEls.built = true;
      for (const [k, , label, dot] of items) {
        const b = h('b', {});
        counterEls[k] = b;
        box.append(h('div', { class: 'counter glass', title: k === 'hot' ? 'Организации без сайта или только с соцсетями: им проще всего продать сайт' : '' }, dot ? h('i', { class: 'dot ' + dot }) : null, b, h('span', {}, label)));
      }
    }
    for (const [k, v] of items) LF.tween(counterEls[k], v);
  }

  // Число непрочитанных у значка «Входящие»
  function paintUnread() {
    const btn = document.querySelector('.nav[data-id=inbox]');
    if (!btn) return;
    const n = LF.unread ? LF.unread.total() : 0;
    let b = btn.querySelector('.ub');
    if (!n) { if (b) b.remove(); return; }
    if (!b) { b = h('i', { class: 'ub' }); btn.append(b); }
    b.textContent = n > 99 ? '99+' : String(n);
  }
  document.addEventListener('lf:unread', paintUnread);

  document.addEventListener('lf:changed', () => {
    paintCounters();
    const v = LF.views[current];
    if (v && v.refresh) v.refresh();
  });
  LF.on('search:progress', LF.debounce(paintCounters, 1500));
  window.addEventListener('resize', LF.debounce(movePill, 100));

  async function boot() {
    LF.settings = await LF.call('settings:get');
    LF.applySettings(LF.settings);
    const rail = document.getElementById('rail');
    rail.append(h('div', { class: 'mark', 'aria-hidden': 'true' }, 'P'), h('div', { class: 'brand' }, 'Palad1n'), h('div', { id: 'pill', class: 'nav-pill', 'aria-hidden': 'true' }));
    TABS.forEach(([id, label, ic]) => rail.append(h('button', { class: 'nav', 'data-id': id, title: label, onclick: () => LF.go(id) }, icon(ic), h('span', {}, label))));
    paintCounters();
    LF.chat.warmup();
    document.addEventListener('keydown', (e) => {
      if (!e.altKey) return;
      const i = Number(e.key) - 1;
      if (TABS[i]) { e.preventDefault(); LF.go(TABS[i][0]); }
    });
    let start = 'parser';
    try { start = localStorage.getItem('lf-tab') || 'parser'; } catch (e) { /* ok */ }
    if (!LF.views[start]) start = 'parser';
    await LF.go(start);
    document.getElementById('pill').style.transition = 'none';
    movePill();
    requestAnimationFrame(() => { document.getElementById('pill').style.transition = ''; });
  }

  boot().catch((e) => {
    document.getElementById('view').textContent = 'Не удалось запустить интерфейс: ' + e.message;
  });
})();

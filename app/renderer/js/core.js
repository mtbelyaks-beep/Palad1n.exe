'use strict';
// Связь с главным процессом, настройки и оформление (темы, акцент, фон).
(function () {
  const LF = window.LF;

  /** Вызов главного процесса. Ошибки приходят как обычные исключения с человеческим текстом. */
  LF.call = async function call(channel, payload) {
    const res = await window.api.invoke(channel, payload);
    if (!res || !res.ok) throw new Error((res && res.error) || 'Неизвестная ошибка');
    return res.data;
  };
  LF.on = (ch, cb) => window.api.on(ch, cb);

  LF.settings = null;

  LF.SITE_CLASSES = {
    none: { label: 'Нет сайта', tier: 'hot', hint: 'В 2ГИС нет ссылки на сайт: самый простой клиент' },
    social: { label: 'Только соцсети', tier: 'hot', hint: 'Вместо сайта только соцсети или мессенджер' },
    booking: { label: 'Слабый сайт', tier: 'warm', hint: 'Только страница записи, а не полноценный сайт' },
    multilink: { label: 'Слабый сайт', tier: 'warm', hint: 'Только страница-визитка со ссылками' },
    builder: { label: 'Слабый сайт', tier: 'warm', hint: 'Сайт на конструкторе (Tilda, Wix и т. п.)' },
    own: { label: 'Есть сайт', tier: 'cold', hint: 'Свой сайт уже есть' },
  };
  LF.STATUSES = [
    ['new', 'Новый'], ['contacted', 'Написал'], ['replied', 'Ответил'], ['agreed', 'Договорились'], ['paid', 'Оплатил'], ['rejected', 'Отказ'],
  ];
  LF.statusName = (s) => (LF.STATUSES.find((x) => x[0] === s) || [s, s])[1];

  function hexToRgb(hex) {
    const m = /^#?([0-9a-f]{6})$/i.exec(hex || '');
    if (!m) return [139, 124, 255];
    const n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }

  LF.applySettings = function applySettings(s) {
    const b = document.body;
    const root = document.documentElement.style;
    b.dataset.theme = s.theme;
    b.dataset.bg = s.bg;
    b.dataset.density = s.density;
    b.dataset.font = s.font;
    b.dataset.motion = s.motion;
    b.dataset.rail = s.rail;
    b.classList.toggle('lite', !!s.lite);
    root.setProperty('--fs', s.fontSize + 'px');
    root.setProperty('--r', s.radius + 'px');
    root.setProperty('--r-sm', Math.round(s.radius * 0.62) + 'px');
    root.setProperty('--glass-k', String(s.glassK));
    const [r, g, bl] = hexToRgb(s.accent);
    root.setProperty('--accent', s.accent);
    root.setProperty('--accent-rgb', `${r}, ${g}, ${bl}`);
    // читаемый цвет текста на акценте
    const lum = (0.299 * r + 0.587 * g + 0.114 * bl) / 255;
    root.setProperty('--on-accent', lum > 0.6 ? '#0a0e1c' : '#ffffff');
    const img = document.querySelector('#bg .img');
    img.style.backgroundImage = s.bgImage ? `url("${s.bgImage}")` : '';
    img.style.opacity = String(s.bgOpacity);
    img.style.filter = `blur(${s.bgBlur}px)`;
    // видео-обои: без звука, по кругу; на паузе, если анимации выключены, компьютер слабый или окно свёрнуто
    const bgEl = document.getElementById('bg');
    let vid = bgEl.querySelector('video');
    if (s.bg === 'video' && LF.bgVideoUrl && !s.lite) {
      if (!vid) {
        vid = document.createElement('video');
        vid.muted = true; vid.loop = true; vid.autoplay = true; vid.playsInline = true; vid.disablePictureInPicture = true;
        bgEl.prepend(vid);
      }
      if (vid.getAttribute('src') !== LF.bgVideoUrl) vid.setAttribute('src', LF.bgVideoUrl);
      bgEl.style.setProperty('--dim', String(s.bgDim));
      if (s.motion === 'off' || document.hidden) vid.pause(); else { const p = vid.play(); if (p && p.catch) p.catch(() => {}); }
    } else if (vid) { vid.pause(); vid.removeAttribute('src'); vid.remove(); }
  };

  LF.saveSettings = async function saveSettings(patch) {
    LF.settings = await LF.call('settings:set', patch);
    LF.applySettings(LF.settings);
    return LF.settings;
  };

  /** Перечитать настройки (например, после изменения списка аккаунтов). */
  LF.reloadSettings = async () => { LF.settings = await LF.call('settings:get'); return LF.settings; };

  // Анимация не крутится, когда окно свёрнуто или вкладка скрыта.
  LF.setPaused = (p) => {
    document.body.classList.toggle('paused', p);
    const v = document.querySelector('#bg video');
    if (v) { if (p || document.body.dataset.motion === 'off') v.pause(); else { const r = v.play(); if (r && r.catch) r.catch(() => {}); } }
  };
  document.addEventListener('visibilitychange', () => LF.setPaused(document.hidden));
  LF.on('app:visibility', (visible) => LF.setPaused(!visible));
})();

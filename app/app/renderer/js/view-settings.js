'use strict';
// Вкладка «Настройки»: главное сверху и понятным языком, редкое спрятано в раскрывающиеся блоки.
(function () {
  const LF = window.LF;
  const { h, icon, clear } = LF;

  const THEMES = [
    ['paldark', 'Palad1n: красно-чёрная', 'linear-gradient(135deg,#0a0a0b,#3a0a10 60%,#e5232e)'],
    ['pal', 'Красно-белая', 'linear-gradient(135deg,#ffffff,#ffd9dc 60%,#e5232e)'],
    ['light', 'Светлая', 'linear-gradient(135deg,#eef1f8,#cfd9f5 60%,#f4d6ea)'],
    ['glass', 'Тёмное стекло', 'linear-gradient(135deg,#0a0e1c,#1d2552 60%,#3b2f7a)'],
    ['amoled', 'AMOLED', 'linear-gradient(135deg,#000,#000 60%,#12121a)'],
    ['neon', 'Неон', 'linear-gradient(135deg,#07030f,#2a0f5c 55%,#00b8d4)'],
  ];
  const ACCENTS = ['#e5232e', '#ff6b3d', '#f2a900', '#1e9b6b', '#2f7bff', '#8b7cff', '#e86bd0', '#222222'];
  const FONTS = [['segoe', 'Обычный'], ['bahn', 'Строгий'], ['serif', 'Книжный'], ['mono', 'Код']];
  const WHEN = [['none', 'Нет сайта', ['none']], ['social', 'Только соцсети', ['social']], ['booking', 'Страница записи', ['booking', 'multilink']], ['builder', 'Конструктор', ['builder']]];

  async function pickImage(file) {
    const url = URL.createObjectURL(file);
    const img = new Image();
    await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
    const k = Math.min(1, 1920 / Math.max(img.width, img.height));
    const c = document.createElement('canvas');
    c.width = Math.round(img.width * k); c.height = Math.round(img.height * k);
    c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
    URL.revokeObjectURL(url);
    return c.toDataURL('image/jpeg', 0.82);
  }

  const group = (title, ...kids) => h('section', { class: 'sgroup glass' }, h('h2', {}, title), ...kids);
  const more = (title, ...kids) => h('details', { class: 'sgroup glass more' }, h('summary', {}, title), h('div', {}, ...kids));

  function slider(label, key, min, max, step, fmt) {
    const out = h('b', {}, fmt(LF.settings[key]));
    const input = h('input', { type: 'range', min, max, step, value: LF.settings[key],
      oninput: (e) => { out.textContent = fmt(Number(e.target.value)); LF.applySettings({ ...LF.settings, [key]: Number(e.target.value) }); },
      onchange: (e) => LF.saveSettings({ [key]: Number(e.target.value) }) });
    return h('label', { class: 'field' }, h('span', {}, label, ' ', out), input);
  }

  const seg = (key, items) => h('div', { class: 'seg' }, items.map(([v, n]) => h('button', { 'aria-pressed': String(LF.settings[key] === v),
    onclick: async (e) => {
      const btn = e.currentTarget; const row = btn.parentElement; // после await currentTarget уже обнулён
      row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn)));
      await LF.saveSettings({ [key]: v });
      if (key === 'bg' && v === 'video' && !LF.bgVideoUrl) { await pickVideo(); }
      if (key === 'bg') render();
    } }, n)));

  async function pickVideo() {
    try {
      const r = await LF.call('bg:video:pick');
      if (r.picked) {
        LF.bgVideoUrl = r.url; await LF.reloadSettings(); LF.applySettings(LF.settings);
        LF.toast(r.big ? 'Видео подключено. Файл большой: если приложение тормозит, возьми ролик полегче.' : 'Видео подключено');
      } else { await LF.reloadSettings(); LF.applySettings(LF.settings); }
    } catch (e) { LF.toast(e.message, 'err'); await LF.reloadSettings(); LF.applySettings(LF.settings); }
    render();
  }

  function look() {
    const s = LF.settings;
    const themeBtns = THEMES.map(([k, name, grad]) => h('button', { class: 'theme', 'aria-pressed': String(s.theme === k),
      onclick: async () => { await LF.saveSettings({ theme: k }); render(); } },
    h('span', { class: 'sw', style: { background: grad } }), h('span', { class: 't' }, name)));
    const dots = ACCENTS.map((c) => h('button', { class: 'sw-dot', style: { background: c }, 'aria-label': 'Цвет ' + c, 'aria-pressed': String(s.accent.toLowerCase() === c),
      onclick: async () => { await LF.saveSettings({ accent: c }); render(); } }));
    const picker = h('input', { type: 'color', value: s.accent, 'aria-label': 'Свой цвет', title: 'Свой цвет', onchange: async (e) => { await LF.saveSettings({ accent: e.target.value }); render(); } });
    const file = h('input', { type: 'file', accept: 'image/*', style: { display: 'none' }, onchange: async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      try { await LF.saveSettings({ bg: 'image', bgImage: await pickImage(f) }); render(); } catch (err) { LF.toast('Не удалось открыть картинку.', 'err'); }
    } });

    return group('Оформление',
      h('div', { class: 'themes' }, themeBtns),
      h('div', { class: 'field' }, h('span', {}, 'Главный цвет'), h('div', { class: 'swatches' }, dots, picker)),
      h('div', { class: 'field' }, h('span', {}, 'Фон'),
        h('div', { class: 'row' }, seg('bg', [['animated', 'Живой'], ['static', 'Неподвижный'], ['image', 'Своя картинка'], ['video', 'Видео']]),
          h('button', { class: 'btn sm', onclick: () => file.click() }, 'Выбрать картинку…'), file)),
      s.bg === 'video' ? h('div', { class: 'sgrid' },
        h('div', { class: 'field' }, h('span', {}, 'Видео'), h('div', { class: 'row' },
          h('button', { class: 'btn sm', onclick: pickVideo }, 'Выбрать другое…'),
          h('button', { class: 'btn sm ghost', onclick: async () => { await LF.call('bg:video:clear'); LF.bgVideoUrl = ''; await LF.reloadSettings(); LF.applySettings(LF.settings); render(); } }, 'Убрать видео'))),
        slider('Затемнение, чтобы текст читался', 'bgDim', 0, 0.9, 0.05, (v) => Math.round(v * 100) + '%'),
        h('div', { class: 'help' }, 'Подойдёт mp4 или webm до 30–60 МБ. Звука нет, ролик идёт по кругу. Когда окно свёрнуто или анимации выключены, видео стоит на паузе.')) : null,
      s.bg === 'image' ? h('div', { class: 'sgrid' }, slider('Яркость картинки', 'bgOpacity', 0.1, 1, 0.05, (v) => Math.round(v * 100) + '%'), slider('Размытие картинки', 'bgBlur', 0, 40, 1, (v) => v + ' px')) : null,
      h('div', { class: 'sgrid' },
        slider('Прозрачность панелей', 'glassK', 0.3, 1.8, 0.05, (v) => Math.round(v * 100) + '%'),
        slider('Скругление углов', 'radius', 4, 28, 1, (v) => v + ' px'),
        slider('Размер текста', 'fontSize', 12, 18, 1, (v) => v + ' px')),
      h('div', { class: 'sgrid' },
        h('div', { class: 'field' }, h('span', {}, 'Шрифт'), seg('font', FONTS)),
        h('div', { class: 'field' }, h('span', {}, 'Плотность'), seg('density', [['compact', 'Плотно'], ['normal', 'Обычно'], ['cozy', 'Свободно']])),
        h('div', { class: 'field' }, h('span', {}, 'Организации показывать'), seg('leadView', [['cards', 'Плитками'], ['rows', 'Списком']])),
        h('div', { class: 'field' }, h('span', {}, 'Подписи у значков слева'), seg('rail', [['labels', 'Есть'], ['icons', 'Нет']]))));
  }

  function motion() {
    const s = LF.settings;
    return group('Анимации и скорость',
      h('div', { class: 'field' }, h('span', {}, 'Анимации'), seg('motion', [['full', 'Полные'], ['calm', 'Спокойные'], ['off', 'Выключены']])),
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.lite, onchange: async (e) => { await LF.saveSettings({ lite: e.target.checked }); } }),
        h('span', {}, 'Для слабого компьютера ', h('span', { class: 'muted' }, '(без фона и анимаций, самый быстрый вариант)'))),
      h('div', { class: 'help' }, 'Когда окно свёрнуто, анимация сама останавливается.'));
  }

  function messaging() {
    const s = LF.settings;
    const limit = (ch, label) => h('label', { class: 'field' }, h('span', {}, label), h('input', { type: 'number', min: 0, max: 200, value: s.dailyLimits[ch],
      onchange: (e) => LF.saveSettings({ dailyLimits: { [ch]: Math.max(0, Number(e.target.value) || 0) } }) }));
    const CH_NAMES = { telegram: 'Telegram', whatsapp: 'WhatsApp', vk: 'ВКонтакте' };
    const order = s.channelOrder.filter((k) => CH_NAMES[k]);
    const saveOrder = async (i, d) => {
      const o = order.slice(); const [x] = o.splice(i, 1); o.splice(i + d, 0, x);
      await LF.saveSettings({ channelOrder: [...o, ...s.channelOrder.filter((k) => !CH_NAMES[k])] }); render();
    };
    return group('Сообщения',
      h('label', { class: 'field' }, h('span', {}, 'Твоё имя: оно подставляется в сообщения'), h('input', { type: 'text', value: s.senderName, placeholder: 'Например: Матвей',
        onchange: (e) => LF.saveSettings({ senderName: e.target.value.trim() }) })),
      h('div', { class: 'field' }, h('span', {}, 'Каким способом писать в первую очередь'),
        h('div', { class: 'row', 'data-testid': 'chorder' }, order.map((k, i) => h('div', { class: 'row', style: { gap: '4px' } },
          h('b', {}, (i + 1) + '.'), CH_NAMES[k],
          h('button', { class: 'btn sm ghost', 'aria-label': 'Раньше', disabled: i === 0, onclick: () => saveOrder(i, -1) }, '◀'),
          h('button', { class: 'btn sm ghost', 'aria-label': 'Позже', disabled: i === order.length - 1, onclick: () => saveOrder(i, 1) }, '▶')))),
        h('div', { class: 'help' }, 'Если у организации есть и Telegram, и WhatsApp, предложим первый по этому порядку. Когда его дневной лимит кончился, предложим следующий.')),
      h('div', { class: 'field' }, h('span', {}, 'Аккаунты и вход в мессенджеры'),
        h('div', {}, h('button', { class: 'btn', onclick: () => LF.go('inbox') }, icon('chat', 'sm'), 'Открыть вкладку «Входящие»'))),
      h('div', { class: 'sgrid' }, limit('telegram', 'Telegram: в день на один аккаунт'), limit('whatsapp', 'WhatsApp: в день на один аккаунт'), limit('vk', 'ВКонтакте: в день на один аккаунт')),
      h('div', { class: 'help' }, 'Приложение само ничего не отправляет: оно открывает чат и подставляет текст, а отправляешь ты. Лимиты осторожные: если писать слишком много незнакомым, аккаунт могут заблокировать.'));
  }


  /* ---------- нейросеть для текстов ---------- */
  const STATUS_TEXT = { ok: 'Работает', wait: 'Ждёт', badkey: 'Ключ не принят', off: 'Выключен' };
  const hhmm = (iso) => { try { return new Date(iso).toLocaleString('ru-RU', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' }); } catch (e) { return ''; } };

  function aiGroup() {
    const box = h('section', { class: 'sgroup glass', id: 'aigroup' });
    const st = { data: null, providers: null, adding: false, provider: 'gigachat', busy: '' };

    async function refresh() {
      try { [st.data, st.providers] = await Promise.all([LF.call('ai:status'), LF.call('ai:providers')]); } catch (e) { LF.toast(e.message, 'err'); return; }
      paint();
    }

    async function act(id, label, fn) {
      st.busy = id; paint();
      try { await fn(); } catch (e) { LF.toast(e.message, 'err'); }
      st.busy = ''; await refresh();
    }

    function keyRow(k, i, all) {
      const wait = k.status === 'wait' ? ' до ' + hhmm(k.waitUntil) : '';
      const row = h('div', { class: 'aikey', draggable: 'true', 'data-id': k.id },
        h('span', { class: 'grip', title: 'Перетащи, чтобы поменять порядок' }, '⋮⋮'),
        h('b', { class: 'num' }, String(i + 1)),
        h('div', { class: 'grow' },
          h('div', { class: 'ttl' }, k.label, ' ', h('span', { class: 'muted' }, k.providerName + ' · ' + (k.model || 'модель по умолчанию') + ' · ' + k.hint)),
          h('div', { class: 'muted' }, 'Сегодня запросов: ' + k.usedToday + (k.lastError && k.status !== 'ok' ? ' · ' + k.lastError : ''))),
        h('span', { class: 'chip2 ' + k.status }, STATUS_TEXT[k.status] + wait),
        h('div', { class: 'row', style: { gap: '6px', flexWrap: 'nowrap' } },
          h('button', { class: 'btn sm ghost', 'aria-label': 'Выше', disabled: i === 0, onclick: () => act(k.id, 'up', () => LF.call('ai:reorder', move(all, i, -1))) }, '▲'),
          h('button', { class: 'btn sm ghost', 'aria-label': 'Ниже', disabled: i === all.length - 1, onclick: () => act(k.id, 'down', () => LF.call('ai:reorder', move(all, i, 1))) }, '▼'),
          h('button', { class: 'btn sm', disabled: st.busy === k.id, onclick: () => act(k.id, 'test', async () => {
            const r = await LF.call('ai:test', k.id);
            LF.toast(r.ok ? 'Ключ работает.' : r.error, r.ok ? 'ok' : 'err');
          }) }, st.busy === k.id ? 'Проверяю…' : 'Проверить'),
          h('button', { class: 'btn sm ghost', onclick: () => act(k.id, 'sw', () => LF.call('ai:update', { id: k.id, patch: { enabled: k.status === 'off' } })) }, k.status === 'off' ? 'Включить' : 'Выключить'),
          h('button', { class: 'btn sm ghost danger', 'aria-label': 'Удалить ключ', title: 'Удалить ключ', onclick: () => act(k.id, 'rm', () => LF.call('ai:remove', k.id)) }, icon('trash', 'sm'))));
      row.addEventListener('dragstart', (e) => { e.dataTransfer.setData('text/plain', k.id); e.dataTransfer.effectAllowed = 'move'; row.classList.add('dragging'); });
      row.addEventListener('dragend', () => row.classList.remove('dragging'));
      row.addEventListener('dragover', (e) => { e.preventDefault(); row.classList.add('over'); });
      row.addEventListener('dragleave', () => row.classList.remove('over'));
      row.addEventListener('drop', (e) => {
        e.preventDefault(); row.classList.remove('over');
        const from = e.dataTransfer.getData('text/plain');
        const ids = all.map((x) => x.id).filter((x) => x !== from);
        ids.splice(ids.indexOf(k.id), 0, from);
        act(from, 'drag', () => LF.call('ai:reorder', ids));
      });
      return row;
    }
    const move = (all, i, d) => { const ids = all.map((x) => x.id); const [x] = ids.splice(i, 1); ids.splice(i + d, 0, x); return ids; };

    function addForm() {
      const p = st.providers.providers.find((x) => x.id === st.provider) || st.providers.providers[0];
      const key = h('input', { type: 'password', autocomplete: 'off', spellcheck: 'false', placeholder: 'Вставь ключ сюда', 'aria-label': 'Ключ' });
      const label = h('input', { type: 'text', placeholder: p.name, 'aria-label': 'Название' });
      const model = h('input', { type: 'text', placeholder: p.model || 'название модели', 'aria-label': 'Модель' });
      const base = p.custom ? h('input', { type: 'text', placeholder: 'https://api.example.com/v1', 'aria-label': 'Адрес сервиса' }) : null;
      const submit = h('button', { class: 'btn primary', onclick: async () => {
        submit.disabled = true;
        try {
          const v = await LF.call('ai:add', { provider: p.id, key: key.value, label: label.value, model: model.value, baseUrl: base ? base.value : '' });
          key.value = '';
          const r = await LF.call('ai:test', v.id);
          LF.toast(r.ok ? 'Ключ добавлен и работает.' : 'Ключ добавлен, но проверка не прошла: ' + r.error, r.ok ? 'ok' : 'err');
          st.adding = false;
        } catch (e) { LF.toast(e.message, 'err'); }
        await refresh();
      } }, icon('plus', 'sm'), 'Добавить и проверить');
      return h('div', { class: 'aiadd' },
        h('div', { class: 'field' }, h('span', {}, '1. Выбери сервис'),
          h('div', { class: 'seg' }, st.providers.providers.map((x) => h('button', { 'aria-pressed': String(x.id === p.id), onclick: () => { st.provider = x.id; paint(); } }, x.name)))),
        h('div', { class: 'help' }, p.region),
        h('div', { class: 'field' }, h('span', {}, '2. Как получить ключ'),
          h('ol', { class: 'steps' }, p.steps.map((t) => h('li', {}, t))),
          p.keyUrl ? h('div', {}, h('a', { class: 'btn sm', href: p.keyUrl, target: '_blank', rel: 'noopener noreferrer' }, icon('ext', 'sm'), 'Открыть страницу ключей')) : null),
        p.certHelp ? h('div', { class: 'notice' }, p.certHelp, ' ', h('button', { class: 'btn sm', onclick: () => LF.call('ai:certs').catch((e) => LF.toast(e.message, 'err')) }, 'Открыть папку сертификатов')) : null,
        h('div', { class: 'field' }, h('span', {}, '3. Вставь ключ'), key),
        h('div', { class: 'sgrid' },
          base ? h('label', { class: 'field' }, h('span', {}, 'Адрес сервиса'), base) : null,
          h('label', { class: 'field' }, h('span', {}, p.custom ? 'Модель' : 'Модель (можно не менять)'), model),
          h('label', { class: 'field' }, h('span', {}, 'Название ключа (для себя)'), label)),
        h('div', { class: 'row' }, submit, h('button', { class: 'btn ghost', onclick: () => { st.adding = false; paint(); } }, 'Отмена')));
    }

    function paint() {
      clear(box);
      if (!st.data) { box.append(h('h2', {}, 'Нейросеть для текстов'), h('div', { class: 'help' }, 'Загружаю…')); return; }
      const s = LF.settings.ai || { enabled: true, tone: 'friendly' };
      const d = st.data;
      box.append(...[
        h('h2', {}, 'Нейросеть для текстов'),
        h('div', { class: 'help' }, 'Нейросеть переписывает шаблон под конкретную организацию. Бесплатных ключей можно добавить несколько: если у одного кончится лимит, приложение само возьмёт следующий. Когда не останется ни одного, тексты будут из шаблонов, а нейросеть вернётся сама, как только лимит обновится.'),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.enabled, onchange: async (e) => { await LF.saveSettings({ ai: { enabled: e.target.checked } }); } }), 'Писать тексты нейросетью'),
        h('div', { class: 'field' }, h('span', {}, 'Тон'), h('div', { class: 'seg' }, [['friendly', 'Тёплый'], ['business', 'Деловой'], ['short', 'Коротко']].map(([v, n]) =>
          h('button', { 'aria-pressed': String(s.tone === v), onclick: async (e) => { const btn = e.currentTarget; const row = btn.parentElement; row.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === btn))); await LF.saveSettings({ ai: { tone: v } }); } }, n)))),
        !d.canStoreKeys ? h('div', { class: 'notice err' }, 'На этом компьютере недоступно шифрование Windows, поэтому ключи сохранять нельзя. Это защита: открытым текстом ключи не хранятся.') : null,
        d.keys.length ? h('div', { class: 'aikeys' }, d.keys.map((k, i) => keyRow(k, i, d.keys))) : h('div', { class: 'empty2' }, 'Ключей пока нет. Тексты берутся из шаблонов.'),
        d.keys.length > 1 ? h('div', { class: 'help' }, 'Порядок важен: сверху ключ, который пробуется первым. Перетащи строку или нажми стрелки.') : null,
        st.adding ? addForm() : h('div', {}, h('button', { class: 'btn', disabled: !d.canStoreKeys, onclick: () => { st.adding = true; paint(); } }, icon('plus', 'sm'), 'Добавить ключ нейросети')),
        h('div', { class: 'help' }, 'Ключи шифруются средствами Windows и нигде не записываются в журналы. Список сервисов лежит в файле providers.json (версия ' + st.providers.version + '), его можно заменить на новый.')].filter(Boolean));
    }

    paint();
    refresh();
    LF.on('ai:state', () => { if (box.isConnected) refresh(); });
    return box;
  }

  function templates() {
    const s = LF.settings;
    const save = (list) => LF.saveSettings({ templates: list });
    const edit = (i, patch) => save(s.templates.map((t, j) => (j === i ? { ...t, ...patch } : t)));
    return more('Тексты сообщений',
      h('div', { class: 'help' }, 'В текст подставляются: {name} — название, {district} — район, {niche} — чем занимается, {me} — твоё имя. Нужный текст выбирается сам: по тому, какой у бизнеса сайт, и по его рубрике.'),
      s.templates.map((t, i) => h('div', { class: 'tpl' },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('input', { type: 'text', value: t.name, 'aria-label': 'Название', onchange: (e) => edit(i, { name: e.target.value }) })),
          h('button', { class: 'btn sm ghost danger', 'aria-label': 'Удалить', title: 'Удалить этот текст', onclick: async () => { await save(s.templates.filter((_, j) => j !== i)); render(true); } }, icon('trash', 'sm'))),
        h('div', { class: 'help' }, 'Подходит, если у бизнеса:'),
        h('div', { class: 'row' }, WHEN.map(([k, label, set]) => h('label', { class: 'switch muted' },
          h('input', { type: 'checkbox', checked: (t.when || []).includes(set[0]), onchange: (e) => {
            const w = new Set(t.when || []);
            set.forEach((x) => (e.target.checked ? w.add(x) : w.delete(x)));
            t.when = [...w]; edit(i, { when: t.when });
          } }), label))),
        h('label', { class: 'field' }, h('span', {}, 'Только для таких рубрик (слова через «|», пусто — для всех)'),
          h('input', { type: 'text', value: t.niche || '', placeholder: 'барбер|парикмах', onchange: (e) => edit(i, { niche: e.target.value.trim() }) })),
        h('textarea', { rows: 4, 'aria-label': 'Текст', onchange: (e) => edit(i, { text: e.target.value }) }, t.text))),
      h('div', {}, h('button', { class: 'btn', onclick: async () => {
        await save([...s.templates, { id: 't' + Date.now(), name: 'Новый текст', niche: '', when: ['none', 'social'], text: 'Здравствуйте! Меня зовут {me}. ' }]); render(true);
      } }, icon('plus', 'sm'), 'Добавить текст')));
  }


  function offerSettings() {
    const o = LF.settings.offer;
    const save = (patch) => LF.saveSettings({ offer: { ...LF.settings.offer, ...patch } });
    const editPkg = (i, patch) => save({ packages: LF.settings.offer.packages.map((p, j) => (j === i ? { ...p, ...patch } : p)) });
    const lines = (v) => String(v).split('\n').map((x) => x.trim()).filter(Boolean);
    return more('Коммерческое предложение',
      !o.pricesConfirmed ? h('div', { class: 'notice' }, 'Цены и сроки ниже — только примеры, они взяты с потолка. Поставь свои, потом включи «Цены мои».') : null,
      h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: o.pricesConfirmed, onchange: async (e) => { await save({ pricesConfirmed: e.target.checked }); render(); } }), 'Цены мои, можно отправлять клиентам'),
      h('label', { class: 'field' }, h('span', {}, 'Твои контакты в предложении (каждый с новой строки)'), h('textarea', { rows: 3, placeholder: 'Telegram: @name\n+7 999 000-00-00', onchange: (e) => save({ contacts: e.target.value }) }, o.contacts)),
      h('div', { class: 'sgrid' },
        h('label', { class: 'field' }, h('span', {}, 'Сколько дней предложение действует'), h('input', { type: 'number', min: 1, max: 90, value: o.validDays, onchange: (e) => save({ validDays: Number(e.target.value) }) })),
        h('label', { class: 'field' }, h('span', {}, 'Цвет предложения'), h('input', { type: 'color', value: o.accent, onchange: (e) => save({ accent: e.target.value }) }))),
      o.packages.map((p, i) => h('div', { class: 'tpl' },
        h('div', { class: 'row' },
          h('div', { class: 'grow' }, h('input', { type: 'text', value: p.name, 'aria-label': 'Название варианта', onchange: (e) => editPkg(i, { name: e.target.value }) })),
          h('button', { class: 'btn sm ghost danger', 'aria-label': 'Удалить вариант', title: 'Удалить вариант', onclick: async () => { await save({ packages: o.packages.filter((_, j) => j !== i) }); render(); } }, icon('trash', 'sm'))),
        h('div', { class: 'sgrid' },
          h('label', { class: 'field' }, h('span', {}, 'Цена (как написать)'), h('input', { type: 'text', value: p.price, placeholder: 'от 20 000 ₽', onchange: (e) => editPkg(i, { price: e.target.value }) })),
          h('label', { class: 'field' }, h('span', {}, 'Срок'), h('input', { type: 'text', value: p.term, placeholder: '5–7 дней', onchange: (e) => editPkg(i, { term: e.target.value }) }))),
        h('label', { class: 'field' }, h('span', {}, 'Что входит (каждый пункт с новой строки)'), h('textarea', { rows: 4, onchange: (e) => editPkg(i, { items: lines(e.target.value) }) }, p.items.join('\n'))))),
      h('div', {}, h('button', { class: 'btn', disabled: o.packages.length >= 6, onclick: async () => { await save({ packages: [...o.packages, { id: 'p' + Date.now().toString(36), name: 'Новый вариант', price: '', term: '', items: [] }] }); render(); } }, icon('plus', 'sm'), 'Добавить вариант')),
      h('label', { class: 'field' }, h('span', {}, 'Как вы работаете (шаги, каждый с новой строки)'), h('textarea', { rows: 4, onchange: (e) => save({ steps: lines(e.target.value) }) }, o.steps.join('\n'))),
      h('label', { class: 'field' }, h('span', {}, 'Примечание внизу'), h('input', { type: 'text', value: o.note, onchange: (e) => save({ note: e.target.value }) })));
  }

  function network() {
    const s = LF.settings;
    const out = h('div', { class: 'netout' });
    const run = async (btn) => {
      btn.disabled = true; clear(out).append(h('div', { class: 'muted' }, 'Проверяю доступ к 2ГИС, до 40 секунд…'));
      try {
        const r = await LF.call('net:check');
        const rows = Object.entries(r.results).map(([host, x]) => h('div', { class: 'netrow ' + (x.ok ? 'ok' : 'bad') }, h('b', {}, host), x.ok ? ` открылся за ${(x.ms / 1000).toFixed(1)} с` : ` не открылся: ${x.code}`));
        const any = Object.values(r.results).some((x) => x.ok);
        clear(out).append(...rows, h('div', { class: 'help' }, 'Путь выхода в сеть: ' + (r.customProxy ? 'свой прокси' : (r.proxy && r.proxy !== 'DIRECT' ? 'системный прокси Windows (' + r.proxy + ')' : 'напрямую'))),
          h('div', { class: 'notice ' + (any ? 'ok' : 'err') }, any ? 'Доступ есть. Если поиск всё равно не идёт, нажми в Парсере «Проверить окно 2ГИС»: возможно, 2ГИС просит пройти проверку.'
            : 'Из окна приложения 2ГИС недоступен. Отключи VPN-расширения браузера и сторонние VPN, проверь антивирус и файрвол, дату и время на компьютере. Если в браузере сайт открывается, а здесь нет, укажи прокси так же, как в браузере.'));
      } catch (e) { clear(out).append(h('div', { class: 'notice err' }, e.message)); }
      btn.disabled = false;
    };
    return group('Соединение с 2ГИС',
      h('div', { class: 'row' }, h('button', { class: 'btn', onclick: (e) => run(e.currentTarget) }, icon('reload', 'sm'), 'Проверить соединение с 2ГИС')),
      out,
      h('label', { class: 'field' }, h('span', {}, 'Свой прокси (необязательно)'), h('input', { type: 'text', placeholder: 'например 127.0.0.1:8080 или socks5://host:1080', value: s.netProxy || '', spellcheck: 'false',
        onchange: async (e) => { await LF.saveSettings({ netProxy: e.target.value }); e.target.value = LF.settings.netProxy; LF.toast(LF.settings.netProxy ? 'Прокси сохранён' : 'Прокси отключён'); } })),
      h('div', { class: 'help' }, 'Прокси касается только окна поиска в 2ГИС, не чатов. Если оставить пустым, используются настройки Windows.'));
  }

  function advanced() {
    const s = LF.settings;
    return more('Дополнительно',
      h('div', { class: 'sgrid' },
        h('label', { class: 'field' }, h('span', {}, 'Сетью считать организацию от скольких филиалов'), h('input', { type: 'number', min: 2, max: 50, value: s.chainThreshold,
          onchange: async (e) => { await LF.saveSettings({ chainThreshold: Number(e.target.value) }); LF.changed(); } })),
        h('label', { class: 'switch' }, h('input', { type: 'checkbox', checked: s.excludeChains, onchange: async (e) => { await LF.saveSettings({ excludeChains: e.target.checked }); LF.changed(); } }), 'Скрывать сети и франшизы')),
      h('div', { class: 'notice' }, 'Данные берутся из публичных страниц 2ГИС на твоём компьютере. Перед публичной раздачей приложения и первыми продажами прочитай условия использования 2ГИС: они могут ограничивать такой сбор.'),
      h('div', { class: 'help' }, 'Palad1n 2.1. База и настройки хранятся только на этом компьютере.'));
  }

  let host = null;
  function render(keepTpl) {
    if (!host) return;
    const view = document.getElementById('view');
    const top = view ? view.scrollTop : 0;
    // перерисовка не должна закрывать блоки, которые пользователь раскрыл
    const opened = new Set([...host.querySelectorAll('details.more[open] > summary')].map((x) => x.textContent));
    if (keepTpl) opened.add('Тексты сообщений');
    clear(host).append(h('div', { class: 'settings' }, look(), motion(), messaging(), aiGroup(), templates(), offerSettings(), network(), advanced()));
    host.querySelectorAll('details.more').forEach((d) => { if (opened.has(d.firstChild.textContent)) d.setAttribute('open', ''); });
    if (view) view.scrollTop = top;
  }

  LF.views = LF.views || {};
  LF.views.settings = (root) => { host = root; render(); };
  LF.views.settings.unmount = () => { host = null; };
  LF.views.settings.refresh = () => {};
})();

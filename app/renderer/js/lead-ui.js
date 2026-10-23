'use strict';
// Общие кусочки интерфейса лида: плашки, каналы, оценка, карточка, боковая панель.
(function () {
  const LF = window.LF;
  const { h, icon } = LF;

  LF.changed = () => document.dispatchEvent(new CustomEvent('lf:changed'));

  LF.plate = (lead) => {
    const c = LF.SITE_CLASSES[lead.site_class] || LF.SITE_CLASSES.own;
    return h('span', { class: 'plate ' + c.tier, title: c.hint || '' }, c.label);
  };

  LF.scoreRing = (lead) => h('div', { class: 'score ' + lead.tier, style: { '--p': lead.score },
    title: 'Оценка от 0 до 100: чем выше, тем проще продать сайт этому бизнесу (мало конкурентов-сетей, есть отзывы и контакты).' }, h('span', {}, lead.score));

  const CH_NAMES = { telegram: 'Telegram', whatsapp: 'WhatsApp', vk: 'ВК', max: 'Max', phone: 'Телефон' };
  /** Показываем только те способы связи, которые есть. Лучший идёт первым. */
  LF.channels = (lead) => {
    const has = {
      telegram: !!(lead.telegram || lead.telegram_phone), whatsapp: !!lead.whatsapp, vk: !!lead.vk, max: !!lead.max, phone: (lead.phones || []).length > 0,
    };
    const list = Object.keys(CH_NAMES).filter((k) => has[k]).sort((a, b) => (b === lead.channel) - (a === lead.channel));
    if (!list.length) return h('div', { class: 'chs' }, h('span', { class: 'ch none' }, 'Нет контактов'));
    return h('div', { class: 'chs' }, list.map((k) => h('span', { class: 'ch ' + k, title: k === lead.channel ? 'Лучший способ связаться' : '' }, CH_NAMES[k])));
  };

  LF.rating = (lead) => h('span', { class: 'rate' }, lead.rating ? [h('i', {}, '★ '), lead.rating.toFixed(1)] : '—',
    h('span', { class: 'muted' }, ' · ' + (lead.reviews || 0) + ' отзывов'));

  LF.leadCard = (lead, opts = {}) => {
    const el = h('article', { class: 'lead glass ' + lead.tier + (opts.enter ? ' enter' : ''), tabindex: 0, role: 'button', onclick: () => LF.openLead(lead.id),
      onkeydown: (e) => { if (e.key === 'Enter') LF.openLead(lead.id); } },
    h('div', { class: 'head' },
      h('div', { class: 'grow' }, h('h3', {}, lead.short_name || lead.name),
        h('div', { class: 'sub' }, [lead.rubric, (lead.district || '').replace(/\s*район$/i, '')].filter(Boolean).join(' · '))),
      LF.scoreRing(lead)),
    h('div', { class: 'sub' }, lead.address),
    h('div', { class: 'meta' }, LF.plate(lead), LF.rating(lead),
      lead.status !== 'new' ? h('span', { class: 'src' }, LF.statusName(lead.status)) : null),
    LF.channels(lead));
    if (opts.enter) el.style.setProperty('--i', String(Math.min(opts.i || 0, 14)));
    return el;
  };

  /** Написать лиду во встроенном чате с готовым текстом. */
  LF.writeTo = async (lead) => {
    try {
      const r = await LF.call('queue:render', { leadId: lead.id });
      const ok = await LF.chat.open({ leadId: lead.id, text: r.text, title: lead.short_name || lead.name });
      if (ok) LF.closeLead();
    } catch (e) { LF.toast(e.message, 'err'); }
  };

  /* ---------- боковая панель лида ---------- */
  const drawer = () => document.getElementById('drawer');
  const scrim = () => document.getElementById('scrim');

  LF.closeLead = () => { drawer().classList.remove('on'); scrim().classList.remove('on'); };

  LF.openLead = async (id) => {
    let lead;
    try { lead = await LF.call('leads:get', id); } catch (e) { return LF.toast(e.message, 'err'); }
    if (!lead) return LF.toast('Лид не найден.', 'err');
    const d = LF.clear(drawer());

    const phoneEls = (lead.phones || []).map((p) => h('div', {}, h('span', { class: 'copyable', title: 'Нажми, чтобы скопировать', onclick: () => LF.copy(p, 'Номер скопирован') }, LF.fmtPhone(p))));
    const statusSel = h('select', { onchange: async (e) => {
      try { await LF.call('leads:setStatus', { id: lead.id, status: e.target.value }); LF.toast('Этап: ' + LF.statusName(e.target.value)); LF.changed(); } catch (err) { LF.toast(err.message, 'err'); }
    } }, LF.STATUSES.map(([k, n]) => h('option', { value: k, selected: k === lead.status }, n)));
    const notes = h('textarea', { rows: 4, placeholder: 'Что обсуждали, когда написать снова…' }, lead.notes || '');
    notes.addEventListener('blur', async () => {
      try { await LF.call('leads:update', { id: lead.id, patch: { notes: notes.value } }); } catch (err) { LF.toast(err.message, 'err'); }
    });
    const canChat = ['telegram', 'whatsapp', 'vk'].includes(lead.channel);

    d.append(
      h('div', { class: 'dh' },
        h('div', { class: 'row' }, LF.plate(lead), h('span', { class: 'src' }, LF.statusName(lead.status)),
          h('button', { class: 'btn ghost sm', style: { marginLeft: 'auto' }, 'aria-label': 'Закрыть', onclick: LF.closeLead }, icon('x', 'sm'))),
        h('h2', {}, lead.name),
        h('div', { class: 'muted' }, [lead.rubric, lead.district].filter(Boolean).join(' · '))),
      h('div', { class: 'db' },
        h('div', { class: 'row' }, LF.scoreRing(lead), LF.rating(lead)),
        LF.channels(lead),
        h('dl', { class: 'kv' },
          h('dt', {}, 'Адрес'), h('dd', {}, lead.address || '—'),
          h('dt', {}, 'Телефон'), h('dd', {}, phoneEls.length ? phoneEls : '—'),
          (lead.emails || []).length ? [h('dt', {}, 'Почта'), h('dd', {}, lead.emails.join(', '))] : null,
          h('dt', {}, 'Сайт'), h('dd', {}, lead.own_domain || (lead.site_class === 'none' ? 'нет' : (LF.SITE_CLASSES[lead.site_class] || {}).hint || '—'))),
        h('div', { class: 'row' },
          canChat ? h('button', { class: 'btn primary', onclick: () => LF.writeTo(lead) }, icon('chat', 'sm'), 'Написать') : null,
          h('button', { class: 'btn', title: 'Сделать пример сайта для этой организации', onclick: () => LF.siteFor(lead.id) }, icon('site', 'sm'), 'Сайт'),
          h('button', { class: 'btn danger', title: 'Скрыть этого человека и его номера: он больше нигде не появится', onclick: async () => {
            try { await LF.call('leads:blacklist', { id: lead.id }); LF.toast('Больше не покажется'); LF.closeLead(); LF.changed(); } catch (err) { LF.toast(err.message, 'err'); }
          } }, icon('ban', 'sm'), 'Не писать')),
        h('label', { class: 'field' }, h('span', {}, 'Этап'), statusSel),
        h('label', { class: 'field' }, h('span', {}, 'Заметки'), notes),
        h('a', { class: 'linkbtn', href: `https://2gis.ru/${lead.city}/firm/${lead.id}`, target: '_blank', rel: 'noopener' }, 'Открыть в 2ГИС')));
    d.classList.add('on');
    scrim().classList.add('on');
  };

  scrim().addEventListener('click', LF.closeLead);
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') LF.closeLead(); });
})();

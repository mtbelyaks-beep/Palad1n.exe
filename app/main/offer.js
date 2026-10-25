'use strict';
/**
 * Коммерческое предложение: одна страница A4 в HTML, которая печатается в PDF.
 * Цены, сроки и состав пакетов берутся из настроек пользователя. Приложение их не придумывает:
 * в стартовом наборе стоят примеры, и пока пользователь не подтвердил цены, в интерфейсе об этом предупреждение.
 */
const { esc, facts, nicheById, detectNiche } = require('./sitegen');

const DEFAULT_OFFER = {
  contacts: '',
  validDays: 14,
  accent: '#1f3a5f',
  pricesConfirmed: false,
  packages: [
    { id: 'card', name: 'Сайт-визитка', price: 'от 15 000 ₽', term: '5–7 дней', items: ['Одна страница: услуги, о вас, контакты, карта', 'Адаптивная вёрстка: удобно с телефона', 'Кнопки звонка и мессенджеров', 'Подключение домена и размещение'] },
    { id: 'booking', name: 'Сайт с заявками', price: 'от 25 000 ₽', term: '7–10 дней', items: ['Всё из «Сайта-визитки»', 'Форма заявки с уведомлением вам в Telegram', 'Блок с отзывами и фото', 'Рекомендации по оформлению карточки в 2ГИС'] },
    { id: 'bot', name: 'Telegram-бот', price: 'от 12 000 ₽', term: '5–7 дней', items: ['Заявки или запись через Telegram', 'Уведомления вам и клиенту', 'Ответы на частые вопросы'] },
  ],
  steps: ['Вы выбираете вариант и присылаете фото, список услуг и цены', 'Я готовлю макет, вы смотрите и говорите, что поправить', 'Вношу правки и запускаю сайт на вашем домене', 'Передаю доступы и показываю, как всё менять самим'],
  note: 'Предоплата и точный срок согласуются после выбора варианта.',
};

const clip = (v, n) => String(v == null ? '' : v).replace(/[\t\r]+/g, ' ').trim().slice(0, n);

/** Приводит настройки предложения к безопасному виду (длины, количество, цвет). */
function normalizeOffer(o) {
  const src = o && typeof o === 'object' ? o : {};
  const pk = Array.isArray(src.packages) ? src.packages : DEFAULT_OFFER.packages;
  const seen = new Set();
  const packages = pk.slice(0, 6).map((p, i) => {
    let id = clip(p && p.id, 20).replace(/[^\w-]/g, '') || 'p' + (i + 1);
    while (seen.has(id)) id += 'x';
    seen.add(id);
    return {
      id, name: clip(p && p.name, 60) || 'Вариант ' + (i + 1), price: clip(p && p.price, 40), term: clip(p && p.term, 40),
      items: (Array.isArray(p && p.items) ? p.items : []).slice(0, 10).map((x) => clip(x, 140)).filter(Boolean),
    };
  });
  return {
    contacts: String(src.contacts || '').slice(0, 300),
    validDays: Math.max(1, Math.min(90, Math.round(Number(src.validDays)) || DEFAULT_OFFER.validDays)),
    accent: /^#[0-9a-f]{6}$/i.test(src.accent || '') ? src.accent : DEFAULT_OFFER.accent,
    pricesConfirmed: !!src.pricesConfirmed,
    packages,
    steps: (Array.isArray(src.steps) ? src.steps : DEFAULT_OFFER.steps).slice(0, 8).map((x) => clip(x, 160)).filter(Boolean),
    note: clip(src.note, 300),
  };
}

const SITE_LINE = {
  none: 'сайт не указан',
  social: 'вместо сайта указаны только страницы в соцсетях',
  booking: 'вместо сайта указана только страница онлайн-записи',
  multilink: 'вместо сайта указана страница со списком ссылок',
  builder: 'сайт сделан на конструкторе',
};

const dateRu = (d) => d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' });

/**
 * HTML предложения. packageIds — какие варианты показать (по умолчанию все).
 * sender: имя отправителя из настроек.
 */
function renderOffer(lead, offerSettings, { packageIds, sender, now } = {}) {
  const o = normalizeOffer(offerSettings);
  const f = facts(lead);
  const nowD = now instanceof Date ? now : new Date();
  const chosen = o.packages.filter((p) => !packageIds || packageIds.includes(p.id));
  const niche = nicheById(detectNiche(lead.rubric));
  const why = SITE_LINE[lead.site_class] || 'у вашей организации нет полноценного сайта';
  const until = new Date(nowD.getTime() + o.validDays * 864e5);
  const contactLines = String(o.contacts || '').split('\n').map((x) => x.trim()).filter(Boolean).slice(0, 5);
  const css = `@page{size:A4;margin:16mm}*{box-sizing:border-box}body{margin:0;font:13px/1.55 "Segoe UI",system-ui,Arial,sans-serif;color:#1c2430}
h1{font-size:25px;line-height:1.2;margin:0 0 6px;color:${o.accent}}h2{font-size:15px;margin:22px 0 8px;color:${o.accent};text-transform:uppercase;letter-spacing:.04em}
.top{display:flex;justify-content:space-between;align-items:flex-start;gap:20px;border-bottom:3px solid ${o.accent};padding-bottom:12px;margin-bottom:18px}
.who{font-weight:700;font-size:15px}.muted{color:#5f6b7a}.right{text-align:right;font-size:12px}
.pk{display:grid;grid-template-columns:repeat(${Math.min(Math.max(chosen.length, 1), 3)},1fr);gap:12px;margin-top:6px}
.card{border:1px solid #cfd6e0;border-top:4px solid ${o.accent};border-radius:6px;padding:12px 14px;break-inside:avoid}
.card h3{margin:0 0 4px;font-size:15px}.price{font-size:18px;font-weight:700;color:${o.accent}}.term{font-size:12px;color:#5f6b7a;margin-bottom:8px}
.card ul{margin:0;padding-left:16px}.card li{margin:2px 0}
ol{margin:0;padding-left:18px}ol li{margin:3px 0}
.foot{margin-top:22px;padding-top:12px;border-top:1px solid #cfd6e0;display:flex;justify-content:space-between;gap:20px;font-size:12px}
.note{margin-top:10px;font-size:12px;color:#5f6b7a}`;
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>Предложение для ${esc(f.name)}</title><style>${css}</style></head><body>
<div class="top"><div><div class="who">${esc(sender || 'Веб-разработчик')}</div>${contactLines.length ? `<div class="muted">${contactLines.map(esc).join('<br>')}</div>` : ''}</div>
<div class="right"><div>Коммерческое предложение</div><div class="muted">${esc(dateRu(nowD))}</div></div></div>
<h1>Сайт для «${esc(f.name)}»</h1>
<div class="muted">${esc([f.rubric, f.district].filter(Boolean).join(', '))}</div>
<h2>Почему пишу</h2>
<p>Я посмотрел карточку «${esc(f.name)}» в 2ГИС: ${esc(why)}. ${esc(niche.id === 'generic' ? 'Люди, которые ищут такие услуги рядом, сначала смотрят сайт или карточку, и по ним решают, звонить или нет.' : `Людям, которые ищут «${niche.label.toLowerCase()}» рядом, важно быстро увидеть услуги, адрес и записаться. Сайт помогает этому и работает за вас круглосуточно.`)}</p>
<h2>Что я предлагаю</h2>
${chosen.length ? `<div class="pk">${chosen.map((p) => `<div class="card"><h3>${esc(p.name)}</h3><div class="price">${esc(p.price || 'по договорённости')}</div>${p.term ? `<div class="term">Срок: ${esc(p.term)}</div>` : '<div class="term"></div>'}${p.items.length ? `<ul>${p.items.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}</div>`).join('')}</div>` : '<p class="muted">Варианты не выбраны.</p>'}
${o.steps.length ? `<h2>Как мы работаем</h2><ol>${o.steps.map((x) => `<li>${esc(x)}</li>`).join('')}</ol>` : ''}
${o.note ? `<div class="note">${esc(o.note)}</div>` : ''}
<div class="foot"><div>Предложение действует до ${esc(dateRu(until))}.</div><div>${esc(sender || '')}${contactLines[0] ? ', ' + esc(contactLines[0]) : ''}</div></div>
</body></html>`;
}

module.exports = { DEFAULT_OFFER, normalizeOffer, renderOffer };

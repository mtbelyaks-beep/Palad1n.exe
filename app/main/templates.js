'use strict';
/**
 * Шаблоны сообщений и подстановка переменных.
 * Переменные: {name} {district} {niche} {me}
 * Поле niche - ключевые слова через «|» для подбора под рубрику; when - классы сайта, для которых шаблон подходит.
 */

const DEFAULT_TEMPLATES = [
  {
    id: 'nosite', name: 'Нет сайта', niche: '', when: ['none'],
    text: 'Здравствуйте! Меня зовут {me}, я делаю сайты для малого бизнеса. Нашёл «{name}» в 2ГИС, и там нет ссылки на сайт. Могу бесплатно показать пример страницы под вашу нишу ({niche}), без обязательств. Удобно сейчас обсудить?',
  },
  {
    id: 'social', name: 'Только соцсети', niche: '', when: ['social'],
    text: 'Здравствуйте! Меня зовут {me}. Увидел, что у «{name}» в 2ГИС вместо сайта только соцсети. Людям, которые ищут {niche} в районе «{district}», обычно нужно быстро увидеть услуги и цены и записаться. Я делаю лёгкие сайты с формой записи. Прислать пример для вашей ниши?',
  },
  {
    id: 'booking', name: 'Только виджет записи', niche: '', when: ['booking', 'multilink'],
    text: 'Здравствуйте! Меня зовут {me}. У «{name}» в 2ГИС вместо сайта ссылка на запись. Она удобна, но не показывает ваши услуги, фото и цены в одном месте. Я делаю небольшие сайты-визитки, которые работают вместе с вашей записью. Показать пример?',
  },
  {
    id: 'builder', name: 'Сайт на конструкторе', niche: '', when: ['builder'],
    text: 'Здравствуйте! Меня зовут {me}. Посмотрел сайт «{name}»: он на конструкторе. Могу сделать версию на своём домене, которая быстрее открывается и лучше выглядит с телефона. Если интересно, пришлю пример.',
  },
  {
    id: 'barber', name: 'Барбершоп', niche: 'барбер|парикмах|мужск', when: ['none', 'social', 'booking', 'multilink', 'builder'],
    text: 'Здравствуйте! Меня зовут {me}, делаю сайты для барбершопов: услуги, мастера, цены, запись в два касания. Нашёл «{name}» в 2ГИС ({district}). Могу бесплатно показать макет под ваш стиль. Интересно?',
  },
  {
    id: 'auto', name: 'Автосервис', niche: 'авто|шиномонт|сто|кузов|мойк', when: ['none', 'social', 'booking', 'multilink', 'builder'],
    text: 'Здравствуйте! Меня зовут {me}. Люди ищут автосервис рядом и сначала смотрят услуги, цены и как доехать. Нашёл «{name}» в 2ГИС ({district}), а сайта там нет. Делаю такие сайты с заявкой в один клик. Показать пример?',
  },
];

function pickTemplate(lead, templates) {
  const list = templates && templates.length ? templates : DEFAULT_TEMPLATES;
  const rubric = String(lead.rubric || '').toLowerCase();
  let best = null;
  let bestScore = -1;
  for (const t of list) {
    const whenOk = !t.when || !t.when.length || t.when.includes(lead.site_class);
    if (!whenOk) continue;
    let s = 1;
    if (t.niche) {
      const hit = t.niche.split('|').some((k) => k && rubric.includes(k.toLowerCase()));
      if (!hit) continue;
      s += 2;
    }
    if (s > bestScore) { best = t; bestScore = s; }
  }
  return best || list[0];
}

function renderTemplate(text, lead, settings) {
  const vars = {
    name: lead.short_name || lead.name || '',
    district: String(lead.district || '').replace(/\s*район$/i, '') || 'вашем районе',
    niche: String(lead.rubric || 'вашей сфере').toLowerCase(),
    me: (settings && settings.senderName) || '',
  };
  return String(text).replace(/\{(name|district|niche|me)\}/g, (_, k) => vars[k]).replace(/ {2,}/g, ' ').trim();
}

module.exports = { DEFAULT_TEMPLATES, pickTemplate, renderTemplate };

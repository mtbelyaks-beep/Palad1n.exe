'use strict';
/**
 * Классификация сайта и контактов организации. Чистый JS без зависимостей:
 * работает и в Node, и (через new Function) внутри страницы.
 */

const BOOKING = ['yclients.com', 'yclients.ru', 'dikidi.ru', 'dikidi.net', 'alteg.io', 'easyweek.io', 'bookform.ru'];
const MULTILINK = ['taplink.cc', 'taplink.ru', 'linktr.ee', 'lnk.bio', 'hipolink.net', 'bio.site', 'mssg.me', 'bento.me', 'litt.ly', 'linkin.bio'];
const BUILDER = [
  'tilda.ws', 'tilda.cc', 'wixsite.com', 'wix.com', 'ucoz.ru', 'ucoz.com', 'ucoz.net', 'nethouse.ru',
  'jimdofree.com', 'jimdosite.com', 'mystrikingly.com', 'webflow.io', 'carrd.co', 'github.io',
  'godaddysites.com', 'blogspot.com', 'wordpress.com', 'business.site', 'sites.google.com', 'clients.site',
];
const SOCIAL = [
  'vk.com', 'vk.ru', 'vk.cc', 'vkontakte.ru', 't.me', 'telegram.me', 'telegram.org', 'max.ru', 'wa.me', 'whatsapp.com',
  'instagram.com', 'facebook.com', 'youtube.com', 'youtu.be', 'ok.ru', 'tiktok.com', 'twitter.com', 'x.com',
  'viber.com', 'dzen.ru', 'zen.yandex.ru',
];
const DIRECTORY = [
  '2gis.ru', '2gis.com', 'zoon.ru', 'flamp.ru', 'orgpage.ru', 'yell.ru', 'spravker.ru', 'profi.ru', 'avito.ru',
  'yandex.ru', 'ya.ru', 'google.com', 'goo.gl',
];

function hostIn(host, list) {
  return list.some((d) => host === d || host.endsWith('.' + d));
}

/** Достаёт реальный адрес из ссылки 2ГИС-обёртки (link.2gis.ru/...?http://реальный). */
function realUrl(raw) {
  let u = String(raw || '').trim();
  const m = u.match(/link\.2gis\.[a-z]+\/[^?]*\?(https?:\/\/.+)$/i);
  if (m) u = m[1];
  return u;
}

function hostOf(raw) {
  let u = realUrl(raw);
  if (!u) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(u)) u = 'http://' + u;
  try {
    return new URL(u).hostname.toLowerCase().replace(/^www\./, '');
  } catch (e) {
    return '';
  }
}

function normPhone(raw) {
  const d = String(raw || '').replace(/\D/g, '');
  if (d.length === 11 && (d[0] === '7' || d[0] === '8')) return '+7' + d.slice(1);
  if (d.length === 10) return '+7' + d;
  return d ? '+' + d : '';
}

/**
 * @param {Array<{type:string,text?:string,url?:string,value?:string}>} contacts
 * @returns {{siteClass:string,tier:string,ownDomain:string,websites:string[],phones:string[],mobilePhones:string[],
 *           emails:string[],whatsapp:string,telegram:string,telegramPhone:string,vk:string,max:string,hasMessenger:boolean}}
 */
function classifyContacts(contacts) {
  const websites = [];
  const phones = [];
  const emails = [];
  let whatsapp = '';
  let telegram = '';
  let telegramPhone = '';
  let vk = '';
  let max = '';
  const socialHostsSeen = [];

  for (const c of contacts || []) {
    const raw = c.url || c.text || c.value || '';
    if (c.type === 'phone') {
      const p = normPhone(c.value || c.text);
      if (p && !phones.includes(p)) phones.push(p);
    } else if (c.type === 'email') {
      const e = String(c.text || c.value || '').trim().toLowerCase();
      if (e && !emails.includes(e)) emails.push(e);
    } else if (c.type === 'whatsapp') {
      const m = String(raw).match(/wa\.me\/(\d+)/i) || String(c.text).match(/(\d{10,})/);
      if (m && !whatsapp) whatsapp = '+' + m[1];
    } else if (c.type === 'telegram') {
      const m = String(raw).match(/t(?:elegram)?\.me\/(\+?[\w.]+)/i);
      if (m) {
        if (m[1].startsWith('+')) telegramPhone = telegramPhone || normPhone(m[1]);
        else telegram = telegram || m[1];
      }
    } else if (c.type === 'vkontakte') {
      vk = vk || realUrl(raw);
    } else if (c.type === 'max') {
      max = max || realUrl(raw);
    } else if (c.type === 'website') {
      const h = hostOf(raw);
      if (h) {
        websites.push(h);
        if (hostIn(h, SOCIAL)) socialHostsSeen.push(h);
      }
    } else if (['odnoklassniki', 'youtube', 'instagram', 'facebook', 'viber', 'twitter'].includes(c.type)) {
      socialHostsSeen.push(c.type);
    }
  }

  const real = websites.filter((h) => !hostIn(h, SOCIAL) && !hostIn(h, DIRECTORY));
  let siteClass = 'none';
  let ownDomain = '';
  const own = real.find((h) => !hostIn(h, BOOKING) && !hostIn(h, MULTILINK) && !hostIn(h, BUILDER));
  if (own) {
    siteClass = 'own';
    ownDomain = own;
  } else if (real.some((h) => hostIn(h, BUILDER))) {
    siteClass = 'builder';
    ownDomain = real.find((h) => hostIn(h, BUILDER));
  } else if (real.some((h) => hostIn(h, MULTILINK))) {
    siteClass = 'multilink';
  } else if (real.some((h) => hostIn(h, BOOKING))) {
    siteClass = 'booking';
  } else if (vk || max || telegram || whatsapp || telegramPhone || socialHostsSeen.length) {
    siteClass = 'social';
  }

  // hot: лучшие лиды; warm: сайт слабый; cold: есть нормальный сайт
  const tier = siteClass === 'none' || siteClass === 'social' ? 'hot'
    : siteClass === 'own' ? 'cold' : 'warm';

  const mobilePhones = phones.filter((p) => /^\+79\d{9}$/.test(p));
  return {
    siteClass, tier, ownDomain, websites, phones, mobilePhones, emails,
    whatsapp, telegram, telegramPhone, vk, max,
    hasMessenger: !!(whatsapp || telegram || telegramPhone || vk || max),
  };
}

/** Лучший канал связи по порядку предпочтений (порядок задаёт пользователь). */
function pickChannel(cls, order) {
  const prefs = order || ['telegram', 'whatsapp', 'vk', 'telegramPhone', 'phone'];
  for (const ch of prefs) {
    if (ch === 'telegram' && cls.telegram) return { channel: 'telegram', target: 'https://t.me/' + cls.telegram };
    if (ch === 'whatsapp' && cls.whatsapp) return { channel: 'whatsapp', target: 'https://wa.me/' + cls.whatsapp.replace('+', '') };
    if (ch === 'vk' && cls.vk) return { channel: 'vk', target: cls.vk };
    if (ch === 'telegramPhone' && cls.telegramPhone) return { channel: 'telegram', target: 'https://t.me/' + cls.telegramPhone };
    if (ch === 'phone' && cls.phones[0]) return { channel: 'phone', target: cls.phones[0] };
  }
  return { channel: '', target: '' };
}

/**
 * Оценка лида 0-100. Простая и объяснимая: чем больше живой бизнес без нормального сайта,
 * до которого легко достучаться, тем выше. Веса можно менять в настройках.
 */
function scoreLead(rec, cls, opts) {
  const o = Object.assign({ chainThreshold: 4 }, opts || {});
  let s = 0;
  s += cls.tier === 'hot' ? 35 : cls.tier === 'warm' ? 20 : 0;
  s += Math.min(rec.reviews || 0, 100) / 100 * 25;        // живой бизнес с клиентами
  s += rec.rating >= 4.5 ? 15 : rec.rating >= 4 ? 8 : 0;   // репутация
  s += cls.mobilePhones.length ? 10 : cls.phones.length ? 4 : 0;
  s += cls.hasMessenger ? 10 : 0;
  s += (rec.branchCount || 1) < o.chainThreshold ? 5 : -25; // сети и франшизы вряд ли купят
  return Math.max(0, Math.min(100, Math.round(s)));
}

function buildLead(rec, opts) {
  const cls = classifyContacts(rec.contacts);
  const best = pickChannel(cls, opts && opts.channelOrder);
  const isChain = (rec.branchCount || 1) >= ((opts && opts.chainThreshold) || 4);
  return {
    id: rec.id, name: rec.name, shortName: rec.shortName, address: rec.address, district: rec.district,
    lat: rec.lat, lon: rec.lon, rubric: (rec.rubrics || [])[0] || '', rating: rec.rating, reviews: rec.reviews,
    orgId: rec.orgId, branchCount: rec.branchCount, isChain,
    siteClass: cls.siteClass, tier: cls.tier, ownDomain: cls.ownDomain,
    phones: cls.phones, emails: cls.emails, whatsapp: cls.whatsapp, telegram: cls.telegram,
    telegramPhone: cls.telegramPhone, vk: cls.vk, max: cls.max,
    channel: best.channel, channelTarget: best.target,
    score: scoreLead(rec, cls, opts), updatedAt: rec.updatedAt,
  };
}

module.exports = { classifyContacts, pickChannel, scoreLead, buildLead, hostOf, normPhone };

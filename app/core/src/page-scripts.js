'use strict';
/**
 * Функции в этом файле выполняются В КОНТЕКСТЕ СТРАНИЦЫ 2gis.ru
 * (скрытое окно Electron или вкладка браузера), а не в Node.
 * Функции не используют внешних переменных и ставятся в страницу вместе
 * (см. installScript в engine.js), поэтому могут вызывать друг друга.
 * extractFirm - чистая функция (html -> запись), поэтому её же проверяют тесты в Node.
 */

/** Состояние выдачи: номер страницы, id организаций, общее число, есть ли следующая. */
function getResultsState() {
  const ids = [...new Set(
    [...document.querySelectorAll('a[href*="/firm/"]')]
      .map((a) => (a.getAttribute('href') || '').split('?')[0].split('/').pop())
      .filter((x) => /^\d+$/.test(x))
  )];
  const pagerLinks = [...document.querySelectorAll('a[href*="/page/"]')];
  // Номер страницы берём из адреса: после перехода внутри приложения он всегда точный.
  // (В переключателе с 7-й страницы появляется «…», по нему страницу определять нельзя.)
  const pm = location.pathname.match(/\/page\/(\d+)/);
  let page = pm ? +pm[1] : 1;
  if (!pm && pagerLinks.length) {
    const box = pagerLinks[0].parentElement;
    const cur = [...box.children].find((e) => e.tagName !== 'A' && /^\d+$/.test(e.textContent.trim()));
    if (cur) page = parseInt(cur.textContent, 10) || 1;
  }
  const nextLink = pagerLinks.find((a) => {
    const m = (a.getAttribute('href') || '').match(/\/page\/(\d+)/);
    return m && +m[1] === page + 1;
  });
  const cnt = (document.body.innerText.match(/Места\s*(\d+)/) || [])[1];
  return { page, ids, count: cnt ? +cnt : null, hasNext: !!nextLink, path: location.pathname };
}

/** Нажимает на следующую страницу выдачи. Возвращает true, если нажал. */
function clickNext() {
  const st = getResultsState();
  const link = [...document.querySelectorAll('a[href*="/page/"]')].find((a) => {
    const m = (a.getAttribute('href') || '').match(/\/page\/(\d+)/);
    return m && +m[1] === st.page + 1;
  });
  if (!link) return false;
  link.scrollIntoView({ block: 'center' });
  link.click();
  return true;
}

/**
 * Из HTML карточки достаёт объект организации и возвращает компактную запись.
 * Данные в странице - JS-литерал, а не строгий JSON: встречается \' (апостроф в названии),
 * поэтому перед разбором такие escape-последовательности приводятся к JSON.
 * Возвращает запись или { id, error: 'no_object' }.
 */
function extractFirm(html, id) {
  function matchEnd(h, s) {
    let depth = 0;
    let inStr = false;
    for (let i = s; i < h.length; i++) {
      const c = h[i];
      if (inStr) {
        if (c === '\\') i++;
        else if (c === '"') inStr = false;
      } else if (c === '"') inStr = true;
      else if (c === '{') depth++;
      else if (c === '}') {
        depth--;
        if (depth === 0) return i;
      }
    }
    return -1;
  }
  // \' -> ' (только если обратная косая не экранирована сама: нечётное число слэшей)
  function fixEscapes(t) {
    return t.replace(/(\\+)'/g, (m, bs) => (bs.length % 2 ? bs.slice(0, -1) + "'" : m));
  }
  function findObject(h) {
    const anchors = ['"contact_groups":', '"address_name":'];
    for (const a of anchors) {
      const k = h.indexOf(a);
      if (k < 0) continue;
      let s = k;
      let tries = 0;
      while (s > 0 && tries < 400) {
        s = h.lastIndexOf('{', s - 1);
        if (s < 0) break;
        tries++;
        const e = matchEnd(h, s);
        if (e < 0 || e < k) continue;
        try {
          const o = JSON.parse(fixEscapes(h.slice(s, e + 1)));
          if (o && String(o.id) === String(id)) return o;
        } catch (err) { /* пробуем следующий кандидат */ }
      }
    }
    return null;
  }

  const o = findObject(html);
  if (!o) return { id: String(id), error: 'no_object' };

  const contacts = [];
  for (const g of o.contact_groups || []) {
    for (const c of g.contacts || []) {
      contacts.push({ type: c.type, text: c.text || c.print_text || '', url: c.url || '', value: c.value || '' });
    }
  }
  const rev = o.reviews || {};
  const district = (o.adm_div || []).find((a) => a.type === 'district');
  return {
    id: String(o.id),
    name: o.name || '',
    shortName: (o.name_ex && o.name_ex.primary) || o.name || '',
    address: o.address_name || '',
    lat: o.point ? o.point.lat : null,
    lon: o.point ? o.point.lon : null,
    district: district ? district.name : '',
    rubrics: (o.rubrics || []).map((r) => r.name),
    poi: o.poi_category || '',
    rating: rev.general_rating || null,
    reviews: rev.general_review_count || 0,
    orgId: o.org ? String(o.org.id) : '',
    branchCount: o.org ? o.org.branch_count || 1 : 1,
    updatedAt: o.dates ? o.dates.updated_at : '',
    is24x7: !!(o.schedule && o.schedule.is_24x7),
    contacts,
  };
}

/** Загружает карточку организации. Возвращает компактную запись или { id, error }. */
async function fetchFirm(id, city) {
  let res;
  try {
    res = await fetch('/' + city + '/firm/' + id, { credentials: 'include' });
  } catch (err) {
    return { id, error: 'network' };
  }
  if (!res.ok) return { id, error: 'http_' + res.status };
  return extractFirm(await res.text(), id);
}

module.exports = { getResultsState, clickNext, extractFirm, fetchFirm };

'use strict';
/**
 * Города и районы: пользователь пишет обычными словами («Санкт-Петербург, Пушкин», «Москва Арбат»),
 * приложение само находит код города в 2ГИС (spb, moscow …) и район.
 * Коды крупных городов зашиты в список. Для остальных код подбирается транслитерацией: у 2ГИС он в большинстве случаев такой же,
 * но это догадка, поэтому в результате есть признак known: false, и интерфейс об этом предупреждает.
 */
const D_SPB = ['Адмиралтейский', 'Василеостровский', 'Выборгский', 'Калининский', 'Кировский', 'Колпинский', 'Красногвардейский', 'Красносельский', 'Кронштадтский', 'Курортный', 'Московский', 'Невский', 'Петроградский', 'Петродворцовый', 'Приморский', 'Пушкинский', 'Фрунзенский', 'Центральный',
  'Пушкин', 'Павловск', 'Колпино', 'Петергоф', 'Кронштадт', 'Сестрорецк', 'Зеленогорск', 'Ломоносов', 'Шушары', 'Парголово', 'Металлострой', 'Красное Село', 'Мурино', 'Девяткино'];
const D_MSK = ['Арбат', 'Тверской', 'Басманный', 'Хамовники', 'Замоскворечье', 'Пресненский', 'Таганский', 'Мещанский', 'Якиманка', 'Митино', 'Строгино', 'Выхино', 'Марьино', 'Бутово', 'Зеленоград', 'Тропарёво', 'Алтуфьево', 'Бибирево', 'Чертаново', 'Люблино', 'Кузьминки', 'Измайлово', 'Сокольники', 'Щукино', 'Северный', 'Южный', 'Западный', 'Восточный', 'Новая Москва', 'Троицк', 'Щербинка'];

// [название, код 2ГИС, синонимы, районы]
const CITIES = [
  ['Санкт-Петербург', 'spb', ['питер', 'спб', 'петербург', 'санкт петербург'], D_SPB],
  ['Москва', 'moscow', ['мск', 'москва город'], D_MSK],
  ['Новосибирск', 'novosibirsk', ['нск']], ['Екатеринбург', 'ekaterinburg', ['екб', 'екат']], ['Казань', 'kazan'],
  ['Нижний Новгород', 'n_novgorod', ['нн', 'нижний']], ['Челябинск', 'chelyabinsk'], ['Самара', 'samara'], ['Омск', 'omsk'],
  ['Ростов-на-Дону', 'rostov', ['ростов']], ['Уфа', 'ufa'], ['Красноярск', 'krasnoyarsk'], ['Пермь', 'perm'], ['Воронеж', 'voronezh'],
  ['Волгоград', 'volgograd'], ['Краснодар', 'krasnodar'], ['Саратов', 'saratov'], ['Тюмень', 'tyumen'], ['Тольятти', 'tolyatti'],
  ['Ижевск', 'izhevsk'], ['Барнаул', 'barnaul'], ['Ульяновск', 'ulyanovsk'], ['Иркутск', 'irkutsk'], ['Хабаровск', 'khabarovsk'],
  ['Ярославль', 'yaroslavl'], ['Владивосток', 'vladivostok', ['владик']], ['Томск', 'tomsk'], ['Оренбург', 'orenburg'], ['Кемерово', 'kemerovo'],
  ['Рязань', 'ryazan'], ['Астрахань', 'astrakhan'], ['Пенза', 'penza'], ['Липецк', 'lipetsk'], ['Киров', 'kirov'], ['Чебоксары', 'cheboksary'],
  ['Тула', 'tula'], ['Калининград', 'kaliningrad'], ['Курск', 'kursk'], ['Сочи', 'sochi'], ['Тверь', 'tver'], ['Иваново', 'ivanovo'],
  ['Брянск', 'bryansk'], ['Белгород', 'belgorod'], ['Владимир', 'vladimir'], ['Архангельск', 'arkhangelsk'], ['Калуга', 'kaluga'],
  ['Смоленск', 'smolensk'], ['Мурманск', 'murmansk'], ['Вологда', 'vologda'], ['Петрозаводск', 'petrozavodsk'], ['Кострома', 'kostroma'],
  ['Новокузнецк', 'novokuznetsk'], ['Набережные Челны', 'chelny', ['челны']], ['Ставрополь', 'stavropol'], ['Магнитогорск', 'magnitogorsk'],
  ['Сургут', 'surgut'], ['Тамбов', 'tambov'], ['Орёл', 'orel', ['орел']], ['Якутск', 'yakutsk'], ['Махачкала', 'makhachkala'],
  ['Севастополь', 'sevastopol'], ['Симферополь', 'simferopol'], ['Благовещенск', 'blagoveshchensk'], ['Саранск', 'saransk'],
  ['Череповец', 'cherepovets'], ['Подольск', 'podolsk'], ['Химки', 'khimki'], ['Балашиха', 'balashikha'], ['Мытищи', 'mytishchi'],
].map(([name, slug, alias = [], districts = []]) => ({ name, slug, alias, districts }));

const norm = (s) => String(s || '').toLowerCase().replace(/ё/g, 'е').replace(/[^a-zа-я0-9]+/g, ' ').trim();
const TR = { а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch', ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya' };
const translit = (s) => norm(s).split(' ').filter(Boolean).map((w) => [...w].map((c) => (TR[c] !== undefined ? TR[c] : c)).join('')).join('_').replace(/[^a-z0-9_]/g, '').slice(0, 40);
const NOISE = /(^| )(район|р н|г|город|гор|обл|область)( |$)/g;

const index = CITIES.map((c) => ({ c, names: [norm(c.name), ...c.alias.map(norm)].sort((a, b) => b.length - a.length) }));
const stem = (w) => (w.length > 6 ? w.slice(0, w.length - 2) : w.length > 4 ? w.slice(0, w.length - 1) : w);
const exactDistrict = (typed, d) => norm(d) === typed;
const fuzzyDistrict = (typed, d) => { const a = norm(d); return typed.length >= 4 && (a.startsWith(stem(typed)) || typed.startsWith(stem(a))); };
const findDistrict = (list, typed) => list.find((d) => exactDistrict(typed, d)) || list.find((d) => fuzzyDistrict(typed, d));
// «Центральный», «Невский»: это районы города, их ищем в поле «район» 2ГИС. Остальное (Пушкин, Арбат) ищем и в адресе.
const isAdmin = (d) => /(ский|цкий|ный|ной|ый|ий|ой)$/i.test(d);

/** Из свободного текста делает { city, slug, district, term, known, label }. Пустая строка даёт null. */
function resolvePlace(text) {
  const raw = String(text || '').trim().slice(0, 100);
  if (!raw) return null;
  // латиницей с цифрами и подчёркиванием: это уже код 2ГИС (для тех, кто знает)
  if (/^[a-z0-9_-]{2,40}$/.test(raw) && !/\s/.test(raw)) {
    const hit = CITIES.find((c) => c.slug === raw.toLowerCase());
    return hit ? { city: hit.name, slug: hit.slug, district: '', term: '', known: true, label: hit.name } : { city: raw.toLowerCase(), slug: raw.toLowerCase(), district: '', term: '', known: false, label: raw.toLowerCase() };
  }
  const n = norm(raw);
  let best = null;
  for (const it of index) for (const name of it.names) {
    const re = new RegExp(`(^| )${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`);
    if (re.test(n) && (!best || name.length > best.name.length)) best = { it, name };
  }
  const clean = (s) => s.replace(NOISE, ' ').replace(/\s+/g, ' ').trim();
  if (best) {
    const rest = clean(n.replace(new RegExp(`(^| )${best.name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}( |$)`), ' '));
    const known = rest ? findDistrict(best.it.c.districts, rest) : '';
    const district = rest ? (known || rest.replace(/(^| )([а-я])/g, (m, a, b) => a + b.toUpperCase())) : '';
    return { city: best.it.c.name, slug: best.it.c.slug, district, term: rest ? stem(norm(known || rest)) : '', scope: known && isAdmin(known) ? 'district' : 'any', known: true, label: best.it.c.name + (district ? ', ' + district : '') };
  }
  // только район: «Пушкин», «Колпино»
  const only = clean(n);
  for (const c of CITIES) { const d = findDistrict(c.districts, only); if (d) return { city: c.name, slug: c.slug, district: d, term: stem(norm(d)), scope: isAdmin(d) ? 'district' : 'any', known: true, label: c.name + ', ' + d }; }
  const slug = translit(only);
  if (!slug) return null;
  const nice = only.replace(/(^| )([а-я])/g, (m, a, b) => a + b.toUpperCase());
  return { city: nice, slug, district: '', term: '', known: false, label: nice };
}

/** Подсказки для поля ввода: города и популярные районы. */
function suggestions() {
  const out = [];
  for (const c of CITIES) { out.push(c.name); for (const d of c.districts) out.push(`${c.name}, ${d}`); }
  return out;
}

const slugName = (slug) => (CITIES.find((c) => c.slug === slug) || {}).name || slug;

/** Подходит ли организация под район: ищем начало названия района в адресе и районе 2ГИС. */
function matchesDistrict(lead, term, scope) {
  if (!term) return true;
  const hay = ' ' + norm(scope === 'district' ? lead.district : [lead.address, lead.district].filter(Boolean).join(' ')) + ' ';
  return hay.includes(' ' + term);
}

module.exports = { CITIES, resolvePlace, suggestions, slugName, matchesDistrict, translit, norm };

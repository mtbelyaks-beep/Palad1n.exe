'use strict';
/**
 * Движок сбора. Не знает, где живёт страница: ему нужны две функции от «хозяина»
 *   navigate(url)  - открыть адрес в скрытом окне и дождаться загрузки
 *   evaluate(code) - выполнить код на странице и вернуть результат (JSON-совместимый)
 * В приложении это скрытое окно Electron (electron-engine.js), в тестах - что угодно.
 */
const pageScripts = require('./page-scripts');
const { buildLead } = require('./classify');
const dbApi = require('./db');

const HOSTS = ['2gis.ru', '2gis.com'];
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const jitter = (base) => Math.round(base * (0.7 + Math.random() * 0.6));

/** Код, который кладёт функции в страницу как window.__lc. */
function installScript() {
  const { getResultsState, clickNext, extractFirm, fetchFirm } = pageScripts;
  return `(function(){
    ${getResultsState.toString()}
    ${clickNext.toString()}
    ${extractFirm.toString()}
    ${fetchFirm.toString()}
    window.__lc = { getResultsState: getResultsState, clickNext: clickNext, fetchFirm: fetchFirm };
    return true;
  })()`;
}

class Engine {
  constructor({ navigate, evaluate, retryDelayMs = 1500 }) {
    this.retryDelayMs = retryDelayMs;
    this.navigate = navigate;
    this.evaluate = evaluate;
  }

  /** Открывает адрес с повторами: сеть бывает нестабильной. После неудач пробует запасной адрес сайта. */
  async load(path, hosts = HOSTS) {
    let lastErr = null;
    for (const host of hosts) {
      for (let attempt = 1; attempt <= 2; attempt++) {
        try { await this.navigate(`https://${host}${path}`); this.host = host; return; } catch (e) {
          lastErr = e;
          if (!/load failed/i.test(String(e && e.message))) throw e;
          await sleep(attempt * this.retryDelayMs);
        }
      }
    }
    throw lastErr;
  }

  async open(city, query) {
    await this.load(`/${city}/search/${encodeURIComponent(query)}`);
    await this.evaluate(installScript());
    await this.waitFor(async () => (await this.state()).ids.length > 0, 15000);
  }

  state() { return this.evaluate('window.__lc.getResultsState()'); }

  async waitFor(pred, timeoutMs) {
    const t0 = Date.now();
    while (Date.now() - t0 < timeoutMs) {
      if (await pred()) return true;
      await sleep(300);
    }
    return false;
  }

  /** Листает выдачу и по странице отдаёт id. Останавливается, когда следующей страницы нет. */
  async *pages({ maxPages = 50, delayMs = 1500, signal } = {}) {
    for (let n = 1; n <= maxPages; n++) {
      if (signal && signal.aborted) return;
      const st = await this.state();
      yield { page: st.page, ids: st.ids, count: st.count };
      if (!st.hasNext) return;
      const prevFirst = st.ids[0];
      await sleep(jitter(delayMs));
      const clicked = await this.evaluate('window.__lc.clickNext()');
      if (!clicked) return;
      const moved = await this.waitFor(async () => {
        const s = await this.state();
        return s.page === st.page + 1 && s.ids[0] !== prevFirst;
      }, 12000);
      if (!moved) return;
    }
  }

  fetchCard(id, city) {
    return this.evaluate(`window.__lc.fetchFirm(${JSON.stringify(id)}, ${JSON.stringify(city)})`);
  }
}

/**
 * Полный прогон: выдача -> карточки -> классификация -> база.
 * Недавно собранные организации пропускаются (кэш).
 */
async function runSearch({ engine, db, city, query, maxPages = 50, maxCards = 1000, cardDelayMs = 700,
  cacheDays = 7, leadOpts, onProgress, signal, accept }) {
  const started = new Date().toISOString();
  const known = dbApi.knownIds(db, city, cacheDays);
  const seen = new Set();
  const stat = { pages: 0, cards: 0, newLeads: 0, skippedCached: 0, errors: 0, total: null, filtered: 0 };
  // С фильтром (соцсеть, район) просматриваем больше карточек: нужное число подходящих, а не просмотренных.
  const cardCap = accept ? maxCards * 6 : maxCards;

  await engine.open(city, query);
  for await (const pg of engine.pages({ maxPages, signal })) {
    stat.pages++;
    stat.total = pg.count;
    for (const id of pg.ids) {
      if (signal && signal.aborted) break;
      if (seen.has(id)) continue;
      seen.add(id);
      if (known.has(id)) { stat.skippedCached++; continue; }
      if (stat.cards >= cardCap || (accept && stat.newLeads >= maxCards)) break;
      const rec = await engine.fetchCard(id, city);
      stat.cards++;
      if (!rec || rec.error) { stat.errors++; }
      else {
        const lead = buildLead(rec, leadOpts);
        if (accept && !accept(lead)) stat.filtered++;
        else if (dbApi.upsertLead(db, city, lead) === 'new') stat.newLeads++;
      }
      if (onProgress) onProgress({ ...stat, page: pg.page });
      await sleep(jitter(cardDelayMs));
    }
    if (stat.cards >= cardCap || (accept && stat.newLeads >= maxCards) || (signal && signal.aborted)) break;
  }
  db.prepare('INSERT INTO runs (city, query, started_at, finished_at, pages, cards, new_leads, errors) VALUES (?,?,?,?,?,?,?,?)')
    .run(city, query, started, new Date().toISOString(), stat.pages, stat.cards, stat.newLeads, stat.errors);
  return stat;
}

module.exports = { Engine, runSearch, installScript };

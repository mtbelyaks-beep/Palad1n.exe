'use strict';
/**
 * Сервис приложения: вся логика между окном и ядром lead-core.
 * Не импортирует Electron: окно, браузер и буфер обмена приходят снаружи, поэтому сервис тестируется в обычном Node.
 */
const fs = require('node:fs');
const path = require('node:path');
const geo = require('./geo');
const dbApi = require('../core/src/db');
const { runSearch } = require('../core/src/engine');
const { DEFAULT_TEMPLATES, pickTemplate, renderTemplate } = require('./templates');
const { AiManager } = require('./ai');
const site = require('./sitegen');
const offerLib = require('./offer');

const MESSENGERS = ['telegram', 'whatsapp', 'vk'];
const OPEN_HOSTS = ['t.me', 'telegram.me', 'wa.me', 'vk.com', 'vk.ru', 'max.ru'];

const SERVICE_NAME = { telegram: 'Telegram', whatsapp: 'WhatsApp', vk: 'ВКонтакте' };
const CHANNEL_KEYS = ['telegram', 'whatsapp', 'vk', 'telegramPhone', 'phone'];
const MAX_ACCOUNTS = 6; // на один мессенджер

/** Раздел сессии для аккаунта. У первого аккаунта он такой же, как был раньше, чтобы вход не потерялся. */
const partitionFor = (service, n) => 'persist:chat-' + service + (n > 1 ? '-' + n : '');
const defaultAccounts = () => MESSENGERS.map((sv) => ({ id: sv + '-1', service: sv, n: 1, name: SERVICE_NAME[sv], limit: null }));
function normalizeAccounts(list) {
  const out = []; const seen = new Set();
  for (const a of Array.isArray(list) ? list : []) {
    if (!a || !MESSENGERS.includes(a.service)) continue;
    const n = Math.max(1, Math.min(99, Number(a.n) || Number(String(a.id || '').split('-')[1]) || 1));
    const id = a.service + '-' + n;
    if (seen.has(id)) continue;
    seen.add(id);
    const lim = a.limit === null || a.limit === undefined || a.limit === '' ? null : Math.max(0, Math.min(200, Math.round(Number(a.limit)) || 0));
    out.push({ id, service: a.service, n, name: String(a.name || SERVICE_NAME[a.service]).trim().slice(0, 30) || SERVICE_NAME[a.service], limit: lim, partition: partitionFor(a.service, n) });
  }
  return out;
}
function normalizeOrder(list) {
  const out = [];
  for (const k of Array.isArray(list) ? list : []) if (CHANNEL_KEYS.includes(k) && !out.includes(k)) out.push(k);
  for (const k of CHANNEL_KEYS) if (!out.includes(k)) out.push(k);
  return out;
}

function normalizeQueueOff(list) {
  const out = [];
  for (const k of Array.isArray(list) ? list : []) if (MESSENGERS.includes(k) && !out.includes(k)) out.push(k);
  // выключить все три нельзя: очередь осталась бы пустой без объяснений
  return out.length >= MESSENGERS.length ? out.slice(0, MESSENGERS.length - 1) : out;
}

const SETTINGS_VERSION = 3;
const DEFAULT_SETTINGS = {
  settingsVersion: SETTINGS_VERSION,
  senderName: '',
  city: 'spb',
  theme: 'paldark', accent: '#e5232e',
  bg: 'animated', bgImage: '', bgVideo: '', bgDim: 0.45, bgOpacity: 0.55, bgBlur: 14,
  density: 'normal', fontSize: 14, lite: false,
  glassK: 1, radius: 16, font: 'segoe', motion: 'full', rail: 'labels', leadView: 'cards',
  chainThreshold: 4, excludeChains: true,
  channelOrder: ['telegram', 'whatsapp', 'vk', 'telegramPhone', 'phone'],
  dailyLimits: { telegram: 10, whatsapp: 15, vk: 15 },
  queueTiers: ['hot', 'warm'],
  queueOff: [],            // соцсети, которые не показывать в очереди «Сообщения»
  queueMode: 'network',    // network: сначала организации по порядку соцсетей; score: просто по оценке
  templates: DEFAULT_TEMPLATES,
  ai: { enabled: true, tone: 'friendly' },
  accounts: defaultAccounts(),
  inboxWatch: false,
  netProxy: '',
  place: '',
  offer: offerLib.DEFAULT_OFFER,
};

/** Прокси для окна 2ГИС: пусто, host:port, http://, https:// или socks5://. Всё остальное отбрасывается. */
function normalizeProxy(v) {
  const t = String(v || '').trim().slice(0, 120);
  if (!t) return '';
  const m = /^((?:https?|socks[45]):\/\/)?([\w.-]+):(\d{2,5})$/i.exec(t);
  return m ? `${m[1] || 'http://'}${m[2]}:${m[3]}` : '';
}

/** Человеческие тексты вместо технических ошибок. */
function humanizeError(e) {
  const m = String((e && e.message) || e || '');
  if (/load failed|ERR_/i.test(m)) {
    const code = (m.match(/ERR_[A-Z_]+/) || [''])[0];
    const tip = /ERR_NAME|ERR_INTERNET/i.test(m) ? 'Нет интернета или не работает DNS: проверь соединение.'
      : /ERR_CERT|ERR_SSL/i.test(m) ? 'Не проходит защищённое соединение: проверь дату и время на компьютере и антивирус.'
      : 'Похоже, 2ГИС недоступен с этого интернета или VPN: попробуй отключить VPN или включить российский, и открой 2gis.ru в браузере.';
    return `Не удалось открыть 2ГИС${code ? ' (' + code + ')' : ''}. ${tip}`;
  }
  if (/занят|already/i.test(m)) return m;
  return 'Сбор остановился из-за ошибки: ' + m;
}

class AppService {
  constructor({ pickFile, dataDir, dbFile, createEngine, openExternal, openPath, writeClipboard, emit, now, cardDelayMs, secrets, http, renderPdf, checkNet } = {}) {
    this.pickFile = pickFile || null; // окно выбора файла (в Electron это системный диалог)
    this.checkNet = checkNet || null; // проверка доступа к 2ГИС из окна приложения
    this.cardDelayMs = cardDelayMs; // пауза между карточками; по умолчанию берётся из ядра
    this.dataDir = dataDir || null;
    this.db = dbApi.openDb(dbFile || (dataDir ? path.join(dataDir, 'leads.db') : ':memory:'));
    this.db.exec(`CREATE TABLE IF NOT EXISTS message_log (
      id INTEGER PRIMARY KEY AUTOINCREMENT, lead_id TEXT NOT NULL, channel TEXT NOT NULL,
      template_id TEXT, text TEXT, sent_at TEXT NOT NULL);
      CREATE INDEX IF NOT EXISTS idx_log_sent ON message_log(sent_at);`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS chat_bind (lead_id TEXT PRIMARY KEY, service TEXT, account_id TEXT, opened_at TEXT)`);
    // откуда взялся текст: шаблон или нейросеть (колонки добавлены в версии 2)
    const cols = this.db.prepare('PRAGMA table_info(message_log)').all().map((c) => c.name);
    if (!cols.includes('source')) this.db.exec("ALTER TABLE message_log ADD COLUMN source TEXT DEFAULT 'template'");
    if (!cols.includes('provider')) this.db.exec("ALTER TABLE message_log ADD COLUMN provider TEXT DEFAULT ''");
    if (!cols.includes('account')) this.db.exec("ALTER TABLE message_log ADD COLUMN account TEXT DEFAULT ''");
    this.createEngine = createEngine;
    this.openExternal = openExternal || (async () => {});
    this.openPath = openPath || (async () => {});
    this.renderPdf = renderPdf || null; // HTML -> PDF (в Electron печатает скрытое окно)
    this.writeClipboard = writeClipboard || (() => {});
    this.emit = emit || (() => {});
    this.now = now || (() => new Date());
    this.settingsFile = this.dataDir ? path.join(this.dataDir, 'settings.json') : null;
    this.settings = this._loadSettings();
    this.run = null; // { abort, engine, params, stat }
    this.ai = new AiManager({ dataDir: this.dataDir, secrets, http, now: () => this.now(), emit: (c, d) => this.emit(c, d) });
    this.ai.mode = this.ai.status().mode;
  }

  /* ---------- настройки ---------- */
  _loadSettings() {
    let saved = {};
    try { if (this.settingsFile) saved = JSON.parse(fs.readFileSync(this.settingsFile, 'utf8')); } catch (e) { /* первый запуск */ }
    // Настройки версии 1 (тёмная тема с фиолетовым акцентом) заменяются новым красно-белым оформлением.
    // Имя, лимиты, шаблоны и порог сетей остаются.
    const v = saved.settingsVersion || 1;
    if (v < 2) for (const k of ['theme', 'accent', 'bg', 'bgImage', 'bgOpacity', 'bgBlur', 'density', 'fontSize', 'lite']) delete saved[k];
    if (v < 3) for (const k of ['theme', 'accent']) delete saved[k]; // стартовая тема стала красно-чёрной
    return { ...DEFAULT_SETTINGS, ...saved, settingsVersion: SETTINGS_VERSION, dailyLimits: { ...DEFAULT_SETTINGS.dailyLimits, ...(saved.dailyLimits || {}) }, ai: { ...DEFAULT_SETTINGS.ai, ...(saved.ai || {}) },
      accounts: normalizeAccounts(saved.accounts && saved.accounts.length ? saved.accounts : defaultAccounts()), channelOrder: normalizeOrder(saved.channelOrder), queueOff: normalizeQueueOff(saved.queueOff), queueMode: saved.queueMode === 'score' ? 'score' : 'network', offer: offerLib.normalizeOffer(saved.offer) };
  }

  getSettings() { return this.settings; }

  setSettings(patch) {
    const next = { ...this.settings, ...patch };
    if (patch && patch.dailyLimits) next.dailyLimits = { ...this.settings.dailyLimits, ...patch.dailyLimits };
    if (patch && patch.ai) {
      next.ai = { ...this.settings.ai, ...patch.ai };
      if (!['friendly', 'business', 'short'].includes(next.ai.tone)) next.ai.tone = 'friendly';
      next.ai.enabled = next.ai.enabled !== false;
    }
    next.chainThreshold = Math.max(2, Math.min(50, Number(next.chainThreshold) || 4));
    next.glassK = Math.max(0.3, Math.min(1.8, Number(next.glassK) || 1));
    next.radius = Math.max(4, Math.min(28, Number(next.radius) || 16));
    next.accounts = normalizeAccounts(next.accounts);
    next.channelOrder = normalizeOrder(next.channelOrder);
    next.queueOff = normalizeQueueOff(next.queueOff);
    next.queueMode = next.queueMode === 'score' ? 'score' : 'network';
    next.inboxWatch = !!next.inboxWatch;
    next.netProxy = normalizeProxy(next.netProxy);
    next.place = String(next.place || '').slice(0, 100);
    next.bgDim = Math.max(0, Math.min(0.9, Number(next.bgDim) || 0));
    if (!/^bg-video\.(mp4|webm|m4v)$/.test(next.bgVideo || '')) next.bgVideo = '';
    if (next.bg === 'video' && !next.bgVideo) next.bg = 'animated';
    next.offer = offerLib.normalizeOffer(next.offer);
    this.settings = next;
    if (this.settingsFile) {
      fs.mkdirSync(this.dataDir, { recursive: true });
      fs.writeFileSync(this.settingsFile, JSON.stringify(next, null, 2));
    }
    return next;
  }

  /* ---------- сбор ---------- */
  searchStatus() {
    if (!this.run) return { running: false };
    return { running: true, params: this.run.params, stat: this.run.stat };
  }

  async startSearch({ city, place, query, networks, maxPages = 10, maxCards = 150 } = {}) {
    if (this.run) throw new Error('Сбор уже идёт. Дождись окончания или останови его.');
    // Город можно ввести обычными словами («Санкт-Петербург, Пушкин»): код 2ГИС и район определяются сами.
    const placeText = place || (city && !/^[a-z0-9_-]{2,40}$/i.test(String(city).trim()) ? city : '');
    const g = placeText ? geo.resolvePlace(placeText) : null;
    if (placeText && !g) throw new Error('Не понял, какой город. Напиши, например: «Санкт-Петербург» или «Москва, Арбат».');
    city = g ? g.slug : String(city || '').trim().toLowerCase();
    query = String(query || '').trim();
    if (!/^[a-z0-9_-]{2,40}$/.test(city)) throw new Error('Не понял, какой город. Напиши его название, например: «Казань».');
    if (!query) throw new Error('Введи, кого искать: например, «барбершоп».');
    const nets = (Array.isArray(networks) ? networks : []).filter((n) => ['vk', 'telegram', 'whatsapp'].includes(n));
    const district = g && g.term ? g : null;
    const fullQuery = district ? `${query} ${district.district}${district.scope === 'district' ? ' район' : ''}` : query;
    const has = { vk: (l) => !!l.vk, telegram: (l) => !!(l.telegram || l.telegramPhone), whatsapp: (l) => !!l.whatsapp };
    const accept = nets.length || district
      ? (l) => (!nets.length || nets.some((n) => has[n](l))) && (!district || geo.matchesDistrict(l, district.term, district.scope))
      : null;
    maxPages = Math.max(1, Math.min(100, Number(maxPages) || 10));
    maxCards = Math.max(1, Math.min(2000, Number(maxCards) || 150));

    const abort = new AbortController();
    const engine = this.createEngine();
    this.run = { abort, engine, params: { city, query, maxPages, maxCards, place: g ? g.label : '', networks: nets }, stat: null };
    this.emit('search:progress', { pages: 0, cards: 0, newLeads: 0, skippedCached: 0, errors: 0, filtered: 0, total: null, page: 0 });

    // Фоновый запуск: вызывающий сразу получает ответ, ход работы идёт событиями.
    runSearch({
      engine, db: this.db, city, query: fullQuery, maxPages, maxCards, signal: abort.signal, accept,
      ...(this.cardDelayMs !== undefined ? { cardDelayMs: this.cardDelayMs } : {}),
      leadOpts: { chainThreshold: this.settings.chainThreshold, channelOrder: this.settings.channelOrder },
      onProgress: (p) => { if (this.run) this.run.stat = p; this.emit('search:progress', p); },
    }).then((stat) => {
      const stopped = abort.signal.aborted;
      let message = '';
      if (!stopped && stat.cards === 0 && stat.skippedCached === 0) {
        message = 'Выдача пустая.' + (g && !g.known ? ` Город «${g.city}» не из моего списка, код «${g.slug}» подобран по названию и мог не подойти: проверь написание или введи код из адреса 2gis.ru/…` : ' Возможно, 2ГИС показал проверку «я не робот» или ничего не нашлось. Нажми «Проверить окно 2ГИС».');
      } else if (stat.errors > 0 && stat.errors >= stat.cards / 2) {
        message = 'Больше половины карточек не загрузились. Источник мог ограничить доступ: повтори через 5 минут.';
      }
      if (!message && !stopped && accept && stat.newLeads === 0 && stat.filtered > 0) message = `Просмотрено ${stat.cards}, но подходящих под выбранную соцсеть или район нет (отсеяно ${stat.filtered}). Попробуй другой запрос или убери часть условий.`;
      this.emit('search:done', { stat, stopped, message });
    }).catch((e) => {
      this.emit('search:error', { message: humanizeError(e) });
    }).finally(() => {
      try { engine.close && engine.close(); } catch (e) { /* окно уже закрыто */ }
      this.run = null;
    });
    return { started: true, params: this.run.params };
  }

  stopSearch() {
    if (this.run) this.run.abort.abort();
    return { stopping: !!this.run };
  }

  revealWindow() {
    const w = this.run && this.run.engine && this.run.engine.window;
    if (w && !w.isDestroyed()) { w.show(); return { shown: true }; }
    return { shown: false };
  }

  /* ---------- лиды ---------- */
  listLeads(f = {}) {
    const s = this.settings;
    const excludeChains = f.excludeChains === undefined ? s.excludeChains : f.excludeChains;
    let rows = dbApi.listLeads(this.db, {
      city: f.city || undefined, tiers: f.tiers, status: f.status || undefined, rubric: f.rubric || undefined,
      minScore: f.minScore, minReviews: f.minReviews, onlyReachable: f.onlyReachable, limit: 100000,
    });
    if (excludeChains) rows = rows.filter((r) => (r.branch_count || 1) < s.chainThreshold);
    if (f.siteClasses && f.siteClasses.length) rows = rows.filter((r) => f.siteClasses.includes(r.site_class));
    if (f.minRating) rows = rows.filter((r) => (r.rating || 0) >= f.minRating);
    if (f.district) { const g = geo.resolvePlace(f.district); if (g && g.term) rows = rows.filter((r) => geo.matchesDistrict(r, g.term, g.scope)); }
    if (f.channel) rows = rows.filter((r) => r.channel === f.channel);
    if (Array.isArray(f.networks) && f.networks.length) {
      const has = { vk: (r) => !!r.vk, telegram: (r) => !!(r.telegram || r.telegram_phone), whatsapp: (r) => !!r.whatsapp };
      rows = rows.filter((r) => f.networks.some((n) => has[n] && has[n](r)));
    }
    if (f.q) {
      const q = String(f.q).toLowerCase();
      rows = rows.filter((r) => [r.name, r.address, r.district, r.rubric, r.notes, r.tags, (r.phones || []).join(' ')]
        .some((v) => String(v || '').toLowerCase().includes(q)));
    }
    const total = rows.length;
    return { rows: rows.slice(0, f.limit || 1000), total };
  }

  getLead(id) {
    const r = this.db.prepare('SELECT * FROM leads WHERE id = ?').get(String(id));
    if (!r) return null;
    return { ...r, phones: JSON.parse(r.phones || '[]'), emails: JSON.parse(r.emails || '[]') };
  }

  setStatus(id, status) { dbApi.setStatus(this.db, String(id), status); return true; }

  updateLead(id, patch) {
    const allowed = ['notes', 'tags'];
    for (const k of Object.keys(patch || {})) {
      if (!allowed.includes(k)) continue;
      this.db.prepare(`UPDATE leads SET ${k} = ? WHERE id = ?`).run(String(patch[k]).slice(0, 4000), String(id));
    }
    return this.getLead(id);
  }

  stats(city) {
    const { rows } = this.listLeads({ city: city || undefined, limit: 100000 });
    const byStatus = {};
    const rubrics = {};
    let hot = 0; let warm = 0; let cold = 0; let reachable = 0;
    for (const r of rows) {
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
      if (r.rubric) rubrics[r.rubric] = (rubrics[r.rubric] || 0) + 1;
      if (r.tier === 'hot') hot++; else if (r.tier === 'warm') warm++; else cold++;
      if (r.channel) reachable++;
    }
    const cities = this.db.prepare('SELECT DISTINCT city FROM leads ORDER BY city').all().map((x) => x.city);
    return {
      total: rows.length, hot, warm, cold, reachable, byStatus, cities,
      rubrics: Object.entries(rubrics).sort((a, b) => b[1] - a[1]).slice(0, 30).map(([name, n]) => ({ name, n })),
    };
  }

  /* ---------- видео-обои ---------- */
  bgVideoUrl() {
    if (!this.settings.bgVideo || !this.dataDir) return '';
    const f = path.join(this.dataDir, 'wallpaper', this.settings.bgVideo);
    return fs.existsSync(f) ? require('node:url').pathToFileURL(f).href : '';
  }

  /** Копирует выбранный пользователем ролик в папку данных и включает его как фон. */
  async pickBgVideo() {
    if (!this.pickFile) throw new Error('В этом окружении выбор файла недоступен.');
    if (!this.dataDir) throw new Error('Нет папки для данных.');
    const src = await this.pickFile({ title: 'Видео для фона', extensions: ['mp4', 'webm', 'm4v'] });
    if (!src) return { picked: false };
    const ext = path.extname(String(src)).toLowerCase().replace('.', '');
    if (!['mp4', 'webm', 'm4v'].includes(ext)) throw new Error('Подходят файлы mp4 или webm.');
    const st = fs.statSync(src);
    if (!st.isFile()) throw new Error('Это не файл.');
    if (st.size > 300 * 1024 * 1024) throw new Error('Файл больше 300 МБ. Возьми ролик короче или сожми его.');
    const dir = path.join(this.dataDir, 'wallpaper');
    fs.mkdirSync(dir, { recursive: true });
    for (const old of fs.readdirSync(dir)) if (/^bg-video\./.test(old)) fs.rmSync(path.join(dir, old), { force: true });
    const name = 'bg-video.' + ext;
    fs.copyFileSync(src, path.join(dir, name));
    this.setSettings({ bgVideo: name, bg: 'video' });
    return { picked: true, big: st.size > 60 * 1024 * 1024, url: this.bgVideoUrl() };
  }

  clearBgVideo() {
    if (this.dataDir) { const dir = path.join(this.dataDir, 'wallpaper'); if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true }); }
    this.setSettings({ bgVideo: '', bg: this.settings.bg === 'video' ? 'animated' : this.settings.bg });
    return { cleared: true };
  }

  /** Сколько организаций подходит под каждый фильтр: подписи кнопок показывают число. */
  facets(city) {
    const { rows } = this.listLeads({ city: city || undefined, excludeChains: false, limit: 100000 });
    const t = this.settings.chainThreshold;
    const out = { total: rows.length, plates: { none: 0, social: 0, weak: 0, own: 0 }, rating4: 0, chains: 0, networks: { vk: 0, telegram: 0, whatsapp: 0 } };
    for (const r of rows) {
      if (r.site_class === 'none') out.plates.none++;
      else if (r.site_class === 'social') out.plates.social++;
      else if (['booking', 'multilink', 'builder'].includes(r.site_class)) out.plates.weak++;
      else out.plates.own++;
      if ((r.rating || 0) >= 4) out.rating4++;
      if ((r.branch_count || 1) >= t) out.chains++;
      if (r.vk) out.networks.vk++;
      if (r.telegram || r.telegram_phone) out.networks.telegram++;
      if (r.whatsapp) out.networks.whatsapp++;
    }
    return out;
  }

  /** Проверка доступа к 2ГИС из окна приложения: код ошибки и время ответа. */
  async netCheck() {
    if (!this.checkNet) throw new Error('В этом окружении проверка соединения недоступна.');
    return this.checkNet({ proxy: this.settings.netProxy });
  }

  /* ---------- чёрный список ---------- */
  blacklistLead(id, kind = 'all') {
    const l = this.getLead(id);
    if (!l) return false;
    if (kind === 'all') {
      dbApi.addBlacklist(this.db, 'id', l.id);
      for (const p of l.phones) dbApi.addBlacklist(this.db, 'phone', p);
    } else if (kind === 'org') { if (l.org_id) dbApi.addBlacklist(this.db, 'org', l.org_id); else dbApi.addBlacklist(this.db, 'id', l.id); }
    else if (kind === 'phone') for (const p of l.phones) dbApi.addBlacklist(this.db, 'phone', p);
    else dbApi.addBlacklist(this.db, 'id', l.id);
    return true;
  }

  addBlacklistManual(kind, value) {
    if (!['phone', 'id', 'org'].includes(kind) || !String(value || '').trim()) throw new Error('Укажи тип и значение.');
    dbApi.addBlacklist(this.db, kind, String(value).trim());
    return true;
  }

  listBlacklist() {
    const rows = this.db.prepare('SELECT kind, value, added_at FROM blacklist ORDER BY added_at DESC').all();
    // Номера человека, скрытого целиком, отдельной строкой не показываем: они идут вместе с ним.
    const covered = new Set();
    for (const b of rows) if (b.kind === 'id') { const l = this.getLead(b.value); if (l) l.phones.forEach((p) => covered.add(p)); }
    return rows.filter((b) => !(b.kind === 'phone' && covered.has(b.value))).map((b) => {
      let label = '';
      if (b.kind === 'id') { const l = this.getLead(b.value); label = l ? l.name : ''; }
      else if (b.kind === 'org') { const l = this.db.prepare('SELECT name FROM leads WHERE org_id = ? LIMIT 1').get(b.value); label = l ? l.name : ''; }
      else if (b.kind === 'phone') { const l = this.db.prepare('SELECT name FROM leads WHERE phones LIKE ? LIMIT 1').get('%' + b.value + '%'); label = l ? l.name : ''; }
      return { ...b, label };
    });
  }

  removeBlacklist(kind, value) {
    if (kind === 'id') {
      const l = this.getLead(value);
      if (l) for (const p of l.phones) this.db.prepare('DELETE FROM blacklist WHERE kind = ? AND value = ?').run('phone', p);
    }
    this.db.prepare('DELETE FROM blacklist WHERE kind = ? AND value = ?').run(kind, String(value));
    return true;
  }

  /* ---------- сообщения ---------- */
  _dayStart() {
    const d = this.now();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).toISOString();
  }

  accountsOf(service) { return this.settings.accounts.filter((a) => a.service === service); }
  accountLimit(a) { return a.limit === null || a.limit === undefined ? (this.settings.dailyLimits[a.service] || 0) : a.limit; }

  /** По каждому мессенджеру: сколько отправлено сегодня, лимит (сумма по аккаунтам) и разбивка по аккаунтам. */
  counters() {
    const since = this._dayStart();
    const rows = this.db.prepare("SELECT channel, COALESCE(account, '') AS account, COUNT(*) AS n FROM message_log WHERE sent_at >= ? GROUP BY channel, account").all(since);
    const out = {};
    for (const ch of MESSENGERS) {
      const accs = this.accountsOf(ch);
      const per = accs.map((a) => ({ id: a.id, name: a.name, used: 0, limit: this.accountLimit(a) }));
      for (const r of rows) {
        if (r.channel !== ch) continue;
        const hit = per.find((x) => x.id === r.account) || per[0]; // старые записи без аккаунта относятся к первому
        if (hit) hit.used += r.n;
      }
      for (const x of per) x.left = Math.max(0, x.limit - x.used);
      const used = per.reduce((n, x) => n + x.used, 0);
      const limit = per.reduce((n, x) => n + x.limit, 0);
      out[ch] = { used, limit, left: per.reduce((n, x) => n + x.left, 0), accounts: per };
    }
    return out;
  }

  /** Аккаунт, с которого лучше писать сейчас: где больше всего свободных сообщений. */
  pickAccount(service, counters) {
    const c = (counters || this.counters())[service];
    const best = c && c.accounts.filter((a) => a.left > 0).sort((a, b) => b.left - a.left)[0];
    return best || null;
  }

  /** Каналы-мессенджеры, по которым можно написать этой организации, в порядке, который задал пользователь. */
  channelsOf(lead) {
    const has = {
      telegram: /^[\w.]{3,}$/.test(lead.telegram || ''),
      whatsapp: /^\+\d{10,15}$/.test(lead.whatsapp || ''),
      vk: /^https:\/\/(m\.)?vk\.(com|ru)\//.test(lead.vk || ''),
    };
    // старые записи: канал выбран ядром, но отдельного поля может не быть
    if (lead.channel && MESSENGERS.includes(lead.channel) && !has[lead.channel] && lead.channel_target) has[lead.channel] = true;
    return this.settings.channelOrder.filter((k) => MESSENGERS.includes(k) && has[k]);
  }

  _withChannel(lead, ch) {
    let target = lead.channel_target || '';
    if (ch !== lead.channel || !target) {
      if (ch === 'telegram' && lead.telegram) target = 'https://t.me/' + lead.telegram;
      else if (ch === 'whatsapp' && lead.whatsapp) target = 'https://wa.me/' + String(lead.whatsapp).replace(/\D/g, '');
      else if (ch === 'vk' && lead.vk) target = lead.vk;
    }
    return { ...lead, channel: ch, channel_target: target };
  }

  /**
   * Следующий лид для написания. skipIds — те, кого пользователь отложил в этой сессии.
   * Порядок соцсетей и выключенные берутся из настроек (channelOrder, queueOff, queueMode).
   * Возвращаемое plan показывает, сколько организаций ждёт по каждой соцсети: так видно, почему выпал именно этот лид.
   */
  queueNext({ skipIds = [], channel } = {}) {
    const counters = this.counters();
    const { rows } = this.listLeads({ status: 'new', tiers: this.settings.queueTiers, onlyReachable: true, limit: 100000 });
    const off = this.settings.queueOff || [];
    const order = this.settings.channelOrder.filter((k) => MESSENGERS.includes(k));
    const plan = {};
    for (const k of MESSENGERS) plan[k] = { leads: 0, only: 0, on: !off.includes(k) };
    const pool = []; const open = [];
    for (const r of rows) {
      if (skipIds.includes(r.id)) continue;
      const all = this.channelsOf(r);
      for (const c of all) { plan[c].leads++; if (all.length === 1) plan[c].only++; }
      const chs = all.filter((c) => !off.includes(c) && (!channel || c === channel));
      if (!chs.length) continue;
      pool.push(r);
      const best = chs.find((c) => counters[c].left > 0);
      if (best) open.push({ r, best, chs, all, rank: order.indexOf(best) });
    }
    const waiting = pool.length;
    const base = { waiting, counters, plan, order, off, mode: this.settings.queueMode };
    if (!open.length) return { lead: null, reason: waiting ? 'limit' : 'empty', ...base };
    // «network»: сначала все, кому можно написать через первую соцсеть списка, потом через вторую и так далее (внутри группы по оценке)
    if (this.settings.queueMode !== 'score') open.sort((a, b) => a.rank - b.rank);
    const { r, best, all } = open[0];
    const lead = this._withChannel(r, best);
    const tpl = pickTemplate(lead, this.settings.templates);
    return {
      lead, ...base, templateId: tpl.id, ai: this.aiAvailable(),
      text: renderTemplate(tpl.text, lead, this.settings),
      needsName: !this.settings.senderName,
      // показываем все соцсети организации, в том числе выключенные в очереди: выбрать можно любую
      channels: all.map((c) => ({ id: c, left: counters[c].left, off: off.includes(c) })),
      account: this.pickAccount(best, counters),
      accounts: counters[best].accounts,
    };
  }

  renderFor(leadId, templateId) {
    const lead = this.getLead(leadId);
    const tpl = this.settings.templates.find((t) => t.id === templateId) || pickTemplate(lead, this.settings.templates);
    return { templateId: tpl.id, text: renderTemplate(tpl.text, lead, this.settings) };
  }

  /** Ссылка для открытия чата. Только https и известные мессенджеры. */
  chatUrl(lead, text) {
    let url = lead.channel_target || '';
    let prefilled = false;
    if (lead.channel === 'whatsapp' && /^https:\/\/wa\.me\/\d+$/.test(url)) { url += '?text=' + encodeURIComponent(text); prefilled = true; }
    let host = '';
    try { const u = new URL(url); if (u.protocol === 'https:') host = u.hostname.replace(/^www\./, ''); } catch (e) { /* неверная ссылка */ }
    if (!host || !OPEN_HOSTS.some((h) => host === h || host.endsWith('.' + h))) return { url: '', prefilled: false };
    return { url, prefilled };
  }

  async openChat(leadId, text, opts = {}) {
    const base = this.getLead(leadId);
    if (!base) throw new Error('Лид не найден.');
    const lead = opts.channel && MESSENGERS.includes(opts.channel) ? this._withChannel(base, opts.channel) : base;
    if (text) this.writeClipboard(text);
    const { url, prefilled } = this.chatUrl(lead, text);
    if (!url) return { opened: false, copied: true, prefilled: false };
    await this.openExternal(url);
    return { opened: true, copied: true, prefilled };
  }

  /**
   * Куда вести во встроенном чате. WhatsApp Web принимает номер и текст в адресе;
   * Telegram Web открывает чат по имени (текст всегда в буфере); у ВКонтакте открывается страница человека или сообщества.
   */
  chatTarget(leadId, text, opts = {}) {
    const base = this.getLead(leadId);
    if (!base) throw new Error('Лид не найден.');
    const ch = opts.channel && MESSENGERS.includes(opts.channel) ? opts.channel : base.channel;
    const lead = this._withChannel(base, ch);
    text = String(text || '');
    if (text) this.writeClipboard(text);
    const external = this.chatUrl(lead, text).url;
    let service = ''; let url = ''; let prefilled = false;
    if (ch === 'whatsapp' && /^\+\d{10,15}$/.test(lead.whatsapp || '')) {
      service = 'whatsapp';
      url = 'https://web.whatsapp.com/send?phone=' + lead.whatsapp.slice(1) + (text ? '&text=' + encodeURIComponent(text) : '');
      prefilled = !!text;
    } else if (ch === 'telegram' && /^[\w.]{3,}$/.test(lead.telegram || '')) {
      service = 'telegram';
      url = 'https://web.telegram.org/k/#@' + lead.telegram;
    } else if (ch === 'vk' && /^https:\/\/(m\.)?vk\.(com|ru)\//.test(lead.vk || '')) {
      service = 'vk';
      url = lead.vk;
    }
    // аккаунт: выбранный пользователем, иначе тот, где больше свободных сообщений, иначе первый
    let acc = null;
    if (service) {
      const mine = this.accountsOf(service);
      acc = mine.find((a) => a.id === opts.accountId) || (this.pickAccount(service) && mine.find((a) => a.id === this.pickAccount(service).id)) || mine[0] || null;
      if (acc) this.db.prepare('INSERT INTO chat_bind (lead_id, service, account_id, opened_at) VALUES (?,?,?,?) ON CONFLICT(lead_id) DO UPDATE SET service=excluded.service, account_id=excluded.account_id, opened_at=excluded.opened_at')
        .run(lead.id, service, acc.id, this.now().toISOString());
    }
    return { service, url, prefilled, accountId: acc ? acc.id : '', partition: acc ? acc.partition : '', external, copied: !!text };
  }


  /* ---------- генератор сайтов ---------- */
  siteOptions() {
    return {
      styles: site.STYLES.map((x) => ({ id: x.id, name: x.name, desc: x.desc, swatch: x.swatch })),
      niches: site.NICHES.map((x) => ({ id: x.id, label: x.label, best: x.best })),
      blocks: site.BLOCKS.map(([id, name]) => ({ id, name })),
    };
  }

  _siteLead(leadId) {
    const lead = this.getLead(leadId);
    if (!lead) throw new Error('Организация не найдена.');
    return lead;
  }

  /** Страница сайта в HTML. Для превью и для сохранения. */
  sitePreview({ leadId, style, niche, blocks, accent, content, noMap } = {}) {
    const lead = this._siteLead(leadId);
    const nid = niche || site.detectNiche(lead.rubric);
    return { html: site.renderSite(lead, { style, niche: nid, blocks, accent, content, noMap, year: this.now().getFullYear() }), niche: nid };
  }

  sitePrompt({ leadId, style, niche, mode } = {}) {
    const lead = this._siteLead(leadId);
    return { text: site.buildSitePrompt(lead, style, niche || site.detectNiche(lead.rubric), { mode }) };
  }

  /** Тексты сайта от нейросети; если её нет или она отказала, возвращаются тексты из базы ниши. */
  async siteTexts({ leadId, niche } = {}) {
    const lead = this._siteLead(leadId);
    const nid = niche || site.detectNiche(lead.rubric);
    const base = { ...site.buildContent(lead, nid) }; delete base.f;
    if (!this.settings.ai.enabled) return { source: 'niche', reason: 'disabled', content: base };
    const r = await this.ai.complete(site.buildTextsPrompt(lead, nid), site.parseTexts);
    if (!r.ok) return { source: 'niche', reason: r.reason, nextRetryAt: r.nextRetryAt, content: base };
    return { source: 'ai', label: r.label, provider: r.provider, content: { ...base, ...r.value } };
  }

  /** Сохраняет сайт в папку «sites» рядом с базой и открывает её. */
  async siteExport(o = {}) {
    if (!this.dataDir) throw new Error('Папка для сохранения недоступна.');
    const { html } = this.sitePreview(o);
    const lead = this._siteLead(o.leadId);
    const slug = (String(lead.id).replace(/[^\w-]/g, '').slice(0, 40) || 'site') + '-' + (site.styleById(o.style).id);
    const dir = path.join(this.dataDir, 'sites', slug);
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, 'index.html');
    fs.writeFileSync(file, html);
    await this.openPath(dir);
    return { dir, file };
  }


  /* ---------- коммерческое предложение ---------- */
  offerPreview({ leadId, packageIds } = {}) {
    const lead = this._siteLead(leadId);
    return {
      html: offerLib.renderOffer(lead, this.settings.offer, { packageIds, sender: this.settings.senderName, now: this.now() }),
      pricesConfirmed: this.settings.offer.pricesConfirmed, needsName: !this.settings.senderName,
    };
  }

  /** Печатает предложение в PDF рядом с базой (папка «offers») и открывает его. */
  async offerPdf({ leadId, packageIds } = {}) {
    if (!this.dataDir) throw new Error('Папка для сохранения недоступна.');
    if (!this.renderPdf) throw new Error('В этом окружении печать в PDF недоступна.');
    const lead = this._siteLead(leadId);
    const { html } = this.offerPreview({ leadId, packageIds });
    const buf = await this.renderPdf(html);
    if (!buf || !buf.length) throw new Error('Не удалось создать PDF.');
    const dir = path.join(this.dataDir, 'offers');
    fs.mkdirSync(dir, { recursive: true });
    const day = this.now().toISOString().slice(0, 10);
    const file = path.join(dir, (String(lead.id).replace(/[^\w-]/g, '').slice(0, 40) || 'offer') + '-' + day + '.pdf');
    fs.writeFileSync(file, buf);
    await this.openPath(file);
    return { file, dir };
  }

  /* ---------- аккаунты и «Входящие» ---------- */
  _saveAccounts(list) { this.setSettings({ accounts: list }); return this.settings.accounts; }

  accountAdd(service) {
    if (!MESSENGERS.includes(service)) throw new Error('Неизвестный мессенджер.');
    const mine = this.accountsOf(service);
    if (mine.length >= MAX_ACCOUNTS) throw new Error('Достаточно: больше ' + MAX_ACCOUNTS + ' аккаунтов одного мессенджера не добавить.');
    let n = 1; while (mine.some((a) => a.n === n)) n++;
    return this._saveAccounts([...this.settings.accounts, { id: service + '-' + n, service, n, name: SERVICE_NAME[service] + ' ' + n, limit: null }]);
  }

  accountUpdate({ id, patch = {} }) {
    const list = this.settings.accounts.map((a) => {
      if (a.id !== id) return a;
      const next = { ...a };
      if (typeof patch.name === 'string') next.name = patch.name;
      if ('limit' in patch) next.limit = patch.limit;
      return next;
    });
    if (!list.some((a) => a.id === id)) throw new Error('Такого аккаунта нет.');
    return this._saveAccounts(list);
  }

  accountRemove(id) {
    if (!this.settings.accounts.some((a) => a.id === id)) throw new Error('Такого аккаунта нет.');
    return this._saveAccounts(this.settings.accounts.filter((a) => a.id !== id));
  }

  /** Диалоги по организациям, которым уже писали: с какого аккаунта и когда. */
  inboxList() {
    const rows = this.db.prepare(`SELECT l.id, l.name, l.short_name, l.rubric, l.status, l.channel,
      (SELECT sent_at FROM message_log m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_sent,
      (SELECT channel FROM message_log m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_channel,
      (SELECT account FROM message_log m WHERE m.lead_id = l.id ORDER BY m.id DESC LIMIT 1) AS last_account,
      (SELECT account_id FROM chat_bind b WHERE b.lead_id = l.id) AS bound
      FROM leads l WHERE l.status IN ('contacted','replied') ORDER BY last_sent DESC LIMIT 200`).all();
    return rows.map((r) => ({
      id: r.id, name: r.short_name || r.name, rubric: r.rubric || '', status: r.status,
      channel: r.last_channel || r.channel, accountId: r.last_account || r.bound || '', sentAt: r.last_sent || '',
    }));
  }

  /* ---------- нейросети ---------- */
  aiAvailable() {
    const st = this.ai.status();
    return { enabled: this.settings.ai.enabled, mode: st.mode, nextRetryAt: st.nextRetryAt };
  }

  /**
   * Текст сообщения: нейросеть, а если она недоступна, обычный шаблон.
   * Всегда возвращает готовый текст и пометку source: 'ai' или 'template'.
   */
  async generateMessage({ leadId, templateId } = {}) {
    const base = this.renderFor(leadId, templateId);
    if (!this.settings.ai.enabled) return { ...base, source: 'template', reason: 'disabled' };
    const lead = this.getLead(leadId);
    const r = await this.ai.generate({ lead, template: base.text, senderName: this.settings.senderName, tone: this.settings.ai.tone });
    if (!r.ok) return { ...base, source: 'template', reason: r.reason, nextRetryAt: r.nextRetryAt };
    return { templateId: base.templateId, text: r.text, source: 'ai', provider: r.provider, label: r.label };
  }

  aiStatus() { return { ...this.aiAvailable(), keys: this.ai.list(), canStoreKeys: this.ai.canStoreKeys(), certDir: this.ai.certDir() }; }
  aiProviders() { return this.ai.providerList(); }
  aiAdd(o) { const v = this.ai.add(o || {}); return v; }
  aiUpdate({ id, patch }) { return this.ai.update(id, patch); }
  aiRemove(id) { return this.ai.remove(id); }
  aiReorder(ids) { return this.ai.reorder(ids); }
  aiTest(id) { return this.ai.test(id); }
  async aiOpenCerts() {
    const dir = this.ai.certDir();
    if (!dir) return false;
    fs.mkdirSync(dir, { recursive: true });
    await this.openPath(dir);
    return true;
  }

  /** Пользователь сам отправил сообщение и подтверждает это. Автоотправки нет. */
  markSent({ leadId, templateId, text, source, provider, channel, accountId }) {
    const lead = this.getLead(leadId);
    if (!lead) throw new Error('Лид не найден.');
    const ch = MESSENGERS.includes(channel) ? channel : lead.channel;
    const acc = this.accountsOf(ch).find((a) => a.id === accountId) || null;
    this.db.prepare('INSERT INTO message_log (lead_id, channel, template_id, text, sent_at, source, provider, account) VALUES (?,?,?,?,?,?,?,?)')
      .run(lead.id, ch, templateId || '', String(text || ''), this.now().toISOString(), source === 'ai' ? 'ai' : 'template', source === 'ai' ? String(provider || '').slice(0, 40) : '', acc ? acc.id : '');
    dbApi.setStatus(this.db, lead.id, 'contacted');
    return this.counters();
  }
}

module.exports = { normalizeProxy, AppService, DEFAULT_SETTINGS, SETTINGS_VERSION, humanizeError, partitionFor };

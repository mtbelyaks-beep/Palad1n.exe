'use strict';
/**
 * Локальная база лидов на встроенном SQLite (node:sqlite, без сторонних пакетов).
 * Статус, заметки и теги пользователя никогда не затираются при повторном сборе.
 */
const { DatabaseSync } = require('node:sqlite');

const STATUSES = ['new', 'contacted', 'replied', 'agreed', 'paid', 'rejected'];

function openDb(file) {
  const db = new DatabaseSync(file || ':memory:');
  db.exec(`
    PRAGMA journal_mode = WAL;
    CREATE TABLE IF NOT EXISTS leads (
      id TEXT PRIMARY KEY,
      city TEXT NOT NULL,
      name TEXT NOT NULL,
      short_name TEXT,
      address TEXT,
      district TEXT,
      lat REAL, lon REAL,
      rubric TEXT,
      rating REAL,
      reviews INTEGER DEFAULT 0,
      org_id TEXT,
      branch_count INTEGER DEFAULT 1,
      is_chain INTEGER DEFAULT 0,
      site_class TEXT,
      tier TEXT,
      own_domain TEXT,
      phones TEXT,
      emails TEXT,
      whatsapp TEXT, telegram TEXT, telegram_phone TEXT, vk TEXT, max TEXT,
      channel TEXT, channel_target TEXT,
      score INTEGER DEFAULT 0,
      source_updated_at TEXT,
      status TEXT NOT NULL DEFAULT 'new',
      notes TEXT DEFAULT '',
      tags TEXT DEFAULT '',
      remind_at TEXT,
      first_seen TEXT NOT NULL,
      last_seen TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_leads_city_tier ON leads(city, tier, score DESC);
    CREATE INDEX IF NOT EXISTS idx_leads_status ON leads(status);
    CREATE TABLE IF NOT EXISTS blacklist (
      kind TEXT NOT NULL,          -- 'phone' | 'id' | 'org'
      value TEXT NOT NULL,
      added_at TEXT NOT NULL,
      PRIMARY KEY (kind, value)
    );
    CREATE TABLE IF NOT EXISTS runs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      city TEXT, query TEXT,
      started_at TEXT, finished_at TEXT,
      pages INTEGER DEFAULT 0, cards INTEGER DEFAULT 0, new_leads INTEGER DEFAULT 0, errors INTEGER DEFAULT 0
    );
  `);
  return db;
}

const now = () => new Date().toISOString();

/** Вставляет или обновляет лид. Возвращает 'new' или 'updated'. */
function upsertLead(db, city, lead) {
  const existed = db.prepare('SELECT 1 FROM leads WHERE id = ?').get(lead.id);
  const t = now();
  db.prepare(`
    INSERT INTO leads (id, city, name, short_name, address, district, lat, lon, rubric, rating, reviews, org_id,
      branch_count, is_chain, site_class, tier, own_domain, phones, emails, whatsapp, telegram, telegram_phone, vk, max,
      channel, channel_target, score, source_updated_at, first_seen, last_seen)
    VALUES (@id, @city, @name, @shortName, @address, @district, @lat, @lon, @rubric, @rating, @reviews, @orgId,
      @branchCount, @isChain, @siteClass, @tier, @ownDomain, @phones, @emails, @whatsapp, @telegram, @telegramPhone, @vk, @max,
      @channel, @channelTarget, @score, @updatedAt, @t, @t)
    ON CONFLICT(id) DO UPDATE SET
      name=excluded.name, short_name=excluded.short_name, address=excluded.address, district=excluded.district,
      lat=excluded.lat, lon=excluded.lon, rubric=excluded.rubric, rating=excluded.rating, reviews=excluded.reviews,
      org_id=excluded.org_id, branch_count=excluded.branch_count, is_chain=excluded.is_chain,
      site_class=excluded.site_class, tier=excluded.tier, own_domain=excluded.own_domain,
      phones=excluded.phones, emails=excluded.emails, whatsapp=excluded.whatsapp, telegram=excluded.telegram,
      telegram_phone=excluded.telegram_phone, vk=excluded.vk, max=excluded.max,
      channel=excluded.channel, channel_target=excluded.channel_target, score=excluded.score,
      source_updated_at=excluded.source_updated_at, last_seen=excluded.last_seen
  `).run({
    ...lead,
    city,
    isChain: lead.isChain ? 1 : 0,
    phones: JSON.stringify(lead.phones || []),
    emails: JSON.stringify(lead.emails || []),
    lat: lead.lat ?? null, lon: lead.lon ?? null, rating: lead.rating ?? null,
    t,
  });
  return existed ? 'updated' : 'new';
}

/** id, которые уже собраны недавно: их карточки повторно не запрашиваем. */
function knownIds(db, city, maxAgeDays = 7) {
  const since = new Date(Date.now() - maxAgeDays * 864e5).toISOString();
  return new Set(db.prepare('SELECT id FROM leads WHERE city = ? AND last_seen >= ?').all(city, since).map((r) => r.id));
}

function addBlacklist(db, kind, value) {
  db.prepare('INSERT OR IGNORE INTO blacklist (kind, value, added_at) VALUES (?, ?, ?)').run(kind, String(value), now());
}

function isBlacklisted(db, lead) {
  const q = db.prepare('SELECT 1 FROM blacklist WHERE kind = ? AND value = ?');
  if (q.get('id', lead.id) || (lead.orgId && q.get('org', lead.orgId))) return true;
  return (lead.phones || []).some((p) => q.get('phone', p));
}

function setStatus(db, id, status) {
  if (!STATUSES.includes(status)) throw new Error('bad status: ' + status);
  db.prepare('UPDATE leads SET status = ? WHERE id = ?').run(status, id);
}

/** Выборка для таблицы в приложении. Чёрный список и (по желанию) сети исключаются. */
function listLeads(db, f = {}) {
  const where = ['1=1'];
  const args = [];
  if (f.city) { where.push('city = ?'); args.push(f.city); }
  if (f.tiers && f.tiers.length) { where.push(`tier IN (${f.tiers.map(() => '?').join(',')})`); args.push(...f.tiers); }
  if (f.status) { where.push('status = ?'); args.push(f.status); }
  if (f.rubric) { where.push('rubric = ?'); args.push(f.rubric); }
  if (f.minScore) { where.push('score >= ?'); args.push(f.minScore); }
  if (f.minReviews) { where.push('reviews >= ?'); args.push(f.minReviews); }
  if (f.excludeChains) where.push('is_chain = 0');
  if (f.onlyReachable) where.push("channel != ''");
  const rows = db.prepare(`SELECT * FROM leads WHERE ${where.join(' AND ')} ORDER BY score DESC, reviews DESC LIMIT ?`)
    .all(...args, f.limit || 500)
    .map((r) => ({ ...r, phones: JSON.parse(r.phones || '[]'), emails: JSON.parse(r.emails || '[]') }));
  return rows.filter((r) => !isBlacklisted(db, { id: r.id, orgId: r.org_id, phones: r.phones }));
}

function stats(db, city) {
  return db.prepare(`
    SELECT rubric, tier, COUNT(*) AS n FROM leads WHERE city = ? GROUP BY rubric, tier ORDER BY rubric
  `).all(city);
}

module.exports = { openDb, upsertLead, knownIds, addBlacklist, isBlacklisted, setStatus, listLeads, stats, STATUSES };

'use strict';
/** Единая таблица «канал -> функция». Её используют и Electron, и тестовый стенд, поэтому интерфейс проверяется на той же логике. */
function buildHandlers(s) {
  return {
    'settings:get': () => s.getSettings(),
    'settings:set': (patch) => s.setSettings(patch),

    'search:start': (p) => s.startSearch(p),
    'search:stop': () => s.stopSearch(),
    'search:status': () => s.searchStatus(),
    'search:reveal': () => s.revealWindow(),

    'leads:list': (f) => s.listLeads(f),
    'leads:get': (id) => s.getLead(id),
    'leads:setStatus': ({ id, status }) => s.setStatus(id, status),
    'leads:update': ({ id, patch }) => s.updateLead(id, patch),
    'leads:blacklist': ({ id, kind }) => s.blacklistLead(id, kind || 'all'),
    'stats:get': (city) => s.stats(city),
    'leads:facets': (city) => s.facets(city),
    'net:check': () => s.netCheck(),
    'bg:video:pick': () => s.pickBgVideo(),
    'bg:video:clear': () => s.clearBgVideo(),
    'bg:video:url': () => s.bgVideoUrl(),
    'geo:resolve': (text) => require('./geo').resolvePlace(text),
    'geo:list': () => require('./geo').suggestions(),

    'blacklist:list': () => s.listBlacklist(),
    'blacklist:add': ({ kind, value }) => s.addBlacklistManual(kind, value),
    'blacklist:remove': ({ kind, value }) => s.removeBlacklist(kind, value),

    'queue:next': (o) => s.queueNext(o),
    'queue:render': ({ leadId, templateId }) => s.renderFor(leadId, templateId),
    'queue:open': ({ leadId, text, channel }) => s.openChat(leadId, text, { channel }),
    'chat:target': ({ leadId, text, channel, accountId }) => s.chatTarget(leadId, text, { channel, accountId }),

    'accounts:add': (service) => s.accountAdd(service),
    'accounts:update': (o) => s.accountUpdate(o),
    'accounts:remove': (id) => s.accountRemove(id),
    'inbox:list': () => s.inboxList(),

    'site:options': () => s.siteOptions(),
    'site:preview': (o) => s.sitePreview(o),
    'site:prompt': (o) => s.sitePrompt(o),
    'site:texts': (o) => s.siteTexts(o),
    'site:export': (o) => s.siteExport(o),

    'offer:preview': (o) => s.offerPreview(o),
    'offer:pdf': (o) => s.offerPdf(o),
    'queue:sent': (o) => s.markSent(o),
    'queue:counters': () => s.counters(),
    'queue:generate': (o) => s.generateMessage(o),

    'ai:status': () => s.aiStatus(),
    'ai:providers': () => s.aiProviders(),
    'ai:add': (o) => s.aiAdd(o),
    'ai:update': (o) => s.aiUpdate(o),
    'ai:remove': (id) => s.aiRemove(id),
    'ai:reorder': (ids) => s.aiReorder(ids),
    'ai:test': (id) => s.aiTest(id),
    'ai:certs': () => s.aiOpenCerts(),
  };
}

const EVENTS = ['search:progress', 'search:done', 'search:error', 'ai:state'];

module.exports = { buildHandlers, EVENTS };

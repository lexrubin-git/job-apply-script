// Apply Assistant extension (background). Connects job tabs in your Chrome to the Apply Assistant app on this
// computer. It only acts on tabs the app opened (and tabs those open), and never runs on LinkedIn or Handshake.

// The app opens jobs through http://127.0.0.1:<port>/go?j=<job id>&t=<key>, which tells us which tab is the job.
const GO = /^http:\/\/127\.0\.0\.1:(\d+)\/go\?j=([\w-]+)&t=([0-9a-f]+)/;

// Kept in local storage so the extension still knows its job tabs after it updates itself.
async function jobTabs() {
  return (await chrome.storage.local.get('jobTabs')).jobTabs || {};
}
async function saveTab(tabId, info) {
  const tabs = await jobTabs();
  if (info) tabs[tabId] = info;
  else delete tabs[tabId];
  await chrome.storage.local.set({ jobTabs: tabs });
}

// Tab numbers start over when Chrome restarts.
chrome.runtime.onStartup.addListener(() => chrome.storage.local.remove('jobTabs'));

// After an update or reload, the job tabs' page helpers are disconnected: attach fresh ones.
chrome.runtime.onInstalled.addListener(async () => {
  for (const id of Object.keys(await jobTabs()).map(Number)) {
    const frames = await chrome.webNavigation.getAllFrames({ tabId: id }).catch(() => null);
    if (frames) await attachHelper(id, frames);
    else await saveTab(id, null);
  }
});

async function api(info, path, body = {}) {
  const res = await fetch(`${info.origin}${path}`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-token': info.token },
    body: JSON.stringify({ jobId: info.jobId, ...body }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || res.statusText);
  return data;
}

// go.js runs on the app's /go page and reports in; the page's address says which job and app it belongs to.
async function claimTab(tabId, url) {
  const m = String(url || '').match(GO);
  if (tabId == null || !m) return { ok: false };
  const info = { origin: `http://127.0.0.1:${m[1]}`, jobId: m[2], token: m[3] };
  const version = chrome.runtime.getManifest().version_name;
  const r = await api(info, '/api/ext/claim', { version, retry: /[?&]r=1\b/.test(url) });
  // The app was updated since Chrome loaded this extension: reload it (the /go page then tries again).
  if (r.reload) {
    chrome.runtime.reload();
    return r;
  }
  await saveTab(tabId, info);
  await chrome.storage.local.set({ appOrigin: info.origin }); // where the app is, for the toolbar menu and side panel
  return r;
}

// Sites often open the application form in a new tab. Only tabs the job page itself opens (a link or popup)
// count; a new tab you open yourself doesn't.
chrome.webNavigation.onCreatedNavigationTarget.addListener(async ({ sourceTabId, tabId }) => {
  const parent = (await jobTabs())[sourceTabId];
  if (parent) await saveTab(tabId, parent);
});

chrome.tabs.onRemoved.addListener((tabId) => saveTab(tabId, null));

chrome.runtime.onMessage.addListener((msg, sender, reply) => {
  handle(msg, sender).then(reply, (e) => reply({ error: e.message }));
  return true; // reply comes later
});

// ---- "Import from tab" in the app: which page you're looking at ----
// The page you were on last in each window (not the app itself), so the app can import it even when it's open in its
// own tab. Only the address and title are used; the page itself isn't read.
const isAppPage = (url) => /^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(url || '');
const isWebPage = (url) => /^https?:\/\//i.test(url || '') && !isAppPage(url);
async function rememberPage(tab) {
  if (!tab || !isWebPage(tab.url)) return;
  const { lastPages = {} } = await chrome.storage.session.get('lastPages');
  lastPages[tab.windowId] = tab.id;
  await chrome.storage.session.set({ lastPages });
}
chrome.tabs.onActivated.addListener(({ tabId }) => chrome.tabs.get(tabId).then(rememberPage, () => {}));
chrome.tabs.onUpdated.addListener((tabId, change, tab) => {
  if (change.url && tab.active) rememberPage(tab);
});

// windowId: the window the side panel is in (it says), or the app tab's window, or else the window you used last.
async function currentPage(sender, windowId) {
  windowId ??= sender.tab?.windowId ?? (await chrome.windows.getLastFocused({ windowTypes: ['normal'] }).catch(() => null))?.id;
  const { lastPages = {} } = await chrome.storage.session.get('lastPages');
  // The page showing in that window, else the page you were on before switching to the app there, else the page
  // showing in any window.
  const seen = [
    ...(windowId != null ? await chrome.tabs.query({ active: true, windowId }) : []),
    lastPages[windowId] != null ? await chrome.tabs.get(lastPages[windowId]).catch(() => null) : null,
    ...(await chrome.tabs.query({ active: true, windowType: 'normal' })),
  ].filter(Boolean);
  const tab = seen.find((t) => isWebPage(t.url));
  if (tab) return { url: tab.url, title: tab.title || '' };
  return { error: seen.some((t) => !t.url) ? 'cant-read' : 'no page' };
}

async function handle(msg, sender) {
  const tabId = sender.tab?.id;
  if (msg.type === 'go') return claimTab(tabId, sender.url);
  // From the app's own page (bridge.js) or the side panel: only those may ask.
  if (msg.type === 'current-page') {
    const fromExtension = sender.url?.startsWith(chrome.runtime.getURL(''));
    if (!fromExtension && !isAppPage(sender.url)) return { error: 'not allowed' };
    return currentPage(sender, fromExtension && Number.isInteger(msg.windowId) ? msg.windowId : undefined);
  }
  const info = tabId == null ? null : (await jobTabs())[tabId];
  if (msg.type === 'whoami') return { jobTab: !!info };
  if (!info) return { error: 'Not an Apply Assistant tab.' };
  switch (msg.type) {
    case 'poll':
      return api(info, '/api/ext/poll');
    case 'page':
      return api(info, '/api/ext/page', { text: msg.text, title: msg.title });
    case 'cmd': {
      const m = msg.msg || {};
      if (m.type === 'hello') return api(info, '/api/ext/poll', { peek: true });
      if (m.type === 'learn') return api(info, '/api/ext/learn', { q: m.q, value: m.value });
      if (m.type === 'done' || m.type === 'skip') return api(info, '/api/ext/command', { type: m.type });
      if (m.type === 'fill') return fillTab(info, tabId);
      return null;
    }
    default:
      return null;
  }
}

// Never touch these, even when re-attaching the page helper below.
const NEVER = /^https?:\/\/([^/]+\.)?(linkedin\.com|licdn\.com|lnkd\.in|joinhandshake\.com|handshake\.com)(:\d+)?\//i;
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// Ask every frame of the tab for its form fields. `answered` = how many frames have the page helper running.
async function collectAll(info, tabId) {
  const frames = (await chrome.webNavigation.getAllFrames({ tabId })) || [];
  const fields = [];
  let answered = 0;
  for (const frame of frames) {
    const r = await chrome.tabs.sendMessage(tabId, { type: 'collect' }, { frameId: frame.frameId }).catch(() => null);
    if (!r) continue;
    answered++;
    for (const f of r.fields || []) fields.push({ ...f, frameId: frame.frameId });
    for (const l of r.learned || []) await api(info, '/api/ext/learn', l).catch(() => {});
  }
  return { frames, fields, answered };
}

// The page helper isn't running in this tab (for example, the tab was already open when the extension was set up
// or updated itself): attach it now, to the job's frames only.
async function attachHelper(tabId, frames) {
  const frameIds = frames.filter((f) => /^https?:/i.test(f.url) && !NEVER.test(f.url) && !/^https?:\/\/(127\.0\.0\.1|localhost)[:/]/i.test(f.url)).map((f) => f.frameId);
  if (!frameIds.length) return;
  await chrome.scripting.executeScript({ target: { tabId, frameIds }, files: ['inpage.js', 'shared.js', 'content.js'] }).catch(() => {});
  await wait(2500);
}

// "Fill this page": collect the fields from every frame of the tab, ask the app how to answer them, then fill.
const busyTabs = new Set();
async function fillTab(info, tabId) {
  if (busyTabs.has(tabId)) return null;
  busyTabs.add(tabId);
  try {
    await api(info, '/api/ext/status', { text: 'Reading the form…', busy: true });
    let { frames, fields, answered } = await collectAll(info, tabId);
    if (!answered) {
      await attachHelper(tabId, frames);
      ({ frames, fields, answered } = await collectAll(info, tabId));
    }
    if (!answered) return api(info, '/api/ext/filled', { empty: 'noscript' });
    const todo = fields.filter((f) => !f.filled);
    if (!todo.length) return api(info, '/api/ext/filled', { empty: fields.length ? 'filled' : 'none' });

    await api(info, '/api/ext/status', { text: 'Filling…', busy: true });
    const { decisions } = await api(info, '/api/ext/decide', { fields: todo });
    const byFrame = {};
    for (const f of todo) (byFrame[f.frameId] ||= []).push({ field: f, decision: decisions[`${f.frameId}:${f.id}`] });
    const results = [];
    for (const [frameId, items] of Object.entries(byFrame)) {
      const r = await chrome.tabs.sendMessage(tabId, { type: 'fill', items }, { frameId: Number(frameId) }).catch(() => null);
      results.push(...(r?.results || []));
    }
    const counts = { fact: 0, needs_you: 0 };
    const needs = [];
    for (const r of results) {
      if (r.status === 'skip') continue;
      counts[r.status]++;
      if (r.status === 'needs_you') needs.push({ question: r.question, note: r.note });
    }
    return api(info, '/api/ext/filled', { counts, needs });
  } catch (e) {
    await api(info, '/api/ext/status', { text: `Something went wrong: ${e.message}`, busy: false }).catch(() => {});
    return null;
  } finally {
    busyTabs.delete(tabId);
  }
}

// The toolbar button's menu: open the app in a tab or in Chrome's side panel, or add the page you're on to your job list.
// It only talks to the Apply Assistant app on this computer, and only reads the address of the tab you're on (when
// you click the button), never the page itself.
const $ = (id) => document.getElementById(id);
const DEFAULT_ORIGIN = 'http://127.0.0.1:47321';

async function appInfo() {
  const { appOrigin } = await chrome.storage.local.get('appOrigin');
  const origin = appOrigin || DEFAULT_ORIGIN;
  const res = await fetch(`${origin}/api/ext/app`, { method: 'POST' });
  if (!res.ok) throw new Error(String(res.status));
  return { origin, ...(await res.json()) };
}

let windowId = null; // looked up now: opening the side panel has to happen right when you click
chrome.windows.getCurrent().then((w) => (windowId = w.id));

(async () => {
  let app;
  try {
    app = await appInfo();
  } catch {
    $('status').textContent = "The Apply Assistant app isn't open. Start it from your Desktop, then click this button again.";
    return;
  }
  $('status').textContent = '✓ Connected to Apply Assistant.';
  $('openTab').disabled = false;
  $('openSide').disabled = false;
  $('openTab').addEventListener('click', async () => {
    await chrome.tabs.create({ url: app.url });
    window.close();
  });
  $('openSide').addEventListener('click', () => {
    chrome.sidePanel.open({ windowId }).then(() => window.close(), (e) => ($('status').textContent = `Couldn't open the side panel: ${e.message}`));
  });

  // The page you're on: a company's job page, or a LinkedIn/Handshake job posting (added as a link only; the app never
  // opens or reads it, your Chrome does when you start that job).
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const url = tab?.url || '';
  if (!/^https?:/i.test(url) || url.startsWith(app.origin)) {
    $('addNote').textContent = 'Go to a job page first';
    return;
  }
  const board = /(^|\.)(linkedin|joinhandshake|handshake)\.com$/i.test(new URL(url).hostname);
  if (board && app.mode !== 'chrome') {
    $('addNote').textContent = 'LinkedIn and Handshake jobs work when jobs open in your own Chrome (app → My info → Settings)';
    return;
  }
  $('addNote').textContent = board ? 'This LinkedIn/Handshake posting (you click Apply there when you get to it)' : new URL(url).hostname.replace(/^www\./, '');
  $('addPage').disabled = false;
  $('addPage').addEventListener('click', async () => {
    $('addPage').disabled = true;
    try {
      const res = await fetch(`${app.origin}/api/queue/add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ text: url }) });
      const r = await res.json();
      $('status').textContent = r.added ? '✓ Added to your job list.' : r.blocked || 'Already in your list (or already applied to).';
    } catch (e) {
      $('status').textContent = `Couldn't add it: ${e.message}`;
    }
  });
})();

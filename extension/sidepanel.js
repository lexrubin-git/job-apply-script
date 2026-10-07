// Chrome's side panel: the Apply Assistant app, next to whatever page you're browsing. Nothing is added to the page
// itself, so sites like LinkedIn can't see it.
const DEFAULT_ORIGIN = 'http://127.0.0.1:47321';

async function show() {
  const msg = document.getElementById('msg');
  const frame = document.getElementById('app');
  try {
    const { appOrigin } = await chrome.storage.local.get('appOrigin');
    const res = await fetch(`${appOrigin || DEFAULT_ORIGIN}/api/ext/app`, { method: 'POST' });
    if (!res.ok) throw new Error(String(res.status));
    const { url } = await res.json();
    if (frame.src !== url) frame.src = url;
    frame.hidden = false;
    msg.hidden = true;
  } catch {
    frame.hidden = true;
    msg.hidden = false;
    msg.replaceChildren(
      "The Apply Assistant app isn't open. Start it from your Desktop and this panel will connect.",
      Object.assign(document.createElement('br')),
      Object.assign(document.createElement('button'), { textContent: 'Try again', onclick: show }),
    );
    setTimeout(show, 5000); // keep trying until the app is open
  }
}
show();

// "Import from tab" in the app shown here: tell it which page is next to the panel.
window.addEventListener('message', async (e) => {
  const frame = document.getElementById('app');
  if (e.source !== frame.contentWindow || e.data?.type !== 'jaa-current-page?') return;
  // The side panel belongs to one window: ask for the page showing in that window.
  const { id: windowId } = await chrome.windows.getCurrent();
  const page = await chrome.runtime.sendMessage({ type: 'current-page', windowId }).catch(() => ({ error: 'extension reloaded' }));
  frame.contentWindow.postMessage({ type: 'jaa-current-page', id: e.data.id, page }, new URL(frame.src).origin);
});

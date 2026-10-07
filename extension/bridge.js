// Apply Assistant extension. Runs only on the app's own page (http://127.0.0.1:<port>/ opened in Chrome) and lets its
// "Import from tab" button ask which page you're looking at. Answers only the Apply Assistant page.
window.addEventListener('message', async (e) => {
  // Inside the side panel, the panel itself answers (it knows its window), so this only answers the app in a tab.
  if (window.top !== window) return;
  if (e.source !== window || e.data?.type !== 'jaa-current-page?' || !document.querySelector('meta[name="apply-assistant"]')) return;
  let page;
  try {
    page = await chrome.runtime.sendMessage({ type: 'current-page' });
  } catch {
    page = { error: 'extension reloaded' };
  }
  window.postMessage({ type: 'jaa-current-page', id: e.data.id, page }, location.origin);
});
// Tell the page the extension is here (so it can offer the button).
window.postMessage({ type: 'jaa-bridge' }, location.origin);

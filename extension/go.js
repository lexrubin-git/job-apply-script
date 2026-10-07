// Apply Assistant extension. Runs only on the app's own "Opening job…" page (http://127.0.0.1:<port>/go?...),
// and tells the extension that this tab is the job the app just opened.
chrome.runtime.sendMessage({ type: 'go' }).catch(() => {});

// Apply Assistant extension (runs on pages). Does nothing unless this tab was opened by the Apply Assistant app.
// Uses jaaInit (inpage.js: reads the form, draws the panel) and bestMatch/normalizeQuestion (shared.js),
// both generated from the app's own code so they behave the same as the separate-window mode.
(async () => {
  // Asked twice, because a tab the job page just opened may be registered a moment after this runs.
  const isJobTab = () => chrome.runtime.sendMessage({ type: 'whoami' }).then((r) => !!r?.jobTab, () => false);
  if (!(await isJobTab()) && !(await wait(1500).then(isJobTab))) return;
  // Nothing to show if the app is closed or has moved on to another job.
  const hello = await chrome.runtime.sendMessage({ type: 'cmd', msg: { type: 'hello' } }).catch(() => null);
  if (!hello?.active) return;

  // The panel and form code talk to the app through this.
  window.jaaCommand = async (msg) => {
    const r = await chrome.runtime.sendMessage({ type: 'cmd', msg });
    return msg?.type === 'hello' && r ? { text: r.text, busy: r.busy, where: r.where } : r;
  };
  // Re-attached after the extension was updated: clear the old copy's panel and highlights so this one draws its own.
  if (!window.__jaa) document.querySelectorAll('[data-jaa-ui]').forEach((el) => el.remove());
  jaaInit();

  chrome.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (msg.type === 'collect') {
      reply({ fields: window.__jaa.collect(), learned: window.__jaa.harvest().map((x) => ({ q: x.q, value: x.value })) });
      return false;
    }
    if (msg.type === 'fill') {
      fillItems(msg.items).then((results) => reply({ results }), () => reply({ results: [] }));
      return true;
    }
    return false;
  });

  if (window.top !== window) return;

  // Send the page text for the match score once it's loaded.
  const sendText = () => {
    let text = document.body?.innerText || '';
    for (const s of document.querySelectorAll('select')) if (s.innerText.length > 200) text = text.replace(s.innerText, '');
    chrome.runtime.sendMessage({ type: 'page', text: text.slice(0, 12000), title: document.querySelector('h1')?.innerText || document.title }).catch(() => {});
  };
  setTimeout(sendText, 2500);

  // Keep the panel's status up to date, and pick up "Fill this page" clicked in the app window.
  const timer = setInterval(async () => {
    let s;
    try {
      s = await chrome.runtime.sendMessage({ type: 'poll' });
    } catch {
      return clearInterval(timer); // extension reloaded
    }
    if (!s || s.error) return;
    if (!s.active) {
      window.__jaa.close();
      return clearInterval(timer);
    }
    window.__jaa.setStatus(s.text, s.busy);
    window.__jaa.setWhere(s.where);
    if (s.fill) window.jaaCommand({ type: 'fill' });
  }, 1200);
})();

// ---------------- filling (inside this page) ----------------
var wait = (ms) => new Promise((r) => setTimeout(r, ms));
var clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
var AUTOCOMPLETE_Q = /location|city|address|school|university|college|employer|company/i;
var SUGGESTION_SEL = '[role="option"], .pac-item, .dropdown-results > *, [class*="suggestion"], [class*="autocomplete"] li';

function shown(el) {
  const r = el.getBoundingClientRect();
  if (r.width < 1 || r.height < 1) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
}

// Set a value the way typing would, so sites built with React and similar libraries notice it.
function setValue(el, value) {
  const proto = el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value').set.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}

// Some search-as-you-type boxes (like Lever's location) only search on key presses, not on input events.
function keyTap(el, value) {
  const key = String(value).slice(-1) || 'a';
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true }));
}

function press(el) {
  for (const type of ['pointerdown', 'mousedown', 'pointerup', 'mouseup']) {
    el.dispatchEvent(new MouseEvent(type, { bubbles: true, cancelable: true, view: window }));
  }
  el.click();
}

var byId = (id) => document.querySelector(`[data-jaa-id="${CSS.escape(id)}"]`);
var group = (id) => [...document.querySelectorAll(`[data-jaa-group="${CSS.escape(id)}"]`)];

async function pickSuggestion(value, selector = SUGGESTION_SEL) {
  const options = [...document.querySelectorAll(selector)].filter(shown);
  const texts = options.map((o) => clean(o.innerText));
  let i = bestMatch(value, texts);
  const first = normalizeQuestion(value).split(' ')[0];
  if (i < 0) i = texts.findIndex((t) => t && normalizeQuestion(t).startsWith(first));
  if (i < 0) return false;
  press(options[i]);
  await wait(300);
  return true;
}

async function fillOne(f, value, file) {
  const el = byId(f.id);
  if (!el && !['radio', 'checkboxes', 'buttons'].includes(f.kind)) return false;
  el?.scrollIntoView({ block: 'center' });
  switch (f.kind) {
    case 'text':
    case 'textarea': {
      el.focus();
      setValue(el, value);
      if (f.kind === 'text' && (f.autocomplete || AUTOCOMPLETE_Q.test(f.question || ''))) {
        keyTap(el, value);
        await wait(1500);
        await pickSuggestion(value);
      }
      el.dispatchEvent(new Event('blur', { bubbles: true }));
      return clean(el.value) !== '';
    }
    case 'richtext': {
      el.focus();
      document.execCommand('selectAll', false);
      document.execCommand('insertText', false, value);
      return clean(el.innerText) !== '';
    }
    case 'select': {
      const opts = [...el.options].filter((o) => o.value !== '');
      const i = bestMatch(value, opts.map((o) => o.text.trim()));
      if (i < 0) return false;
      setValue(el, opts[i].value);
      return true;
    }
    case 'radio': {
      const radios = group(f.id);
      const i = bestMatch(value, f.options || []);
      if (i < 0 || !radios[i]) return false;
      if (!radios[i].checked) radios[i].click();
      return radios[i].checked;
    }
    case 'checkbox': {
      const want = /^(yes|true|checked|check|y|1)$/i.test(clean(value));
      if (el.checked !== want) el.click();
      return el.checked === want;
    }
    case 'checkboxes': {
      const boxes = group(f.id);
      let any = false;
      for (const pick of String(value).split('|').map(clean).filter(Boolean)) {
        const i = bestMatch(pick, f.options || []);
        if (i < 0 || !boxes[i]) continue;
        if (!boxes[i].checked) boxes[i].click();
        any = boxes[i].checked || any;
      }
      return any;
    }
    case 'buttons': {
      const btns = group(f.id);
      const i = bestMatch(value, f.options || []);
      if (i < 0 || !btns[i]) return false;
      press(btns[i]);
      return true;
    }
    case 'combobox': {
      press(el);
      el.focus();
      await wait(400);
      if (await pickSuggestion(value, '[role="option"]')) return true;
      if (el.tagName !== 'INPUT') {
        el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
        return false;
      }
      // Type-to-search: try the full answer, then just the part before a comma ("Temple City, CA" -> "Temple City").
      const searches = [String(value).slice(0, 40)];
      if (String(value).includes(',')) searches.push(String(value).split(',')[0].trim());
      for (const search of searches) {
        setValue(el, search);
        keyTap(el, search);
        await wait(1500);
        if (await pickSuggestion(value, '[role="option"]')) return true;
        if (await pickSuggestion(search, '[role="option"]')) return true;
      }
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return false;
    }
    case 'file': {
      if (!file) return false;
      const bytes = Uint8Array.from(atob(file.base64), (c) => c.charCodeAt(0));
      const dt = new DataTransfer();
      dt.items.add(new File([bytes], file.name, { type: file.type }));
      el.files = dt.files;
      el.dispatchEvent(new Event('input', { bubbles: true }));
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return el.files.length > 0;
    }
    default:
      return false;
  }
}

async function fillItems(items) {
  const results = [];
  for (const { field: f, decision: d } of items) {
    const question = f.question || f.placeholder || '(unlabeled field)';
    if (!d || d.source === 'skip') {
      results.push({ status: 'skip' });
      continue;
    }
    let status = d.source === 'needs_you' ? 'needs_you' : 'fact';
    let note = d.note || '';
    if (status === 'fact') {
      // Choice fields may word the answer differently ("Spring 2027" vs "May 2027"), so try each form.
      const tries = ['text', 'textarea', 'richtext'].includes(f.kind) ? [d.value] : [d.value, ...(d.alternatives || [])];
      let ok = false;
      for (const v of tries) {
        try {
          ok = await fillOne(f, v, d.file);
        } catch {
          ok = false;
        }
        if (ok) break;
      }
      if (!ok) {
        status = 'needs_you';
        note = `Couldn't fill this automatically. Your answer: ${String(d.value).slice(0, 300)}`;
      } else if (d.review) {
        status = 'needs_you'; // filled, but you asked to double-check this saved answer
      }
    }
    window.__jaa.mark(f.id, status, note, d.learnable !== false);
    results.push({ status, question, note });
  }
  return results;
}

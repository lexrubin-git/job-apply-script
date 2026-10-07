// Generated from src/inpage.js by the app. Don't edit here.
var jaaInit =function inPageInit() {
  if (window.__jaa) return;
  const W = window;
  const key = Math.random().toString(36).slice(2, 7);
  let counter = 0;

  const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
  const textOf = (el) => (el ? clean(el.innerText || el.textContent) : '');
  const GENERIC = /^(select|choose|please select|select one|select an option|select\.\.\.|--|search|start typing|type to search|type here)\b/i;
  const FIELD_SEL =
    'input:not([type=hidden]), select, textarea, [contenteditable="true"], [role="combobox"], button[aria-haspopup="listbox"]';

  // Run `fn` once the page has loaded and its framework has finished hydrating. Adding nodes
  // earlier makes React/Remix sites throw hydration errors and re-render, wiping what we added.
  function whenSettled(fn) {
    let done = false;
    const run = () => {
      if (!done) {
        done = true;
        fn();
      }
    };
    if (document.readyState === 'complete') setTimeout(run, 800);
    else addEventListener('load', () => setTimeout(run, 800), { once: true });
    setTimeout(run, 10000);
  }

  // ---- Highlight boxes: drawn in our own layer so site CSS can't hide or clip them ----
  const COLORS = { fact: '#16a34a', written: '#2563eb', needs_you: '#f97316' };
  const boxes = new Map(); // target element -> { box, status }
  let layer = null;

  function ensureLayer() {
    if (layer && layer.isConnected) return layer;
    const host = document.createElement('div');
    host.setAttribute('data-jaa-ui', 'layer');
    host.style.cssText = 'position:fixed;inset:0;pointer-events:none;z-index:2147483646;';
    layer = host.attachShadow({ mode: 'open' });
    document.documentElement.appendChild(host);
    for (const b of boxes.values()) layer.appendChild(b.box);
    return layer;
  }

  function positionBoxes() {
    for (const [target, b] of boxes) {
      if (!target.isConnected) {
        b.box.remove();
        boxes.delete(target);
        continue;
      }
      const r = target.getBoundingClientRect();
      const hidden = r.width < 1 || r.height < 1;
      b.box.style.display = hidden ? 'none' : 'block';
      if (!hidden) {
        b.box.style.left = `${r.left - 4}px`;
        b.box.style.top = `${r.top - 4}px`;
        b.box.style.width = `${r.width + 8}px`;
        b.box.style.height = `${r.height + 8}px`;
      }
    }
  }
  let ticking = false;
  const schedule = () => {
    if (ticking || !boxes.size) return;
    ticking = true;
    requestAnimationFrame(() => {
      ticking = false;
      positionBoxes();
    });
  };
  addEventListener('scroll', schedule, true);
  addEventListener('resize', schedule);
  setInterval(schedule, 300);

  function drawBox(target, status) {
    ensureLayer();
    let b = boxes.get(target);
    if (!b) {
      const box = document.createElement('div');
      box.style.cssText = 'position:fixed;box-sizing:border-box;border-radius:6px;pointer-events:none;';
      layer.appendChild(box);
      b = { box };
      boxes.set(target, b);
    }
    b.box.style.border = `${status === 'needs_you' ? 3 : 2}px solid ${COLORS[status] || '#888'}`;
    positionBoxes();
  }

  function visible(el) {
    if (!el || !el.isConnected || !el.getBoundingClientRect) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    const s = getComputedStyle(el);
    return s.visibility !== 'hidden' && s.display !== 'none';
  }

  function byIds(ids) {
    return clean(ids.split(/\s+/).map((id) => textOf(document.getElementById(id))).join(' '));
  }

  function ownLabel(el) {
    const lb = el.getAttribute('aria-labelledby');
    if (lb) {
      const t = byIds(lb);
      if (t) return t;
    }
    if (el.labels && el.labels.length) {
      const t = clean([...el.labels].map(textOf).join(' '));
      if (t) return t;
    }
    return clean(el.getAttribute('aria-label'));
  }

  // Look backwards (previous siblings, then up a level) for the text that labels a field.
  function nearbyText(el, levels = 5) {
    let node = el;
    for (let i = 0; i < levels && node && node !== document.body; i++) {
      let sib = node.previousElementSibling;
      for (let hops = 0; sib && hops < 4; hops++, sib = sib.previousElementSibling) {
        if (sib.matches('script,style,template')) continue;
        if (sib.matches(FIELD_SEL) || sib.querySelector(FIELD_SEL)) break;
        const t = textOf(sib);
        if (t && t.length <= 500) return t;
      }
      node = node.parentElement;
    }
    return '';
  }

  // Upload inputs are usually labeled just "Attach"/"Upload"; the real question sits higher up.
  const GENERIC_UPLOAD = /^(attach|upload|browse|choose( a)? files?|select( a)? files?|drop|drag|enter manually|dropbox|google drive|or)\b/i;
  function fileQuestion(el) {
    const own = ownLabel(el);
    if (own && !GENERIC_UPLOAD.test(own)) return own;
    let node = el;
    for (let i = 0; i < 7 && node && node !== document.body; i++) {
      const lb = node !== el && node.getAttribute('aria-labelledby');
      if (lb) {
        const t = byIds(lb);
        if (t && !GENERIC_UPLOAD.test(t)) return t;
      }
      let sib = node.previousElementSibling;
      for (let hops = 0; sib && hops < 3; hops++, sib = sib.previousElementSibling) {
        if (sib.matches('script,style,template') || sib.querySelector('input[type=file]')) continue;
        const t = textOf(sib);
        if (t && t.length <= 200 && !GENERIC_UPLOAD.test(t)) return t;
      }
      node = node.parentElement;
    }
    return own;
  }

  function contextText(el, levels = 5) {
    let n = el.parentElement;
    for (let i = 0; i < levels && n && n !== document.body; i++, n = n.parentElement) {
      const t = textOf(n);
      if (t) return t.slice(0, 300);
    }
    return '';
  }

  function commonAncestor(nodes) {
    let a = nodes[0].parentElement;
    while (a && !nodes.every((n) => a.contains(n))) a = a.parentElement;
    return a || document.body;
  }

  function optionLabel(input) {
    return ownLabel(input) || textOf(input.parentElement) || clean(input.value);
  }

  // A heading inside the group's box that isn't one of the option labels (e.g. Ashby's <label class=heading>).
  function headingInside(container, members) {
    const own = new Set(members.flatMap((m) => [...(m.labels || [])]));
    const sel = 'legend, label, h1, h2, h3, h4, h5, h6, [class*="heading"], [class*="question"], [class*="label"], [class*="title"]';
    for (const h of container.querySelectorAll(sel)) {
      if (own.has(h) || h.querySelector(FIELD_SEL) || members.some((m) => h.contains(m))) continue;
      const t = textOf(h);
      if (t && !members.some((m) => textOf(m) === t || optionLabel(m) === t)) return t;
    }
    return '';
  }

  function groupQuestion(members, container) {
    const g = members[0].closest('[role=radiogroup],[role=group],fieldset');
    if (g && members.every((i) => g.contains(i))) {
      const lb = g.getAttribute('aria-labelledby');
      if (lb) {
        const t = byIds(lb);
        if (t) return t;
      }
      const a = clean(g.getAttribute('aria-label'));
      if (a) return a;
      const t = headingInside(g, members);
      if (t) return t;
    }
    return headingInside(container, members) || nearbyText(container);
  }

  // Yes/No answered with buttons over a hidden checkbox (Ashby).
  function buttonChoices(el) {
    const box = el.parentElement;
    if (!box) return null;
    const btns = [...box.querySelectorAll(':scope > button, :scope > [role=button]')];
    return btns.length >= 2 && btns.length <= 6 && btns.every((b) => textOf(b)) ? { box, btns } : null;
  }

  function comboValue(el) {
    if (el.tagName === 'BUTTON') {
      const t = textOf(el);
      return GENERIC.test(t) ? '' : t;
    }
    if (el.tagName === 'INPUT' && clean(el.value)) return clean(el.value);
    // react-select style widgets show the chosen value next to the input, inside a "control" box.
    const box = el.closest('[class*="control"],[class*="Control"]') || el.parentElement;
    if (!box) return '';
    let t = textOf(box);
    const ph = box.querySelector('[class*="placeholder"],[class*="Placeholder"]');
    if (ph) t = clean(t.replace(textOf(ph), ''));
    return GENERIC.test(t) ? '' : t;
  }

  function newId(el) {
    if (!el.dataset.jaaId) el.dataset.jaaId = `${key}-${++counter}`;
    return el.dataset.jaaId;
  }

  function collect() {
    const out = [];
    const seen = new Set();
    for (const el of document.querySelectorAll(FIELD_SEL)) {
      if (el.closest('header,nav,footer,[aria-hidden="true"],[data-jaa-ui]')) continue;
      if (el.disabled) continue;
      const tag = el.tagName;
      const type = (el.getAttribute('type') || '').toLowerCase();
      const role = el.getAttribute('role');
      let kind;
      if (tag === 'SELECT') kind = 'select';
      else if (tag === 'TEXTAREA') kind = 'textarea';
      else if (tag === 'BUTTON') kind = 'combobox';
      else if (tag === 'INPUT') {
        if (['submit', 'button', 'reset', 'image', 'password', 'range', 'color'].includes(type)) continue;
        if (type === 'search' && role !== 'combobox') continue;
        if (type === 'radio') kind = 'radio';
        else if (type === 'checkbox') kind = 'checkbox';
        else if (type === 'file') kind = 'file';
        else kind = role === 'combobox' || el.getAttribute('aria-autocomplete') === 'list' ? 'combobox' : 'text';
      } else if (role === 'combobox') {
        if (el.querySelector('input')) continue;
        kind = 'combobox';
      } else if (el.isContentEditable) {
        if (el.parentElement && el.parentElement.isContentEditable) continue;
        kind = 'richtext';
      } else continue;
      if (kind === 'text' && el.readOnly) continue;

      const shown =
        kind === 'file'
          ? [el, el.parentElement, el.parentElement && el.parentElement.parentElement].some(visible)
          : kind === 'radio' || kind === 'checkbox'
            ? visible(el) || [...(el.labels || [])].some(visible) || visible(el.parentElement)
            : visible(el);
      if (!shown) continue;

      if (kind === 'checkbox') {
        const bc = buttonChoices(el);
        if (bc) {
          if (seen.has(bc.box)) continue;
          seen.add(bc.box);
          const id = newId(bc.box);
          bc.btns.forEach((b) => (b.dataset.jaaGroup = id));
          const forLabel = el.name && document.querySelector(`label[for="${CSS.escape(el.name)}"]`);
          const question = (textOf(forLabel) || headingInside(bc.box.parentElement || bc.box, bc.btns) || nearbyText(bc.box)).slice(0, 400);
          bc.box.dataset.jaaQ = question;
          out.push({
            id,
            kind: 'buttons',
            question,
            options: bc.btns.map(textOf),
            required: !!(forLabel && /required/i.test(forLabel.className)) || /\*/.test(question),
            filled: bc.btns.some((b) => b.getAttribute('aria-pressed') === 'true'),
          });
          continue;
        }
      }

      // Radio buttons and checkbox lists become one field per question.
      if (kind === 'radio' || kind === 'checkbox') {
        let group = [el];
        if (el.name) group = [...document.querySelectorAll(`input[type="${kind}"][name="${CSS.escape(el.name)}"]`)];
        if (kind === 'checkbox' && group.length < 2) {
          const box = el.closest('fieldset,[role=group]');
          const inBox = box ? [...box.querySelectorAll('input[type=checkbox]')] : [];
          if (inBox.length >= 2) group = inBox;
        }
        if (group.some((i) => seen.has(i))) continue;
        group.forEach((i) => seen.add(i));
        if (kind === 'radio' || group.length > 1) {
          const g = el.closest('[role=radiogroup],[role=group],fieldset');
          const container = g && group.every((i) => g.contains(i)) ? g : commonAncestor(group);
          const id = newId(container);
          group.forEach((i) => (i.dataset.jaaGroup = id));
          const question = groupQuestion(group, container).slice(0, 400);
          container.dataset.jaaQ = question;
          out.push({
            id,
            kind: kind === 'radio' ? 'radio' : 'checkboxes',
            question,
            options: group.map(optionLabel),
            required: group.some((i) => i.required || i.getAttribute('aria-required') === 'true') || /\*/.test(question),
            filled: group.some((i) => i.checked),
          });
          continue;
        }
      }

      const id = newId(el);
      let question = kind === 'file' ? fileQuestion(el) : ownLabel(el) || nearbyText(el);
      // A <label> wrapped around a <select> also contains every option's text; keep just the question.
      if (kind === 'select') for (const o of el.options) if (clean(o.text).length > 2) question = question.replace(clean(o.text), '');
      question = clean(question).slice(0, 400);
      const placeholder = clean(el.getAttribute('placeholder'));
      const field = {
        id,
        kind,
        question,
        placeholder: placeholder || undefined,
        required: el.required || el.getAttribute('aria-required') === 'true' || /\*/.test(question),
      };
      if (kind === 'text' || kind === 'textarea') {
        field.filled = !!clean(el.value);
        if (kind === 'text') field.inputType = type || 'text';
        if (el.getAttribute('aria-autocomplete') || el.getAttribute('list')) field.autocomplete = true;
        if (el.maxLength > 0 && el.maxLength < 100000) field.maxLength = el.maxLength;
      } else if (kind === 'richtext') {
        field.filled = !!textOf(el);
      } else if (kind === 'select') {
        field.options = [...el.options].filter((o) => o.value !== '' && !GENERIC.test(clean(o.text))).map((o) => clean(o.text));
        const cur = el.selectedOptions[0];
        field.filled = !!(cur && cur.value !== '' && !GENERIC.test(clean(cur.text)));
      } else if (kind === 'checkbox') {
        field.filled = el.checked;
        field.context = contextText(el.closest('label') || el, 4);
      } else if (kind === 'combobox') {
        field.filled = !!comboValue(el);
      } else if (kind === 'file') {
        field.filled = !!(el.files && el.files.length);
        field.context = clean(`${contextText(el)} ${el.name || ''} ${el.id || ''}`);
      }
      el.dataset.jaaQ = question || placeholder;
      out.push(field);
    }
    return out;
  }

  function find(id) {
    return document.querySelector(`[data-jaa-id="${CSS.escape(id)}"]`);
  }

  function mark(id, status, note, learnable) {
    const el = find(id);
    if (!el) return;
    // Box the smallest element around the field that's big enough to see
    // (custom dropdowns and upload buttons hide or shrink the real input).
    let target = el;
    for (let i = 0; i < 8 && target.parentElement && target !== document.body; i++) {
      const r = target.getBoundingClientRect();
      if (visible(target) && r.width >= 120 && r.height >= 28) break;
      target = target.parentElement;
    }
    drawBox(target, status);
    el.dataset.jaaStatus = status;
    if (learnable === false) el.dataset.jaaLearn = 'no';
    if (note) target.title = `Apply Assistant: ${note}`;
  }

  function currentValue(el) {
    const isGroup = !/^(INPUT|SELECT|TEXTAREA|BUTTON)$/.test(el.tagName) && !el.isContentEditable && el.getAttribute('role') !== 'combobox';
    if (isGroup) {
      const members = [...document.querySelectorAll(`[data-jaa-group="${CSS.escape(el.dataset.jaaId)}"]`)];
      const picked = members.filter((m) => (m.tagName === 'INPUT' ? m.checked : m.getAttribute('aria-pressed') === 'true'));
      return picked.map((m) => (m.tagName === 'INPUT' ? optionLabel(m) : textOf(m))).join(' | ');
    }
    if (el.tagName === 'SELECT') {
      const o = el.selectedOptions[0];
      return o && o.value !== '' ? clean(o.text) : '';
    }
    if (el.type === 'checkbox') return el.checked ? 'Yes' : '';
    if (el.type === 'file') return '';
    if (el.tagName === 'BUTTON' || el.getAttribute('role') === 'combobox') return comboValue(el);
    if (el.isContentEditable) return textOf(el);
    return clean(el.value);
  }

  // Answers you typed into orange fields, so the tool can remember them.
  function harvest() {
    return [...document.querySelectorAll('[data-jaa-status="needs_you"]')]
      .filter((el) => el.dataset.jaaLearn !== 'no')
      .map((el) => ({ q: el.dataset.jaaQ || '', value: currentValue(el) }))
      .filter((x) => x.q && x.value);
  }

  // Send what you typed into orange fields to the tool as you go, so it's saved even after you submit and the page
  // changes. Search-as-you-type dropdowns never fire "change", so this also checks every second and the moment you
  // click anything (like Submit).
  const sent = new WeakMap();
  function learnSweep(includeFocused) {
    if (typeof W.jaaCommand !== 'function') return;
    for (const el of document.querySelectorAll('[data-jaa-status="needs_you"]')) {
      if (el.dataset.jaaLearn === 'no') continue;
      const active = document.activeElement;
      if (!includeFocused && active && (el === active || el.contains(active))) continue; // still typing
      const q = el.dataset.jaaQ;
      const value = currentValue(el);
      if (!q || !value || sent.get(el) === value) continue;
      sent.set(el, value);
      W.jaaCommand({ type: 'learn', q, value }).catch(() => {});
    }
  }
  setInterval(() => learnSweep(false), 1000);
  document.addEventListener('change', () => learnSweep(true), true);
  document.addEventListener('focusout', () => setTimeout(() => learnSweep(false), 0), true);
  document.addEventListener('pointerdown', () => learnSweep(true), true);
  document.addEventListener('keydown', (e) => e.key === 'Enter' && learnSweep(true), true);
  addEventListener('pagehide', () => learnSweep(true));

  // ---- Floating panel (top window only) ----
  let statusEl = null;
  let pending = { text: 'Starting…', busy: false };

  function setStatus(text, busy) {
    pending = { text, busy };
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.parentElement.classList.toggle('busy', !!busy);
  }

  // "Where" box: location and distance, remote / hybrid / on-site, relocation, and how that fits your settings.
  let whereEl = null;
  let whereData = null;
  let whereShown = '';
  function setWhere(w) {
    whereData = w || null;
    if (!whereEl) return;
    const key = JSON.stringify(whereData);
    if (key === whereShown) return;
    whereShown = key;
    whereEl.hidden = !whereData;
    if (!whereData) return;
    const n = whereData.nearest;
    const more = whereData.places.length > 1 ? ` +${whereData.places.length - 1} more` : '';
    const loc = n ? `${n.label}${n.miles != null ? ` · ${n.miles.toLocaleString()} mi away` : ''}${more}` : whereData.places.join(', ') || 'Not stated';
    const from = (x) => (x?.quote ? `From the job description: "${x.quote}"` : x?.from === 'listing' ? 'From the job listing' : '');
    const set = (cls, text, tip) => {
      const el = whereEl.querySelector(cls);
      el.textContent = text;
      el.title = tip || '';
    };
    set('.loc', loc, whereData.places.length > 1 ? whereData.places.join('\n') : '');
    set('.type', whereData.workType.value || 'Not stated', from(whereData.workType));
    set('.reloc', whereData.relocation.label, from(whereData.relocation));
    const v = whereEl.querySelector('.verdict');
    v.hidden = !whereData.verdict;
    if (whereData.verdict) {
      v.className = `verdict ${whereData.verdict.level}`;
      v.textContent = `${{ good: '✓ ', warn: '⚠ ' }[whereData.verdict.level] || ''}${whereData.verdict.text}`;
    }
  }

  // The app moved on from this job: take the panel and highlights off the page for good.
  let closed = false;
  function close() {
    closed = true;
    for (const el of document.querySelectorAll('[data-jaa-ui="panel"], [data-jaa-ui="layer"]')) el.remove();
  }

  function buildPanel() {
    if (closed || W.top !== W || !document.documentElement || document.querySelector('[data-jaa-ui="panel"]')) return;
    const host = document.createElement('div');
    host.setAttribute('data-jaa-ui', 'panel');
    host.style.cssText = 'position:fixed;right:16px;bottom:16px;z-index:2147483647;';
    const root = host.attachShadow({ mode: 'open' });
    root.innerHTML = `
      <style>
        :host { all: initial; }
        /* Windows 98 look, to match the app window */
        .panel { width: 276px; font: 12px/1.35 "Microsoft Sans Serif", "MS Sans Serif", Tahoma, sans-serif; color: #000; background: #c0c0c0; padding: 3px;
          box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #dfdfdf, inset -2px -2px #808080, inset 2px 2px #fff, 4px 4px 0 rgba(0,0,0,.25); }
        .head { display: flex; align-items: center; justify-content: space-between; height: 20px; padding: 0 3px 0 4px; color: #fff; font-weight: bold;
          background: linear-gradient(90deg, #000080, #1084d0); cursor: move; user-select: none; }
        .head button { all: unset; box-sizing: border-box; width: 16px; height: 14px; background: #c0c0c0; color: #000; display: grid; place-items: center;
          font: bold 11px/1 Tahoma, sans-serif; box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; }
        .head button:active { box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080; }
        .body { padding: 8px 6px 6px; display: grid; gap: 7px; }
        .statuswrap { background: #fff; padding: 5px 6px; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080, inset -2px -2px #dfdfdf, inset 2px 2px #0a0a0a; }
        .status { white-space: pre-wrap; max-height: 150px; overflow: auto; }
        .marq { display: none; height: 14px; margin-top: 5px; padding: 2px; overflow: hidden; box-shadow: inset -1px -1px #fff, inset 1px 1px #808080; }
        .marq i { display: block; width: 30%; height: 100%; background: repeating-linear-gradient(90deg, #000080 0 7px, transparent 7px 9px);
          animation: marq 1.5s linear infinite; }
        .busy .marq { display: block; }
        @keyframes marq { from { margin-left: -30%; } to { margin-left: 100%; } }
        button.act { all: unset; box-sizing: border-box; text-align: center; min-height: 23px; padding: 4px 8px; background: #c0c0c0; cursor: default;
          box-shadow: inset -1px -1px #0a0a0a, inset 1px 1px #fff, inset -2px -2px #808080, inset 2px 2px #dfdfdf; }
        button.act:active { box-shadow: inset -1px -1px #fff, inset 1px 1px #0a0a0a, inset -2px -2px #dfdfdf, inset 2px 2px #808080; padding: 5px 7px 3px 9px; }
        button.act:focus-visible { outline: 1px dotted #000; outline-offset: -4px; }
        button.primary { font-weight: bold;
          box-shadow: inset -2px -2px #0a0a0a, inset 1px 1px #0a0a0a, inset 2px 2px #fff, inset -3px -3px #808080, inset 3px 3px #dfdfdf; }
        button.confirm { background: #000080; color: #fff; }
        .row { display: grid; grid-template-columns: 1fr 1fr; gap: 6px; }
        .where { position: relative; margin-top: 6px; padding: 9px 7px 6px; border: 1px solid #808080; box-shadow: inset 1px 1px #fff, 1px 1px #fff; }
        .where .cap { position: absolute; top: -8px; left: 6px; padding: 0 3px; background: #c0c0c0; }
        .where dl { display: grid; grid-template-columns: auto 1fr; gap: 2px 8px; margin: 0; }
        .where dt { font-weight: bold; }
        .where dd { margin: 0; min-width: 0; overflow-wrap: anywhere; }
        .where dd[title]:not([title=""]) { text-decoration: underline dotted; cursor: help; }
        .verdict { margin-top: 5px; padding: 3px 5px; background: #fff; box-shadow: inset 1px 1px #808080, inset -1px -1px #fff; }
        .verdict.good { color: #006400; }
        .verdict.warn { color: #8a3a00; font-weight: bold; }
        .legend { display: flex; gap: 10px; font-size: 11px; }
        .legend i { display: inline-block; width: 9px; height: 9px; border: 1px solid #000; margin-right: 4px; vertical-align: -1px; }
        .min .body { display: none; }
      </style>
      <div class="panel">
        <div class="head"><span>Apply Assistant</span><button class="toggle" title="Minimize">_</button></div>
        <div class="body">
          <div class="where" hidden>
            <span class="cap">Where</span>
            <dl>
              <dt>Location</dt><dd class="loc"></dd>
              <dt>Work type</dt><dd class="type"></dd>
              <dt>Relocation</dt><dd class="reloc"></dd>
            </dl>
            <div class="verdict" hidden></div>
          </div>
          <div class="statuswrap"><div class="status"></div><div class="marq"><i></i></div></div>
          <button class="act primary fill">Fill this page</button>
          <div class="row">
            <button class="act done">Done, submitted</button>
            <button class="act skip">Skip job</button>
          </div>
          <div class="legend"><span><i style="background:#16a34a"></i>from your info</span><span><i style="background:#f97316"></i>needs you</span></div>
        </div>
      </div>`;
    document.documentElement.appendChild(host);
    statusEl = root.querySelector('.status');
    setStatus(pending.text, pending.busy);
    whereEl = root.querySelector('.where');
    whereShown = '';
    setWhere(whereData);

    const send = (type) => typeof W.jaaCommand === 'function' && W.jaaCommand({ type }).catch(() => {});
    root.querySelector('.fill').addEventListener('click', () => send('fill'));

    // Two-click confirm (native confirm() dialogs are auto-dismissed in an automated browser).
    const armed = {};
    for (const [cls, type, label, armedLabel] of [
      ['done', 'done', 'Done, submitted', 'Click again: submitted'],
      ['skip', 'skip', 'Skip job', 'Click again: skip'],
    ]) {
      const btn = root.querySelector(`.${cls}`);
      btn.addEventListener('click', () => {
        if (armed[cls]) {
          clearTimeout(armed[cls]);
          armed[cls] = null;
          btn.textContent = label;
          btn.classList.remove('confirm');
          send(type);
          return;
        }
        btn.textContent = armedLabel;
        btn.classList.add('confirm');
        armed[cls] = setTimeout(() => {
          armed[cls] = null;
          btn.textContent = label;
          btn.classList.remove('confirm');
        }, 3000);
      });
    }

    const panel = root.querySelector('.panel');
    root.querySelector('.toggle').addEventListener('click', (e) => {
      e.stopPropagation();
      panel.classList.toggle('min');
    });

    // Drag by the header.
    const head = root.querySelector('.head');
    head.addEventListener('mousedown', (e) => {
      const r = host.getBoundingClientRect();
      const dx = e.clientX - r.left;
      const dy = e.clientY - r.top;
      const move = (ev) => {
        host.style.left = `${Math.max(0, ev.clientX - dx)}px`;
        host.style.top = `${Math.max(0, ev.clientY - dy)}px`;
        host.style.right = 'auto';
        host.style.bottom = 'auto';
      };
      const up = () => {
        removeEventListener('mousemove', move, true);
        removeEventListener('mouseup', up, true);
      };
      addEventListener('mousemove', move, true);
      addEventListener('mouseup', up, true);
    });

    if (typeof W.jaaCommand === 'function') {
      W.jaaCommand({ type: 'hello' })
        .then((s) => {
          if (!s) return;
          setStatus(s.text, s.busy);
          if ('where' in s) setWhere(s.where);
        })
        .catch(() => {});
    }
  }

  if (W.top === W) {
    whenSettled(() => {
      buildPanel();
      // Some single-page sites replace the whole document body; put the panel back if that happens.
      setInterval(() => document.querySelector('[data-jaa-ui="panel"]') || buildPanel(), 2000);
    });
  }

  W.__jaa = { collect, mark, harvest, setStatus, setWhere, close };
};

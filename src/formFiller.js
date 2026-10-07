// Puts answers into the page. Each function returns true if the field now holds the answer.
import { normalizeQuestion } from './materials.js';

const sel = (id) => `[data-jaa-id="${id}"]`;
const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();
export const DECLINE_RE = /decline|prefer not|not (to )?(say|answer|disclose)|wish to answer|wish to (self )?identify|don t wish|do not wish|choose not/;
export const STATES = {
  al: 'alabama', ak: 'alaska', az: 'arizona', ar: 'arkansas', ca: 'california', co: 'colorado', ct: 'connecticut', de: 'delaware',
  dc: 'district of columbia', fl: 'florida', ga: 'georgia', hi: 'hawaii', id: 'idaho', il: 'illinois', in: 'indiana', ia: 'iowa',
  ks: 'kansas', ky: 'kentucky', la: 'louisiana', me: 'maine', md: 'maryland', ma: 'massachusetts', mi: 'michigan', mn: 'minnesota',
  ms: 'mississippi', mo: 'missouri', mt: 'montana', ne: 'nebraska', nv: 'nevada', nh: 'new hampshire', nj: 'new jersey',
  nm: 'new mexico', ny: 'new york', nc: 'north carolina', nd: 'north dakota', oh: 'ohio', ok: 'oklahoma', or: 'oregon',
  pa: 'pennsylvania', ri: 'rhode island', sc: 'south carolina', sd: 'south dakota', tn: 'tennessee', tx: 'texas', ut: 'utah',
  vt: 'vermont', va: 'virginia', wa: 'washington', wv: 'west virginia', wi: 'wisconsin', wy: 'wyoming',
};

/** Index of the option that best matches `value`, or -1. */
export function bestMatch(value, options) {
  const v = normalizeQuestion(value);
  if (!v) return -1;
  const opts = options.map((o) => normalizeQuestion(o));
  let i = opts.indexOf(v);
  if (i >= 0) return i;

  const yes = /^(yes|y|true)\b/.test(v);
  const no = /^(no|n|false)\b/.test(v);
  if (yes || no) {
    i = opts.findIndex((o) => (yes ? /^yes\b/ : /^no\b/).test(o));
    if (i >= 0) return i;
  }
  if (DECLINE_RE.test(v)) {
    i = opts.findIndex((o) => DECLINE_RE.test(o));
    if (i >= 0) return i;
  }
  i = opts.findIndex((o) => o && (o.startsWith(`${v} `) || v.startsWith(`${o} `)));
  if (i >= 0) return i;
  i = opts.findIndex((o) => o && (` ${o} `.includes(` ${v} `) || (o.length > 3 && ` ${v} `.includes(` ${o} `))));
  if (i >= 0) return i;

  // Every word you gave starts a word in the option, so "Temple City, CA" matches
  // "Temple City, California, United States" and "Cal Poly Pomona" matches "California State Polytechnic University-Pomona".
  const words = v.split(' ');
  const wordHit = (t, o, ow) => ow.some((w) => w.startsWith(t)) || (STATES[t] && ` ${o} `.includes(` ${STATES[t]} `));
  const hits = opts
    .map((o, idx) => ({ idx, len: o.length, ow: o.split(' '), o }))
    .filter((x) => x.o && words.every((t) => wordHit(t, x.o, x.ow)))
    .sort((a, b) => a.len - b.len);
  if (hits.length) return hits[0].idx;

  const vt = new Set(v.split(' '));
  let best = -1;
  let score = 0;
  opts.forEach((o, idx) => {
    const ot = o.split(' ').filter(Boolean);
    const shared = ot.filter((t) => vt.has(t)).length;
    const s = shared / Math.max(vt.size, ot.length, 1);
    if (s > score) {
      score = s;
      best = idx;
    }
  });
  return score >= 0.5 ? best : -1;
}

async function visibleOptions(frame) {
  const loc = frame.locator('[role="option"]:visible');
  const texts = (await loc.allInnerTexts()).map(clean);
  return { loc, texts };
}

async function clickInput(input) {
  try {
    await input.click({ timeout: 2000 });
  } catch {
    // Custom-styled radios/checkboxes often hide the real input; a DOM click still fires the change.
    await input.evaluate((el) => el.click());
  }
}

// Location/school/company boxes often only keep a value picked from their suggestion list.
export const AUTOCOMPLETE_Q = /location|city|address|school|university|college|employer|company/i;
const SUGGESTION_SEL =
  '[role="option"]:visible, .pac-item:visible, .dropdown-results > *:visible, [class*="suggestion"]:visible, [class*="autocomplete"] li:visible';

async function fillText(frame, f, value) {
  const loc = frame.locator(sel(f.id));
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  const autocomplete = f.kind === 'text' && (f.autocomplete || AUTOCOMPLETE_Q.test(f.question || ''));
  if (!autocomplete) {
    await loc.fill(value, { timeout: 5000 });
    return clean(await loc.inputValue()) !== '';
  }
  await loc.fill('');
  await loc.pressSequentially(value, { delay: 30 });
  await frame.waitForTimeout(1500);
  const sugg = frame.locator(SUGGESTION_SEL);
  const texts = (await sugg.allInnerTexts()).slice(0, 30).map(clean);
  if (texts.some(Boolean)) {
    let i = bestMatch(value, texts);
    const first = normalizeQuestion(value).split(' ')[0];
    if (i < 0) i = texts.findIndex((t) => t && normalizeQuestion(t).startsWith(first));
    if (i >= 0) {
      await sugg.nth(i).click({ timeout: 3000 });
      await frame.waitForTimeout(400);
    }
  }
  return clean(await loc.inputValue()) !== '';
}

async function fillRichText(frame, f, value) {
  const loc = frame.locator(sel(f.id));
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await loc.click({ timeout: 3000 });
  await frame.page().keyboard.press('Control+A');
  await frame.page().keyboard.insertText(value);
  return clean(await loc.innerText()) !== '';
}

async function fillSelect(frame, f, value) {
  const loc = frame.locator(sel(f.id));
  const opts = await loc.evaluate((el) => [...el.options].map((o) => ({ value: o.value, text: o.text.trim() })));
  const usable = opts.filter((o) => o.value !== '');
  const i = bestMatch(value, usable.map((o) => o.text));
  if (i < 0) return false;
  await loc.selectOption(usable[i].value, { timeout: 5000 });
  return true;
}

async function fillRadio(frame, f, value) {
  const radios = frame.locator(`input[data-jaa-group="${f.id}"]`);
  const i = bestMatch(value, f.options || []);
  if (i < 0 || i >= (await radios.count())) return false;
  const r = radios.nth(i);
  await r.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  if (!(await r.isChecked())) await clickInput(r);
  return r.isChecked();
}

async function fillCheckbox(frame, f, value) {
  const box = frame.locator(sel(f.id));
  const want = /^(yes|true|checked|check|y|1)$/i.test(clean(value));
  if ((await box.isChecked()) !== want) await clickInput(box);
  return (await box.isChecked()) === want;
}

async function fillCheckboxes(frame, f, value) {
  const boxes = frame.locator(`input[data-jaa-group="${f.id}"]`);
  const picks = String(value).split('|').map(clean).filter(Boolean);
  let any = false;
  for (const pick of picks) {
    const i = bestMatch(pick, f.options || []);
    if (i < 0) continue;
    const b = boxes.nth(i);
    if (!(await b.isChecked())) await clickInput(b);
    any = (await b.isChecked()) || any;
  }
  return any;
}

async function fillButtons(frame, f, value) {
  const btns = frame.locator(`[data-jaa-group="${f.id}"]`);
  const i = bestMatch(value, f.options || []);
  if (i < 0 || i >= (await btns.count())) return false;
  const b = btns.nth(i);
  await b.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await b.click({ timeout: 3000 });
  return true;
}

async function fillCombobox(frame, f, value) {
  const loc = frame.locator(sel(f.id));
  await loc.scrollIntoViewIfNeeded({ timeout: 3000 }).catch(() => {});
  await loc.click({ timeout: 3000 });
  await frame.waitForTimeout(400);
  let { loc: options, texts } = await visibleOptions(frame);
  let i = bestMatch(value, texts);

  // Type-to-search boxes only show options after typing. If the full answer finds nothing ("Temple City, CA"),
  // try just the part before the comma ("Temple City").
  if (i < 0 && (await loc.evaluate((el) => el.tagName === 'INPUT'))) {
    const searches = [String(value).slice(0, 40)];
    if (String(value).includes(',')) searches.push(String(value).split(',')[0].trim());
    for (const search of searches) {
      await loc.fill('');
      await loc.pressSequentially(search, { delay: 35 });
      await frame.waitForTimeout(1500);
      ({ loc: options, texts } = await visibleOptions(frame));
      i = bestMatch(value, texts);
      if (i < 0) i = bestMatch(search, texts);
      if (i < 0 && texts.length === 1) i = 0;
      if (i >= 0) break;
    }
  }
  if (i < 0) {
    await frame.page().keyboard.press('Escape');
    return false;
  }
  await options.nth(i).click({ timeout: 3000 });
  return true;
}

export async function fillField(f, value) {
  const { frame } = f;
  switch (f.kind) {
    case 'text':
    case 'textarea':
      return fillText(frame, f, value);
    case 'richtext':
      return fillRichText(frame, f, value);
    case 'select':
      return fillSelect(frame, f, value);
    case 'radio':
      return fillRadio(frame, f, value);
    case 'checkbox':
      return fillCheckbox(frame, f, value);
    case 'checkboxes':
      return fillCheckboxes(frame, f, value);
    case 'buttons':
      return fillButtons(frame, f, value);
    case 'combobox':
      return fillCombobox(frame, f, value);
    case 'file':
      await frame.locator(sel(f.id)).setInputFiles(value, { timeout: 10000 });
      return true;
    default:
      return false;
  }
}

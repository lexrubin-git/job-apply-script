// "Fill this page": read the form, fill what's known (your info + saved answers), mark the rest orange for you.
import { fillField } from './formFiller.js';
import { inPageInit } from './inpage.js';
import { log } from './log.js';
import { loadLearned, loadProfile, normalizeQuestion, saveLearned } from './materials.js';
import { decideLocally, needsYou, SENSITIVE_RE } from './rules.js';

// Shown when Fill finds nothing to fill.
export const NO_FIELDS =
  'No form fields on this page.\nOn the job description, click the site\'s Apply button first. On a sign-in page, sign in or create an account (Workday needs one per company). Then click Fill this page on the form.';

// Long free-text answers ("Why do you want to work here?") are written for one company, so they aren't reused.
export const MAX_SAVED_ANSWER = 200;

export function shouldRemember(question, answer) {
  return !!question && !!answer && String(answer).length <= MAX_SAVED_ANSWER && !SENSITIVE_RE.test(normalizeQuestion(question));
}

async function inEveryFrame(page, fn, arg) {
  const results = [];
  for (const frame of page.frames()) {
    try {
      if (!(await frame.evaluate(() => !!window.__jaa))) await frame.evaluate(inPageInit);
      results.push({ frame, value: await frame.evaluate(fn, arg) });
    } catch {
      // detached or navigating frame
    }
  }
  return results;
}

/** Save answers you typed into orange fields. Returns the questions saved. */
export async function harvestLearned(page) {
  const saved = [];
  for (const { value } of await inEveryFrame(page, () => window.__jaa.harvest())) {
    for (const { q, value: answer } of value) {
      if (shouldRemember(q, answer) && saveLearned(q, answer)) saved.push(q);
    }
  }
  return saved;
}

async function collectFields(page) {
  const fields = [];
  for (const { frame, value } of await inEveryFrame(page, () => window.__jaa.collect())) {
    for (const f of value) fields.push({ ...f, frame });
  }
  return fields;
}

/** Fill the current page. Returns { counts, needs: [{ question, note }] } or null if nothing to fill. */
export async function fillPage(page, job, setStatus) {
  await setStatus('Reading the form…', true);
  const learnedNow = await harvestLearned(page);
  if (learnedNow.length) log(`Saved ${learnedNow.length} answer(s) you typed for next time.`);

  const fields = await collectFields(page);
  const todo = fields.filter((f) => !f.filled);
  if (!todo.length) {
    await setStatus(fields.length ? 'Everything on this page is already filled in.' : NO_FIELDS);
    return null;
  }

  const ctx = { profile: loadProfile(), learned: loadLearned(), job };
  await setStatus('Filling…', true);
  const counts = { fact: 0, needs_you: 0 };
  const needs = [];
  for (const f of todo) {
    const d = decideLocally(f, ctx) || needsYou("Fill this in yourself. It'll be remembered for next time.");
    if (d.source === 'skip') continue;
    let status = d.source === 'needs_you' ? 'needs_you' : 'fact';
    let note = d.note;
    if (status === 'fact') {
      // Choice fields may word the answer differently ("Spring 2027" vs "May 2027"), so try each form.
      const tries = f.kind === 'text' || f.kind === 'textarea' || f.kind === 'richtext' ? [d.value] : [d.value, ...(d.alternatives || [])];
      let ok = false;
      for (const value of tries) {
        try {
          ok = await fillField(f, value);
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
    await f.frame
      .evaluate(([id, s, n, l]) => window.__jaa?.mark(id, s, n, l), [f.id, status, note || '', d.learnable !== false])
      .catch(() => {});
    counts[status]++;
    if (status === 'needs_you') needs.push({ question: f.question || f.placeholder || '(unlabeled field)', note: note || '' });
  }

  const parts = [`Filled ${counts.fact} from your info and saved answers`];
  if (counts.needs_you) parts.push(`${counts.needs_you} need you (orange)`);
  log(`${parts.join(', ')}.`);
  if (needs.length) log(`Needs you:\n${needs.map((n) => `• ${n.question}`).join('\n')}`);
  await setStatus(`${parts.join('\n')}\nFill in the orange fields (they'll be remembered), then click the site's Next/Continue.`);
  return { counts, needs };
}

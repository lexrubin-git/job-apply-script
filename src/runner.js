// The applying loop: works through data/queue.txt one job at a time.
// Two ways to show the job:
// - "chrome" (default in the app): opens the job as a tab in your own, logged-in Chrome. The Apply Assistant
//   extension adds the panel and does the filling (see extension/ and the /api/ext routes in app.js).
// - "separate": a separate Chrome window controlled by Playwright (also used by the terminal version).
import crypto from 'node:crypto';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { launchBrowser } from './browser.js';
import { config, isBlockedUrl, jobBoardLink } from './config.js';
import { fillPage, harvestLearned, NO_FIELDS, shouldRemember } from './fill.js';
import { inPageInit } from './inpage.js';
import { analyzeJob, captureDescription, fetchPosting, jobStatusText, parseNote, printAnalysis } from './job.js';
import { log } from './log.js';
import { listResumes, loadLearned, loadProfile, saveLearned } from './materials.js';
import { readQueue, removeFromQueue } from './queue.js';
import { saveScore } from './scores.js';
import { decideLocally } from './rules.js';
import { loggedUrls, logApplication, normalizeUrl } from './tracker.js';
import { describeWhere } from './where.js';

export const BLOCKED_MSG =
  'That link is LinkedIn/Handshake. To keep your account safe, this tool never opens those sites. ' +
  "Click Apply there in your normal browser, then use the company's page link instead.";

/** Emits 'state' whenever anything the app window shows has changed. */
export const runnerEvents = new EventEmitter();

const commands = new EventEmitter();
const ui = { text: 'Not started', busy: false };
let running = false;
let mode = 'separate';
let context = null; // Playwright browser ("separate" mode)
let job = null;
let filling = false;
let lastPage = null;
let openInChrome = null; // set by app.js: opens a job in your Chrome ("chrome" mode)
let extensionSeenAt = 0;
let fillRequested = false;

export function setChromeOpener(fn) {
  openInChrome = fn;
}

export function runnerState() {
  const a = job?.analysis;
  return {
    running,
    filling,
    mode,
    extensionConnected: Date.now() - extensionSeenAt < 15000,
    status: ui.text,
    busy: ui.busy,
    job: job && {
      url: job.url,
      note: job.note,
      company: a?.company || '',
      title: a?.title || '',
      location: a?.location || '',
      score: a?.score ?? null,
      summary: a?.summary || '',
      matched: a?.matched || [],
      missing: a?.missing || [],
      flags: a?.flags || [],
      resume: job.resume || '',
      lastFill: job.lastFill || null,
      where: job.where || null,
    },
  };
}

const changed = () => runnerEvents.emit('state');

/** The job being applied to right now, with its description (for the cover letter maker). */
export function currentJob() {
  if (!job) return null;
  const a = job.analysis || {};
  return { url: job.url, company: a.company, title: a.title, location: a.location, department: job.posting?.department || '', description: job.description };
}

async function setStatus(text, busy = false) {
  ui.text = text;
  ui.busy = busy;
  changed();
  for (const p of context?.pages() ?? []) {
    p.evaluate(([t, b]) => window.__jaa?.setStatus(t, b), [text, busy]).catch(() => {});
  }
}

function activePage() {
  if (lastPage && !lastPage.isClosed()) return lastPage;
  const open = context?.pages().filter((p) => !p.isClosed()) || [];
  return open[open.length - 1];
}

async function runFill(page) {
  if (!job) {
    await setStatus('No job loaded yet. Add a job link to the queue.');
    return;
  }
  if (mode === 'chrome') {
    // The extension in your Chrome does the filling; it checks in about every second and picks this up.
    fillRequested = true;
    await setStatus('Filling the page in Chrome…', true);
    return;
  }
  if (filling || !page) return;
  filling = true;
  changed();
  try {
    // No score yet (the job page hadn't loaded its description)? Try again from what's on screen now.
    if (job.analysis?.score == null) await scoreFrom(page);
    const summary = await fillPage(page, job, setStatus);
    if (summary && job) job.lastFill = summary;
  } catch (e) {
    log(`Fill failed: ${e.message}`);
    await setStatus(`Something went wrong: ${e.message}`);
  } finally {
    filling = false;
    changed();
  }
}

let switchRequested = false;

/** Commands from the app window or terminal: fill, done, skip, quit, switch (to the job now at the top), url (queue changed). */
export function sendCommand(type) {
  if (type === 'fill') return runFill(activePage());
  if (type === 'switch') switchRequested = true; // kept until the current job is ready to switch
  commands.emit('cmd', { type });
  return null;
}

function waitFor(types) {
  return new Promise((resolve) => {
    const on = (cmd) => {
      if (!types.includes(cmd.type)) return;
      commands.off('cmd', on);
      resolve(cmd);
    };
    commands.on('cmd', on);
  });
}

export function rememberAnswer(question, value) {
  if (!shouldRemember(question, value)) return;
  if (saveLearned(question, value)) log(`Saved your answer for next time: "${question.slice(0, 80)}"`);
}

/** Score the job from its description: the job board's listing if possible, else the given page text. */
async function scoreWith(current, onPage) {
  const posting = current.posting || (await fetchPosting(current.url).catch(() => null));
  if (job !== current) return; // moved on to another job meanwhile
  if (posting) job.posting = posting;
  const text = posting?.text?.length > 400 ? posting.text : onPage.text;
  if (text.length < (job.description || '').length) return;
  job.description = text;
  if (onPage.title) job.pageTitle = onPage.title;
  job.analysis = analyzeJob(job);
  if (job.analysis.score != null) saveScore(job.url, job.analysis.score); // the Fit column in your job list
  job.where = describeWhere(job);
  printAnalysis(job);
  pushWhere();
  changed();
}

// The "Where" box on the panel (separate-window mode; the extension picks it up when it checks in).
function pushWhere() {
  for (const p of context?.pages() ?? []) {
    p.evaluate((w) => window.__jaa?.setWhere(w), job?.where || null).catch(() => {});
  }
}

/** Your location settings changed: redo the current job's "Where" box. */
export function refreshWhere() {
  if (!job?.analysis) return;
  job.where = describeWhere(job);
  pushWhere();
  changed();
}

async function scoreFrom(page) {
  const current = job;
  const onPage = await captureDescription(page).catch(() => ({ text: '', title: '' }));
  await scoreWith(current, onPage);
}

// ---- for the extension in your Chrome ("chrome" mode); called from app.js ----
const isCurrent = (jobId) => !!job && job.id === jobId;

export function extensionPoll(jobId, { peek = false } = {}) {
  extensionSeenAt = Date.now();
  const active = isCurrent(jobId);
  const fill = active && fillRequested && !peek;
  if (fill) fillRequested = false;
  return { active, text: active ? ui.text : 'This job is no longer the one being applied to.', busy: active && ui.busy, fill, where: active ? job.where || null : null };
}

export function extensionClaim(jobId) {
  extensionSeenAt = Date.now();
  if (isCurrent(jobId)) job.claimed = true;
  changed();
  return { ok: isCurrent(jobId), url: isCurrent(jobId) ? job.url : null };
}

export function jobClaimed(jobId) {
  return { claimed: isCurrent(jobId) && !!job.claimed, url: isCurrent(jobId) ? job.url : null };
}

export async function extensionPage(jobId, text, title) {
  if (!isCurrent(jobId)) return;
  await scoreWith(job, { text: String(text || '').slice(0, 12000), title: String(title || '').slice(0, 200) });
  if (!ui.busy) await setStatus(jobStatusText(job));
}

/** How to answer each field the extension found (same rules as the separate window). */
export function extensionDecide(jobId, fields) {
  if (!isCurrent(jobId)) throw new Error('This job is no longer the one being applied to.');
  filling = true;
  changed();
  const ctx = { profile: loadProfile(), learned: loadLearned(), job };
  const decisions = {};
  for (const f of fields) {
    const d = decideLocally(f, ctx) || { value: '', source: 'needs_you', note: "Fill this in yourself. It'll be remembered for next time.", learnable: true };
    // Files (your resume) are sent along so the extension can attach them.
    if (f.kind === 'file' && d.source !== 'needs_you' && d.source !== 'skip' && d.value) {
      d.file = { name: path.basename(d.value), type: 'application/pdf', base64: fs.readFileSync(d.value).toString('base64') };
    }
    decisions[`${f.frameId}:${f.id}`] = d;
  }
  return decisions;
}

export async function extensionStatus(jobId, text, busy) {
  if (isCurrent(jobId)) await setStatus(String(text || ''), !!busy);
}

export async function extensionFilled(jobId, counts, needs, empty) {
  filling = false;
  if (!isCurrent(jobId)) return changed();
  if (empty) {
    await setStatus(
      empty === 'filled' ? 'Everything on this page is already filled in.'
        : empty === 'noscript' ? "Couldn't read this page. Reload it (F5), then click Fill this page again."
        : NO_FIELDS,
    );
    return;
  }
  job.lastFill = { counts, needs };
  const parts = [`Filled ${counts.fact} from your info and saved answers`];
  if (counts.needs_you) parts.push(`${counts.needs_you} need you (orange)`);
  log(`${parts.join(', ')}.`);
  await setStatus(`${parts.join('\n')}\nFill in the orange fields (they'll be remembered), then click the site's Next/Continue.`);
}

export function extensionCommand(jobId, type) {
  if (isCurrent(jobId) && ['done', 'skip'].includes(type)) commands.emit('cmd', { type });
}

// ---- the loop ----
const skippedBoards = new Set();
async function nextEntry() {
  for (;;) {
    const done = loggedUrls();
    for (const entry of readQueue()) {
      // LinkedIn/Handshake postings open only in your own Chrome (you click Apply there). The separate window is
      // automated, so it never goes to those sites: skip them, but keep them in your list.
      if (isBlockedUrl(entry.url)) {
        if (mode !== 'chrome' || !jobBoardLink(entry.url)) {
          if (!skippedBoards.has(entry.url)) log(`Skipped a LinkedIn/Handshake job: those open only in your own Chrome (My info → Settings). ${entry.url}`);
          skippedBoards.add(entry.url);
          continue;
        }
      }
      if (done.has(normalizeUrl(entry.url))) {
        removeFromQueue(entry.url);
        continue;
      }
      return entry;
    }
    const msg = 'Your job list is empty. Add a job link (or find new internships) to keep going.';
    log(msg);
    await setStatus(msg);
    const cmd = await waitFor(['url', 'quit']);
    if (cmd.type === 'quit') return null;
  }
}

async function openJob(entry) {
  if (mode === 'chrome') {
    await setStatus('Opening the job in your Chrome…', true);
    openInChrome(job.id);
    // Score from the job board's listing right away; the extension also sends the page text once it loads.
    await scoreWith(job, { text: '', title: '' });
    await setStatus(jobStatusText(job));
    return;
  }
  const page = activePage();
  lastPage = page;
  await setStatus('Loading the job page…', true);
  try {
    await page.goto(entry.url, { waitUntil: 'domcontentloaded', timeout: 60000 });
  } catch (e) {
    log(`The page didn't finish loading (${e.message.split('\n')[0]}). You can still use it if it shows up.`);
  }
  await setStatus('Reading the job description…', true);
  await scoreFrom(page);
  await setStatus(jobStatusText(job));
}

async function runJob(entry) {
  const resumes = listResumes();
  job = {
    id: crypto.randomBytes(6).toString('hex'),
    url: entry.url,
    note: entry.note,
    description: '',
    pageTitle: '',
    posting: null,
    analysis: null,
    resume: resumes[0]?.file,
    resumePath: resumes[0]?.pdfPath,
    lastFill: null,
    claimed: false,
  };
  fillRequested = false;
  changed();
  log(`▶ ${entry.note ? `${entry.note}\n  ` : ''}${entry.url}`);
  await openJob(entry);

  const cmd = switchRequested ? { type: 'switch' } : await waitFor(['done', 'skip', 'quit', 'switch']);
  if (cmd.type === 'switch') switchRequested = false;
  for (const p of context?.pages() ?? []) {
    const saved = await harvestLearned(p).catch(() => []);
    if (saved.length) log(`Saved ${saved.length} answer(s) you typed for next time.`);
  }
  if (cmd.type === 'quit') return 'quit';
  if (cmd.type === 'switch') {
    // You picked another job from the list: leave this one in the list, unlogged, and open that one.
    log('Switching jobs. This one stays in your list.');
    job = null;
    changed();
    return 'switched';
  }

  const status = cmd.type === 'done' ? 'submitted' : 'skipped';
  const a = job.analysis;
  const fromNote = parseNote(job.note);
  logApplication({
    status,
    company: a?.company || fromNote.company,
    title: a?.title || fromNote.title || job.pageTitle,
    fit: a?.score ?? '',
    url: job.url,
    notes: a?.flags?.join('; '),
  });
  removeFromQueue(job.url);
  log(`✓ Logged as ${status}.`);
  job = null;
  changed();
  return status;
}

function wirePage(page) {
  page.on('dialog', async (d) => {
    // Without this, an automated browser silently dismisses the site's pop-ups.
    if (d.type() !== 'beforeunload') log(`The site says: ${d.message()}`);
    if (d.type() === 'prompt') await d.dismiss().catch(() => {});
    else await d.accept().catch(() => {});
  });
  page.on('framenavigated', (frame) => {
    if (frame === page.mainFrame() && isBlockedUrl(frame.url())) log(BLOCKED_MSG);
  });
}

export function isRunning() {
  return running;
}

async function openSeparateWindow() {
  await setStatus('Opening the Apply Assistant browser…', true);
  context = await launchBrowser();
  await context.addInitScript(inPageInit);
  await context.exposeBinding('jaaCommand', async ({ page }, msg) => {
    switch (msg?.type) {
      case 'hello':
        return { text: ui.text, busy: ui.busy, where: job?.where || null };
      case 'fill':
        lastPage = page;
        runFill(page);
        return null;
      case 'done':
      case 'skip':
        commands.emit('cmd', { type: msg.type });
        return null;
      case 'learn':
        rememberAnswer(msg.q, msg.value);
        return null;
      default:
        return null;
    }
  });
  context.pages().forEach(wirePage);
  context.on('page', (p) => {
    wirePage(p);
    lastPage = p; // sites often open the application in a new tab
  });
  context.on('close', () => {
    context = null;
    commands.emit('cmd', { type: 'quit' });
  });
  if (!context.pages().length) await context.newPage();
}

/**
 * Work through the queue until stopped. Resolves when finished.
 * useMode: "chrome" (your own Chrome, needs the extension and the app) or "separate" (a separate window).
 */
export async function startApplying(useMode = 'separate') {
  if (running) return;
  running = true;
  mode = useMode === 'chrome' && openInChrome ? 'chrome' : 'separate';
  let finished = '';
  try {
    if (mode === 'separate') await openSeparateWindow();
    for (;;) {
      const entry = await nextEntry();
      if (!entry || (mode === 'separate' && !context)) break;
      const result = await runJob(entry);
      if (result === 'quit') break;
      // "Open the next job automatically" is off: after Done or Skip, wait without a job until you click Start applying.
      if ((result === 'submitted' || result === 'skipped') && config.autoNext === false) {
        finished = result;
        break;
      }
    }
  } catch (e) {
    log(e.message);
  } finally {
    await context?.close().catch(() => {});
    context = null;
    job = null;
    lastPage = null;
    running = false;
    filling = false;
    ui.text = finished
      ? `${finished === 'submitted' ? 'Marked as submitted' : 'Skipped'}. Click Start applying (or ▶ on a job) when you're ready for the next one.`
      : 'Stopped';
    ui.busy = false;
    changed();
  }
}

export async function stopApplying() {
  commands.emit('cmd', { type: 'quit' });
  await context?.close().catch(() => {});
}

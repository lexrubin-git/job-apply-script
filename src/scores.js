// Match scores ("compatibility", 1-10) for jobs before you open them: used by Find's Compatibility filter and the
// Fit column in the job list. Scores are kept in data/scores.json and redone when your resume or website changes.
import crypto from 'node:crypto';
import path from 'node:path';
import { paths, readJson, writeJson } from './config.js';
import { fetchPosting } from './job.js';
import { scoreJob, yearsRequired } from './match.js';
import { experienceText } from './experience.js';
import { loadProfile } from './materials.js';
import { readQueue } from './queue.js';
import { normalizeUrl } from './tracker.js';

const FILE = path.join(paths.data, 'scores.json');
const SCORING = 2; // bump when match.js scoring changes, so saved scores are redone
const RETRY_UNREADABLE = 3 * 864e5; // try pages we couldn't read again after 3 days

export function resumeInfo() {
  const text = experienceText();
  // Scores are redone when your resume, website or other work change, when your years of experience change, or when
  // the way scores are worked out changes (SCORING).
  const years = String(loadProfile().experience?.years ?? '');
  return { text, key: crypto.createHash('sha1').update(`${SCORING}|${years}|${text}`).digest('hex').slice(0, 10) };
}

export function loadScores() {
  return readJson(FILE, {});
}

/** { url: score } for the given links (score null = not scored or couldn't be scored). */
export function scoresFor(urls) {
  const all = loadScores();
  const { key } = resumeInfo();
  return Object.fromEntries(urls.map((u) => {
    const s = all[normalizeUrl(u)];
    return [u, s && s.resume === key ? s.score : null];
  }));
}

export function saveScore(url, score) {
  const all = loadScores();
  all[normalizeUrl(url)] = { score: score ?? null, resume: resumeInfo().key, at: Date.now() };
  writeJson(FILE, all);
}

/** Save several at once: { url: score } or { url: { score, location } }. */
export function saveScores(byUrl) {
  const all = loadScores();
  const resume = resumeInfo().key;
  for (const [url, v] of Object.entries(byUrl)) {
    const { score, location, title, company, years } = v && typeof v === 'object' ? v : { score: v };
    const prev = all[normalizeUrl(url)] || {};
    all[normalizeUrl(url)] = {
      score: score ?? null, resume, at: Date.now(),
      location: location ?? prev.location, located: location !== undefined || !!prev.located,
      title: title || prev.title, company: company || prev.company, years: years ?? prev.years,
    };
  }
  writeJson(FILE, all);
}

/** { url: location } read from each job's posting ('' if unknown), for jobs whose list entry doesn't say where. */
export function placesFor(urls) {
  const all = loadScores();
  return Object.fromEntries(urls.map((u) => [u, all[normalizeUrl(u)]?.location || '']));
}

/** { url: years of experience the posting asks for } (null if unknown), which settles the level of vague titles. */
export function yearsFor(urls) {
  const all = loadScores();
  return Object.fromEntries(urls.map((u) => [u, all[normalizeUrl(u)]?.years ?? null]));
}

/** { url: { title, company } } from each job's posting, for jobs you pasted without a name. */
export function namesFor(urls) {
  const all = loadScores();
  return Object.fromEntries(urls.map((u) => [u, { title: all[normalizeUrl(u)]?.title || '', company: all[normalizeUrl(u)]?.company || '' }]));
}

/** Score from a description you already have. */
export function scoreText(title, text, resume = resumeInfo()) {
  if (!text || text.length < 300) return null;
  return scoreJob({ jobText: text, title, resumeText: resume.text, profile: loadProfile() }).score ?? null;
}

/** Read the job's posting from its job board: { score, location } (score null if the page can't be read). */
export async function readJob(url, title = '', resume = resumeInfo()) {
  const posting = await fetchPosting(url).catch(() => null);
  if (!posting) return { score: null, location: '' };
  const company = posting.company || '';
  const location = [posting.location, ...(posting.locations || [])].filter(Boolean).slice(0, 4).join('; ');
  return { score: scoreText(title || posting.title, posting.text, resume), location, title: posting.title || '', company, years: yearsRequired(posting.text).required };
}

/** Just the score. */
export async function scoreUrl(url, title = '', resume = resumeInfo()) {
  return (await readJob(url, title, resume)).score;
}

const notePlace = (note) => note.match(/\(([^()]*)\)\s*$/)?.[1] || '';

function needsScore(entry, all, key) {
  const s = all[normalizeUrl(entry.url)];
  if (!s || s.resume !== key) return true;
  if (!notePlace(entry.note) && !s.located) return true; // still need to find out where it is (and what it is)
  return s.score == null && Date.now() - (s.at || 0) > RETRY_UNREADABLE;
}

// Score the jobs in your list that don't have a score yet (and find out where they are), a few at a time, in the
// background. Returns true if it read anything.
let running = false;
export async function scoreQueueInBackground(onScored) {
  if (running) return false;
  running = true;
  let did = false;
  try {
    for (;;) {
      const resume = resumeInfo();
      if (!resume.text) return did; // nothing to compare against yet
      const all = loadScores();
      const batch = readQueue().filter((e) => needsScore(e, all, resume.key)).slice(0, 4);
      if (!batch.length) return did;
      const results = await Promise.all(batch.map(async (e) => {
        const title = e.note.match(/^.*?\s\|\s(.*?)(?:\s\([^()]*\))?$/)?.[1] || '';
        return [e.url, await readJob(e.url, title, resume)];
      }));
      saveScores(Object.fromEntries(results));
      did = true;
      onScored?.();
      await new Promise((r) => setTimeout(r, 300));
    }
  } finally {
    running = false;
  }
}

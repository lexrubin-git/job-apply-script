// data/queue.txt: one job link per line. Anything after "#" is a note. Lines starting with "#" are ignored.
import fs from 'node:fs';
import path from 'node:path';
import { paths, readText } from './config.js';
import { loggedUrls, normalizeUrl } from './tracker.js';

const HEADER = `# Job links to apply to, one per line. Paste the company's application page link
# (not the LinkedIn/Handshake link). Anything after "#" is a note.
`;

export function readQueue() {
  return readText(paths.queue)
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\s*(https?:\/\/\S+)\s*(?:#\s*(.*))?$/);
      return m ? { url: m[1], note: (m[2] || '').trim() } : null;
    })
    .filter(Boolean);
}

/** Add entries ({url, note}); skips links already queued or logged. Returns how many were added. */
export function addToQueue(entries) {
  const have = new Set([...readQueue().map((e) => normalizeUrl(e.url)), ...loggedUrls()]);
  const lines = [];
  for (const { url, note } of entries) {
    const key = normalizeUrl(url);
    if (have.has(key)) continue;
    have.add(key);
    lines.push(note ? `${url}  # ${note}` : url);
  }
  if (!lines.length) return 0;
  let text = readText(paths.queue);
  if (!text) text = HEADER;
  if (!text.endsWith('\n')) text += '\n';
  fs.mkdirSync(paths.data, { recursive: true });
  fs.writeFileSync(paths.queue, text + lines.join('\n') + '\n');
  return lines.length;
}

/** Move one link to the top of the queue so it's done next. */
export function moveToTop(url) {
  const key = normalizeUrl(url);
  const lines = readText(paths.queue).split(/\r?\n/);
  const idx = lines.findIndex((line) => {
    const m = line.match(/^\s*(https?:\/\/\S+)/);
    return m && normalizeUrl(m[1]) === key;
  });
  if (idx < 0) return;
  const [line] = lines.splice(idx, 1);
  const firstLink = lines.findIndex((l) => /^\s*https?:\/\//.test(l));
  lines.splice(firstLink < 0 ? lines.length : firstLink, 0, line);
  fs.writeFileSync(paths.queue, lines.join('\n'));
}

/** Put the job links in this order (any not listed keep their place after them). Comment lines stay on top. */
export function reorderQueue(urls) {
  const lines = readText(paths.queue).split(/\r?\n/);
  const isJob = (l) => /^\s*https?:\/\//.test(l);
  const rank = new Map(urls.map((u, i) => [normalizeUrl(u), i]));
  const jobs = lines.filter(isJob);
  const keyOf = (l) => normalizeUrl(l.match(/^\s*(https?:\/\/\S+)/)[1]);
  const sorted = [...jobs].sort((a, b) => (rank.get(keyOf(a)) ?? Infinity) - (rank.get(keyOf(b)) ?? Infinity));
  const others = lines.filter((l) => !isJob(l));
  while (others.length && others[others.length - 1] === '') others.pop();
  fs.writeFileSync(paths.queue, [...others, ...sorted, ''].join('\n'));
}

export function removeFromQueue(url) {
  const key = normalizeUrl(url);
  const text = readText(paths.queue);
  if (!text) return;
  const kept = text.split(/\r?\n/).filter((line) => {
    const m = line.match(/^\s*(https?:\/\/\S+)/);
    return !(m && normalizeUrl(m[1]) === key);
  });
  fs.writeFileSync(paths.queue, kept.join('\n'));
}

// data/hidden.txt: jobs Find set aside because they don't fit your settings right now (too far, below your
// Compatibility, or the other job kind). Same format as the queue. They come back when they fit again.
const HIDDEN = path.join(paths.data, 'hidden.txt');

export function readHidden() {
  return readText(HIDDEN)
    .split(/\r?\n/)
    .map((line) => {
      const m = line.match(/^\s*(https?:\/\/\S+)\s*(?:#\s*(.*))?$/);
      return m ? { url: m[1], note: (m[2] || '').trim() } : null;
    })
    .filter(Boolean);
}

function writeHidden(entries) {
  fs.mkdirSync(paths.data, { recursive: true });
  fs.writeFileSync(HIDDEN, entries.map((e) => (e.note ? `${e.url}  # ${e.note}` : e.url)).join('\n') + (entries.length ? '\n' : ''));
}

/** Move these job list entries to the hidden list. */
export function hideEntries(entries) {
  if (!entries.length) return;
  const keys = new Set(entries.map((e) => normalizeUrl(e.url)));
  const have = new Set(readHidden().map((e) => normalizeUrl(e.url)));
  writeHidden([...readHidden(), ...entries.filter((e) => !have.has(normalizeUrl(e.url)))]);
  const lines = readText(paths.queue).split(/\r?\n/).filter((line) => {
    const m = line.match(/^\s*(https?:\/\/\S+)/);
    return !m || !keys.has(normalizeUrl(m[1]));
  });
  fs.writeFileSync(paths.queue, lines.join('\n'));
}

/** Put hidden entries back at the end of the job list (all of them if no links are given). Returns how many. */
export function unhideEntries(urls) {
  const hidden = readHidden();
  const keys = urls ? new Set(urls.map(normalizeUrl)) : null;
  const back = hidden.filter((e) => !keys || keys.has(normalizeUrl(e.url)));
  writeHidden(hidden.filter((e) => !back.includes(e)));
  return addToQueue(back);
}

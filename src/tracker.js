// data/applications.csv: every job you submitted or skipped.
import fs from 'node:fs';
import { paths, readText } from './config.js';

const COLUMNS = ['date', 'status', 'company', 'title', 'fit', 'url', 'notes'];
const TRACKING_PARAMS = /^(utm_.*|ref|source|src|gh_src|lever-source|lever-origin|iis|iisn)$/i;

export function normalizeUrl(url) {
  try {
    const u = new URL(url.trim());
    for (const k of [...u.searchParams.keys()]) if (TRACKING_PARAMS.test(k)) u.searchParams.delete(k);
    u.hash = '';
    return `${u.hostname.toLowerCase()}${u.pathname.replace(/\/+$/, '')}${u.search}`;
  } catch {
    return url.trim();
  }
}

const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

function parseCsvLine(line) {
  const cells = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i++) {
    const c = line[i];
    if (quoted) {
      if (c === '"' && line[i + 1] === '"') {
        cur += '"';
        i++;
      } else if (c === '"') quoted = false;
      else cur += c;
    } else if (c === '"') quoted = true;
    else if (c === ',') {
      cells.push(cur);
      cur = '';
    } else cur += c;
  }
  cells.push(cur);
  return cells;
}

/** All rows as objects, using the file's own header (so older files still read correctly). */
function readRows() {
  const lines = readText(paths.log).split(/\r?\n/).filter(Boolean);
  if (!lines.length) return [];
  const header = parseCsvLine(lines[0]);
  return lines.slice(1).map((line) => Object.fromEntries(parseCsvLine(line).map((v, i) => [header[i], v])));
}

function writeRows(rows) {
  fs.mkdirSync(paths.data, { recursive: true });
  fs.writeFileSync(paths.log, [COLUMNS.join(','), ...rows.map((r) => COLUMNS.map((c) => csvCell(r[c])).join(','))].join('\n') + '\n');
}

/** All logged applications, newest first. */
export function readLog() {
  return readRows().reverse();
}

export function loggedUrls() {
  return new Set(readRows().map((r) => normalizeUrl(r.url || '')));
}

export function logApplication(row) {
  const header = readText(paths.log).split(/\r?\n/)[0];
  const rows = readRows();
  rows.push({ date: new Date().toLocaleDateString('en-CA'), ...row });
  if (header === COLUMNS.join(',')) {
    fs.appendFileSync(paths.log, COLUMNS.map((c) => csvCell(rows.at(-1)[c])).join(',') + '\n');
  } else {
    writeRows(rows); // first write, or an older file format: rewrite in the current format
  }
}

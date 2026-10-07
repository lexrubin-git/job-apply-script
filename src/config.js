import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

export const paths = {
  config: path.join(ROOT, 'config.json'),
  profile: path.join(ROOT, 'me', 'profile.json'),
  learned: path.join(ROOT, 'me', 'learned.json'),
  secrets: path.join(ROOT, 'me', 'secrets.json'),
  coverLetters: path.join(ROOT, 'data', 'cover-letters'),
  letterCss: path.join(ROOT, 'src', 'ui', 'letter.css'),
  resumeText: path.join(ROOT, 'me', 'resumes'),
  resumePdf: path.join(ROOT, 'resume'),
  data: path.join(ROOT, 'data'),
  queue: path.join(ROOT, 'data', 'queue.txt'),
  log: path.join(ROOT, 'data', 'applications.csv'),
  browserProfile: path.join(ROOT, 'browser-profile'),
  uiProfile: path.join(ROOT, 'browser-profile-ui'),
};

export function readText(file, fallback = '') {
  try {
    return fs.readFileSync(file, 'utf8').replace(/^﻿/, '');
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw e;
  }
}

export function readJson(file, fallback) {
  const text = readText(file, null);
  if (text === null) {
    if (fallback !== undefined) return fallback;
    throw new Error(`Missing file: ${path.relative(ROOT, file)}`);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    throw new Error(`${path.relative(ROOT, file)} isn't valid JSON (${e.message}). Check for a missing comma or quote.`);
  }
}

export function writeJson(file, data) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(data, null, 2) + '\n');
}

export const config = readJson(paths.config);

// The tool's browser never talks to these sites, so there is nothing for them to detect.
export const BLOCKED_HOST_RE = /(^|\.)(linkedin\.com|licdn\.com|lnkd\.in|joinhandshake\.com|handshake\.com)$/i;

/**
 * A LinkedIn or Handshake job posting link, cleaned up ("https://www.linkedin.com/jobs/view/4012345678/"), or ''.
 * These can go in your job list when jobs open in your own Chrome: the app never loads or reads them. Your Chrome opens
 * the posting, you click Apply there, and the company's page gets the Fill panel.
 */
export function jobBoardLink(url) {
  let u;
  try {
    u = new URL(url);
  } catch {
    return '';
  }
  if (/(^|\.)linkedin\.com$/i.test(u.hostname)) {
    const id = u.pathname.match(/\/jobs\/view\/(?:[^/]*?-)?(\d{6,})/)?.[1] || u.searchParams.get('currentJobId');
    return id && /^\d+$/.test(id) ? `https://www.linkedin.com/jobs/view/${id}/` : '';
  }
  if (/(^|\.)(joinhandshake|handshake)\.com$/i.test(u.hostname)) {
    const id = u.pathname.match(/\/(?:jobs|job-search|postings)\/(\d{4,})/)?.[1] || u.searchParams.get('jobId');
    return id && /^\d+$/.test(id) ? `https://app.joinhandshake.com/jobs/${id}` : '';
  }
  return '';
}

export function isBlockedUrl(url) {
  try {
    return BLOCKED_HOST_RE.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

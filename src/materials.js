// Your info: profile, resumes, and answers you've taught the tool.
import fs from 'node:fs';
import path from 'node:path';
import { paths, readJson, readText, writeJson } from './config.js';

export function loadProfile() {
  const p = readJson(paths.profile, {});
  if (p.experience) return p;
  // Added later: years of work experience (the job warnings and "How many years of experience?" use it).
  // Shown right after Education in My info.
  const out = {};
  for (const [k, v] of Object.entries(p)) {
    out[k] = v;
    if (k === 'education') out.experience = { years: '' };
  }
  if (!out.experience) out.experience = { years: '' };
  return out;
}

export function listResumes() {
  let pdfs = [];
  try {
    pdfs = fs.readdirSync(paths.resumePdf).filter((f) => f.toLowerCase().endsWith('.pdf'));
  } catch {
    // no resume folder yet
  }
  return pdfs.map((file) => {
    const base = file.replace(/\.pdf$/i, '');
    const mdPath = path.join(paths.resumeText, `${base}.md`);
    return { file, pdfPath: path.join(paths.resumePdf, file), mdPath, text: readText(mdPath).trim() };
  });
}

export function normalizeQuestion(q) {
  return String(q || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(required\)|\(optional\)|\*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function loadLearned() {
  return readJson(paths.learned, {});
}

export function saveLearned(question, answer) {
  const key = normalizeQuestion(question);
  if (!key || !String(answer).trim()) return false;
  const learned = loadLearned();
  if (learned[key]?.answer === answer) return false;
  // A new or changed answer starts orange (double-check) until you greenlight it in My info.
  const { green, check, ...before } = learned[key] || {};
  learned[key] = { ...before, question: String(question).trim(), answer: String(answer).trim(), savedAt: new Date().toISOString() };
  writeJson(paths.learned, learned);
  return true;
}

// "Other work" (My info → Resumes & website): documents from your computer and links to pages online (case studies,
// Behance, a Google Doc, a writing sample...). Their text is scanned along with your resume and website so the match
// score reflects all your work. Originals are kept in work/, their text in me/work/, the list in me/work.json.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { chromium } from 'playwright';
import { NO_LINKEDIN_HANDSHAKE } from './browser.js';
import { isBlockedUrl, readJson, readText, ROOT, writeJson } from './config.js';
import { crawlSite, pageText, siteText } from './portfolio.js';
import { loadProfile } from './materials.js';
import { pdfText } from './resume.js';

const FILES = path.join(ROOT, 'work');
const TEXTS = path.join(ROOT, 'me', 'work');
const LIST = path.join(ROOT, 'me', 'work.json');
export const WORK_TYPES = ['.pdf', '.docx', '.pptx', '.txt', '.md'];

export function listWork() {
  return readJson(LIST, []);
}

/** All the text from your other work, for the match score. */
export function workText() {
  return listWork()
    .map((w) => readText(path.join(TEXTS, `${w.id}.md`)).trim())
    .filter(Boolean)
    .join('\n\n');
}

function save(item, text) {
  const clean = String(text || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim();
  if (clean.length < 40) throw new Error(`Couldn't find any text in ${item.name}. (Images and scans can't be read.)`);
  fs.mkdirSync(TEXTS, { recursive: true });
  fs.writeFileSync(path.join(TEXTS, `${item.id}.md`), `# ${item.name}\n\n${clean}\n`);
  const done = { ...item, words: clean.split(/\s+/).length, addedAt: new Date().toISOString() };
  writeJson(LIST, [...listWork().filter((w) => w.id !== item.id), done]);
  return done;
}

// ---- documents ----
// .docx and .pptx files are zip archives of XML; this reads the parts we need without extra libraries.
function unzip(buf, wanted) {
  const out = {};
  let eocd = buf.length - 22;
  while (eocd >= 0 && buf.readUInt32LE(eocd) !== 0x06054b50) eocd--;
  if (eocd < 0) throw new Error("That file isn't a valid Word or PowerPoint file.");
  let at = buf.readUInt32LE(eocd + 16);
  const count = buf.readUInt16LE(eocd + 10);
  for (let i = 0; i < count; i++) {
    const method = buf.readUInt16LE(at + 10);
    const size = buf.readUInt32LE(at + 20);
    const nameLen = buf.readUInt16LE(at + 28);
    const extraLen = buf.readUInt16LE(at + 30);
    const commentLen = buf.readUInt16LE(at + 32);
    const local = buf.readUInt32LE(at + 42);
    const name = buf.toString('utf8', at + 46, at + 46 + nameLen);
    if (wanted(name)) {
      const start = local + 30 + buf.readUInt16LE(local + 26) + buf.readUInt16LE(local + 28);
      const data = buf.subarray(start, start + size);
      out[name] = (method === 8 ? zlib.inflateRawSync(data) : data).toString('utf8');
    }
    at += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

const xmlText = (xml) =>
  xml
    .replace(/<\/(w|a):p>/g, '\n')
    .replace(/<(w:tab|w:br)\/>/g, ' ')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');

async function documentText(file, ext) {
  if (ext === '.pdf') return pdfText(file);
  if (ext === '.txt' || ext === '.md') return fs.readFileSync(file, 'utf8');
  const buf = fs.readFileSync(file);
  if (ext === '.docx') return xmlText(unzip(buf, (n) => n === 'word/document.xml')['word/document.xml'] || '');
  if (ext === '.pptx') {
    const slides = unzip(buf, (n) => /^ppt\/slides\/slide\d+\.xml$/.test(n));
    const num = (n) => Number(n.match(/(\d+)\.xml$/)[1]);
    return Object.keys(slides).sort((a, b) => num(a) - num(b)).map((n) => xmlText(slides[n])).join('\n');
  }
  throw new Error(`Add a ${WORK_TYPES.join(', ')} file.`);
}

/** Add a document (name + base64 contents) and read its text. */
export async function addWorkFile(name, base64) {
  const safe = path.basename(String(name || '')).replace(/[^\w.\- ()]+/g, '_');
  const ext = path.extname(safe).toLowerCase();
  if (!WORK_TYPES.includes(ext)) throw new Error(`That kind of file can't be read. Add a ${WORK_TYPES.join(', ')} file.`);
  const bytes = Buffer.from(String(base64 || ''), 'base64');
  if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('That file is empty or too large (15 MB max).');
  fs.mkdirSync(FILES, { recursive: true });
  const file = path.join(FILES, safe);
  fs.writeFileSync(file, bytes);
  const id = `file-${crypto.createHash('sha1').update(safe).digest('hex').slice(0, 10)}`;
  try {
    return save({ id, kind: 'file', name: safe }, await documentText(file, ext));
  } catch (e) {
    fs.rmSync(file, { force: true });
    throw e;
  }
}

// ---- links ----
async function renderedText(url) {
  // Pages built with JavaScript (Behance, Dribbble, Notion...) need a real browser to show their text.
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [NO_LINKEDIN_HANDSHAKE] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'networkidle', timeout: 45000 }).catch(() => {});
    return { title: await page.title(), text: await page.innerText('body').catch(() => '') };
  } finally {
    await browser.close();
  }
}

/** Add a link to a page online and read its text. */
export async function addWorkLink(rawUrl) {
  let url;
  try {
    url = new URL(/^https?:\/\//i.test(rawUrl) ? rawUrl : `https://${String(rawUrl).trim()}`);
  } catch {
    throw new Error("That doesn't look like a web address.");
  }
  if (isBlockedUrl(url.href)) throw new Error("That's LinkedIn or Handshake, which this tool never reads. Add the work itself (a file or another link).");
  const portfolio = String(loadProfile().links?.portfolio || '').replace(/^https?:\/\/(www\.)?/i, '').replace(/\/.*$/, '').toLowerCase();
  if (portfolio && url.hostname.replace(/^www\./, '').toLowerCase() === portfolio && url.pathname === '/') {
    throw new Error("That's your portfolio website, which is already scanned (the first item in the list).");
  }
  const id = `link-${crypto.createHash('sha1').update(url.href).digest('hex').slice(0, 10)}`;
  // A whole website (just the address, like "lexrubin.com"): read every page of it, like your portfolio site.
  if (url.pathname === '/' && !url.search) {
    const site = await crawlSite(url.href).catch(() => null);
    if (site && (site.pages.length > 1 || site.pages[0]?.text.length > 300)) {
      return save({ id, kind: 'site', name: site.host, url: url.href, pages: site.pages.length }, siteText(site.pages));
    }
  }
  // A shared Google Doc: read it as plain text.
  const gdoc = url.hostname === 'docs.google.com' && url.pathname.match(/^\/document\/d\/([\w-]+)/);
  const fetchUrl = gdoc ? `https://docs.google.com/document/d/${gdoc[1]}/export?format=txt` : url.href;
  let title = '';
  let text = '';
  const res = await fetch(fetchUrl, { headers: { 'user-agent': 'Mozilla/5.0 (Apply Assistant reading my own work)' }, signal: AbortSignal.timeout(20000) }).catch(() => null);
  if (res?.ok) {
    const type = res.headers.get('content-type') || '';
    if (/pdf/i.test(type)) {
      const tmp = path.join(TEXTS, `${id}.pdf`);
      fs.mkdirSync(TEXTS, { recursive: true });
      fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
      text = await pdfText(tmp).finally(() => fs.rmSync(tmp, { force: true }));
    } else {
      const body = await res.text();
      title = (body.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
      text = /html/i.test(type) ? pageText(body) : body;
    }
  }
  if (text.length < 300 && !gdoc) {
    const r = await renderedText(url.href).catch(() => null);
    if (r && r.text.length > text.length) ({ title, text } = { title: r.title || title, text: r.text });
  }
  if (!text) throw new Error(gdoc ? "Couldn't open that Google Doc. Set its sharing to \"Anyone with the link\"." : "Couldn't read that page.");
  return save({ id, kind: 'link', name: title || url.hostname + url.pathname, url: url.href }, text);
}

export function removeWork(id) {
  const item = listWork().find((w) => w.id === id);
  if (!item) return;
  fs.rmSync(path.join(TEXTS, `${id}.md`), { force: true });
  if (item.kind === 'file') fs.rmSync(path.join(FILES, item.name), { force: true });
  writeJson(LIST, listWork().filter((w) => w.id !== id));
}

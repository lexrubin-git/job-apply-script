// Reads your portfolio website (My info → Links → Portfolio) so the match score counts what's on it too:
// project pages, tools, and skills that may not fit on a one-page resume. The text is saved to me/portfolio.md.
// Only pages on your own site are read (no PDFs, images, or other sites, and never LinkedIn or Handshake).
import fs from 'node:fs';
import path from 'node:path';
import { isBlockedUrl, ROOT, readText } from './config.js';

export const PORTFOLIO_FILE = path.join(ROOT, 'me', 'portfolio.md');
const MAX_PAGES = 25;
const STALE = 14 * 864e5; // read it again after two weeks

const decode = (s) =>
  s
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&rsquo;|&lsquo;/g, "'")
    .replace(/&#?\w+;/g, ' ');

export function pageText(html) {
  const body = html
    .replace(/<(script|style|noscript|svg)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div|\/section)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ');
  return decode(body)
    .split('\n')
    .map((l) => l.replace(/\s+/g, ' ').trim())
    .filter((l) => l && !/^(click to enlarge|view project|view on instagram|[‹›∨<>|])$/i.test(l))
    .join('\n');
}

// Links on the page: normal links, plus cards that navigate with onclick="window.location='2/'".
function pageLinks(html, base) {
  const raw = [
    ...[...html.matchAll(/href\s*=\s*["']([^"'#]+)/gi)].map((m) => m[1]),
    ...[...html.matchAll(/(?:window\.)?location(?:\.href)?\s*=\s*["']([^"']+)/gi)].map((m) => m[1]),
  ];
  const out = [];
  for (const r of raw) {
    try {
      const u = new URL(r, base);
      u.hash = '';
      out.push(u);
    } catch {
      // not a link
    }
  }
  return out;
}

// The same page whether or not the address has "www.", http or https, or a trailing slash.
const pageKey = (u) => String(u).replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '').toLowerCase();

/** Read every page of a site (up to 25, same site only). Returns { host, pages: [{ url, title, text }] }. */
export async function crawlSite(siteUrl) {
  const start = new URL(/^https?:\/\//i.test(siteUrl) ? siteUrl : `https://${siteUrl}`);
  if (isBlockedUrl(start.href)) throw new Error("That's LinkedIn or Handshake, which this tool never reads. Use your own portfolio site.");
  const host = start.hostname.replace(/^www\./, '');
  const queue = [start.href];
  const seen = new Set();
  const pages = [];
  while (queue.length && pages.length < MAX_PAGES) {
    const url = queue.shift();
    if (seen.has(pageKey(url))) continue;
    seen.add(pageKey(url));
    let res;
    try {
      res = await fetch(url, { headers: { 'user-agent': 'Mozilla/5.0 (Apply Assistant reading my own portfolio)' }, signal: AbortSignal.timeout(15000) });
    } catch {
      continue;
    }
    if (!res.ok || !/text\/html/i.test(res.headers.get('content-type') || '')) continue;
    const html = await res.text();
    const title = decode(html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1] || '').replace(/\s+/g, ' ').trim();
    const text = pageText(html);
    if (text.length > 80) pages.push({ url: res.url, title: title || res.url, text });
    for (const link of pageLinks(html, res.url)) {
      const sameSite = link.hostname.replace(/^www\./, '') === host;
      const isPage = !/\.(pdf|jpe?g|png|gif|webp|svg|mp4|mov|zip|css|js|ico|xml|json)$/i.test(link.pathname);
      if (sameSite && isPage && /^https?:$/.test(link.protocol) && !seen.has(pageKey(link.href)) && !queue.some((q) => pageKey(q) === pageKey(link.href))) queue.push(link.href);
    }
  }
  if (!pages.length) throw new Error(`Couldn't read any pages from ${start.href}.`);
  return { host, pages };
}

/** The whole site as text, one section per page. */
export const siteText = (pages) => pages.flatMap((p) => [`## ${p.title}`, `<${p.url}>`, '', p.text, '']).join('\n');

/** Read your portfolio site and save its text (me/portfolio.md). Returns { pages, words }. */
export async function readPortfolio(siteUrl) {
  const { host, pages } = await crawlSite(siteUrl);
  const date = new Date().toISOString().slice(0, 10);
  const md = [`# Portfolio: ${host} (read ${date})`, '', siteText(pages)].join('\n');
  fs.mkdirSync(path.dirname(PORTFOLIO_FILE), { recursive: true });
  fs.writeFileSync(PORTFOLIO_FILE, md);
  return { pages: pages.length, words: md.split(/\s+/).length };
}

/** The saved text of your portfolio site ('' if it hasn't been read). */
export function portfolioText() {
  return readText(PORTFOLIO_FILE, '').trim();
}

/** { pages, words, readAt, stale } about the saved copy, or null. */
export function portfolioInfo() {
  if (!fs.existsSync(PORTFOLIO_FILE)) return null;
  const text = portfolioText();
  const readAt = fs.statSync(PORTFOLIO_FILE).mtimeMs;
  return { pages: (text.match(/^## /gm) || []).length, words: text.split(/\s+/).length, readAt, stale: Date.now() - readAt > STALE };
}

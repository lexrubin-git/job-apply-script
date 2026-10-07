// Reads the job posting and scores how well it fits your resume (keyword match, no AI).
import { config, isBlockedUrl } from './config.js';
import { experienceText } from './experience.js';
import { log } from './log.js';
import { scoreJob } from './match.js';
import { loadProfile } from './materials.js';
import { whereLines } from './where.js';

async function readFrames(page) {
  let best = '';
  let title = '';
  for (const frame of page.frames()) {
    try {
      const r = await frame.evaluate(() => {
        let text = document.body?.innerText || '';
        // Dropdowns (e.g. a list of every university) would drown out the job description.
        for (const s of document.querySelectorAll('select')) {
          const st = s.innerText;
          if (st && st.length > 200) text = text.replace(st, '');
        }
        const h1 = document.querySelector('h1');
        return {
          text: text.replace(/[ \t]+/g, ' ').replace(/\n\s*\n\s*\n+/g, '\n\n').trim(),
          title: (h1?.innerText || document.title || '').trim(),
        };
      });
      if (r.text.length > best.length) {
        best = r.text;
        title = r.title;
      }
    } catch {
      // frame went away
    }
  }
  return { text: best, title };
}

/** Grab the posting text right after the page loads, before you click into the form. */
export async function captureDescription(page) {
  await page.waitForLoadState('networkidle', { timeout: 10000 }).catch(() => {});
  let r = { text: '', title: '' };
  for (let i = 0; i < 5; i++) {
    r = await readFrames(page);
    if (r.text.length > 800) break;
    await page.waitForTimeout(2000);
  }
  return { text: r.text.slice(0, config.jobDescriptionMaxChars || 12000), title: r.title.slice(0, 200) };
}

// ---- full job description from the job board's public listing (Greenhouse, Lever, Ashby) ----
// Company career sites often load the posting late inside a frame, and application-form pages don't show it at all.
const decodeHtml = (s) =>
  String(s || '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&');
const htmlToText = (html) =>
  decodeHtml(decodeHtml(html))
    .replace(/<\s*(br|\/p|\/li|\/h\d|\/div)\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/\n\s*\n+/g, '\n')
    .trim();

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(8000), headers: { 'user-agent': 'job-apply-script' } });
  return res.ok ? res.json() : null;
}

function greenhouseGuesses(u) {
  const m = u.pathname.match(/^\/(?:embed\/job_app\?for=)?([^/]+)\/jobs\/(\d+)/);
  if (/greenhouse\.io$/.test(u.hostname) && m) return { id: m[2], tokens: [m[1]] };
  const id = u.searchParams.get('gh_jid') || u.searchParams.get('token');
  if (!id || !/^\d+$/.test(id)) return null;
  // Guess the board name from the site: careers.roblox.com -> roblox, pinterestcareers.com -> pinterest,
  // app.careerpuck.com/job-board/lyft/... -> lyft
  const labels = u.hostname.replace(/^www\./, '').split('.');
  const main = labels.length > 1 ? labels[labels.length - 2] : labels[0];
  const tokens = new Set([main, main.replace(/careers?|jobs?/g, ''), ...u.pathname.split('/').filter((p) => /^[a-z][a-z0-9-]{1,30}$/i.test(p))]);
  return { id, tokens: [...tokens].filter(Boolean).slice(0, 6) };
}

/** { title, company, location, text } from the job board, or null. */
export async function fetchPosting(url) {
  if (isBlockedUrl(url)) return null; // never LinkedIn or Handshake
  let u;
  try {
    u = new URL(url);
  } catch {
    return null;
  }
  const lever = u.hostname === 'jobs.lever.co' && u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/);
  if (lever) {
    const j = await getJson(`https://api.lever.co/v0/postings/${lever[1]}/${lever[2]}`);
    if (!j) return null;
    const lists = (j.lists || []).map((l) => `${l.text}\n${htmlToText(l.content)}`).join('\n');
    return {
      title: j.text, company: '', location: j.categories?.location || '', department: j.categories?.team || j.categories?.department || '',
      locations: j.categories?.allLocations || [], workplaceType: j.workplaceType || '',
      text: [j.descriptionPlain, lists, j.additionalPlain].filter(Boolean).join('\n'),
    };
  }
  const ashby = u.hostname === 'jobs.ashbyhq.com' && u.pathname.match(/^\/([^/]+)\/([0-9a-f-]{36})/);
  if (ashby) {
    const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${ashby[1]}`);
    const job = j?.jobs?.find((x) => x.id === ashby[2]);
    if (!job) return null;
    return {
      title: job.title, company: '', location: job.location || '', department: job.department || job.team || '',
      locations: (job.secondaryLocations || []).map((l) => l.location).filter(Boolean), workplaceType: job.workplaceType || '',
      text: job.descriptionPlain || htmlToText(job.descriptionHtml),
    };
  }
  // Workday: the career site's own job API (https://adobe.wd5.myworkdayjobs.com/en-US/external/job/...).
  const wdHost = u.hostname.match(/^([^.]+)\.wd\d+\.myworkdayjobs\.com$/);
  if (wdHost) {
    const parts = u.pathname.split('/').filter(Boolean);
    const at = parts.indexOf('job');
    if (at < 1) return null;
    const j = await getJson(`https://${u.hostname}/wday/cxs/${wdHost[1]}/${parts[at - 1]}/${parts.slice(at).join('/')}`);
    const p = j?.jobPostingInfo;
    if (!p) return null;
    return {
      title: p.title, company: '', location: p.location || '', department: '',
      locations: p.additionalLocations || [], workplaceType: p.remoteType || '',
      text: htmlToText(p.jobDescription),
    };
  }
  // SmartRecruiters: public posting API (https://jobs.smartrecruiters.com/<company>/<id>).
  const sr = u.hostname === 'jobs.smartrecruiters.com' && u.pathname.match(/^\/([^/]+)\/(\d+)/);
  if (sr) {
    const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${sr[1]}/postings/${sr[2]}`);
    if (!j?.jobAd) return null;
    const loc = j.location || {};
    return {
      title: j.name, company: j.company?.name || '', location: [loc.city, loc.region].filter(Boolean).join(', '), department: j.department?.label || '',
      workplaceType: loc.remote ? 'remote' : loc.hybrid ? 'hybrid' : '',
      text: Object.values(j.jobAd.sections || {}).map((s) => `${s.title || ''}\n${htmlToText(s.text)}`).join('\n'),
    };
  }
  const gh = greenhouseGuesses(u);
  if (gh) {
    for (const token of gh.tokens) {
      const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs/${gh.id}`).catch(() => null);
      if (j?.content) {
        return { title: j.title, company: j.company_name || '', location: j.location?.name || '', department: j.departments?.[0]?.name || '', text: htmlToText(j.content) };
      }
    }
  }
  return null;
}

/** "Company | Title (Location)" notes come from the job finder. */
export function parseNote(note = '') {
  const m = note.match(/^(.*?)\s\|\s(.*?)(?:\s\(([^()]*)\))?$/);
  return m ? { company: m[1], title: m[2], location: m[3] || '' } : { company: '', title: '', location: '' };
}

export function analyzeJob(job) {
  const fromNote = parseNote(job.note);
  const board = job.posting || {};
  const title = fromNote.title || board.title || job.pageTitle || '';
  const resumeText = experienceText(); // your resumes, website, and other work
  const result = scoreJob({ jobText: job.description, title, resumeText, profile: loadProfile() });
  return {
    company: fromNote.company || board.company || '',
    title,
    location: fromNote.location || board.location || '',
    ...result,
  };
}

export function printAnalysis(job) {
  const a = job.analysis;
  const line = '─'.repeat(60);
  const out = [line, [a.company, a.title, a.location].filter(Boolean).join(' | ') || job.url];
  out.push(a.score != null ? `Match: ${a.score}/10. ${a.summary}` : a.summary);
  if (a.matched.length) out.push(`On your resume or site: ${a.matched.join(', ')}`);
  if (a.missing.length) out.push(`Not on either: ${a.missing.join(', ')}`);
  for (const flag of a.flags) out.push(`⚠ ${flag}`);
  out.push(...whereLines(job.where));
  out.push(line);
  log(out.join('\n'));
}

export function jobStatusText(job) {
  const a = job.analysis;
  const head = [a?.company, a?.title].filter(Boolean).join(': ');
  const match = a?.score != null ? `Match ${a.score}/10` : '';
  const flags = a?.flags.length ? `⚠ ${a.flags.length} thing${a.flags.length > 1 ? 's' : ''} to check before applying` : '';
  return [head, match, flags, 'Click Apply, then "Fill this page" on each step.'].filter(Boolean).join('\n');
}

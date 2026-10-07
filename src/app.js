// The Apply Assistant app: a small local server plus an app-style Chrome window (src/ui/index.html).
// Started by "Apply Assistant.exe" or `npm run app`. Closing the window quits everything.
import { spawn } from 'node:child_process';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { config, isBlockedUrl, jobBoardLink, paths, readJson, ROOT, writeJson } from './config.js';
import { answerQuestion, desktopDir, jobDetails, letterFileName, renderPdf, savePdf, TONES, writeCoverLetter } from './coverLetter.js';
import { findJobs, hiddenJobs, jobKind, jobLevels, jobTypes, LEVELS, minScore, refreshList, selectedTypes } from './finder.js';
import { geminiKey, saveGeminiKey } from './gemini.js';
import { log, logBus } from './log.js';
import { parseNote } from './job.js';
import { listResumes, loadLearned, loadProfile } from './materials.js';
import { addToQueue, moveToTop, readQueue, removeFromQueue, reorderQueue, unhideEntries } from './queue.js';
import { convertResumes } from './resume.js';
import { portfolioInfo, readPortfolio } from './portfolio.js';
import { addWorkFile, addWorkLink, listWork, removeWork } from './work.js';
import { namesFor, placesFor, scoreQueueInBackground, scoresFor } from './scores.js';
import { buildExtension, EXTENSION_DIR, EXTENSION_ID } from './extension.js';
import {
  BLOCKED_MSG, currentJob, extensionClaim, extensionCommand, extensionDecide, extensionFilled, extensionPage, extensionPoll,
  extensionStatus, isRunning, jobClaimed, refreshWhere, rememberAnswer, runnerEvents, runnerState, sendCommand, setChromeOpener, startApplying,
  stopApplying,
} from './runner.js';
import { searchPlaces, searchUrl } from './elsewhere.js';
import { distanceFor, findPlace, locationPrefs, suggestCities } from './where.js';
import { readLog } from './tracker.js';

const HOST = '127.0.0.1';
const PORT = Number(process.env.APPLY_ASSISTANT_PORT) || 47321;
const token = crypto.randomBytes(16).toString('hex');
const UI_FILE = path.join(ROOT, 'src', 'ui', 'index.html');
const ICON_FILES = new Set(['icon.png', 'icon16.png', 'icon32.png']);
const EXTENSION_SEEN = path.join(paths.data, 'extension-seen.txt');

const EXTENSION_VERSION = buildExtension();

// "Start applying" opens jobs in your own Chrome unless Settings says to use a separate window.
const browserMode = () => (config.browserMode === 'separate' ? 'separate' : 'chrome');

// Open a job in your normal Chrome (a new tab, or Chrome itself if it's closed) via the /go page below,
// which is how the extension knows that tab is the job.
// Open a link in your normal Chrome (or your default browser if Chrome isn't installed).
function openInYourChrome(url) {
  const chrome = chromePath();
  if (chrome) spawn(chrome, [url], { detached: true, stdio: 'ignore' }).unref();
  // Not "cmd /c start": cmd would cut the link off at the first "&".
  else spawn('rundll32', ['url.dll,FileProtocolHandler', url], { detached: true, stdio: 'ignore' }).unref();
}

setChromeOpener((jobId) => {
  const url = `http://${HOST}:${PORT}/go?j=${jobId}&t=${token}`;
  if (process.env.APPLY_ASSISTANT_TEST) return console.log(`GO: ${url}`);
  openInYourChrome(url);
});

function markExtensionSeen() {
  if (!fs.existsSync(EXTENSION_SEEN)) {
    fs.mkdirSync(paths.data, { recursive: true });
    fs.writeFileSync(EXTENSION_SEEN, new Date().toISOString());
  }
}

// Shown in your Chrome for a moment while the extension picks up the job tab.
function goPage() {
  return `<!doctype html><html><head><meta charset="utf-8"><title>Opening job…</title><link rel="icon" href="/icon16.png">
<style>body{margin:0;height:100vh;display:grid;place-items:center;background:#008080;font:13px "Microsoft Sans Serif",Tahoma,sans-serif}
.w{background:#c0c0c0;max-width:520px;padding:3px;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #dfdfdf,inset -2px -2px #808080,inset 2px 2px #fff}
.t{background:linear-gradient(90deg,#000080,#1084d0);color:#fff;font-weight:bold;padding:4px 6px}.b{padding:12px 14px}
a.btn{display:inline-block;margin-top:6px;padding:5px 12px;background:#c0c0c0;color:#000;text-decoration:none;box-shadow:inset -1px -1px #0a0a0a,inset 1px 1px #fff,inset -2px -2px #808080,inset 2px 2px #dfdfdf}</style></head>
<body><div class="w"><div class="t">Apply Assistant</div><div class="b"><p id="msg">Opening your job…</p>
<div id="help" hidden><p><b>The Apply Assistant extension isn't set up in this Chrome yet</b>, so this job will open without the Fill panel.</p>
<p>To set it up, go to the Apply Assistant app and choose <b>File → Set up Chrome extension…</b></p><a class="btn" id="go" href="#">Open the job anyway</a></div></div></div>
<script>
const p = new URLSearchParams(location.search), started = Date.now();
async function check() {
  const r = await fetch('/api/ext/claimed?j=' + p.get('j') + '&t=' + p.get('t')).then((x) => x.json()).catch(() => ({}));
  if (r.claimed && r.url) return location.replace(r.url);
  // Try once more (the extension may have just reloaded itself after an update).
  if (Date.now() - started > 1500 && !p.has('r')) return location.replace(location.href + '&r=1');
  if (Date.now() - started > 3500 && r.url) { document.getElementById('msg').hidden = true; document.getElementById('help').hidden = false; document.getElementById('go').href = r.url; return; }
  setTimeout(check, 300);
}
check();
</script></body></html>`;
}

// If the code changes while the app is running (an update), the window asks you to restart it.
function codeVersion() {
  const hash = crypto.createHash('sha1');
  const src = path.join(ROOT, 'src');
  for (const f of fs.readdirSync(src).filter((n) => n.endsWith('.js')).sort()) hash.update(fs.readFileSync(path.join(src, f)));
  hash.update(fs.readFileSync(UI_FILE));
  return hash.digest('hex');
}
const startedVersion = codeVersion();

// ---- live updates to the window (Server-Sent Events) ----
const clients = new Set();
const logLines = [];
let shutdownTimer = null;

function broadcast(event, data) {
  const msg = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const res of clients) res.write(msg);
}

function setupStatus() {
  const issues = [];
  const p = loadProfile();
  const missing = Object.entries({
    'first name': p.firstName,
    email: p.email,
    phone: p.phone,
    school: p.education?.school,
    'work authorization': p.workAuthorization?.authorizedToWorkInUS,
    'visa sponsorship': p.workAuthorization?.needsSponsorshipNowOrFuture,
  })
    .filter(([, v]) => !String(v || '').trim())
    .map(([k]) => k);
  if (missing.length) issues.push(`Your info is missing: ${missing.join(', ')}.`);
  const resumes = listResumes();
  if (!resumes.length) issues.push('Add your resume PDF (My info → Resumes). The match score compares jobs to it.');
  else if (resumes.some((r) => !r.text)) issues.push('A resume still needs converting to text (My info → Resumes).');
  return { issues, savedAnswers: Object.keys(loadLearned()).length };
}

function finderState() {
  return {
    types: jobTypes(),
    selected: selectedTypes(),
    keywords: (config.finder?.customKeywords || []).join(', '),
    kind: jobKind(),
    levels: jobLevels(),
    levelOptions: LEVELS.map(({ key, label }) => ({ key, label })),
    minScore: minScore(),
  };
}

// A job list note ("Company | Title") from a page's title, for "Import from tab": "Graphic Designer, Sports - Fashion
// Nova Careers" on fashionnova.com -> "Fashion Nova | Graphic Designer, Sports". Replaced by the real details once the
// job is opened.
const ATS_HOSTS = /(greenhouse\.io|lever\.co|ashbyhq\.com|myworkdayjobs\.com|smartrecruiters\.com|icims\.com|workable\.com|bamboohr\.com|jobvite\.com|paylocity\.com|recruitee\.com|breezy\.hr|applytojob\.com|ultipro\.com|adp\.com|oraclecloud\.com|successfactors\.com|taleo\.net|rippling\.com)$/i;
const safeHost = (url) => {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
};
function noteFromPage(url, title) {
  let bits = String(title).split(/\s+[-–|·•:@]\s+/).map((s) => s.trim()).filter(Boolean);
  // Lever titles put the company first ("Fashion Nova - Graphic Designer").
  if (/lever\.co$/i.test(safeHost(url)) && bits.length === 2) bits = [bits[1], bits[0]];
  let job = (bits[0] || '').replace(/^(job application for|apply for|apply to|careers?:?)\s+/i, '').slice(0, 120);
  let company = bits.slice(1).find((b) => !/^(careers?|jobs?|job board|apply|job details|home)$/i.test(b)) || '';
  // "Product Designer at Figma" (Greenhouse)
  const at = !company && job.match(/^(.+?)\s+at\s+(.+)$/i);
  if (at) [job, company] = [at[1], at[2]];
  // Job sites like Workday don't put the company in the title ("2027 Intern - Software Engineer"): it's all the job.
  if (!at && ATS_HOSTS.test(safeHost(url).replace(/^www\./, '')) && !/lever\.co$|ashbyhq\.com$/i.test(safeHost(url)) && !/@/.test(title)) {
    job = bits.filter((b) => !/^(careers?|jobs?|job board|apply|job details|home)$/i.test(b)).join(' - ').slice(0, 120);
    company = '';
  }
  if (!job || /^(careers?|jobs?|job board|home|apply|search)$/i.test(job)) return undefined;
  company = company.replace(/\s+(careers?|jobs?)$/i, '');
  if (!company) {
    try {
      const u = new URL(url);
      const host = u.hostname.replace(/^www\./, '');
      // On job sites the company is the first part of the address ("adobe.wd5.myworkdayjobs.com",
      // "careers-acme.icims.com") or the first part of the path ("jobs.lever.co/figma").
      const sub = host.split('.')[0].replace(/^careers?-/, '');
      const generic = /^(jobs?|careers?|boards?|job-boards|apply|app|recruiting|hire)$/i.test(sub);
      const name = ATS_HOSTS.test(host) ? (!generic && host.split('.').length > 2 ? sub : u.pathname.split('/').filter(Boolean)[0] || sub) : host.split('.').slice(-2)[0];
      company = name.replace(/[-_]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
    } catch {
      company = '';
    }
  }
  return job ? `${company.replace(/\|/g, '/')} | ${job.replace(/\|/g, '/')}` : undefined;
}

// Your job list, each with how far it is from your closest hometown ({ miles, remote, from }) and its match score (fit).
function queueWithDistance() {
  const prefs = locationPrefs();
  const queue = readQueue();
  const fits = scoresFor(queue.map((e) => e.url));
  const places = placesFor(queue.map((e) => e.url)); // where a job is, from its posting, when the list doesn't say
  const names = namesFor(queue.map((e) => e.url)); // and its title, for jobs you pasted without one
  return queue.map((e) => ({ ...e, ...distanceFor(parseNote(e.note).location || places[e.url], prefs), fit: fits[e.url], posting: names[e.url] }));
}

// Your job list follows your settings: jobs that no longer fit (distance, Compatibility, internship or full-time) are
// set aside, and set-aside ones that fit again come back. Runs when you change those settings and on every Find.
// New scores and locations can mean some jobs no longer fit your settings: tidy the list once scoring is done.
function afterScoring(did) {
  if (did && tidyList().hidden) stateChanged();
}

function tidyList() {
  const tidy = refreshList({ keep: currentJob()?.url });
  if (tidy.restored) sendCommand('url');
  return tidy;
}

// Sort key for "nearest first": remote counts as 0 mi if you're open to remote; unknown places go last either way.
function distanceKey(e, remoteOk) {
  if (e.remote && remoteOk && (e.miles == null || e.miles > 0)) return 0;
  return e.miles;
}

function fullState() {
  return {
    runner: runnerState(),
    queue: queueWithDistance(),
    hidden: hiddenJobs(),
    setup: setupStatus(),
    finder: finderState(),
    letters: { tones: Object.entries(TONES).map(([key, t]) => ({ key, label: t.label })), hasKey: !!geminiKey() },
    browser: { mode: browserMode(), extensionSetUp: fs.existsSync(EXTENSION_SEEN) },
    autoNext: config.autoNext !== false,
  };
}

// Change config.json safely: start from what's on disk (not this process's copy, which may be older),
// apply the change, save, and refresh the in-memory copy.
function updateConfig(change) {
  const fresh = readJson(paths.config);
  change(fresh);
  writeJson(paths.config, fresh);
  for (const k of Object.keys(config)) delete config[k];
  Object.assign(config, fresh);
}

// Remember the job types ticked in the window.
function saveJobTypes({ types, keywords }) {
  const known = new Set([...jobTypes().map((t) => t.key), 'custom']);
  const picked = (Array.isArray(types) ? types : []).filter((t) => known.has(t));
  if (!picked.length) throw new Error('Tick at least one job type.');
  const words = String(keywords || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
  updateConfig((c) => {
    const { preset, ...rest } = c.finder || {};
    c.finder = { ...rest, selected: picked, customKeywords: words };
  });
  return { types: picked, words };
}

let stateTimer = null;
function stateChanged() {
  clearTimeout(stateTimer);
  stateTimer = setTimeout(() => {
    broadcast('state', fullState());
    // Jobs in your list without a match score yet get one in the background (one at a time).
    scoreQueueInBackground(stateChanged).then(afterScoring).catch(() => {});
  }, 80);
}
runnerEvents.on('state', stateChanged);
logBus.on('log', (line) => {
  console.log(line); // ends up in data/app.log for troubleshooting
  logLines.push(line);
  if (logLines.length > 400) logLines.splice(0, logLines.length - 400);
  broadcast('log', line);
});
setInterval(() => {
  for (const res of clients) res.write(': ping\n\n');
}, 15000);

// ---- actions ----
const OPEN_TARGETS = { folder: ROOT, resumes: paths.resumePdf, data: paths.data, coverLetters: paths.coverLetters };

const routes = {
  'GET /api/state': () => fullState(),
  'GET /api/logs': () => logLines,

  'POST /api/queue/add': ({ text, title }) => {
    const urls = String(text || '').match(/https?:\/\/\S+/g) || [];
    // LinkedIn/Handshake job postings are fine when jobs open in your own Chrome (the app never loads them itself).
    const chrome = browserMode() === 'chrome';
    const entries = urls.map((url) => {
      if (!isBlockedUrl(url)) return { url, note: urls.length === 1 && title ? noteFromPage(url, title) : undefined };
      const board = chrome && jobBoardLink(url);
      if (!board) return null;
      // Named from the tab's title when imported ("Graphic Designer | Snap Inc. | LinkedIn"), else by its number.
      const named = urls.length === 1 && title ? noteFromPage(board, String(title).replace(/\s*[|–-]\s*(LinkedIn|Handshake)\s*$/i, '')) : '';
      return { url: board, note: named || `${/linkedin/.test(board) ? 'LinkedIn' : 'Handshake'} | Job #${board.match(/(\d+)\/?$/)[1]}` };
    });
    const refused = urls.length - entries.filter(Boolean).length;
    const added = addToQueue(entries.filter(Boolean));
    if (added) sendCommand('url');
    stateChanged();
    const why = !chrome
      ? 'LinkedIn and Handshake job links work when jobs open in your own Chrome (My info → Settings). The separate window is automated, so it never goes to those sites.'
      : "That LinkedIn/Handshake link isn't a job posting. Open the job itself and copy its link (it has /jobs/view/ in it).";
    const first = entries.find(Boolean);
    return { added, found: urls.length, blocked: refused ? why : '', name: first?.note ? parseNote(first.note).title : '' };
  },
  'POST /api/queue/remove': ({ url }) => {
    removeFromQueue(String(url));
    stateChanged();
  },
  // Click "Company / place" (distance from your hometowns: nearest or farthest first) or "Fit" (best or worst match first).
  'POST /api/queue/sort': ({ dir, by }) => {
    const prefs = locationPrefs();
    const sign = dir === 'far' || dir === 'best' ? -1 : 1;
    const entries = queueWithDistance().map((e, i) => ({ e, i, d: by === 'fit' ? e.fit : distanceKey(e, prefs.remote) }));
    entries.sort((a, b) => (a.d == null) - (b.d == null) || (a.d == null ? 0 : sign * (a.d - b.d)) || a.i - b.i);
    reorderQueue(entries.map((x) => x.e.url));
    stateChanged();
    return { hometown: prefs.hometown, unknown: entries.filter((x) => x.d == null).length, order: readQueue().map((e) => e.url) };
  },
  // The LinkedIn / Handshake buttons: open a ready-made search in your Chrome for you to browse (the app never reads it).
  'GET /api/search-places': () => ({ places: searchPlaces() }),
  'POST /api/search-elsewhere': ({ site, place }) => {
    const url = searchUrl(String(site), String(place || 'anywhere'));
    if (process.env.APPLY_ASSISTANT_TEST) console.log(`OPEN: ${url}`);
    else openInYourChrome(url);
    return { url };
  },
  // "Bring back" a job Find set aside (or all of them).
  'POST /api/hidden/restore': ({ url }) => {
    const n = unhideEntries(url ? [String(url)] : undefined);
    if (n) sendCommand('url');
    stateChanged();
    return { restored: n };
  },
  'POST /api/queue/top': ({ url }) => {
    moveToTop(String(url));
    stateChanged();
  },
  'POST /api/finder': (body) => {
    saveJobTypes(body);
    stateChanged();
  },
  // The ⟳ button next to Find: check your whole job list against your current settings again (no new search).
  'POST /api/refresh': () => {
    refreshWhere();
    const tidy = tidyList();
    stateChanged();
    scoreQueueInBackground(stateChanged).then(afterScoring).catch(() => {});
    return tidy;
  },
  // The Compatibility setting next to Job types (0 = any).
  'POST /api/finder-min': ({ min }) => {
    const n = Number(min);
    updateConfig((c) => {
      c.finder = { ...c.finder, minScore: Number.isInteger(n) && n >= 1 && n <= 10 ? n : 0 };
    });
    const tidy = tidyList();
    stateChanged();
    return tidy;
  },
  // The Level dropdown next to Job types (Internship, Entry level, Mid level...).
  'POST /api/finder-levels': ({ levels }) => {
    const keep = LEVELS.map((l) => l.key).filter((k) => (levels || []).includes(k));
    if (!keep.length) throw new Error('Tick at least one level.');
    updateConfig((c) => {
      c.finder = { ...c.finder, levels: keep, kind: keep.every((k) => k === 'internship') ? 'intern' : 'fulltime' };
    });
    const tidy = tidyList();
    stateChanged();
    return tidy;
  },
  'POST /api/find': async (body) => {
    const { types, words } = saveJobTypes(body);
    if (types.includes('custom') && !words.length) throw new Error('Type some keywords for "Custom keywords", or untick it.');
    // First tidy your list to match your current settings, then search for new jobs.
    const tidy = tidyList();
    const r = await findJobs({ types, keywords: words });
    if (r.added) sendCommand('url');
    stateChanged();
    return { hiddenNow: tidy.hidden, restored: tidy.restored, label: r.label, added: r.added, total: r.total, errors: r.errors, sources: r.sources, belowMin: r.belowMin, levelSkipped: r.levelSkipped, unscored: r.unscored, minScore: r.minScore, near: r.near };
  },

  'POST /api/start': () => {
    if (!isRunning()) startApplying(browserMode());
  },
  // The ▶ button on a job: apply to that one now (it goes to the top of the list).
  'POST /api/apply-now': ({ url }) => {
    moveToTop(String(url));
    stateChanged();
    if (isRunning()) sendCommand('switch');
    else startApplying(browserMode());
  },

  // ---- the Apply Assistant extension in your Chrome ----
  'GET /api/ext/claimed': (_b, url) => jobClaimed(url.searchParams.get('j')),
  'POST /api/ext/claim': ({ jobId, version, retry }) => {
    markExtensionSeen();
    // Chrome still has the old copy of the extension: it reloads itself and the /go page tries again.
    if (version !== EXTENSION_VERSION && !retry) return { reload: true };
    return extensionClaim(String(jobId));
  },
  'POST /api/ext/poll': ({ jobId, peek }) => {
    markExtensionSeen();
    return extensionPoll(String(jobId), { peek: !!peek });
  },
  'POST /api/ext/page': async ({ jobId, text, title }) => {
    await extensionPage(String(jobId), text, title);
  },
  'POST /api/ext/decide': ({ jobId, fields }) => ({ decisions: extensionDecide(String(jobId), Array.isArray(fields) ? fields : []) }),
  'POST /api/ext/status': async ({ jobId, text, busy }) => {
    await extensionStatus(String(jobId), text, busy);
  },
  'POST /api/ext/filled': async ({ jobId, counts, needs, empty }) => {
    await extensionFilled(String(jobId), counts || { fact: 0, needs_you: 0 }, Array.isArray(needs) ? needs : [], empty);
  },
  'POST /api/ext/learn': ({ q, value }) => {
    rememberAnswer(String(q || ''), String(value || ''));
    stateChanged();
  },
  'POST /api/ext/command': ({ jobId, type }) => {
    extensionCommand(String(jobId), String(type));
  },
  // File → Set up Chrome extension: show the folder and open Chrome's extensions page.
  'POST /api/extension/setup': ({ step }) => {
    buildExtension();
    if (step === 'folder') spawn('explorer.exe', [EXTENSION_DIR], { detached: true, stdio: 'ignore' }).unref();
    if (step === 'chrome') {
      const chrome = chromePath();
      if (chrome) spawn(chrome, ['chrome://extensions/'], { detached: true, stdio: 'ignore' }).unref();
    }
    return { folder: EXTENSION_DIR };
  },
  // The "Open the next job automatically" checkbox next to Skip job.
  'POST /api/auto-next': ({ on }) => {
    updateConfig((c) => {
      c.autoNext = !!on;
    });
    stateChanged();
  },
  'POST /api/browser-mode': ({ mode }) => {
    updateConfig((c) => {
      c.browserMode = mode === 'separate' ? 'separate' : 'chrome';
    });
    stateChanged();
  },
  'POST /api/stop': async () => {
    await stopApplying();
  },
  'POST /api/command': ({ type }) => {
    if (['fill', 'done', 'skip'].includes(type)) sendCommand(type);
  },

  'GET /api/profile': () => ({
    profile: loadProfile(),
    learned: Object.entries(loadLearned()).map(([key, v]) => ({ key, question: v.question, answer: v.answer, check: !v.green })),
    resumes: listResumes().map((r) => ({ file: r.file, converted: !!r.text })),
    portfolio: { url: loadProfile().links?.portfolio || '', ...(portfolioInfo() || {}) },
    work: listWork(),
    settings: {
      locations: (config.finder?.locations || []).join(', '),
      hasGeminiKey: !!geminiKey(),
      hometowns: locationPrefs().hometownFromAddress ? [] : locationPrefs().hometowns,
      hometownDefault: [loadProfile().address?.city, loadProfile().address?.state].filter(Boolean).join(', '),
      radiusMiles: config.jobPrefs ? (config.jobPrefs.radiusMiles ?? null) : 50,
    },
  }),
  // Settings → City search: the dropdown of matching cities as you type.
  'GET /api/place-suggest': (_b, url) => ({ cities: suggestCities(String(url.searchParams.get('q') || '').slice(0, 100)) }),
  // Settings → City search: is it a place we can measure distances from?
  'GET /api/place': (_b, url) => {
    const q = String(url.searchParams.get('q') || '').slice(0, 100);
    const place = q ? findPlace(q) : null;
    return { label: place?.label || null };
  },
  'POST /api/profile': ({ profile, settings }) => {
    if (profile && typeof profile === 'object' && !Array.isArray(profile)) writeJson(paths.profile, profile);
    if (settings?.geminiKey) saveGeminiKey(settings.geminiKey);
    if (settings?.removeGeminiKey) saveGeminiKey('');
    if (settings) {
      updateConfig((c) => {
        c.finder = {
          ...c.finder,
          locations: String(settings.locations || '')
            .split(',')
            .map((s) => s.trim())
            .filter(Boolean),
        };
        if ('hometowns' in settings || 'radiusMiles' in settings) {
          const r = Number(settings.radiusMiles);
          c.jobPrefs = {
            hometowns: (Array.isArray(settings.hometowns) ? settings.hometowns : []).map((h) => String(h || '').trim().slice(0, 100)).filter(Boolean).slice(0, 10),
            radiusMiles: settings.radiusMiles == null || !Number.isFinite(r) ? null : Math.max(0, Math.min(300, Math.round(r))), // null = any distance
          };
        }
      });
    }
    refreshWhere();
    const tidy = settings ? tidyList() : { hidden: 0, restored: 0 };
    stateChanged();
    return tidy;
  },
  // The orange/green switch on a saved answer: orange = double-check (the default: filled in, outlined orange so you
  // look at it), green = greenlit by you (filled in without a flag).
  'POST /api/learned/toggle': ({ key }) => {
    const learned = loadLearned();
    if (!learned[key]) throw new Error('That saved answer is gone. Reopen My info.');
    learned[key].green = !learned[key].green;
    if (!learned[key].green) delete learned[key].green;
    delete learned[key].check; // older setting
    writeJson(paths.learned, learned);
    stateChanged();
    return { check: !learned[key].green };
  },
  'POST /api/learned/delete': ({ key }) => {
    const learned = loadLearned();
    delete learned[key];
    writeJson(paths.learned, learned);
    stateChanged();
  },

  'POST /api/resume/upload': ({ name, data }) => {
    const file = path.basename(String(name || '')).replace(/[^\w.\- ()]+/g, '_');
    if (!/\.pdf$/i.test(file)) throw new Error('Please choose a PDF file.');
    const bytes = Buffer.from(String(data || ''), 'base64');
    if (!bytes.length || bytes.length > 15 * 1024 * 1024) throw new Error('That file is empty or too large.');
    fs.mkdirSync(paths.resumePdf, { recursive: true });
    fs.writeFileSync(path.join(paths.resumePdf, file), bytes);
    stateChanged();
    return { file };
  },
  // My info → Resumes → Website: read your portfolio site (used by the match score with your resume).
  'POST /api/portfolio/read': async () => {
    const url = loadProfile().links?.portfolio;
    if (!url) throw new Error('Add your portfolio link first (My info → About you → Links → Portfolio), then click Save.');
    const r = await readPortfolio(url);
    log(`Read your website: ${r.pages} pages. Match scores will be updated.`);
    stateChanged(); // re-scores your job list with the website included
    return r;
  },
  // My info → Resumes & website → Other work: documents and links scanned for the match score.
  'POST /api/work/file': async ({ name, data }) => {
    const item = await addWorkFile(name, data);
    stateChanged(); // re-scores your job list
    return item;
  },
  'POST /api/work/link': async ({ url }) => {
    const item = await addWorkLink(String(url || ''));
    stateChanged();
    return item;
  },
  'POST /api/work/remove': ({ id }) => {
    removeWork(String(id));
    stateChanged();
  },
  'POST /api/resume/convert': async () => {
    const results = await convertResumes();
    stateChanged();
    return { results };
  },
  'POST /api/resume/remove': ({ file }) => {
    const r = listResumes().find((x) => x.file === file);
    if (r) {
      fs.rmSync(r.pdfPath, { force: true });
      fs.rmSync(r.mdPath, { force: true });
    }
    stateChanged();
  },

  'POST /api/quit': () => {
    // The app window is closing.
    setTimeout(() => shutdown(true), 50);
  },
  'GET /api/history': () => readLog(),

  'POST /api/cover-letter/write': async ({ url, note, company, title, description, tone, customTone, notes }) => {
    const details = url
      ? await jobDetails({ url: String(url), note: String(note || ''), current: currentJob() })
      : { company: String(company || ''), title: String(title || ''), location: '', department: '', description: String(description || '') };
    const letter = await writeCoverLetter({ ...details, tone, customTone, notes });
    return { letter, company: details.company, title: details.title };
  },
  // Cover letter maker → Answer an application question (same job, tone and materials as the letter).
  'POST /api/question/answer': async ({ url, note, company, title, description, tone, customTone, notes, question, limit }) => {
    const details = url
      ? await jobDetails({ url: String(url), note: String(note || ''), current: currentJob() })
      : { company: String(company || ''), title: String(title || ''), location: '', department: '', description: String(description || '') };
    return answerQuestion({ ...details, tone, customTone, notes, question, limit });
  },
  // "Export to Desktop": save straight to your Desktop.
  'POST /api/cover-letter/export': async ({ html, company, title }) => {
    const file = await savePdf({ html: String(html || ''), company, title, dir: desktopDir() });
    return { file, name: path.basename(file) };
  },
  'POST /api/open': ({ target }) => {
    const dir = OPEN_TARGETS[target];
    if (!dir) throw new Error('Unknown folder');
    fs.mkdirSync(dir, { recursive: true });
    spawn('explorer.exe', [dir], { detached: true, stdio: 'ignore' }).unref();
  },
};

// ---- HTTP plumbing ----
function send(res, status, body, type = 'text/plain; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  res.end(body);
}
const json = (res, status, data) => send(res, status, JSON.stringify(data ?? { ok: true }), 'application/json');

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', (c) => {
      size += c.length;
      if (size > 25 * 1024 * 1024) {
        reject(new Error('Request too large'));
        req.destroy();
      } else chunks.push(c);
    });
    req.on('end', () => {
      try {
        resolve(chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : {});
      } catch {
        reject(new Error('Bad request'));
      }
    });
    req.on('error', reject);
  });
}

function openEvents(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
  res.write(`event: state\ndata: ${JSON.stringify(fullState())}\n\n`);
  clients.add(res);
  clearTimeout(shutdownTimer);
  req.on('close', () => {
    clients.delete(res);
    // The window was closed (a reload reconnects within a second or two).
    if (!clients.size) shutdownTimer = setTimeout(shutdown, 8000);
  });
}

const server = http.createServer(async (req, res) => {
  // Only this computer, only this app: reject other hostnames (DNS rebinding) and requests without the launch key.
  if (![`${HOST}:${PORT}`, `localhost:${PORT}`].includes(req.headers.host)) return send(res, 403, 'Forbidden');
  const url = new URL(req.url, `http://${HOST}:${PORT}`);
  if (req.method === 'GET' && url.pathname === '/') {
    let html = fs.readFileSync(UI_FILE, 'utf8');
    if (codeVersion() !== startedVersion) html = html.replace('<head>', '<head><script>window.APP_OUTDATED = true;</script>');
    return send(res, 200, html, 'text/html; charset=utf-8');
  }
  if (req.method === 'GET' && url.pathname === '/letter.css') return send(res, 200, fs.readFileSync(paths.letterCss), 'text/css; charset=utf-8');
  const iconName = url.pathname.slice(1);
  if (req.method === 'GET' && ICON_FILES.has(iconName) && fs.existsSync(path.join(ROOT, 'assets', iconName))) {
    return send(res, 200, fs.readFileSync(path.join(ROOT, 'assets', iconName)), 'image/png');
  }
  if (req.method === 'POST' && url.pathname === '/api/focus' && req.headers['x-apply-assistant'] === 'focus') {
    openWindow();
    return json(res, 200);
  }
  // The job link the app opens in your Chrome (see setChromeOpener).
  if (req.method === 'GET' && url.pathname === '/go') {
    if (url.searchParams.get('t') !== token) return send(res, 403, 'Forbidden');
    return send(res, 200, goPage(), 'text/html; charset=utf-8');
  }
  if (!url.pathname.startsWith('/api/')) return send(res, 404, 'Not found');
  // The app's own Chrome extension (its pages and popup) may use the app too: Chrome sets this Origin, and web pages
  // can't fake it.
  const fromOurExtension = req.headers.origin === `chrome-extension://${EXTENSION_ID}`;
  if ((req.headers['x-token'] || url.searchParams.get('t')) !== token && !fromOurExtension) return send(res, 403, 'Forbidden');
  // The extension's "Open" buttons: the address of this window (with its key).
  if (url.pathname === '/api/ext/app' && fromOurExtension) return json(res, 200, { url: `http://${HOST}:${PORT}/?t=${token}`, mode: browserMode() });
  if (url.pathname === '/api/events') return openEvents(req, res);
  // "Export to…": the PDF itself, which the window saves wherever you pick.
  if (req.method === 'POST' && url.pathname === '/api/cover-letter/pdf') {
    try {
      const { html, company, title } = await readBody(req);
      const bytes = await renderPdf(String(html || ''));
      res.writeHead(200, { 'content-type': 'application/pdf', 'x-file-name': encodeURIComponent(letterFileName(company, title)), 'cache-control': 'no-store' });
      return res.end(bytes);
    } catch (e) {
      return json(res, 500, { error: e.message });
    }
  }
  const handler = routes[`${req.method} ${url.pathname}`];
  if (!handler) return send(res, 404, 'Not found');
  try {
    const body = req.method === 'POST' ? await readBody(req) : {};
    json(res, 200, await handler(body, url));
  } catch (e) {
    json(res, 500, { error: e.message });
  }
});

function chromePath() {
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return [
    path.join(pf, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(pf86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Google', 'Chrome', 'Application', 'chrome.exe'),
  ].find((p) => fs.existsSync(p));
}

function browserPath() {
  const pf = process.env.PROGRAMFILES || 'C:\\Program Files';
  const pf86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';
  return (
    chromePath() ||
    [path.join(pf86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'), path.join(pf, 'Microsoft', 'Edge', 'Application', 'msedge.exe')].find((p) =>
      fs.existsSync(p),
    )
  );
}

function openWindow() {
  const url = `http://${HOST}:${PORT}/?t=${token}`;
  if (process.env.APPLY_ASSISTANT_NO_WINDOW) {
    // "Apply Assistant.exe" shows the window itself: hand it the address, or bring its window to the front.
    if (clients.size) broadcast('focus', {});
    else console.log(`UI: ${url}`);
    return;
  }
  const exe = browserPath();
  if (!exe) {
    spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref();
    return;
  }
  spawn(
    exe,
    [
      `--app=${url}`,
      `--user-data-dir=${paths.uiProfile}`,
      '--window-size=1180,840',
      '--no-first-run',
      '--no-default-browser-check',
    ],
    { detached: true, stdio: 'ignore' },
  ).unref();
}

async function shutdown(force = false) {
  if (clients.size && !force) return;
  await stopApplying().catch(() => {});
  process.exit(0);
}

server.on('error', async (e) => {
  if (e.code === 'EADDRINUSE') {
    // Already running: bring its window up instead of starting a second copy.
    try {
      await fetch(`http://${HOST}:${PORT}/api/focus`, { method: 'POST', headers: { 'x-apply-assistant': 'focus' } });
      process.exit(0);
    } catch {
      console.error(`Port ${PORT} is in use by another program.`);
      process.exit(1);
    }
  }
  console.error(e);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  console.log(`Apply Assistant running at http://${HOST}:${PORT}`);
  openWindow();
  // If the window never connects (browser failed to open), don't linger in the background.
  shutdownTimer = setTimeout(shutdown, 90000);
  // Read your portfolio website if it hasn't been read (or it's been two weeks), then give jobs in your list a
  // match score (the Fit column).
  const site = loadProfile().links?.portfolio;
  const info = portfolioInfo();
  (site && (!info || info.stale) ? readPortfolio(site).catch((e) => log(`Couldn't read your website: ${e.message}`)) : Promise.resolve())
    .then(() => scoreQueueInBackground(stateChanged))
    .then(afterScoring)
    .catch(() => {});
});

process.on('uncaughtException', (e) => {
  console.error(e);
  logBus.emit('log', `Unexpected error: ${e.message}`);
});

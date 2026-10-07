// npm run find: pull internships from public job lists and add matches to data/queue.txt.
// Sources are public feeds (SimplifyJobs and other GitHub internship lists, The Muse, and company boards on Greenhouse,
// Lever, Ashby, SmartRecruiters, and Workday), never LinkedIn or Handshake.
// Options: --dry (only list matches), --type <job type keys from src/jobTypes.js, comma-separated>.
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config, isBlockedUrl } from './config.js';
import { allJobTypes, MUSE_CATEGORIES } from './jobTypes.js';
import { parseNote } from './job.js';
import { addToQueue, hideEntries, readHidden, readQueue, unhideEntries } from './queue.js';
import { placesFor, readJob, resumeInfo, saveScores, scoresFor, scoreText, yearsFor } from './scores.js';
import { yearsRequired } from './match.js';
import { loggedUrls, normalizeUrl } from './tracker.js';
import { distanceFor, locationPrefs, withinRadius } from './where.js';

const INTERN_RE = /\b(intern|interns|internship|co-?op|apprentice(ship)?)\b/i;
// "Manager" is Manager level, unless it's an entry-level kind (associate product manager, account manager...).
const MANAGER_RE = /\bmanager\b/i;
const ENTRY_MANAGER_RE = /\b(associate|assistant|junior|jr|trainee|apm|account manager|community manager|social media manager|store manager|case manager)\b/i;

// ---- Level: the Level dropdown next to Job types ----
export const LEVELS = [
  { key: 'internship', label: 'Internship', linkedin: ['1'], muse: 'Internship' },
  { key: 'entry', label: 'Entry level (new grad, junior)', linkedin: ['2', '3'], muse: 'Entry Level' },
  { key: 'mid', label: 'Mid level', linkedin: ['4'], muse: 'Mid Level' },
  { key: 'senior', label: 'Senior (senior, staff, lead)', linkedin: ['4'], muse: 'Senior Level' },
  { key: 'manager', label: 'Manager', linkedin: ['4'], muse: 'management' },
  { key: 'director', label: 'Director & executive', linkedin: ['5', '6'], muse: 'management' },
];
const LEVEL_WORDS = { internship: 'Internship', entry: 'Entry level', mid: 'Mid level', senior: 'Senior', manager: 'Manager level', director: 'Director level or above' };

/**
 * A job's level from its title, or else from the years of experience its posting asks for. 'unclear' when neither
 * says (a plain "Product Designer"): it counts as entry or mid level.
 */
export function jobLevel(title, { internship = false, years = null } = {}) {
  const t = String(title || '');
  if (internship || INTERN_RE.test(t)) return 'internship';
  if (/\bassociate director\b/i.test(t)) return 'manager';
  if (/\b(director|vp|svp|evp|vice president|chief|head of|ceo|cto|cfo|coo|cmo|cpo|president|general manager)\b/i.test(t)) return 'director';
  if (/\b(sr|senior|staff|principal|lead|leader|iii|iv|expert|distinguished|general counsel|solutions architect|cloud architect|enterprise architect)\b/i.test(t)) return 'senior';
  if (MANAGER_RE.test(t) && !ENTRY_MANAGER_RE.test(t)) return 'manager';
  if (/\b(new grad|graduate|university grad\w*|early career|entry[- ]level|junior|jr|associate|trainee|apprentice|i|level 1)\b/i.test(t)) return 'entry';
  if (/\b(ii|2|mid[- ]level|intermediate)\b/i.test(t)) return 'mid';
  if (years != null && years > 0) return years >= 6 ? 'senior' : years >= 3 ? 'mid' : 'entry';
  return 'unclear';
}

/** The levels you ticked (older settings had just the Internships/Full-time switch). */
export function jobLevels() {
  const saved = config.finder?.levels;
  if (Array.isArray(saved) && saved.length) return saved.filter((k) => LEVELS.some((l) => l.key === k));
  return config.finder?.kind === 'fulltime' ? ['entry'] : ['internship'];
}

const levelFits = (level, levels) => levels.includes(level) || (level === 'unclear' && (levels.includes('entry') || levels.includes('mid')));
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const titleCase = (s) => s.replace(/(^|[-_ ])(\w)/g, (_, sep, c) => (sep ? ' ' : '') + c.toUpperCase());

// Each term matches the start of a word ("illustrat" matches "Illustrator"). "ux+research" needs both words.
// A term starting with "=" or ending in a space is a whole word only ("=spa" doesn't match "Space", "pr " isn't
// "Product").
function titleMatcher(terms) {
  const groups = (terms || [])
    .map((t) => String(t).replace(/^\s+/, ''))
    .filter((t) => t.trim())
    .map((t) =>
      t.split('+').map((part) => {
        const whole = part.startsWith('=') || /\s$/.test(part);
        return new RegExp(`\\b${escapeRe(part.replace(/^=/, '').trim())}${whole ? '\\b' : ''}`, 'i');
      }),
    );
  return (title) => groups.some((g) => g.every((re) => re.test(title)));
}

/** The job types to choose from: [{ key, label }]. "custom" (your own keywords) is always available too. */
export function jobTypes() {
  return [...allJobTypes(config.finder?.presets).map(({ key, label, category }) => ({ key, label, category })), { key: 'any', label: 'Anything', category: '' }];
}

function resolveType(key, keywords) {
  const cfg = config.finder || {};
  if (key === 'custom') {
    const words = keywords ?? cfg.customKeywords ?? [];
    return { label: words.length ? words.join(', ') : 'any', include: words };
  }
  if (key === 'any') return { label: 'Anything', include: [], excludeCategories: [] };
  const types = allJobTypes(cfg.presets);
  return types.find((x) => x.key === key) || types.find((x) => x.key === 'design');
}

async function getJson(url) {
  const res = await fetch(url, { headers: { 'user-agent': 'job-apply-script' } });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// SimplifyJobs' lists and other community lists in the same format (internship lists, and new-grad lists for full-time).
async function fromSimplify(s, name = 'SimplifyJobs', kind = 'intern') {
  const list = await getJson(s.url);
  return list
    .filter((x) => x.active && x.is_visible !== false)
    .filter((x) => !s.terms?.length || (x.terms || []).some((t) => s.terms.includes(t)))
    .map((x) => ({
      company: x.company_name,
      title: x.title,
      url: x.url,
      locations: x.locations || [],
      postedAt: (x.date_posted || 0) * 1000,
      source: name,
      category: x.category,
      internship: kind !== 'fulltime',
    }));
}

async function fromGreenhouse(token) {
  const j = await getJson(`https://boards-api.greenhouse.io/v1/boards/${token}/jobs`);
  return (j.jobs || []).map((x) => ({
    company: x.company_name || titleCase(token),
    title: x.title,
    url: x.absolute_url,
    locations: [x.location?.name].filter(Boolean),
    postedAt: Date.parse(x.first_published || x.updated_at) || 0,
    source: `Greenhouse/${token}`,
  }));
}

async function fromLever(company) {
  const j = await getJson(`https://api.lever.co/v0/postings/${company}?mode=json`);
  return (Array.isArray(j) ? j : []).map((x) => ({
    company: titleCase(company),
    title: x.text,
    url: x.hostedUrl,
    locations: x.categories?.allLocations?.length ? x.categories.allLocations : [x.categories?.location].filter(Boolean),
    postedAt: x.createdAt || 0,
    source: `Lever/${company}`,
    internship: /intern/i.test(x.categories?.commitment || ''),
  }));
}

async function fromAshby(board) {
  const j = await getJson(`https://api.ashbyhq.com/posting-api/job-board/${board}`);
  return (j.jobs || [])
    .filter((x) => x.isListed !== false)
    .map((x) => ({
      company: titleCase(board),
      title: x.title,
      url: x.jobUrl,
      locations: [x.location, ...(x.secondaryLocations || []).map((l) => l.location)].filter(Boolean),
      postedAt: Date.parse(x.publishedAt) || 0,
      source: `Ashby/${board}`,
      internship: /intern/i.test(x.employmentType || ''),
    }));
}

// The Muse (themuse.com): a public job site with an internship filter. Searched by category; your job types and
// locations then filter the results like any other source.
async function fromMuse(muse, levels, categories) {
  const pages = Math.min(muse.pages || 3, 10);
  const museLevels = [...new Set(LEVELS.filter((l) => levels.includes(l.key)).map((l) => l.muse))];
  const urls = museLevels.flatMap((level) => (categories?.length ? categories : ['']).flatMap((c) =>
    Array.from({ length: pages }, (_, p) => [level, `https://www.themuse.com/api/public/jobs?level=${encodeURIComponent(level)}&descending=true&page=${p}${c ? `&category=${encodeURIComponent(c)}` : ''}`]),
  ));
  const results = await Promise.all(urls.map(([level, u]) => getJson(u).then((j) => ({ ...j, level }), () => null)));
  return results.flatMap((j) =>
    (j?.results || []).map((x) => ({
      company: x.company?.name || '',
      title: x.name,
      url: x.refs?.landing_page,
      locations: (x.locations || []).map((l) => l.name),
      postedAt: Date.parse(x.publication_date) || 0,
      source: 'The Muse',
      text: String(x.contents || '').replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' '), // for the match score
      internship: j.level === 'Internship',
    })),
  );
}

// SmartRecruiters company boards (public posting API).
async function fromSmartRecruiters(company, levels) {
  const onlyInterns = levels.every((l) => l === 'internship');
  const j = await getJson(`https://api.smartrecruiters.com/v1/companies/${company}/postings?${onlyInterns ? 'q=intern&' : ''}limit=100`);
  return (j.content || []).map((x) => ({
    company: x.company?.name || titleCase(company),
    title: x.name,
    url: `https://jobs.smartrecruiters.com/${company}/${x.id}`,
    locations: [x.location?.remote ? 'Remote' : '', [x.location?.city, x.location?.region, x.location?.country?.toUpperCase()].filter(Boolean).join(', ')].filter(Boolean),
    postedAt: Date.parse(x.releasedDate) || 0,
    source: `SmartRecruiters/${company}`,
    internship: x.experienceLevel?.id === 'internship' || x.typeOfEmployment?.id === 'intern',
  }));
}

// Workday company career sites ("adobe/wd5/external_experienced" = adobe.wd5.myworkdayjobs.com/external_experienced),
// read the same way the career site itself loads its job list.
function workdayAge(text) {
  const t = String(text || '').toLowerCase();
  if (/today/.test(t)) return 0;
  if (/yesterday/.test(t)) return 1;
  const n = Number(t.match(/(\d+)\+?\s*days?/)?.[1]);
  return Number.isFinite(n) ? n : null;
}
async function fromWorkday(entry, levels) {
  const [tenant, wd, site] = String(entry).split('/');
  const host = `https://${tenant}.${wd}.myworkdayjobs.com`;
  const jobs = [];
  // A search for each level you ticked: internships, entry-level and new-grad jobs, or just the newest jobs for the rest.
  const searches = [...new Set([
    ...(levels.includes('internship') ? ['intern'] : []),
    ...(levels.includes('entry') ? ['graduate', 'entry level', 'associate'] : []),
    ...(levels.some((l) => !['internship', 'entry'].includes(l)) ? [''] : []),
  ])];
  for (const searchText of searches) {
    for (let offset = 0; offset < (searchText === 'intern' || searchText === '' ? 100 : 40); offset += 20) {
      const res = await fetch(`${host}/wday/cxs/${tenant}/${site}/jobs`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', accept: 'application/json', 'user-agent': 'job-apply-script' },
        body: JSON.stringify({ limit: 20, offset, searchText, appliedFacets: {} }),
        signal: AbortSignal.timeout(15000),
      });
      if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
      const j = await res.json();
      const page = j.jobPostings || [];
      for (const x of page) {
        const days = workdayAge(x.postedOn);
        jobs.push({
          company: titleCase(tenant),
          title: x.title,
          url: `${host}/${site}${x.externalPath}`,
          locations: [x.locationsText].filter((l) => l && !/^\d+ locations$/i.test(l)),
          postedAt: days == null ? 0 : Date.now() - days * 864e5,
          source: `Workday/${tenant}`,
        });
      }
      if (page.length < 20 || offset + 20 >= (j.total || 0)) break;
    }
  }
  return jobs;
}

/** The job types you last picked (older configs saved just one). */
export function selectedTypes() {
  const cfg = config.finder || {};
  const list = Array.isArray(cfg.selected) ? cfg.selected : [cfg.preset || 'design'];
  return list.length ? list : ['design'];
}

// A filter for one job type: does a listing belong to it?
function typeFilter(preset, cfg) {
  const include = preset.include?.length ? titleMatcher(preset.include) : null;
  const exclude = titleMatcher([...(preset.exclude || []), ...(preset.excludeTechnical ? cfg.technicalWords || [] : [])]);
  // SimplifyJobs sorts listings into categories (Software, AI/ML/Data, Product, Hardware, Quant).
  const onlyCategories = preset.categories ? new Set(preset.categories) : null;
  const skipCategories = new Set(preset.excludeCategories ?? cfg.simplify?.excludeCategories ?? []);
  return (j) => {
    if (j.category && onlyCategories && !onlyCategories.has(j.category)) return false;
    if (j.category && !onlyCategories && skipCategories.has(j.category)) return false;
    if (include && !include(j.title)) return false;
    return !exclude(j.title);
  };
}

/**
 * Search all sources for one or more job types. Returns { label, total, picked, added, errors }.
 * types: job type keys (src/jobTypes.js, plus your own in config.finder.presets) and/or "custom" (with keywords). A listing that fits any of them counts.
 * With dry: true nothing is queued.
 */
// ---- "Find" also refreshes your job list: jobs that no longer fit your settings are set aside (data/hidden.txt),
// and set-aside jobs that fit again come back. Nothing is deleted.

/** Why a job doesn't fit your settings right now ('' if it does). */
export function misfit(entry, { prefs, least, levels, fit, years = null, place = '', fitsTypes }) {
  const n = parseNote(entry.note);
  const level = n.title ? jobLevel(n.title, { years }) : 'unclear';
  if (!levelFits(level, levels)) return `${LEVEL_WORDS[level]} (not one of the levels you ticked)`;
  if (n.title && fitsTypes && !fitsTypes(n.title)) return 'Not one of the job types you ticked';
  // Where it is: from the list entry, or else from the job's posting (read in the background).
  const location = n.location || place;
  if (location && !withinRadius([location], prefs)) {
    const d = distanceFor(location, prefs);
    if (d.miles == null) return "Remote (you're not open to remote work)";
    const where = d.place ? `${d.place}: ` : '';
    return `${where}${d.approx ? 'about ' : ''}${d.miles.toLocaleString()} mi away (your radius is ${prefs.radiusMiles} mi)`;
  }
  if (least && fit != null && fit < least) return `Matches ${fit}/10 (below your ${least}+)`;
  return '';
}

function fitSettings() {
  // Does a title fit one of the job types you've ticked? ("Anything" fits everything.)
  const cfg = config.finder || {};
  const keys = selectedTypes();
  const filters = keys.includes('any') ? null : keys.map((k) => typeFilter(resolveType(k), cfg));
  const always = titleMatcher(cfg.alwaysExclude || []);
  const fitsTypes = filters ? (title) => !always(title) && filters.some((fits) => fits({ title })) : null;
  return { prefs: locationPrefs(), least: minScore(), levels: jobLevels(), fitsTypes };
}

/** Set aside list jobs that don't fit, and bring back set-aside ones that do. `keep`: the job you're on. */
export function refreshList({ keep = '' } = {}) {
  const s = fitSettings();
  const queue = readQueue();
  const hidden = readHidden();
  const urls = [...queue, ...hidden].map((e) => e.url);
  const fits = scoresFor(urls);
  const places = placesFor(urls);
  const years = yearsFor(urls);
  const why = (e) => misfit(e, { ...s, fit: fits[e.url], place: places[e.url], years: years[e.url] });
  const out = queue.filter((e) => normalizeUrl(e.url) !== normalizeUrl(keep) && why(e));
  const back = hidden.filter((e) => !why(e));
  hideEntries(out);
  const restored = back.length ? unhideEntries(back.map((e) => e.url)) : 0;
  return { hidden: out.length, restored };
}

/** The set-aside jobs, each with why. */
export function hiddenJobs() {
  const s = fitSettings();
  const hidden = readHidden();
  const fits = scoresFor(hidden.map((e) => e.url));
  const places = placesFor(hidden.map((e) => e.url));
  const years = yearsFor(hidden.map((e) => e.url));
  return hidden.map((e) => ({ ...e, fit: fits[e.url], reason: misfit(e, { ...s, fit: fits[e.url], place: places[e.url], years: years[e.url] }) || 'Fits your settings again; comes back when you refresh' }));
}

// The job's places for its note in your list, " (San Francisco, CA; New York, NY)": up to four, so distances and the
// radius check see every city it's offered in (not just the first).
function placesNote(locations) {
  const list = locations.map((l) => String(l).replace(/[()]/g, '').replace(/\s+/g, ' ').trim()).filter(Boolean).slice(0, 4);
  return list.length ? ` (${list.join('; ')})` : '';
}

/** "intern" when you're only looking for internships, else "fulltime" (used for wording). */
export function jobKind() {
  return jobLevels().every((l) => l === 'internship') ? 'intern' : 'fulltime';
}

/** The Compatibility setting next to Job types: only add jobs scoring at least this (0 = any). */
export function minScore() {
  const n = Number(config.finder?.minScore);
  return Number.isInteger(n) && n >= 1 && n <= 10 ? n : 0;
}

// At most this many matches are read and scored per search, so a search stays under about a minute.
const SCORE_LIMIT = 160;

export async function findJobs({ dry = false, types, type, keywords, levels = jobLevels(), minScore: least = minScore() } = {}) {
  const cfg = config.finder || {};
  const prefs = locationPrefs();
  const keys = types?.length ? types : type ? [type] : selectedTypes();
  const presets = keys.map((k) => resolveType(k, keywords));
  const filters = presets.map((p) => typeFilter(p, cfg));
  const label = presets.map((p) => p.label).join(', ');
  const always = titleMatcher(cfg.alwaysExclude || []);
  const wantInterns = levels.includes('internship');
  const wantEntry = levels.includes('entry');

  const tasks = [];
  if (wantInterns && cfg.simplify?.enabled !== false && cfg.simplify?.url) tasks.push(['SimplifyJobs list', fromSimplify(cfg.simplify)]);
  // Internship lists when you ticked Internship, new-grad lists when you ticked Entry level.
  for (const l of cfg.lists || []) {
    const kind = l.kind || 'intern';
    if (l.enabled !== false && l.url && (kind === 'intern' ? wantInterns : wantEntry)) tasks.push([`${l.name} list`, fromSimplify({ ...cfg.simplify, ...l }, l.name, kind)]);
  }
  // The Muse: searched in its categories that match the job types you ticked (healthcare, education, legal...).
  if (cfg.muse?.enabled) {
    const cats = [...new Set(presets.flatMap((p) => MUSE_CATEGORIES[p.category] || []))];
    tasks.push(['The Muse', fromMuse(cfg.muse, levels, cats.length ? cats : cfg.muse.categories)]);
  }
  for (const t of cfg.boards?.greenhouse || []) tasks.push([`Greenhouse/${t}`, fromGreenhouse(t)]);
  for (const t of cfg.boards?.lever || []) tasks.push([`Lever/${t}`, fromLever(t)]);
  for (const t of cfg.boards?.ashby || []) tasks.push([`Ashby/${t}`, fromAshby(t)]);
  for (const t of cfg.boards?.smartrecruiters || []) tasks.push([`SmartRecruiters/${t}`, fromSmartRecruiters(t, levels)]);
  for (const t of cfg.boards?.workday || []) tasks.push([`Workday/${t.split('/')[0]}`, fromWorkday(t, levels)]);

  const settled = await Promise.allSettled(tasks.map(([, p]) => p));
  const jobs = [];
  const errors = [];
  settled.forEach((r, i) => {
    if (r.status === 'fulfilled') jobs.push(...r.value);
    else errors.push(`couldn't read ${tasks[i][0]}: ${r.reason.message}`);
  });

  const companies = (cfg.excludeCompanies || []).map((c) => c.toLowerCase());
  const places = (cfg.locations || []).map((l) => l.toLowerCase());
  const maxAge = (cfg.maxAgeDays || 0) * 864e5;
  const skip = new Set([...loggedUrls(), ...[...readQueue(), ...readHidden()].map((e) => normalizeUrl(e.url))]);
  const seen = new Set();
  // The same job often shows up on several sources with different links ("NIKE, Inc." on The Muse, "Nike" on Workday).
  const sameJob = (company, title) => `${String(company).toLowerCase().match(/[a-z0-9]+/)?.[0] || ''}|${String(title).toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim()}`;
  const seenJobs = new Set(
    readQueue()
      .map((e) => e.note.match(/^(.*?)\s\|\s(.*?)(?:\s\([^()]*\))?$/))
      .filter(Boolean)
      .map((m) => sameJob(m[1], m[2])),
  );

  const matches = jobs.filter((j) => {
    if (!j.url || !j.title || isBlockedUrl(j.url)) return false;
    const key = normalizeUrl(j.url);
    if (skip.has(key) || seen.has(key)) return false;
    // The level you ticked (titles that don't say are checked again below, once the posting's been read)
    if (!levelFits(jobLevel(j.title, { internship: j.internship }), levels)) return false;
    if (always(j.title) || !filters.some((fits) => fits(j))) return false;
    if (companies.some((c) => (j.company || '').toLowerCase().includes(c))) return false;
    if (places.length) {
      const locs = j.locations.map((l) => l.toLowerCase());
      const remoteOk = cfg.includeRemote !== false && locs.some((l) => l.includes('remote'));
      if (!remoteOk && !locs.some((l) => places.some((p) => l.includes(p)))) return false;
    }
    if (!withinRadius(j.locations, prefs)) return false;
    if (maxAge && j.postedAt && Date.now() - j.postedAt > maxAge) return false;
    const same = sameJob(j.company, j.title);
    if (seenJobs.has(same)) return false;
    seenJobs.add(same);
    seen.add(key);
    return true;
  });

  matches.sort((a, b) => (b.postedAt || 0) - (a.postedAt || 0));

  // Score the newest matches against your resume (reading each job's description), keeping those at or above
  // the Compatibility setting. Jobs whose description can't be read are kept, since there's no way to judge them.
  const max = cfg.maxResults || 40;
  const picked = [];
  const scores = {};
  let belowMin = 0;
  let levelSkipped = 0;
  const resume = resumeInfo(); // your resumes plus your portfolio website
  for (let i = 0; i < matches.length && picked.length < max && i < SCORE_LIMIT; i += 8) {
    const batch = matches.slice(i, i + 8);
    await Promise.all(batch.map(async (j) => {
      const read = j.text ? { score: scoreText(j.title, j.text, resume), years: yearsRequired(j.text).required } : await readJob(j.url, j.title, resume);
      j.score = read.score;
      j.years = read.years ?? null;
    }));
    for (const j of batch) {
      scores[j.url] = { score: j.score, years: j.years };
      if (!levelFits(jobLevel(j.title, { internship: j.internship, years: j.years }), levels)) {
        levelSkipped++;
        continue;
      }
      if (j.score != null && least && j.score < least) {
        belowMin++;
        continue;
      }
      if (picked.length < max) picked.push(j);
    }
  }
  if (!dry) saveScores(scores);
  const added = dry
    ? 0
    : addToQueue(picked.map((j) => ({ url: j.url, note: `${j.company} | ${j.title}${placesNote(j.locations)}` })));
  // Where the jobs came from, e.g. { SimplifyJobs: 12, Workday: 3 }
  const sources = {};
  for (const j of picked) sources[j.source.split('/')[0]] = (sources[j.source.split('/')[0]] || 0) + 1;
  const near = prefs.radiusMiles == null ? '' : `within ${prefs.radiusMiles} mi of ${prefs.hometowns.join(', ')}${prefs.remote ? ', or remote' : ''}`;
  return { label, total: matches.length, picked, added, errors, sources, belowMin, levelSkipped, unscored: picked.filter((j) => j.score == null).length, minScore: least, near };
}

async function main() {
  const dry = process.argv.includes('--dry');
  const i = process.argv.indexOf('--type');
  const types = i > 0 ? String(process.argv[i + 1] || '').split(',').filter(Boolean) : undefined;
  const known = new Set(jobTypes().map((x) => x.key));
  const unknown = (types || []).filter((t) => t !== 'custom' && !known.has(t));
  if (unknown.length) {
    console.log(`Unknown job type "${unknown[0]}". Choose from: ${jobTypes().map((t) => t.key).join(', ')}, custom (comma-separate several)`);
    return;
  }
  console.log('Checking job sources…');
  const { label, total, picked, added, errors } = await findJobs({ dry, types });
  for (const e of errors) console.log(`  ${e}`);
  if (!picked.length) {
    console.log(`\nNo new ${label} matches. Try another job type, or loosen locations/maxAgeDays in config.json.`);
    return;
  }
  console.log(`\n${total} new ${label} match${total === 1 ? '' : 'es'}${total > picked.length ? ` (showing the newest ${picked.length})` : ''}:\n`);
  for (const j of picked) {
    const age = j.postedAt ? `${Math.max(0, Math.round((Date.now() - j.postedAt) / 864e5))}d ago` : '';
    console.log(`• ${j.company} | ${j.title}`);
    console.log(`  ${[j.locations.slice(0, 3).join('; '), age, j.source].filter(Boolean).join('  ·  ')}`);
  }
  if (dry) console.log('\n(--dry: nothing was added to the queue)');
  else console.log(`\nAdded ${added} to data/queue.txt. Delete any lines you don't want, then run: npm start`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

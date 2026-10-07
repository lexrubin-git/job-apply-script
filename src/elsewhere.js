// The LinkedIn and Handshake buttons next to Find: they open a ready-made job search on those sites in your own
// Chrome, for you to browse yourself. The app never loads, reads, or clicks anything on LinkedIn or Handshake, so
// there's nothing there for them to flag. (When a job there sends you to the company's site, paste that link into
// your job list.)
import { config } from './config.js';
import { jobLevels, LEVELS, selectedTypes } from './finder.js';
import { allJobTypes } from './jobTypes.js';
import { locationPrefs } from './where.js';

function phrases() {
  const byKey = new Map(allJobTypes(config.finder?.presets).map((x) => [x.key, x]));
  const out = [];
  for (const t of selectedTypes()) {
    if (t === 'custom') out.push(...(config.finder?.customKeywords || []));
    else out.push(...(byKey.get(t)?.search || []));
  }
  return [...new Set(out)].slice(0, 8);
}

/** The places to offer: each hometown, remote (if you're open to it), and anywhere in the US. */
export function searchPlaces() {
  const prefs = locationPrefs();
  return [
    ...prefs.hometowns.map((h) => ({ key: `near:${h}`, label: `Near ${h}${prefs.radiusMiles != null ? ` (${prefs.radiusMiles} mi)` : ''}` })),
    ...(prefs.remote ? [{ key: 'remote', label: 'Remote' }] : []),
    { key: 'anywhere', label: 'Anywhere in the US' },
  ];
}

// LinkedIn's distance filter only takes these values.
const LI_DISTANCES = [5, 10, 25, 50, 100];

/** The search address for LinkedIn or Handshake. place: "near:<hometown>", "remote", or "anywhere". */
export function searchUrl(site, place) {
  const prefs = locationPrefs();
  const levels = jobLevels();
  const onlyInterns = levels.every((l) => l === 'internship');
  const words = phrases();
  const near = String(place || '').startsWith('near:') ? place.slice(5) : '';
  if (site === 'linkedin') {
    const p = new URLSearchParams();
    if (words.length) p.set('keywords', words.map((w) => (w.includes(' ') ? `"${w}"` : w)).join(' OR '));
    p.set('location', near || 'United States');
    if (near && prefs.radiusMiles != null) p.set('distance', String(LI_DISTANCES.find((d) => d >= prefs.radiusMiles) || 100));
    // Experience level: 1 internship, 2 entry level, 3 associate, 4 mid-senior, 5 director, 6 executive
    p.set('f_E', [...new Set(LEVELS.filter((l) => levels.includes(l.key)).flatMap((l) => l.linkedin))].join(','));
    if (onlyInterns) p.set('f_JT', 'I'); // job type: internship
    if (place === 'remote') p.set('f_WT', '2'); // remote
    p.set('f_TPR', 'r2592000'); // posted in the past month
    p.set('sortBy', 'DD'); // newest first
    return `https://www.linkedin.com/jobs/search/?${p}`;
  }
  if (site === 'handshake') {
    // Handshake's location and internship filters are set on the page (it doesn't publish its search addresses).
    const p = new URLSearchParams();
    p.set('query', [words[0] || '', onlyInterns ? 'intern' : ''].filter(Boolean).join(' '));
    return `https://app.joinhandshake.com/job-search?${p}`;
  }
  throw new Error('Unknown site.');
}

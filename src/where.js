// Where a job is and how it fits your location settings: distance from your hometown, remote / hybrid / on-site,
// and whether they help with relocation. Works offline (city list from GeoNames, via the all-the-cities package).
import { createRequire } from 'node:module';
import { config } from './config.js';
import { STATES } from './formFiller.js';
import { loadProfile } from './materials.js';

const require = createRequire(import.meta.url);

// ---- places ----
const STATE_ABBR = Object.fromEntries(Object.entries(STATES).map(([abbr, name]) => [name, abbr.toUpperCase()]));
// GeoNames codes for Canadian provinces.
const PROVINCES = { ab: '01', bc: '02', mb: '03', nb: '04', nl: '05', ns: '07', on: '08', pe: '09', qc: '10', sk: '11', yt: '12', nt: '13', nu: '14',
  alberta: '01', 'british columbia': '02', manitoba: '03', 'new brunswick': '04', newfoundland: '05', 'nova scotia': '07', ontario: '08',
  'prince edward island': '09', quebec: '10', saskatchewan: '11' };
const COUNTRIES = { us: 'US', usa: 'US', 'united states': 'US', 'united states of america': 'US', america: 'US', uk: 'GB', 'united kingdom': 'GB',
  england: 'GB', scotland: 'GB', 'great britain': 'GB', canada: 'CA', ca: 'CA', india: 'IN', germany: 'DE', france: 'FR', ireland: 'IE',
  netherlands: 'NL', spain: 'ES', singapore: 'SG', japan: 'JP', australia: 'AU', mexico: 'MX', brazil: 'BR', israel: 'IL', china: 'CN',
  poland: 'PL', switzerland: 'CH', sweden: 'SE', italy: 'IT', 'south korea': 'KR', korea: 'KR', taiwan: 'TW', 'hong kong': 'HK' };
// Nicknames job posts use for places.
const ALIASES = { nyc: 'New York City, NY', 'new york': 'New York City, NY', 'new york, ny': 'New York City, NY', manhattan: 'New York City, NY',
  brooklyn: 'New York City, NY', sf: 'San Francisco, CA', 'bay area': 'San Francisco, CA', 'sf bay area': 'San Francisco, CA',
  'san francisco bay area': 'San Francisco, CA', 'silicon valley': 'San Jose, CA', la: 'Los Angeles, CA', 'greater los angeles': 'Los Angeles, CA',
  dc: 'Washington, DC', 'washington dc': 'Washington, DC', 'washington, d.c.': 'Washington, DC', 'washington d.c.': 'Washington, DC',
  'washington, dc': 'Washington, DC', 'research triangle': 'Raleigh, NC', 'twin cities': 'Minneapolis, MN', 'dfw': 'Dallas, TX' };

// Lowercase without accents, so "Montreal" finds "Montréal" and "Zurich" finds "Zürich".
const fold = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

// Every country's English name ("Israel", "Luxembourg", "Colombia"...), on top of the short forms above.
const countryNames = new Intl.DisplayNames(['en'], { type: 'region' });
for (let a = 65; a <= 90; a++) {
  for (let b = 65; b <= 90; b++) {
    const code = String.fromCharCode(a, b);
    let name = '';
    try {
      name = countryNames.of(code);
    } catch {
      continue;
    }
    if (name && name !== code && !COUNTRIES[fold(name)]) COUNTRIES[fold(name)] = code;
  }
}
const isCountry = (p) => !!COUNTRIES[fold(p).replace(/\./g, '')] && !STATE_ABBR[fold(p)] && !/^[a-z]{2}$/i.test(p.trim());

let byName = null;
let biggest = null; // "US:KS" or "CA" -> that state's or country's largest cities
function cityIndex() {
  if (byName) return byName;
  byName = new Map();
  const regions = new Map();
  for (const c of require('all-the-cities')) {
    // Also file names like "Washington, D.C." under "washington".
    for (const key of new Set([fold(c.name), fold(c.name.split(',')[0])])) {
      if (!byName.has(key)) byName.set(key, []);
      byName.get(key).push(c);
    }
    for (const r of [c.country, c.country === 'US' ? `US:${c.adminCode}` : null]) {
      if (!r) continue;
      if (!regions.has(r)) regions.set(r, []);
      regions.get(r).push(c);
    }
  }
  biggest = new Map([...regions].map(([r, list]) => [r, list.sort((a, b) => b.population - a.population).slice(0, 12)]));
  return byName;
}

const clean = (s) => String(s || '').replace(/\s+/g, ' ').trim();

/**
 * A place given only as a country or US state ("Canada", "Kansas", "UK"): { label, cities } with that region's
 * largest cities, so its distance can be estimated. null for anything else (including "North America").
 */
function findRegion(text) {
  const k = fold(clean(text)).replace(/\./g, '').replace(/\(.*?\)/g, '').trim();
  if (ALIASES[k]) return null; // "New York" in a job post means the city
  cityIndex();
  if (STATE_ABBR[k] || (/^[a-z]{2}$/.test(k) && STATES[k] && k !== 'in')) {
    const code = STATE_ABBR[k] || k.toUpperCase();
    return { label: STATES[code.toLowerCase()].replace(/\b\w/g, (c) => c.toUpperCase()), cities: biggest.get(`US:${code}`) || [] };
  }
  if (COUNTRIES[k]) return { label: clean(text), cities: biggest.get(COUNTRIES[k]) || [] };
  return null;
}

/** "Erlanger, Kentucky" -> { label: 'Erlanger, KY', lat, lon, country } (or null if it isn't a place we know). */
export function findPlace(text) {
  let s = clean(text)
    .replace(/\((hq|headquarters|office|main office|onsite|on-site|in office|hybrid)\)/gi, '')
    .replace(/\b(hybrid|on-?site|in[- ]office|office)\b\s*[-–:]?\s*/gi, '')
    .replace(/^[-–:,\s]+|[-–:,\s]+$/g, '');
  if (!s || /remote|anywhere|multiple|various|flexible|tbd/i.test(s)) return null;
  // Workday writes places backwards: "US - CO, Westminster" -> "Westminster, CO".
  const wd = s.match(/^(?:US|USA|United States)\s*[-–]+\s*([A-Za-z]{2})\s*[,-]+\s*(.+)$/i);
  if (wd) s = `${wd[2]}, ${wd[1]}`;
  // ...or "TX-Dallas" / "CA - San Jose".
  const st = s.match(/^([A-Za-z]{2})\s*-\s*([^,]+)$/);
  if (st && STATES[st[1].toLowerCase()]) s = `${st[2]}, ${st[1]}`;
  // ...or state, city, then a street address: "IL Chicago 6750 S Cicero Ave".
  const sc = s.match(/^([A-Z]{2})\s+([A-Za-z.' ]+?)\s+\d/);
  if (sc && STATES[sc[1].toLowerCase()]) s = `${sc[2]}, ${sc[1]}`;
  s = ALIASES[s.toLowerCase()] || s;
  // A state on its own ("Washington", "Texas") isn't a place we can measure from.
  if (STATE_ABBR[s.toLowerCase()]) return null;
  // "Colombia - Bogotá" reads like "Colombia, Bogotá".
  s = s.replace(/\s+[-–|]\s+/g, ', ');
  let parts = s.split(',').map((p) => clean(p).replace(/\.$/, '')).filter(Boolean);
  // Country first ("Israel, Kiryat-Gat"): put the country last, like "Kiryat-Gat, Israel".
  if (parts.length > 1 && isCountry(parts[0])) parts = [...parts.slice(1), parts[0]];
  // Street addresses ("Montreal 888, boul. De Maisonneuve Est"): drop the numbers from the city part.
  const city = clean((parts[0] || '').replace(/\b\S*\d\S*\b/g, ' '));
  const rest = parts.slice(1);
  if (!city) return null;
  let state = null;
  let province = null;
  let country = null;
  for (const p of rest) {
    const k = fold(p).replace(/\./g, '');
    if (/^[a-z]{2}$/.test(k) && STATES[k]) state = k.toUpperCase();
    else if (STATE_ABBR[k]) state = STATE_ABBR[k];
    else if (PROVINCES[k]) (province = PROVINCES[k]), (country = 'CA');
    else if (COUNTRIES[k]) country = COUNTRIES[k];
  }
  if (state) country = 'US';
  // Nicknames ("Brooklyn" -> New York City) only when no state or country is given ("Brooklyn, OH" is in Ohio).
  const nick = !rest.length && ALIASES[city.toLowerCase()];
  const named = cityIndex().get(fold((nick || city).split(',')[0])) || [];
  let candidates = named.filter((c) => (!country || c.country === country) && (!state || c.adminCode === state) && (!province || c.adminCode === province));
  // "Berlin, BE, DE": the last part is a country code (DE = Germany), not a US state (Delaware).
  const code = rest.length ? rest[rest.length - 1].toUpperCase() : '';
  if (!candidates.length && /^[A-Z]{2}$/.test(code)) candidates = named.filter((c) => c.country === code);
  // "Tbilisi, Georgia": a state name that's also a country (Georgia, the country).
  if (!candidates.length && state) {
    const alt = rest.map((r) => COUNTRIES[fold(r)]).find(Boolean);
    if (alt) candidates = named.filter((c) => c.country === alt);
  }
  // A street address first ("8940 E Rita Rd, Tucson, AZ"): try again without it.
  if (!candidates.length) return parts.length > 1 ? findPlace(parts.slice(1).join(', ')) : null;
  const c = candidates.reduce((a, b) => (b.population > a.population ? b : a));
  const region = c.country === 'US' ? c.adminCode : c.country === 'CA' ? Object.keys(PROVINCES).find((k) => k.length === 2 && PROVINCES[k] === c.adminCode)?.toUpperCase() : null;
  const countryName = { GB: 'UK', US: '' }[c.country] ?? c.country;
  return { label: [c.name.split(',')[0], region || countryName].filter(Boolean).join(', '), lat: c.loc.coordinates[1], lon: c.loc.coordinates[0], country: c.country };
}

// ---- City search suggestions (the dropdown under each city box) ----
let sortedNames = null; // [foldedName, city] sorted by name, for prefix search
const regionName = new Intl.DisplayNames(['en'], { type: 'region' });

function cityLabel(c) {
  if (c.country === 'US') return { value: `${c.name}, ${c.adminCode}`, place: `${c.name}, ${c.adminCode}` };
  if (c.country === 'CA') {
    const prov = Object.keys(PROVINCES).find((k) => k.length === 2 && PROVINCES[k] === c.adminCode)?.toUpperCase();
    if (prov) return { value: `${c.name}, ${prov}`, place: `${c.name}, ${prov}, Canada` };
  }
  const country = c.country === 'GB' ? 'UK' : c.country;
  return { value: `${c.name}, ${country}`, place: `${c.name}, ${regionName.of(c.country) || c.country}` };
}

/** Up to `limit` cities whose name starts with what you've typed ("port" -> Portland, OR; Portland, ME; Port Arthur...). */
export function suggestCities(query, limit = 8) {
  const raw = clean(query);
  if (raw.length < 2) return [];
  const [namePart, ...after] = raw.split(',');
  // "Saint Louis" and "St. Louis" both work.
  const name = fold(namePart).replace(/^saint\s+/, 'st. ').replace(/^st\s+/, 'st. ').trim();
  const hint = fold(after.join(',')).replace(/\./g, '').trim(); // optional state/country after a comma
  if (!sortedNames) {
    cityIndex();
    sortedNames = [];
    for (const [key, list] of byName) for (const c of list) if (key === fold(c.name)) sortedNames.push([key, c]);
    sortedNames.sort((a, b) => (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0));
  }
  let lo = 0;
  let hi = sortedNames.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (sortedNames[mid][0] < name) lo = mid + 1;
    else hi = mid;
  }
  const matches = [];
  for (let i = lo; i < sortedNames.length && sortedNames[i][0].startsWith(name); i++) matches.push(sortedNames[i][1]);
  const fitsHint = (c) => {
    if (!hint) return true;
    const st = STATE_ABBR[hint] || (STATES[hint] ? hint.toUpperCase() : null);
    if (st) return c.country === 'US' && c.adminCode === st;
    const country = COUNTRIES[hint] || hint.toUpperCase();
    return c.country === country || fold(regionName.of(c.country) || '').startsWith(hint);
  };
  // Nicknames ("la", "nyc", "sf") first, then exact names, then the biggest cities (US and Canada count extra,
  // since that's where most of your jobs are). Districts like "Zürich (Kreis 3)" are left out.
  const alias = ALIASES[name] && !hint ? findPlace(ALIASES[name]) : null;
  const weight = (c) => c.population * (c.country === 'US' || c.country === 'CA' ? 10 : 1);
  const out = [];
  const seen = new Set();
  if (alias) {
    out.push({ value: alias.label, place: alias.label, population: 0 });
    seen.add(alias.label);
  }
  for (const c of matches
    .filter((c) => fitsHint(c) && !/[()]/.test(c.name))
    .sort((a, b) => Number(fold(b.name) === name) - Number(fold(a.name) === name) || weight(b) - weight(a))) {
    const l = cityLabel(c);
    if (seen.has(l.value)) continue;
    seen.add(l.value);
    out.push({ ...l, population: c.population });
    if (out.length >= limit) break;
  }
  return out;
}

function miles(a, b) {
  const rad = (d) => (d * Math.PI) / 180;
  const h = Math.sin(rad(b.lat - a.lat) / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(rad(b.lon - a.lon) / 2) ** 2;
  return 3958.8 * 2 * Math.asin(Math.sqrt(h));
}

/** Split "San Francisco, CA • New York, NY; Remote (US)" into separate places. */
function splitLocations(list) {
  return [...new Set(list.flatMap((l) => String(l || '').split(/\s*(?:•|;|\||\/|\bor\b|\n)\s*/i)).map(clean).filter(Boolean))];
}

// ---- your settings ----
export function locationPrefs() {
  const p = loadProfile();
  const prefs = config.jobPrefs || { radiusMiles: 50 }; // 50 miles until you change it
  const fromAddress = [p.address?.city, p.address?.state].filter(Boolean).join(', ');
  const radius = Number(prefs.radiusMiles);
  // Several hometowns are allowed (older settings saved just one).
  const saved = (Array.isArray(prefs.hometowns) ? prefs.hometowns : [prefs.hometown]).map(clean).filter(Boolean);
  const hometowns = saved.length ? saved : [fromAddress].filter(Boolean);
  return {
    hometowns,
    hometown: hometowns.join('; '),
    hometownFromAddress: !saved.length,
    radiusMiles: prefs.radiusMiles == null || prefs.radiusMiles === '' || !Number.isFinite(radius) ? null : radius, // null = any distance
    remote: !/^no/i.test(p.availability?.openToRemote || ''),
    relocate: !/^no/i.test(p.availability?.willingToRelocate || ''),
  };
}

// ---- what the posting says ----
const sentences = (text) =>
  String(text || '')
    .split(/(?<=[.!?])\s+|\n+/)
    .map(clean)
    .filter((s) => s.length > 3);
const quote = (s) => (s.length > 180 ? `${s.slice(0, 177)}…` : s);

const TYPE_WORDS = { onsite: 'On-site', 'on-site': 'On-site', hybrid: 'Hybrid', remote: 'Remote' };

function workType(posting, places, text) {
  // Some jobs list an office and "Remote (US)" as another location: remote is an option.
  const remoteOption = places.some((p) => /remote/i.test(p));
  const orRemote = (value) => (remoteOption && value !== 'Remote' ? `${value}, or remote` : value);
  const listed = TYPE_WORDS[String(posting?.workplaceType || '').toLowerCase().replace(/\s/g, '')];
  if (listed) return { value: orRemote(listed), from: 'listing' };
  const all = places.join(' | ');
  if (places.length && places.every((p) => /remote|anywhere/i.test(p))) return { value: 'Remote', from: 'listing' };
  if (/hybrid/i.test(all)) return { value: orRemote('Hybrid'), from: 'listing' };

  const said = (re, not) => sentences(text).find((s) => re.test(s) && !(not && not.test(s)));
  const hybrid = said(/\bhybrid\b(?!\s+(cloud|apps?|mobile|approach|vehicles?|methods?))|\b\d\s*(?:-\s*\d\s*)?days?\s+(?:a|per|each)\s+week\s+(?:in|at)\s+(?:the|our)\s+office/i);
  if (hybrid) return { value: orRemote('Hybrid'), from: 'description', quote: quote(hybrid) };
  const remote = said(
    /\b(fully[- ]remote|100% remote|remote[- ](position|role|internship|opportunity|first|friendly|eligible)|(role|position|internship|job|team) is (fully )?remote|can be (done |performed )?remote(ly)?|work (from|at) home|work remotely|wfh)\b/i,
    /\b(not|no|non|isn'?t|cannot|can'?t|unable)\b/i,
  );
  if (remote) return { value: remoteOption ? 'On-site, or remote' : 'Remote', from: 'description', quote: quote(remote) };
  const onsite = said(/\b(on-?site|in-office|in the office|in-person|in person|onsite)\b.*\b(role|position|internship|work|required|expected|days|week)\b|\b(role|position|internship) is (based )?(on-?site|in[- ]person|in[- ]office)\b/i);
  if (onsite) return { value: orRemote('On-site'), from: 'description', quote: quote(onsite) };
  if (remoteOption) return { value: 'On-site, or remote', from: 'listing' };
  return { value: null, from: null };
}

function relocation(text) {
  for (const s of sentences(text)) {
    if (/\b(no|not|unable to|cannot|can'?t|won'?t|does not|do not|will not)\b[^.]{0,40}\b(relocation|housing)\b|\brelocation\b[^.]{0,30}\b(not|unavailable)\b/i.test(s)) {
      return { status: 'none', label: 'Not offered', quote: quote(s) };
    }
    if (/\brelocation\b[^.]{0,40}\b(assistance|support|package|stipend|benefits?|reimbursement|bonus|help|provided|offered|available|covered)\b|\b(offer|provide|cover)s?\b[^.]{0,20}\brelocation\b|\bhousing (stipend|assistance|allowance|support|is provided|provided)\b|\b(corporate|intern|company-provided) housing\b/i.test(s)) {
      return { status: 'offered', label: /housing/i.test(s) && !/relocation/i.test(s) ? 'Housing help offered' : 'Help offered', quote: quote(s) };
    }
    if (/\b(local candidates( only)?|candidates (must|should) (be local|live)|must (currently )?(live|reside|be located|be based) (in|within|near)|within (a )?(reasonable )?commut(ing|able) distance|must be able to commute)\b/i.test(s)) {
      return { status: 'local', label: 'Local candidates only', quote: quote(s) };
    }
    if (/\b(must|should) be (willing|able|open) to relocate\b/i.test(s)) {
      return { status: 'expected', label: 'They expect you to relocate', quote: quote(s) };
    }
  }
  return { status: null, label: 'Not mentioned' };
}

/**
 * Everything the panel shows under "Where", e.g.
 * { places: ['Erlanger, KY'], nearest: { label, miles }, workType: { value }, relocation: { label }, verdict: { level, text } }
 */
export function describeWhere(job, prefs = locationPrefs()) {
  const posting = job.posting || {};
  const raw = splitLocations([...(posting.locations || []), posting.location, job.analysis?.location].filter(Boolean));
  const type = workType(posting, raw, job.description);
  const reloc = relocation(job.description);
  const homes = homePlaces(prefs);

  const found = [];
  for (const r of raw) {
    const place = findPlace(r);
    if (place && !found.some((f) => f.label === place.label)) found.push(place);
  }
  // Each of the job's places, measured from whichever of your hometowns is closest.
  const withMiles = homes.length
    ? found.map((f) => ({ ...f, ...closestHome(homes, f) })).sort((a, b) => a.miles - b.miles)
    : found;
  const nearest = withMiles[0] || null;
  const home = nearest?.home || homes[0] || null;
  const places = withMiles.length ? withMiles.map((f) => f.label) : raw.slice(0, 4); // e.g. "Remote in USA"

  // Compare with your settings.
  const radius = prefs.radiusMiles;
  const near = nearest?.miles != null && (radius == null || nearest.miles <= radius);
  let verdict = null;
  if (type.value === 'Remote') {
    verdict = prefs.remote
      ? { level: 'good', text: 'Remote, so you can work from home.' }
      : { level: 'warn', text: "Remote, and you said you're not looking for remote work." };
  } else if (nearest?.miles != null) {
    // With several hometowns, say which one it's near.
    const of = homes.length > 1 && near ? ` of ${home.label}` : '';
    const away = radius == null ? '' : ` your ${radius} mi radius${of}`;
    if (near) verdict = { level: 'good', text: radius == null ? `${nearest.miles.toLocaleString()} mi from ${home.label}.` : `Within${away}.` };
    else if (/or remote/.test(type.value || '') && prefs.remote) verdict = { level: 'good', text: `Outside${away}, but remote is an option.` };
    else if (reloc.status === 'local') verdict = { level: 'warn', text: `Outside${away}, and they want local candidates only.` };
    else if (!prefs.relocate) verdict = { level: 'warn', text: `Outside${away}, and you're not open to relocating.` };
    else {
      const help = reloc.status === 'offered' ? ' They offer help with it.' : reloc.status === 'none' ? " They don't offer help with it." : '';
      verdict = { level: 'info', text: `Outside${away}. You'd need to relocate.${help}` };
    }
  } else if (raw.length && !homes.length) {
    verdict = { level: 'info', text: 'Add a city in My info → Settings → City search to see how far away this is.' };
  }

  if (!raw.length && !type.value && !reloc.status) return null;
  return {
    hometown: home?.label || prefs.hometown || '',
    places,
    nearest: nearest && { label: nearest.label, miles: nearest.miles ?? null, from: nearest.home?.label || '' },
    workType: type,
    relocation: reloc,
    verdict,
  };
}

const placeCache = new Map();
function cachedPlace(text) {
  if (!placeCache.has(text)) placeCache.set(text, findPlace(text));
  return placeCache.get(text);
}

function homePlaces(prefs) {
  return (prefs.hometowns || [prefs.hometown]).filter(Boolean).map(cachedPlace).filter(Boolean);
}

// { home, miles } for the hometown closest to a place.
function closestHome(homes, place) {
  return homes.map((home) => ({ home, miles: Math.round(miles(home, place)) })).reduce((a, b) => (b.miles < a.miles ? b : a));
}

// The country a place names, when its city isn't one we know ("Kiryat-Gat, Israel" -> Israel).
function countryIn(part) {
  for (const piece of part.split(/,|\s+[-–|]\s+/).map(clean).filter(Boolean)) {
    if (isCountry(piece)) {
      const r = findRegion(piece);
      if (r?.cities.length) return r;
    }
  }
  return null;
}

// Countries or states named on their own ("Canada", "Kansas", "US, Canada"); [] if the part isn't only that.
function regionsIn(part) {
  const whole = findRegion(part);
  if (whole) return [whole];
  const pieces = part.split(',').map(clean).filter(Boolean);
  const each = pieces.map(findRegion);
  return pieces.length > 1 && each.every(Boolean) ? each : [];
}

/**
 * How far a job list entry's place ("Glendale, CA", "Remote in USA", "SF; NYC") is from your closest hometown:
 * { miles, remote, from, place, more, approx }. place is the job's closest city (more = how many other places it
 * lists). For a country or state given on its own, miles is estimated from its largest cities (approx: true).
 * miles is null when the place isn't known.
 */
export function distanceFor(placeText, prefs = locationPrefs()) {
  const parts = splitLocations([placeText]);
  const remote = parts.some((p) => /remote|anywhere/i.test(p));
  const homes = homePlaces(prefs);
  const none = { miles: null, remote, from: '', place: '', more: 0, approx: false };
  if (!homes.length) return none;
  // A country or state on its own is a region, not a town that happens to share the name ("Canada" vs. Cañada, MX).
  // "US, Canada" is two regions, but "New York, NY" is a city.
  const isRegion = (p) => !!findRegion(p) || (regionsIn(p).length > 0 && !cachedPlace(p));
  const cities = parts.filter((p) => !isRegion(p)).map((p) => cachedPlace(p)).filter(Boolean);
  if (cities.length) {
    const best = cities.map((p) => ({ p, ...closestHome(homes, p) })).sort((a, b) => a.miles - b.miles)[0];
    return { miles: best.miles, remote, from: best.home.label, place: best.p.label, more: parts.length - 1, approx: false };
  }
  const regions = [...parts.flatMap(regionsIn), ...parts.filter((p) => !regionsIn(p).length).map(countryIn).filter(Boolean)].filter((r) => r.cities.length);
  if (!regions.length) return none;
  const near = regions
    .flatMap((r) => r.cities.map((c) => ({ r, ...closestHome(homes, { lat: c.loc.coordinates[1], lon: c.loc.coordinates[0] }) })))
    .sort((a, b) => a.miles - b.miles)[0];
  return { miles: near.miles, remote, from: near.home.label, place: regions.map((r) => r.label).join(', '), more: 0, approx: true };
}

// A job listed only by country or state could be anywhere in it, so it counts as near if one of its big cities is
// within this many miles beyond your radius.
const REGION_SLACK = 75;

/** Find's location filter: is this job within your radius of a hometown (or remote, or somewhere unclear)? */
export function withinRadius(locations, prefs = locationPrefs()) {
  if (prefs.radiusMiles == null || !homePlaces(prefs).length) return true;
  const d = distanceFor(locations.join('; '), prefs);
  if (d.remote && prefs.remote) return true;
  if (d.miles == null) return !d.remote; // place unclear: keep it; remote-only when you're not open to remote: skip
  return d.miles <= prefs.radiusMiles + (d.approx ? REGION_SLACK : 0);
}

/** One-line-per-fact text (for the terminal). */
export function whereLines(w) {
  if (!w) return [];
  const loc = w.nearest
    ? `${w.nearest.label}${w.nearest.miles != null ? ` (${w.nearest.miles.toLocaleString()} mi away)` : ''}${w.places.length > 1 ? ` + ${w.places.length - 1} more` : ''}`
    : w.places.join(', ');
  return [
    loc && `Location: ${loc}`,
    `Work type: ${w.workType.value || 'Not stated'}`,
    `Relocation: ${w.relocation.label}`,
    w.verdict && `${w.verdict.level === 'warn' ? '⚠ ' : w.verdict.level === 'good' ? '✓ ' : ''}${w.verdict.text}`,
  ].filter(Boolean);
}

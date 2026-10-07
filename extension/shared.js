// Generated from src/formFiller.js and src/materials.js by the app. Don't edit here.
var STATES = {"al":"alabama","ak":"alaska","az":"arizona","ar":"arkansas","ca":"california","co":"colorado","ct":"connecticut","de":"delaware","dc":"district of columbia","fl":"florida","ga":"georgia","hi":"hawaii","id":"idaho","il":"illinois","in":"indiana","ia":"iowa","ks":"kansas","ky":"kentucky","la":"louisiana","me":"maine","md":"maryland","ma":"massachusetts","mi":"michigan","mn":"minnesota","ms":"mississippi","mo":"missouri","mt":"montana","ne":"nebraska","nv":"nevada","nh":"new hampshire","nj":"new jersey","nm":"new mexico","ny":"new york","nc":"north carolina","nd":"north dakota","oh":"ohio","ok":"oklahoma","or":"oregon","pa":"pennsylvania","ri":"rhode island","sc":"south carolina","sd":"south dakota","tn":"tennessee","tx":"texas","ut":"utah","vt":"vermont","va":"virginia","wa":"washington","wv":"west virginia","wi":"wisconsin","wy":"wyoming"};
var DECLINE_RE = /decline|prefer not|not (to )?(say|answer|disclose)|wish to answer|wish to (self )?identify|don t wish|do not wish|choose not/;
function normalizeQuestion(q) {
  return String(q || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/\(required\)|\(optional\)|\*/g, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
function bestMatch(value, options) {
  const v = normalizeQuestion(value);
  if (!v) return -1;
  const opts = options.map((o) => normalizeQuestion(o));
  let i = opts.indexOf(v);
  if (i >= 0) return i;

  const yes = /^(yes|y|true)\b/.test(v);
  const no = /^(no|n|false)\b/.test(v);
  if (yes || no) {
    i = opts.findIndex((o) => (yes ? /^yes\b/ : /^no\b/).test(o));
    if (i >= 0) return i;
  }
  if (DECLINE_RE.test(v)) {
    i = opts.findIndex((o) => DECLINE_RE.test(o));
    if (i >= 0) return i;
  }
  i = opts.findIndex((o) => o && (o.startsWith(`${v} `) || v.startsWith(`${o} `)));
  if (i >= 0) return i;
  i = opts.findIndex((o) => o && (` ${o} `.includes(` ${v} `) || (o.length > 3 && ` ${v} `.includes(` ${o} `))));
  if (i >= 0) return i;

  // Every word you gave starts a word in the option, so "Temple City, CA" matches
  // "Temple City, California, United States" and "Cal Poly Pomona" matches "California State Polytechnic University-Pomona".
  const words = v.split(' ');
  const wordHit = (t, o, ow) => ow.some((w) => w.startsWith(t)) || (STATES[t] && ` ${o} `.includes(` ${STATES[t]} `));
  const hits = opts
    .map((o, idx) => ({ idx, len: o.length, ow: o.split(' '), o }))
    .filter((x) => x.o && words.every((t) => wordHit(t, x.o, x.ow)))
    .sort((a, b) => a.len - b.len);
  if (hits.length) return hits[0].idx;

  const vt = new Set(v.split(' '));
  let best = -1;
  let score = 0;
  opts.forEach((o, idx) => {
    const ot = o.split(' ').filter(Boolean);
    const shared = ot.filter((t) => vt.has(t)).length;
    const s = shared / Math.max(vt.size, ot.length, 1);
    if (s > score) {
      score = s;
      best = idx;
    }
  });
  return score >= 0.5 ? best : -1;
}

// Fit score without AI: which skills does the job description mention, and which of those are on your resume?
// Plus a few plain-text warnings (unpaid, graduation date, grad-students-only).

// [skill name, pattern]. Patterns run on lowercase text.
const SKILLS = [
  // design tools
  ['Figma', /\bfigma\b/],
  ['Adobe Creative Suite', /\badobe creative (suite|cloud)\b|\bcreative (suite|cloud)\b/],
  ['Photoshop', /\bphotoshop\b/],
  ['Illustrator', /\badobe illustrator\b|\billustrator\b(?![, ]+intern)/],
  ['InDesign', /\bindesign\b/],
  ['After Effects', /\bafter effects\b/],
  ['Premiere Pro', /\bpremiere( pro)?\b/],
  ['Adobe XD', /\badobe xd\b/],
  ['Canva', /\bcanva\b/],
  ['Framer', /\bframer\b/],
  ['Webflow', /\bwebflow\b/],
  ['Blender', /\bblender\b/],
  ['Cinema 4D', /\bcinema ?4d\b|\bc4d\b/],
  ['Procreate', /\bprocreate\b/],
  // design skills
  ['UI/UX design', /\bui\s?\/\s?ux\b|\bux\s?\/\s?ui\b|\buser experience\b|\bux design|\bui design|\buser interface/],
  ['Product design', /\bproduct design/],
  ['Interaction design', /\binteraction design/],
  ['Visual design', /\bvisual (design|identity|communication)/],
  ['Graphic design', /\bgraphic design/],
  ['Design systems', /\bdesign systems?\b|\bcomponent librar|\bui (component|kit)s?\b/],
  ['Prototyping', /\bprototyp/],
  ['Wireframing', /\bwirefram/],
  ['User research', /\buser research|\bux research|\busability (testing|studies|research)|\buser (interviews|testing)/],
  ['Information architecture', /\binformation architecture/],
  ['User flows', /\buser flows?\b|\bjourney map/],
  ['Typography', /\btypograph/],
  ['Branding', /\bbrand(ing| identity| design| guidelines| systems?)\b/],
  ['Illustration', /\billustration/],
  ['Iconography', /\biconograph|\bicon (design|system|set)/],
  ['Motion design', /\bmotion (design|graphics)|\banimation/],
  ['Data visualization', /\bdata[- ]visuali[sz]ation|\binfographic/],
  ['Accessibility', /\baccessib|\bwcag\b|\ba11y\b/],
  ['Design critique', /\bcritiques?\b|\bdesign reviews?\b/],
  ['Portfolio', /\bportfolio/],
  // web and code
  ['HTML/CSS', /\bhtml\b|\bcss\b/],
  ['JavaScript', /\bjavascript\b|\btypescript\b/],
  ['React', /\breact(\.js|js)?\b/],
  ['Python', /\bpython\b/],
  ['Java', /\bjava\b(?!script)/],
  ['C/C++', /\bc\+\+|\bc#/],
  ['SQL', /\bsql\b/],
  ['Git', /\bgit\b|\bgithub\b/],
  ['AI tools', /\bgenerative ai\b|\bai[- ]assisted\b|\bai tools\b|\bllms?\b|\bchatgpt\b|\bprompt engineering\b/],
  // data and business
  ['Excel', /\bexcel\b|\bspreadsheets?\b/],
  ['Tableau', /\btableau\b/],
  ['Power BI', /\bpower ?bi\b/],
  ['Data analysis', /\bdata analy/],
  ['Machine learning', /\bmachine learning\b/],
  ['Statistics', /\bstatistic/],
  // marketing and content
  ['Marketing', /\bmarketing\b/],
  ['Social media', /\bsocial media\b/],
  ['Content creation', /\bcontent (creation|strategy|production)|\bcopywrit/],
  ['SEO', /\bseo\b/],
  ['Video editing', /\bvideo (editing|production)/],
  ['Photography', /\bphotograph/],
  // product and process
  ['Product management', /\bproduct manag/],
  ['Agile', /\bagile\b|\bscrum\b/],
  ['A/B testing', /\ba\/b test/],
  ['Jira', /\bjira\b/],
  ['Cross-functional work', /\bcross[- ]functional/],
];

// Having one of these on your resume counts for the others.
const COVERS = {
  'Adobe Creative Suite': ['Photoshop', 'Illustrator', 'InDesign', 'After Effects', 'Premiere Pro', 'Adobe XD'],
  'UI/UX design': ['Product design', 'Interaction design'],
  'Product design': ['UI/UX design'],
};

const MONTHS = { jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, oct: 10, nov: 11, dec: 12,
  winter: 12, spring: 5, summer: 8, fall: 12, autumn: 12 };

function skillsIn(text) {
  const t = text.toLowerCase();
  return new Set(SKILLS.filter(([, re]) => re.test(t)).map(([name]) => name));
}

// How central a skill is to the job: named in the title, or mentioned again and again, counts more.
function skillWeights(title, text) {
  const t = text.toLowerCase();
  const tt = title.toLowerCase();
  const weights = new Map();
  for (const [name, re] of SKILLS) {
    const count = (t.match(new RegExp(re.source, 'g')) || []).length;
    const inTitle = re.test(tt) || (name === 'Illustration' && /\billustrat/.test(tt));
    if (!count && !inTitle) continue;
    weights.set(name, Math.min(count, 3) + (inTitle ? 3 : 0));
  }
  return weights;
}

// Split a resume into bullet points, each with the job/project it belongs to.
// Works with the Markdown text version (**Company**, *Role*, - bullet) and plain PDF text (• bullet).
function resumeEvidence(resumeText) {
  const items = [];
  let section = '';
  let entry = '';
  let role = '';
  for (const raw of String(resumeText).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const heading = line.match(/^#+\s*(.+)$/) || line.match(/^(experience|projects?|education|skills.*|work experience|leadership|activities)$/i);
    if (heading) {
      section = heading[1].toLowerCase();
      entry = '';
      role = '';
      continue;
    }
    const bullet = line.match(/^[-•▪●◦]\s*(.+)$/);
    if (bullet) {
      items.push({ section, entry, role, text: bullet[1].replace(/\*\*/g, '').trim() });
    } else if (/^\*[^*].*\*/.test(line)) {
      role = line.replace(/\*/g, '').split(',')[0].trim(); // *Designer*, Jan 2025 – Jan 2026
    } else if (line.length < 120) {
      // "**Pyxd, Inc.**, Santa Clara, CA" -> "Pyxd, Inc."; plain PDF text keeps the line up to a big gap.
      const bold = line.match(/^\*\*(.+?)\*\*/);
      entry = (bold ? bold[1] : line.split(/\s{2,}|\t/)[0]).trim();
      role = '';
    }
  }
  return items;
}

/**
 * Which of the job's most important skills your resume can back up, and with which bullet point.
 * Returns { connections: [{ skill, entry, role, evidence }], gaps: [skill] }.
 */
export function findConnections({ jobText, title = '', resumeText = '' }) {
  const weights = skillWeights(title, jobText);
  const items = resumeEvidence(resumeText);
  const isSkillsList = (it) => /skill/.test(it.section) || /^[a-z &/]+:\s/i.test(it.text);
  const ranked = [...weights.keys()].sort((a, b) => weights.get(b) - weights.get(a));
  const connections = [];
  const gaps = [];
  const used = new Set();
  for (const skill of ranked) {
    if (skill === 'Portfolio') continue; // handled separately: your portfolio link goes in the letter
    const re = SKILLS.find(([n]) => n === skill)[1];
    const coveredBy = Object.entries(COVERS).filter(([, also]) => also.includes(skill)).map(([s]) => SKILLS.find(([n]) => n === s)[1]);
    const fits = (it) => re.test(it.text.toLowerCase()) || coveredBy.some((c) => c.test(it.text.toLowerCase()));
    // Prefer real experience (an unused bullet) over a line in the skills list.
    const hit = items.find((it) => fits(it) && !isSkillsList(it) && !used.has(it)) || items.find((it) => fits(it) && !isSkillsList(it)) || items.find(fits);
    if (!hit) {
      gaps.push(skill);
      continue;
    }
    used.add(hit);
    connections.push({ skill, entry: isSkillsList(hit) ? 'Skills' : hit.entry, role: hit.role, evidence: hit.text });
  }
  return { connections: connections.slice(0, 6), gaps: gaps.slice(0, 6) };
}

const season = (yyyymm) => {
  const y = Math.floor(yyyymm / 100);
  const m = yyyymm % 100;
  return `${m <= 5 ? 'spring' : m <= 8 ? 'summer' : 'fall'} ${y}`;
};

/** Earliest graduation date the posting asks for, as YYYYMM, or null. */
function postingGradWindow(text) {
  const found = [];
  const re = /graduat\w*[^.\n]{0,80}/gi;
  for (const m of text.matchAll(re)) {
    for (const d of m[0].matchAll(/\b(jan\w*|feb\w*|mar\w*|apr\w*|may|jun\w*|jul\w*|aug\w*|sep\w*|oct\w*|nov\w*|dec\w*|winter|spring|summer|fall|autumn)?\s*(20\d\d)\b/gi)) {
      const month = d[1] ? MONTHS[d[1].slice(0, 3).toLowerCase()] ?? MONTHS[d[1].toLowerCase()] ?? 6 : 6;
      found.push(Number(d[2]) * 100 + month);
    }
  }
  return found.length ? Math.min(...found) : null;
}

const DESIGN_FIELD = /\b(design|designer|ux|ui|visual|graphic|creative|brand|illustrat\w*|motion|art)\b/i;
const OTHER_FIELD = /\b(software|engineer|developer|data scien|machine learning|analyst|finance|accounting|sales|mechanical|electrical)\b/i;

// ---- years of experience a posting asks for ----
const NUMBER_WORDS = { one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, fifteen: 15 };
const N = `(\\d{1,2}|${Object.keys(NUMBER_WORDS).join('|')})`;
// "10+ years of experience", "at least 5 years of professional experience", "3-5 years' experience", "five or more years
// working in", "minimum 2 yrs experience". The number must be followed by years, then "experience" (or working) soon after.
const YEARS_RE = new RegExp(`\\b${N}\\s*(?:\\+|plus)?\\s*(?:(?:-|–|to)\\s*${N}\\s*)?\\+?\\s*(?:or more\\s+)?(?:years?|yrs?)'?\\b([^.;:\\n]{0,70})`, 'gi');
const PREFERRED_RE = /\b(prefer\w*|nice to have|bonus|a plus|ideally|desired|desirable)\b/i;

/**
 * { required, preferred, quote }: the most years of experience the posting asks for (0 if none), with the sentence it
 * came from. Experience that's only "preferred" or "a plus" is counted separately.
 */
export function yearsRequired(text) {
  const out = { required: 0, preferred: 0, quote: '' };
  for (const sentence of String(text || '').split(/(?<=[.!?;])\s+|\n+/)) {
    for (const m of sentence.matchAll(YEARS_RE)) {
      // "experience" (or "working") within a few words of "years", with nothing like "and we" in between, or work
      // right after it: "10+ years in an agency", "5 years at a studio", "3+ years leading design"...
      const after = m[3] || '';
      const lead = after.match(/^\s*(?:of\s+)?((?:[\w’'/-]+\s+){0,4}?)(experience|exp\b|working|work in)/i);
      const doing = /^\s*(in|at|as|leading|designing|building|managing|creating|doing|shipping|working)\b/i.test(after) &&
        !/^\s*in (business|operation|a row|the making|the past|total)/i.test(after);
      if (!doing && (!lead || /\b(and|but|we|our|have|has|been|old|age|combined|collective)\b/i.test(lead[1]))) continue;
      // ...and not the company's history ("in business for 25 years", "over the past 10 years").
      const before = sentence.slice(Math.max(0, m.index - 30), m.index);
      if (/(past|over the|in business for|been around for|history of|founded|for over|for more than)\s*$/i.test(before)) continue;
      const n = Number(m[1]) || NUMBER_WORDS[m[1].toLowerCase()];
      if (!n || n > 30) continue;
      const kind = PREFERRED_RE.test(sentence) ? 'preferred' : 'required';
      if (n > out[kind]) {
        out[kind] = n;
        if (kind === 'required') out.quote = sentence.trim().replace(/\s+/g, ' ').slice(0, 140);
      }
    }
  }
  return out;
}

/**
 * Compare a job posting to your resume and profile.
 * Returns { score (1-10 or null), summary, matched, missing, flags }.
 */
export function scoreJob({ jobText, title = '', resumeText = '', profile = {} }) {
  const weights = skillWeights(title, jobText);
  const wanted = new Set(weights.keys());
  const have = skillsIn(`${resumeText}\n${profile.education?.major || ''}`);
  for (const [skill, also] of Object.entries(COVERS)) if (have.has(skill)) also.forEach((s) => have.add(s));

  // Most important first.
  const byWeight = [...wanted].sort((a, b) => weights.get(b) - weights.get(a));
  const matched = byWeight.filter((s) => have.has(s));
  const missing = byWeight.filter((s) => !have.has(s));

  const flags = [];
  const lower = jobText.toLowerCase();
  if (/\bunpaid\b/.test(lower)) flags.push('The posting mentions the role is unpaid.');
  if (/security clearance/.test(lower)) flags.push('The posting mentions a security clearance.');
  if (/\b(ph\.?d|doctoral|master'?s)\b[^.\n]{0,40}\b(students?|candidates?|program)\b/.test(lower) && !/\bbachelor|\bundergrad|\bb\.?s\.?\b|\bb\.?a\.?\b/.test(lower)) {
    flags.push('This may be meant for graduate (Master\'s or PhD) students.');
  }
  const myGrad = String(profile.education?.graduationYearMonth || '').match(/(\d{4})-(\d{2})/);
  const earliest = postingGradWindow(jobText);
  if (myGrad && earliest) {
    const mine = Number(myGrad[1]) * 100 + Number(myGrad[2]);
    if (earliest > mine) {
      flags.push(`It's for students graduating ${season(earliest)} or later; you graduate ${profile.education?.graduation || myGrad[1]}.`);
    }
  }

  // Years of experience the posting asks for, compared with yours (My info → Experience).
  const need = yearsRequired(jobText);
  const yearsSet = String(profile.experience?.years ?? '').trim() !== '';
  const myYears = Number(String(profile.experience?.years ?? '').replace(/\+$/, '')) || 0;
  const youHave = yearsSet ? `you have ${myYears}` : "you haven't added yours yet (My info → Experience)";
  let yearsAdjust = 0;
  if (need.required > myYears) {
    flags.push(`It asks for ${need.required}+ years of experience; ${youHave}. ("${need.quote}")`);
    yearsAdjust = need.required - myYears >= 3 ? -3 : -1;
  } else if (need.preferred > myYears) {
    flags.push(`It prefers ${need.preferred}+ years of experience; ${youHave}.`);
    if (need.preferred - myYears >= 3) yearsAdjust = -1;
  }

  // Field fit: a design student applying to a design role, or not.
  const major = profile.education?.major || '';
  let fieldAdjust = 0;
  if (DESIGN_FIELD.test(major)) {
    if (DESIGN_FIELD.test(title)) fieldAdjust = 1;
    else if (OTHER_FIELD.test(title)) fieldAdjust = -2;
  }

  // Too little to go on (e.g. only the title was readable): say so instead of showing a misleading score.
  if (wanted.size < 3 && jobText.length < 2500) {
    return {
      score: null,
      summary: "Couldn't read enough of the job description to score it. Click \"Fill this page\" once the description is on screen to try again.",
      matched, missing, flags,
    };
  }
  if (!wanted.size) {
    return {
      score: null,
      summary: "This posting doesn't mention any skills to compare with your resume.",
      matched, missing, flags,
    };
  }
  const total = [...weights.values()].reduce((a, b) => a + b, 0);
  const got = matched.reduce((a, s) => a + weights.get(s), 0);
  const score = Math.max(1, Math.min(10, Math.round(1 + (got / total) * 8) + fieldAdjust + yearsAdjust));
  return {
    score,
    summary: `Your resume and website cover ${matched.length} of the ${wanted.size} skill${wanted.size > 1 ? 's' : ''} this posting mentions.`,
    matched, missing, flags,
  };
}

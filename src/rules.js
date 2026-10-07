// How each field gets answered: your profile, your saved answers, resume uploads, and safety rules.
import { normalizeQuestion } from './materials.js';

// Never filled automatically and never saved.
export const SENSITIVE_RE =
  /social security|\bssn\b|date of birth|birth ?date|\bdob\b|password|passport number|licen[cs]e number|bank|routing number/;
// Legal agreements are yours to read and accept.
export const CONSENT_RE =
  /certif|attest|acknowledg|i agree|agree to|i consent|consent to|terms (and|of) (conditions|service|use)|privacy (policy|notice)|true (and|,)? ?(complete|correct|accurate)|accurate and complete|electronic signature|e ?signature|^signature|sign (here|your)|full name as signature/;
export const COVER_RE = /cover ?letter/;
const RESUME_RE = /resume|\bcv\b|curriculum vitae/;

// Profile facts can go into text boxes and search-as-you-type dropdowns (location, school, country).
const RULE_KINDS = new Set(['text', 'textarea', 'combobox']);

// [question pattern, value from profile, optional exclusion pattern]. Patterns run on normalized text.
const PROFILE_RULES = [
  [/\bpreferred (first )?name\b/, (p) => p.preferredName || p.firstName],
  [/\b(legal )?first name\b|\bgiven name\b/, (p) => p.firstName, /preferred|middle/],
  [/\blast name\b|\bfamily name\b|\bsurname\b/, (p) => p.lastName],
  [/^(your )?(full )?(legal )?name$/, (p) => [p.firstName, p.lastName].filter(Boolean).join(' ')],
  [/\be ?mail\b/, (p) => p.email],
  [/^(phone|mobile|cell)|\b(phone|mobile|cell) number\b|^(primary )?phone$/, (p) => p.phone, /extension|\bext\b|type|device|country/],
  [/linkedin/, (p) => p.links?.linkedin],
  [/github/, (p) => p.links?.github],
  [/portfolio|personal (web ?site|site)|^web ?site( url)?$/, (p) => p.links?.portfolio, /password|access code|description|tell us/],
  [/^(street )?address( line)?( 1)?$|^street( address)?$|^home address$/, (p) => p.address?.street],
  [/^(current )?city$|city of residence/, (p) => p.address?.city],
  [
    /^(current )?location( city)?$|^(current )?(city|location) (and |& )?state$|^where are you (currently )?(located|based)$|^current address city$/,
    (p) => [p.address?.city, p.address?.state].filter(Boolean).join(', '),
  ],
  [/^(state|state province|province|state or province)$/, (p) => p.address?.state],
  [/\bzip\b|postal code/, (p) => p.address?.zip],
  [/^(major|field of study|area of study|discipline)$/, (p) => p.education?.major],
  [/^gpa$|^(cumulative|overall) gpa$/, (p) => p.education?.gpa],
  [/^pronouns?$/, (p) => p.pronouns],
];

export function profileRule(field, profile) {
  if (!RULE_KINDS.has(field.kind)) return undefined;
  for (const text of [field.question, field.placeholder]) {
    const q = normalizeQuestion(text);
    if (!q || q.length > 60) continue;
    for (const [re, get, exclude] of PROFILE_RULES) {
      if (re.test(q) && !(exclude && exclude.test(q))) {
        const value = get(profile);
        return typeof value === 'string' && value.trim() ? value.trim() : undefined;
      }
    }
  }
  return undefined;
}

// ---- Common application questions answered from My info (any kind of field: dropdowns, Yes/No, radio, text) ----
const SEASONS = { 1: 'Winter', 2: 'Winter', 3: 'Spring', 4: 'Spring', 5: 'Spring', 6: 'Summer', 7: 'Summer', 8: 'Summer', 9: 'Fall', 10: 'Fall', 11: 'Fall', 12: 'Winter' };
const MONTH_NAMES = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

// Ways a date can appear in a form: "May 2027", "Spring 2027", "2027-05", "05/2027", "2027".
function dateForms(text, yearMonth) {
  const m = String(yearMonth || '').match(/^(\d{4})-(\d{2})/);
  if (!m) return [text];
  const [y, mo] = [m[1], Number(m[2])];
  return [text, `${MONTH_NAMES[mo - 1]} ${y}`, `${SEASONS[mo]} ${y}`, `${y}-${m[2]}`, `${m[2]}/${y}`, y];
}

// Also accept plain Yes/No for answers like "I am not a protected veteran".
function withYesNo(value) {
  const v = String(value || '');
  if (!v) return [];
  if (/^yes\b/i.test(v)) return [v, 'Yes'];
  if (/^no\b|\bnot\b|\bdo not\b/i.test(v)) return [v, 'No'];
  return [v];
}

// "How many years of experience?" as a number, or the range a dropdown is likely to offer.
function yearsForms(value) {
  const v = String(value ?? '').trim();
  if (v === '') return [];
  const n = Number(v.replace(/\+$/, ''));
  if (!Number.isFinite(n)) return [v];
  const ranges =
    n < 1 ? ['Less than 1 year', '0-1 years', '0-1', 'None', '0']
    : n <= 2 ? ['1-2 years', '1-3 years', '1-2', '1-3']
    : n <= 5 ? ['3-5 years', '2-5 years', '3-5']
    : n < 10 ? ['5-10 years', '5+ years', '6-10 years']
    : ['10+ years', 'More than 10 years'];
  return [String(n), `${n} year${n === 1 ? '' : 's'}`, ...ranges];
}

// [question pattern, answers from your profile (best first)]. First match wins; patterns run on normalized text.
const ANSWER_RULES = [
  // "Authorized to work ... without sponsorship?" is an authorization question (Yes), not a sponsorship one.
  [/without (the need for |needing |requiring )?(an? )?(employer |company |visa )?sponsor/, (p) => withYesNo(p.workAuthorization?.authorizedToWorkInUS)],
  [/sponsor/, (p) => withYesNo(p.workAuthorization?.needsSponsorshipNowOrFuture)],
  [/authori[sz]ed to work|legally (authori[sz]ed|eligible|able|permitted) to work|eligible to work|right to work|work authori[sz]ation/, (p) => withYesNo(p.workAuthorization?.authorizedToWorkInUS)],
  [/\bu ?s citizen|citizenship status|are you a citizen/, (p) => withYesNo(p.workAuthorization?.usCitizen)],
  [/\b(18|eighteen) years|at least 18|over (the age of )?18|age of 18|legal age/, (p) => withYesNo(p.other?.over18)],
  [/willing to relocate|open to relocat|able to relocate|relocate if/, (p) => withYesNo(p.availability?.willingToRelocate)],
  [/how many years|years of (relevant |professional |work |industry |design |related )?(work )?experience|years experience/, (p) => yearsForms(p.experience?.years)],
  [/(served|serve|service) (in|with) (the )?(u s )?(military|armed forces)|military service|active duty/, (p) => withYesNo(p.other?.everServedInMilitary)],
  [/transgender/, (p) => withYesNo(p.eeo?.transgender)],
  [/sexual orientation/, (p) => withYesNo(p.eeo?.sexualOrientation)],
  [/hispanic|latin[oax]/, (p) => withYesNo(p.eeo?.hispanicOrLatino)],
  [/\bgender\b/, (p) => withYesNo(p.eeo?.gender)],
  [/\brace\b|ethnicity/, (p) => withYesNo(p.eeo?.raceEthnicity)],
  [/veteran/, (p) => withYesNo(p.eeo?.veteranStatus)],
  [/disabilit/, (p) => withYesNo(p.eeo?.disabilityStatus)],
  [/graduat\w* (date|year|term|month|semester|timeline)|expected graduation|anticipated graduation|when (do|will) you graduate/, (p) => (p.education?.graduation ? dateForms(p.education.graduation, p.education.graduationYearMonth) : [])],
  [/(earliest|available|availability|able) (to )?start|start date|when (can|could) you start/, (p) => (p.availability?.earliestStartDate ? dateForms(p.availability.earliestStartDate, p.availability.earliestStartYearMonth) : [])],
  [/how did you (hear|learn|find)|where did you (hear|learn|find)|referral source|source of (your )?application/, (p) => [p.other?.howDidYouHearDefault].filter(Boolean)],
  [/salary|compensation expect|pay expect|desired (pay|compensation)/, (p) => [p.other?.salaryExpectation].filter(Boolean)],
  [/^(country|country of residence|country region)$|country (do )?you (live|reside)/, (p) => [p.address?.country, 'United States of America', 'USA', 'US'].filter(Boolean)],
  [/(which|what|current|name of).{0,25}(school|university|college)|^(school|university|college|institution)( name)?$/, (p) => [p.education?.school, p.education?.officialSchoolName].filter(Boolean)],
  [/^(degree|degree type|highest degree|level of education|education level)$|what degree|degree are you (pursuing|working)/, (p) => [p.education?.degree, "Bachelor's Degree", "Bachelor's", 'Bachelors'].filter((v) => v && p.education?.degree)],
  [/^(major|field of study|area of study|discipline|concentration)$|what is your major/, (p) => [p.education?.major].filter(Boolean)],
];

function answerRule(field, profile) {
  if (field.kind === 'file') return null;
  const q = normalizeQuestion(field.question || field.placeholder);
  if (!q || q.length > 300) return null;
  for (const [re, get] of ANSWER_RULES) {
    if (!re.test(q)) continue;
    let answers = get(profile).filter((a) => String(a || '').trim());
    if (!answers.length) return null; // blank in My info: ask you
    // A text box gets the first form; month/date inputs get YYYY-MM.
    if (field.inputType === 'month') answers = answers.filter((a) => /^\d{4}-\d{2}$/.test(a)).concat(answers);
    return [...new Set(answers)];
  }
  return null;
}

export const needsYou = (note, learnable = true) => ({ value: '', source: 'needs_you', note, learnable });

/** Decide a field from your info and saved answers, or return null if it needs you. */
export function decideLocally(field, { profile, learned, job }) {
  const q = normalizeQuestion(field.question || field.placeholder);
  const ctx = normalizeQuestion(field.context);

  if (SENSITIVE_RE.test(q)) return needsYou('Sensitive: fill this in yourself', false);
  const consentOption = field.kind === 'checkboxes' && (field.options || []).some((o) => CONSENT_RE.test(normalizeQuestion(o)));
  if (CONSENT_RE.test(q) || consentOption || (field.kind === 'checkbox' && CONSENT_RE.test(ctx))) {
    return needsYou('Read this and confirm it yourself', false);
  }

  if (field.kind === 'file') {
    const text = `${q} ${ctx}`;
    // "Autofill from resume" boxes would re-fill the form behind our back; the real resume field is separate.
    if (/autofill|auto fill/.test(text)) return { value: '', source: 'skip' };
    if (COVER_RE.test(text)) return needsYou('Upload a cover letter if you have one', false);
    if (RESUME_RE.test(text) && job.resumePath) return { value: job.resumePath, source: 'resume', note: `Uploaded ${job.resume}` };
    if (/transcript/.test(text)) return needsYou('Upload your transcript', false);
    return needsYou('Upload the file this asks for', false);
  }

  const saved = learned[q];
  // Saved answers are filled in but outlined orange so you check them, until you greenlight them in My info.
  if (saved) return { value: saved.answer, source: 'profile', note: saved.green ? 'Your saved answer' : 'Your saved answer. Check it; greenlight it in My info → Saved answers to stop flagging it.', review: !saved.green };

  const fromProfile = profileRule(field, profile);
  if (fromProfile) return { value: fromProfile, source: 'profile', note: 'From your profile' };

  const answers = answerRule(field, profile);
  if (answers) return { value: answers[0], alternatives: answers.slice(1), source: 'profile', note: 'From My info' };

  return null;
}

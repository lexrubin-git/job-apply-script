// Cover letter maker (and answers to application questions): Gemini writes from the job description and your
// resume, website and other work. The letter header (your contact details, date, company) is filled in here, so
// personal details never leave your computer. Exports to PDF.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { NO_LINKEDIN_HANDSHAKE } from './browser.js';
import { isBlockedUrl, paths, readText } from './config.js';
import { generateJson } from './gemini.js';
import { captureDescription, fetchPosting, parseNote } from './job.js';
import { findConnections } from './match.js';
import { listResumes, loadProfile } from './materials.js';
import { portfolioText } from './portfolio.js';
import { workText } from './work.js';

export const TONES = {
  humanistic: { label: 'Humanistic & warm', guide: 'Humanistic and warm: genuine, personal and empathetic. Show the person behind the work and why the work matters to the people it serves.' },
  professional: { label: 'Professional & polished', guide: 'Professional and polished: formal, clear, measured and precise.' },
  enthusiastic: { label: 'Enthusiastic', guide: 'Enthusiastic and energetic: upbeat and eager, without exaggeration or exclamation-point overload.' },
  concise: { label: 'Concise & direct', guide: 'Concise and direct: short sentences, no filler, about 200 words in 3 short paragraphs.' },
  creative: { label: 'Creative & bold', guide: 'Creative and bold: a distinctive voice and a memorable first line, while staying professional.' },
  storytelling: { label: 'Storytelling', guide: "Storytelling: open with a brief, real moment from the applicant's own experience (from the resume), then connect it to this role." },
  confident: { label: 'Confident & results-focused', guide: 'Confident and results-focused: lead with what the applicant built, shipped and improved.' },
};

const SCHEMA = {
  type: 'OBJECT',
  properties: {
    greeting: { type: 'STRING', description: 'e.g. "Dear Figma Hiring Team,"' },
    paragraphs: { type: 'ARRAY', items: { type: 'STRING' }, description: 'The body paragraphs, in order' },
    closing: { type: 'STRING', description: 'e.g. "Sincerely,"' },
    connections: {
      type: 'ARRAY',
      description: 'Each place the letter ties something the job asks for to the applicant\'s real experience, in the order used',
      items: {
        type: 'OBJECT',
        properties: {
          jobNeed: { type: 'STRING', description: 'What the job asks for, in a few words, from the job description' },
          experience: { type: 'STRING', description: 'The resume experience or project used to show it, in a few words' },
        },
        required: ['jobNeed', 'experience'],
      },
    },
  },
  required: ['greeting', 'paragraphs', 'closing', 'connections'],
};

const SYSTEM = `You write cover letters for a student applying to internships.
Rules:
- Use only facts from the applicant's resume, portfolio projects, other work and education details. Never invent experience, skills, tools, numbers, awards or employers.
- The heart of the letter is the connection between this job and the applicant: pick two or three needs that the job description emphasizes, and for each one point to the specific resume experience or project that shows it. Make the link explicit: name the need, then show the experience. CONNECTIONS lists pairs already checked against the resume; prefer those, and you may add others you can see in the job description and resume.
- Never claim anything from SKILLS NOT ON THE RESUME. If one matters a lot for the job, you may briefly say you're eager to grow in it.
- First paragraph: who the applicant is (name, school, degree and major, expected graduation), the exact role, and one specific reason this company or team appeals, taken from the job description.
- Middle paragraph(s): the connections, each grounded in a concrete detail from the resume. Last paragraph: a short, confident close that mentions the portfolio link if one is given, and thanks.
- 3 or 4 paragraphs, about 250 to 350 words in total unless the tone says otherwise.
- No clichés ("I am writing to express my interest", "passionate", "fast-paced", "I believe I would be a great fit"). No em dashes. No bullet points.
- greeting: "Dear <Company> Hiring Team," unless the posting names the hiring manager. closing: "Sincerely,".`;

function ordinalDate(d = new Date()) {
  const day = d.getDate();
  const suffix = day % 10 === 1 && day !== 11 ? 'st' : day % 10 === 2 && day !== 12 ? 'nd' : day % 10 === 3 && day !== 13 ? 'rd' : 'th';
  return `${day}${suffix} ${d.toLocaleString('en-US', { month: 'long' })} ${d.getFullYear()}`;
}

// For sites without a public job-board listing (e.g. Workday): read the page in a hidden browser.
async function readPageText(url) {
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [NO_LINKEDIN_HANDSHAKE] });
  try {
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    return (await captureDescription(page)).text;
  } finally {
    await browser.close().catch(() => {});
  }
}

/** The job description for a job in your list (or the one you're applying to right now). */
export async function jobDetails({ url, note, current }) {
  const fromNote = parseNote(note);
  if (current?.url === url && current.description?.length > 400) {
    return { company: current.company || fromNote.company, title: current.title || fromNote.title, location: current.location || fromNote.location, department: current.department || '', description: current.description };
  }
  const posting = await fetchPosting(url).catch(() => null);
  // (Never LinkedIn or Handshake: for those, open the job first so its company page is read, or paste the description.)
  const description = posting?.text?.length > 400 ? posting.text : isBlockedUrl(url) ? '' : await readPageText(url).catch(() => '');
  return {
    company: fromNote.company || posting?.company || '',
    title: fromNote.title || posting?.title || '',
    location: fromNote.location || posting?.location || '',
    department: posting?.department || '',
    description,
  };
}

/**
 * What Gemini gets to know about you and the job, shared by cover letters and application answers:
 * your name, education, resume, portfolio website and other work, the job description, the tone, and the pairs of
 * "the job asks for X" / "your resume shows X here" worked out before Gemini writes anything.
 * Never your address, phone or email.
 */
function applicantContext({ company, title, location, description, tone, customTone, notes }) {
  if (!description || description.length < 200) throw new Error("Couldn't get this job's description. Choose \"Other job\" and paste it in.");
  const p = loadProfile();
  const name = [p.firstName, p.lastName].filter(Boolean).join(' ');
  const style = tone === 'custom' ? `Custom style requested by the applicant: ${String(customTone || '').slice(0, 300)}` : (TONES[tone] || TONES.humanistic).guide;
  const education = [p.education?.school && `School: ${p.education.school}`, p.education?.degree && `Degree: ${p.education.degree}`,
    p.education?.major && `Major: ${p.education.major}`, p.education?.graduation && `Expected graduation: ${p.education.graduation}`].filter(Boolean).join('\n');
  const resume = listResumes().map((r) => r.text).filter(Boolean).join('\n\n');
  const work = [portfolioText(), workText()].filter(Boolean).join('\n\n');
  const found = findConnections({ jobText: description, title, resumeText: resume });
  const pairs = found.connections.map((c) => `- ${c.skill} → ${c.entry}${c.role ? ` (${c.role})` : ''}: "${c.evidence}"`).join('\n');
  const prompt = [
    `APPLICANT NAME: ${name}`,
    `EDUCATION:\n${education}`,
    p.links?.portfolio ? `PORTFOLIO: ${p.links.portfolio.replace(/^https?:\/\//, '')}` : '',
    `RESUME:\n${resume.slice(0, 8000)}`,
    work ? `PORTFOLIO PROJECTS AND OTHER WORK (the applicant's own website and documents):\n${work.slice(0, 7000)}` : '',
    `JOB: ${title || 'the role'} at ${company || 'the company'}${location ? ` (${location})` : ''}`,
    `JOB DESCRIPTION:\n${description.slice(0, 9000)}`,
    pairs ? `CONNECTIONS (job need → the resume experience that shows it):\n${pairs}` : '',
    found.gaps.length ? `SKILLS NOT ON THE RESUME: ${found.gaps.join(', ')} (claim one only if the portfolio or other work clearly shows it)` : '',
    `TONE: ${style}`,
    notes ? `THE APPLICANT ALSO WANTS TO MENTION (only if it's true to their materials): ${String(notes).slice(0, 500)}` : '',
  ].filter(Boolean).join('\n\n');
  return { p, name, prompt, found };
}

/** Write a letter. Returns everything the page needs: header, greeting, paragraphs, closing, signature. */
export async function writeCoverLetter({ company, title, location, department, description, tone, customTone, notes }) {
  const { p, name, prompt, found } = applicantContext({ company, title, location, description, tone, customTone, notes });
  const out = await generateJson({ system: SYSTEM, prompt, schema: SCHEMA, temperature: 0.85 });
  const connections = (out.connections || []).filter((c) => c?.jobNeed && c?.experience).length
    ? out.connections.map((c) => ({ jobNeed: String(c.jobNeed), experience: String(c.experience) }))
    : found.connections.slice(0, 3).map((c) => ({ jobNeed: c.skill, experience: c.entry }));
  return {
    sender: {
      name,
      lines: [p.address?.street, [p.address?.city, [p.address?.state, p.address?.zip].filter(Boolean).join(' ')].filter(Boolean).join(', '), p.phone, p.email].filter(Boolean),
    },
    date: ordinalDate(),
    recipient: { org: company || 'Hiring Team', lines: [department, location].filter(Boolean) },
    greeting: out.greeting || `Dear ${company || ''} Hiring Team,`.replace('  ', ' '),
    paragraphs: (out.paragraphs || []).map((s) => String(s).trim()).filter(Boolean),
    closing: out.closing || 'Sincerely,',
    signature: name,
    model: out.model,
    connections,
    gaps: found.gaps,
  };
}

// ---- Answers to application questions ("Why do you want to work here?", "Tell us about a project...") ----
const ANSWER_SCHEMA = {
  type: 'OBJECT',
  properties: {
    answer: { type: 'STRING', description: 'The answer, in plain paragraphs separated by a blank line' },
    basedOn: {
      type: 'ARRAY',
      description: 'What the answer draws on, in order: each thing the question or job asks about, and the applicant\'s real experience used for it',
      items: {
        type: 'OBJECT',
        properties: {
          asked: { type: 'STRING', description: 'What the question or job asks about, in a few words' },
          experience: { type: 'STRING', description: 'The resume, portfolio or other-work experience used, in a few words' },
        },
        required: ['asked', 'experience'],
      },
    },
  },
  required: ['answer', 'basedOn'],
};

const ANSWER_SYSTEM = `You answer job application questions for a student, in the student's own voice (first person).
Rules:
- Answer exactly what QUESTION asks. If it has several parts, answer every part, in order.
- Use only facts from the RESUME, PORTFOLIO PROJECTS AND OTHER WORK, and EDUCATION. Never invent experience, skills, tools, numbers, awards, employers or personal stories.
- Make it about this job: draw on what the JOB DESCRIPTION emphasizes and connect it to specific, concrete experience. CONNECTIONS lists pairs already checked against the resume; prefer them when they fit the question.
- If the question needs something the materials don't contain (a personal motivation, a specific story, availability, salary), write what you can honestly and put a short [bracketed note] where the applicant should add their own detail.
- Follow the TONE.
- Follow LENGTH exactly when given (never go over a word or character limit). With no LENGTH, use 80 to 180 words, or 2 to 3 sentences for a simple factual question.
- Don't repeat the question, don't add a greeting or sign-off, no headings, no em dashes, no clichés ("passionate", "fast-paced", "I believe I would be a great fit"). Bullet points only if the question asks for a list.`;

const LIMITS = { w: 'words', c: 'characters' };

/** Answer one application question. limit: "" or e.g. "w:150" (words) / "c:1000" (characters). */
export async function answerQuestion({ question, limit, ...job }) {
  const q = String(question || '').trim();
  if (q.length < 5) throw new Error('Paste the question from the application first.');
  const { prompt } = applicantContext(job);
  const [unit, n] = String(limit || '').split(':');
  const length = LIMITS[unit] && Number(n) ? `${unit === 'w' ? 'At most' : 'Under'} ${n} ${LIMITS[unit]}` : '';
  const out = await generateJson({
    system: ANSWER_SYSTEM,
    prompt: [prompt, length ? `LENGTH: ${length}` : '', `QUESTION:\n${q.slice(0, 1500)}`].filter(Boolean).join('\n\n'),
    schema: ANSWER_SCHEMA,
    temperature: 0.8,
  });
  return {
    answer: String(out.answer || '').trim(),
    basedOn: (out.basedOn || []).filter((b) => b?.asked && b?.experience).map((b) => ({ asked: String(b.asked), experience: String(b.experience) })),
    model: out.model,
  };
}

const safeName = (s) => String(s || '').replace(/[<>:"/\\|?*\x00-\x1f]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 80);

/** "Coinbase - Product Design Intern - Cover Letter.pdf" */
export function letterFileName(company, title) {
  return `${[safeName(company), safeName(title), 'Cover Letter'].filter(Boolean).join(' - ')}.pdf`;
}

export function desktopDir() {
  const home = os.homedir();
  return [path.join(home, 'Desktop'), path.join(home, 'OneDrive', 'Desktop')].find((d) => fs.existsSync(d)) || home;
}

/** Turn the (edited) letter into PDF bytes. `html` is the letter element from the editor. */
export async function renderPdf(html) {
  const css = readText(paths.letterCss);
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Nunito+Sans:wght@400;700&display=swap">
<style>${css}</style></head><body>${String(html).replace(/\scontenteditable="[^"]*"/g, '')}</body></html>`;
  const browser = await chromium.launch({ channel: 'chrome', headless: true, args: [NO_LINKEDIN_HANDSHAKE] });
  try {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const page = await context.newPage();
    await page.setContent(doc, { waitUntil: 'networkidle', timeout: 15000 }).catch(() => {});
    return await page.pdf({ format: 'Letter', printBackground: true, preferCSSPageSize: true });
  } finally {
    await browser.close();
  }
}

/** Save the letter as a PDF in `dir` (without overwriting an existing file). Returns the file path. */
export async function savePdf({ html, company, title, dir }) {
  const bytes = await renderPdf(html);
  fs.mkdirSync(dir, { recursive: true });
  const name = letterFileName(company, title).replace(/\.pdf$/, '');
  let file = path.join(dir, `${name}.pdf`);
  for (let i = 2; fs.existsSync(file); i++) file = path.join(dir, `${name} (${i}).pdf`);
  fs.writeFileSync(file, bytes);
  return file;
}

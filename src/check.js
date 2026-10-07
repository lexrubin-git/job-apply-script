// npm run check: make sure everything is set up.
import { chromium } from 'playwright';
import { listResumes, loadProfile } from './materials.js';

const ok = (m) => console.log(`✓ ${m}`);
const warn = (m) => console.log(`⚠ ${m}`);

try {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  await browser.close();
  ok('Google Chrome works');
} catch (e) {
  warn(`Chrome didn't start: ${e.message.split('\n')[0]}`);
}

const p = loadProfile();
const need = {
  'first name': p.firstName,
  email: p.email,
  phone: p.phone,
  school: p.education?.school,
  'graduation date': p.education?.graduation,
  'authorized to work in the US': p.workAuthorization?.authorizedToWorkInUS,
  'needs visa sponsorship': p.workAuthorization?.needsSponsorshipNowOrFuture,
};
const missing = Object.entries(need)
  .filter(([, v]) => !String(v || '').trim())
  .map(([k]) => k);
if (missing.length) warn(`me/profile.json is missing: ${missing.join(', ')}`);
else ok('Profile has the basics');

const resumes = listResumes();
if (!resumes.length) warn('No resume PDFs in resume/');
for (const r of resumes) (r.text ? ok : warn)(`${r.file}: ${r.text ? 'text ready' : 'not converted yet (run npm run resume)'}`);

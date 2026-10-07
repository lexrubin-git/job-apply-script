import os from 'node:os';
import path from 'node:path';
import { chromium } from 'playwright';
import { isBlockedUrl, paths } from './config.js';

// For hidden helper browsers (reading job pages, making PDFs): Chrome refuses to look up these sites at all.
// Not used for the visible window, because Chrome shows an "unsupported command-line flag" bar for it there.
export const NO_LINKEDIN_HANDSHAKE = `--host-resolver-rules=${[
  'linkedin.com',
  '*.linkedin.com',
  'licdn.com',
  '*.licdn.com',
  'lnkd.in',
  'joinhandshake.com',
  '*.joinhandshake.com',
  'handshake.com',
  '*.handshake.com',
]
  .map((h) => `MAP ${h} ~NOTFOUND`)
  .join(', ')}`;

/** Refuse every request to LinkedIn or Handshake from these pages (including "Apply with LinkedIn" buttons and tracking pixels). */
export async function blockLinkedInAndHandshake(context) {
  await context.route(
    (url) => isBlockedUrl(url.href),
    (route) => route.abort('blockedbyclient'),
  );
}

export async function launchBrowser() {
  // Automated tests run hidden, in a throwaway profile.
  const test = !!process.env.APPLY_ASSISTANT_TEST;
  let context;
  try {
    context = await chromium.launchPersistentContext(test ? path.join(os.tmpdir(), 'apply-assistant-test-profile') : paths.browserProfile, {
      channel: 'chrome',
      headless: test,
      viewport: null,
      bypassCSP: true,
      // Keep Chrome's security sandbox on. (Playwright turns it off by default, which also makes Chrome show an
      // "unsupported command-line flag: --no-sandbox" warning bar.)
      chromiumSandbox: true,
      args: ['--start-maximized'],
    });
  } catch (e) {
    if (/ProcessSingleton|user data directory is already in use|lock/i.test(e.message)) {
      throw new Error('The Apply Assistant browser is already open. Close that window (or the other npm start) first.');
    }
    if (/chrome.*(not found|distribution)/i.test(e.message)) {
      throw new Error("Couldn't find Google Chrome. Install Chrome, or run: npx playwright install chrome");
    }
    throw e;
  }
  await blockLinkedInAndHandshake(context);
  return context;
}

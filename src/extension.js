// Writes the generated parts of the Chrome extension (extension/): the manifest, icons, and the form-reading and
// answer-matching code copied from the app, so the extension always behaves like the app. Runs when the app starts.
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT } from './config.js';
import { AUTOCOMPLETE_Q, bestMatch, DECLINE_RE, STATES } from './formFiller.js';
import { inPageInit } from './inpage.js';
import { normalizeQuestion } from './materials.js';
import { drawIcon, encodePng } from './pixelIcon.js';

export const EXTENSION_DIR = path.join(ROOT, 'extension');

// The extension's ID, which Chrome works out from the folder it's loaded from (an unpacked extension): SHA-256 of the
// folder path (UTF-16, drive letter in capitals), first 32 hex digits written as the letters a-p.
export const EXTENSION_ID = (() => {
  const dir = path.resolve(EXTENSION_DIR).replace(/^[a-z]:/, (d) => d.toUpperCase());
  const hex = crypto.createHash('sha256').update(Buffer.from(dir, 'utf16le')).digest('hex').slice(0, 32);
  return [...hex].map((c) => String.fromCharCode(97 + parseInt(c, 16))).join('');
})();

// Never run on these (the content script is excluded from them entirely).
const NEVER = ['linkedin.com', 'licdn.com', 'lnkd.in', 'joinhandshake.com', 'handshake.com'];

const MANIFEST = {
  manifest_version: 3,
  name: 'Apply Assistant',
  version: '1.0',
  description: 'Fills internship applications from the Apply Assistant app on your computer. Only acts on tabs the app opens; never runs on LinkedIn or Handshake.',
  // tabs: the address and title of the page you're on, for "Import from tab" (not what's on the page).
  permissions: ['storage', 'webNavigation', 'scripting', 'sidePanel', 'activeTab', 'tabs'],
  // Job sites (to re-attach the page helper to a job tab if needed; LinkedIn and Handshake are always skipped) and the app.
  host_permissions: ['http://127.0.0.1/*', 'https://*/*', 'http://*/*'],
  background: { service_worker: 'background.js' },
  // The toolbar button: open the app in a tab or beside the page, or add the page you're on to your job list.
  action: { default_popup: 'popup.html', default_title: 'Apply Assistant', default_icon: { 16: 'icon16.png', 32: 'icon32.png' } },
  // "Open beside the page": the app in Chrome's side panel, next to whatever you're browsing (nothing is added to
  // the page itself, so sites like LinkedIn can't see it).
  side_panel: { default_path: 'sidepanel.html' },
  content_scripts: [
    {
      matches: ['https://*/*', 'http://*/*'],
      exclude_matches: [...NEVER.flatMap((d) => [`*://${d}/*`, `*://*.${d}/*`]), 'http://127.0.0.1/*', 'http://localhost/*'],
      js: ['inpage.js', 'shared.js', 'content.js'],
      all_frames: true,
      // Also frames a site builds itself (about:blank, srcdoc), which some application forms live in.
      match_origin_as_fallback: true,
      run_at: 'document_idle',
    },
    // The app's "Opening job…" page, which is how the extension knows which tab is the job.
    { matches: ['http://127.0.0.1/go*'], js: ['go.js'], run_at: 'document_start' },
    // The app's own page opened in Chrome: its "Import from tab" button asks the extension which page you're on.
    { matches: ['http://127.0.0.1/*'], exclude_matches: ['http://127.0.0.1/go*'], js: ['bridge.js'], run_at: 'document_end' },
  ],
  icons: { 16: 'icon16.png', 32: 'icon32.png', 128: 'icon128.png' },
};

function writeIfChanged(file, data) {
  const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
  if (fs.existsSync(file) && fs.readFileSync(file).equals(buf)) return;
  fs.writeFileSync(file, buf);
}

/** Writes the generated files and returns the extension's version fingerprint. */
export function buildExtension() {
  fs.mkdirSync(EXTENSION_DIR, { recursive: true });
  writeIfChanged(
    path.join(EXTENSION_DIR, 'inpage.js'),
    `// Generated from src/inpage.js by the app. Don't edit here.\nvar jaaInit =${inPageInit.toString()};\n`,
  );
  // AUTOCOMPLETE_Q is defined in content.js, so it's checked here but not copied.
  void AUTOCOMPLETE_Q;
  writeIfChanged(
    path.join(EXTENSION_DIR, 'shared.js'),
    [
      "// Generated from src/formFiller.js and src/materials.js by the app. Don't edit here.",
      `var STATES = ${JSON.stringify(STATES)};`,
      `var DECLINE_RE = ${DECLINE_RE.toString()};`,
      normalizeQuestion.toString(),
      bestMatch.toString(),
      '',
    ].join('\n'),
  );
  const small = drawIcon(16);
  const large = drawIcon(32);
  writeIfChanged(path.join(EXTENSION_DIR, 'icon16.png'), encodePng(small, 1));
  writeIfChanged(path.join(EXTENSION_DIR, 'icon32.png'), encodePng(large, 1));
  writeIfChanged(path.join(EXTENSION_DIR, 'icon128.png'), encodePng(large, 4));
  // A fingerprint of the extension's files. When the app is updated, the extension in Chrome sees a different
  // fingerprint and reloads itself, so you never have to click "Reload" on chrome://extensions.
  const hash = crypto.createHash('sha1');
  for (const f of fs.readdirSync(EXTENSION_DIR).filter((n) => n !== 'manifest.json').sort()) {
    hash.update(f).update(fs.readFileSync(path.join(EXTENSION_DIR, f)));
  }
  const version = hash.digest('hex').slice(0, 12);
  writeIfChanged(path.join(EXTENSION_DIR, 'manifest.json'), JSON.stringify({ ...MANIFEST, version_name: version }, null, 2) + '\n');
  return version;
}

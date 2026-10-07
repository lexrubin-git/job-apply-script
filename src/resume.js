// npm run resume: read the text out of each PDF in resume/ into me/resumes/<name>.md (used for the match score).
// Runs on your computer with pdf.js; nothing is uploaded. Add --force to redo ones already converted.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';
import { paths } from './config.js';
import { listResumes } from './materials.js';

export async function pdfText(file) {
  const doc = await getDocument({ data: new Uint8Array(fs.readFileSync(file)), verbosity: 0 }).promise;
  let out = '';
  for (let i = 1; i <= doc.numPages; i++) {
    const page = await doc.getPage(i);
    let lastY = null;
    for (const item of (await page.getTextContent()).items) {
      if (lastY !== null && Math.abs(item.transform[5] - lastY) > 2) out += '\n';
      out += item.str + (item.hasEOL ? '\n' : '');
      lastY = item.transform[5];
    }
    out += '\n';
  }
  await doc.destroy();
  return out.replace(/[ \t]+\n/g, '\n').replace(/\n{2,}/g, '\n').trim();
}

/** Convert resumes that have no text version yet. Returns [{ file, ok, skipped, error }]. */
export async function convertResumes({ force = false } = {}) {
  fs.mkdirSync(paths.resumeText, { recursive: true });
  const results = [];
  for (const r of listResumes()) {
    if (r.text && !force) {
      results.push({ file: r.file, ok: true, skipped: true });
      continue;
    }
    try {
      const text = await pdfText(r.pdfPath);
      if (!text) throw new Error('No text found in this PDF (it may be a scanned image).');
      fs.writeFileSync(r.mdPath, text + '\n');
      results.push({ file: r.file, ok: true });
    } catch (e) {
      results.push({ file: r.file, ok: false, error: e.message });
    }
  }
  return results;
}

async function main() {
  if (!listResumes().length) {
    console.log('Put your resume PDF(s) in the resume/ folder first.');
    return;
  }
  for (const r of await convertResumes({ force: process.argv.includes('--force') })) {
    if (r.skipped) console.log(`✓ ${r.file} is already converted (use --force to redo it)`);
    else if (r.ok) console.log(`✓ ${r.file} converted`);
    else console.log(`✗ ${r.file}: ${r.error}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((e) => {
    console.error(e.message);
    process.exit(1);
  });
}

// npm start: the terminal version. (Double-click "Apply Assistant.exe" for the app window.)
import readline from 'node:readline';
import { isBlockedUrl } from './config.js';
import { logBus } from './log.js';
import { listResumes, loadProfile } from './materials.js';
import { addToQueue } from './queue.js';
import { BLOCKED_MSG, sendCommand, startApplying, stopApplying } from './runner.js';

const HELP = `Commands (type here, then Enter):
  f   fill the current page (same as the "Fill this page" button)
  d   done: you submitted this application, go to the next job
  s   skip this job
  q   quit (the current job stays in the queue)
  Paste a link to add it to the queue.`;

logBus.on('log', (line) => console.log(line));

function startTerminal() {
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (raw) => {
    const line = raw.trim();
    if (!line) return;
    const urls = line.match(/https?:\/\/\S+/g);
    if (urls) {
      const ok = urls.filter((u) => {
        if (isBlockedUrl(u)) console.log(BLOCKED_MSG);
        return !isBlockedUrl(u);
      });
      const added = addToQueue(ok.map((url) => ({ url })));
      if (ok.length) console.log(added ? `Added ${added} link${added > 1 ? 's' : ''} to the queue.` : 'Already in the queue or already done.');
      sendCommand('url');
      return;
    }
    const cmd = { f: 'fill', fill: 'fill', d: 'done', done: 'done', s: 'skip', skip: 'skip', q: 'quit', quit: 'quit' }[line.toLowerCase()];
    if (cmd) sendCommand(cmd);
    else console.log(HELP);
  });
}

console.log('Apply Assistant: fills applications on company career sites. Never opens LinkedIn or Handshake.\n');
const profile = loadProfile();
if (!profile.firstName || !profile.email) console.log('⚠ me/profile.json looks empty. Fill it in for better results.');
if (!listResumes().length) console.log('⚠ No resume PDFs in the resume/ folder.');
else if (listResumes().some((r) => !r.text)) console.log('⚠ Some resumes are not converted to text yet. Run: npm run resume');

startTerminal();
console.log(`\n${HELP}\n`);
process.on('SIGINT', async () => {
  await stopApplying();
  process.exit(0);
});
await startApplying();
console.log('\nBrowser closed. Bye!');
process.exit(0);

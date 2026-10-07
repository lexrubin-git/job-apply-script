// npm run build-exe: makes the app icon, builds "Apply Assistant.exe" with the C# compiler that ships with
// Windows, and puts an "Apply Assistant" shortcut on your Desktop.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { ROOT } from './config.js';
import { drawIcon, encodePng } from './pixelIcon.js';

const ASSETS = path.join(ROOT, 'assets');
const EXE = path.join(ROOT, 'Apply Assistant.exe');
const CSC = path.join(process.env.WINDIR || 'C:\\Windows', 'Microsoft.NET', 'Framework64', 'v4.0.30319', 'csc.exe');
// Microsoft's WebView2 control (the browser engine built into Windows 11), used for the frameless app window.
const WEBVIEW2_VERSION = '1.0.4258.31';
const WEBVIEW2_DIR = path.join(ROOT, 'lib', 'webview2');
const WEBVIEW2_FILES = {
  'Microsoft.Web.WebView2.Core.dll': 'lib/net462/Microsoft.Web.WebView2.Core.dll',
  'Microsoft.Web.WebView2.WinForms.dll': 'lib/net462/Microsoft.Web.WebView2.WinForms.dll',
  'WebView2Loader.dll': 'runtimes/win-x64/native/WebView2Loader.dll',
};

async function ensureWebView2() {
  if (Object.keys(WEBVIEW2_FILES).every((f) => fs.existsSync(path.join(WEBVIEW2_DIR, f)))) return;
  console.log(`Downloading Microsoft.Web.WebView2 ${WEBVIEW2_VERSION} from nuget.org…`);
  const res = await fetch(`https://www.nuget.org/api/v2/package/Microsoft.Web.WebView2/${WEBVIEW2_VERSION}`);
  if (!res.ok) throw new Error(`Couldn't download WebView2 (${res.status})`);
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'webview2-'));
  const zip = path.join(tmp, 'webview2.zip');
  fs.writeFileSync(zip, Buffer.from(await res.arrayBuffer()));
  execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${zip}' -DestinationPath '${path.join(tmp, 'x')}' -Force`]);
  fs.mkdirSync(WEBVIEW2_DIR, { recursive: true });
  for (const [name, inner] of Object.entries(WEBVIEW2_FILES)) fs.copyFileSync(path.join(tmp, 'x', inner), path.join(WEBVIEW2_DIR, name));
  fs.rmSync(tmp, { recursive: true, force: true });
  console.log('✓ WebView2 library ready');
}

// An .ico file can hold PNG images directly (Windows Vista and later).
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);
  header.writeUInt16LE(1, 2);
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const { size, data } of pngs) {
    const e = Buffer.alloc(16);
    e.writeUInt8(size >= 256 ? 0 : size, 0);
    e.writeUInt8(size >= 256 ? 0 : size, 1);
    e.writeUInt8(0, 2);
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4);
    e.writeUInt16LE(32, 6);
    e.writeUInt32LE(data.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += data.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs.map((p) => p.data)]);
}

function makeIcon() {
  fs.mkdirSync(ASSETS, { recursive: true });
  const small = drawIcon(16);
  const large = drawIcon(32);
  // Each size is an exact multiple of a hand-drawn grid, so pixels stay crisp.
  const pngs = [
    { size: 16, data: encodePng(small, 1) },
    { size: 32, data: encodePng(large, 1) },
    { size: 48, data: encodePng(small, 3) },
    { size: 64, data: encodePng(large, 2) },
    { size: 128, data: encodePng(large, 4) },
    { size: 256, data: encodePng(large, 8) },
  ];
  fs.writeFileSync(path.join(ASSETS, 'icon16.png'), pngs[0].data);
  fs.writeFileSync(path.join(ASSETS, 'icon32.png'), pngs[1].data);
  fs.writeFileSync(path.join(ASSETS, 'icon.png'), pngs.at(-1).data);
  fs.writeFileSync(path.join(ASSETS, 'icon.ico'), buildIco(pngs));
  console.log('✓ Pixel-art icon created');
}

function compile() {
  if (!fs.existsSync(CSC)) throw new Error(`The C# compiler wasn't found at ${CSC}.`);
  // A running .exe can't be overwritten, but Windows lets you rename it; the old copy is cleaned up next build.
  const old = `${EXE}.old`;
  try {
    fs.rmSync(old, { force: true });
  } catch {
    // still running from last time
  }
  if (fs.existsSync(EXE)) {
    try {
      fs.renameSync(EXE, old);
    } catch {
      // fall through; csc will report if it can't write
    }
  }
  execFileSync(
    CSC,
    [
      '/nologo',
      '/target:winexe',
      '/platform:x64',
      '/optimize+',
      `/out:${EXE}`,
      `/win32icon:${path.join(ASSETS, 'icon.ico')}`,
      '/reference:System.Windows.Forms.dll',
      '/reference:System.Drawing.dll',
      `/reference:${path.join(WEBVIEW2_DIR, 'Microsoft.Web.WebView2.Core.dll')}`,
      `/reference:${path.join(WEBVIEW2_DIR, 'Microsoft.Web.WebView2.WinForms.dll')}`,
      path.join(ROOT, 'src', 'launcher', 'Launcher.cs'),
    ],
    { stdio: 'inherit' },
  );
  console.log(`✓ Built ${path.basename(EXE)}`);
}

function desktopShortcut() {
  const desktop = path.join(os.homedir(), 'Desktop');
  const lnk = path.join(desktop, 'Apply Assistant.lnk');
  const ps = `$s = (New-Object -ComObject WScript.Shell).CreateShortcut('${lnk.replace(/'/g, "''")}');
$s.TargetPath = '${EXE.replace(/'/g, "''")}';
$s.WorkingDirectory = '${ROOT.replace(/'/g, "''")}';
$s.IconLocation = '${EXE.replace(/'/g, "''")},0';
$s.Description = 'Apply Assistant';
$s.Save()`;
  execFileSync('powershell.exe', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', ps], { stdio: 'inherit' });
  console.log(`✓ Desktop shortcut: ${lnk}`);
}

makeIcon();
await ensureWebView2();
compile();
if (!process.argv.includes('--no-shortcut')) desktopShortcut();
// Ask Windows to refresh its icon cache so the shortcut shows the new icon.
try {
  execFileSync('ie4uinit.exe', ['-show'], { stdio: 'ignore' });
} catch {
  // not critical
}

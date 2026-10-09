// Builds the website into dist/:
//   dist/                   landing page (site/)
//   dist/play/              the game (www/)
//   dist/BlocksCraft.apk    latest released APK, served from our own domain so
//                           the download button starts the download immediately
// plus favicons painted with the same grass-block art as the app icon.
import { rmSync, cpSync, writeFileSync, readFileSync } from 'node:fs';
import { paintBlock } from './icon-lib.mjs';

const REPO = 'https://github.com/christianrenz210/blockscraft';
const GITHUB_APK = `${REPO}/releases/latest/download/BlocksCraft.apk`;

rmSync('dist', { recursive: true, force: true });
cpSync('site', 'dist', { recursive: true });
cpSync('www', 'dist/play', { recursive: true });

const SKY = [126, 200, 242];
writeFileSync('dist/icon-32.png', paintBlock(32, 32, { bg: SKY, rounded: true, blockFrac: 0.86 }));
writeFileSync('dist/icon-192.png', paintBlock(192, 192, { bg: SKY, rounded: true, blockFrac: 0.72 }));

// Bundle the latest APK. If GitHub can't be reached, fall back to linking to it.
let apkUrl = GITHUB_APK;
let apkMeta = 'For Android';
try {
  const latest = await fetch(`${REPO}/releases/latest`, { redirect: 'manual' });
  const tag = (latest.headers.get('location') || '').split('/tag/')[1];
  const res = await fetch(GITHUB_APK);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const apk = Buffer.from(await res.arrayBuffer());
  if (apk.length < 100000 || apk.readUInt32LE(0) !== 0x04034b50) throw new Error('not an APK');
  writeFileSync('dist/BlocksCraft.apk', apk);
  apkUrl = 'BlocksCraft.apk';
  apkMeta = ['Android', tag, (apk.length / 1048576).toFixed(1) + ' MB'].filter(Boolean).join(' · ');
  console.log(`Bundled APK ${tag || ''} (${apk.length} bytes)`);
} catch (e) {
  console.warn(`Could not bundle the APK (${e.message}); linking to GitHub instead.`);
}

const html = readFileSync('dist/index.html', 'utf8')
  .replaceAll('%APK_URL%', apkUrl)
  .replaceAll('%APK_META%', apkMeta);
writeFileSync('dist/index.html', html);
console.log('Website built in dist/ (landing page + /play/)');

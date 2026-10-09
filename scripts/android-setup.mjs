// Customizes the Capacitor-generated Android project (run after `npx cap add android`):
//  - locks the game to landscape
//  - installs a full-screen MainActivity
//  - paints the BlocksCraft launcher icon + splash screen (no image tools needed)
import { readFileSync, writeFileSync, readdirSync, existsSync, copyFileSync } from 'node:fs';
import { join } from 'node:path';
import { pngSize, paintBlock } from './icon-lib.mjs';

const APP = 'android/app/src/main';
const RES = join(APP, 'res');

// 1. Landscape orientation
const manifestPath = join(APP, 'AndroidManifest.xml');
let manifest = readFileSync(manifestPath, 'utf8');
if (!manifest.includes('screenOrientation')) {
  manifest = manifest.replace(
    'android:name=".MainActivity"',
    'android:name=".MainActivity"\n            android:screenOrientation="sensorLandscape"',
  );
  writeFileSync(manifestPath, manifest);
}
console.log('Manifest: landscape orientation set');

// Version number from the CI build number, so each new APK installs over the old one.
const build = parseInt(process.env.GITHUB_RUN_NUMBER || '1', 10);
const gradlePath = 'android/app/build.gradle';
const gradle = readFileSync(gradlePath, 'utf8')
  .replace(/versionCode \d+/, `versionCode ${build}`)
  .replace(/versionName "[^"]*"/, `versionName "1.0.${build}"`);
writeFileSync(gradlePath, gradle);
console.log(`Version: 1.0.${build} (code ${build})`);

// 2. Full-screen activity
copyFileSync('android-overrides/MainActivity.java', join(APP, 'java/com/blockscraft/game/MainActivity.java'));
console.log('MainActivity: immersive full-screen installed');

// 3. Icon + splash -----------------------------------------------------------
const SKY = [126, 200, 242];
for (const dir of readdirSync(RES)) {
  const full = join(RES, dir);
  if (dir.startsWith('mipmap-') && !dir.includes('anydpi')) {
    for (const [file, opts] of [
      ['ic_launcher.png', { bg: SKY, rounded: true, blockFrac: 0.72 }],
      ['ic_launcher_round.png', { bg: SKY, circle: true, blockFrac: 0.66 }],
      ['ic_launcher_foreground.png', { blockFrac: 0.5 }],
    ]) {
      const p = join(full, file);
      if (!existsSync(p)) continue;
      const [w, h] = pngSize(p);
      writeFileSync(p, paintBlock(w, h, opts));
    }
  }
  if (dir.startsWith('drawable')) {
    const p = join(full, 'splash.png');
    if (!existsSync(p)) continue;
    const [w, h] = pngSize(p);
    writeFileSync(p, paintBlock(w, h, { bg: [59, 42, 30], blockFrac: 0.3 }));
  }
}
writeFileSync(
  join(RES, 'values/ic_launcher_background.xml'),
  '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <color name="ic_launcher_background">#7EC8F2</color>\n</resources>\n',
);
console.log('Launcher icons + splash screens painted');

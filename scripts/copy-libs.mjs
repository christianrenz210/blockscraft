// Copies third-party libraries from node_modules into www/lib so the game
// runs fully offline (inside the APK and from a local web server), and paints
// the page icon.
import { mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { paintBlock } from './icon-lib.mjs';

mkdirSync('www/lib', { recursive: true });
copyFileSync('node_modules/three/build/three.module.min.js', 'www/lib/three.module.min.js');
writeFileSync('www/lib/icon-192.png', paintBlock(192, 192, { bg: [126, 200, 242], rounded: true, blockFrac: 0.72 }));
console.log('Copied three.module.min.js and painted icon -> www/lib/');

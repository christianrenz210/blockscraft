// Builds the website into dist/:
//   dist/         landing page (site/)
//   dist/play/    the game (www/)
// plus favicons painted with the same grass-block art as the app icon.
import { rmSync, cpSync, writeFileSync } from 'node:fs';
import { paintBlock } from './icon-lib.mjs';

rmSync('dist', { recursive: true, force: true });
cpSync('site', 'dist', { recursive: true });
cpSync('www', 'dist/play', { recursive: true });

const SKY = [126, 200, 242];
writeFileSync('dist/icon-32.png', paintBlock(32, 32, { bg: SKY, rounded: true, blockFrac: 0.86 }));
writeFileSync('dist/icon-192.png', paintBlock(192, 192, { bg: SKY, rounded: true, blockFrac: 0.72 }));
writeFileSync('dist/play/icon-192.png', paintBlock(192, 192, { bg: SKY, rounded: true, blockFrac: 0.72 }));
console.log('Website built in dist/ (landing page + /play/)');

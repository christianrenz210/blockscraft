// Copies third-party libraries from node_modules into www/lib so the game
// runs fully offline (inside the APK and from a local web server).
import { mkdirSync, copyFileSync } from 'node:fs';

mkdirSync('www/lib', { recursive: true });
copyFileSync('node_modules/three/build/three.module.min.js', 'www/lib/three.module.min.js');
console.log('Copied three.module.min.js -> www/lib/');

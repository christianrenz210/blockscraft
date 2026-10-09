# BlocksCraft

A blocky 3D sandbox game for Android phones and the web: explore, break blocks, and build.

- Endless generated worlds: plains, forests, deserts, snowy mountains, oceans, caves, ores
- 26 block types, all textures painted in code (no image files)
- Day/night cycle, clouds, water you can swim in, flying, break particles, sound effects
- Touch controls (joystick and buttons) on phones; keyboard and mouse on PC
- Auto-save: your world is kept on the device

**Website (download the APK or play in your browser):** https://blockscraft.vercel.app  
**Play directly:** https://blockscraft.vercel.app/play/  
**APK direct download:** https://blockscraft.vercel.app/BlocksCraft.apk

Built with **Three.js** (WebGL). It runs as an Android app through **Capacitor**.
The APK is built automatically by **GitHub Actions**, so you don't need Android Studio.

---

## Get the APK (built on GitHub)

1. Create a new **empty** repository on GitHub (e.g. `blockscraft`).
2. Push this folder to it:
   ```bash
   git init
   git add .
   git commit -m "BlocksCraft"
   git branch -M main
   git remote add origin https://github.com/<your-username>/blockscraft.git
   git push -u origin main
   ```
3. On GitHub, open the **Actions** tab. Wait for **Build Android APK** to finish
   (about 5 minutes; a green check means it worked).
4. Click the finished run, then under **Artifacts** download **BlocksCraft-APK**.
   Unzip it to get `BlocksCraft.apk`.
5. Copy the APK to your phone, open it, and allow "Install unknown apps" if Android asks.

### An easier download link for your phone (Releases)
Push a version tag and the APK is added to the **Releases** page:
```bash
git tag v1.0
git push origin v1.0
```
Then on your phone, go to `https://github.com/<your-username>/blockscraft/releases`
and download `BlocksCraft.apk`.

Every push to `main` builds a new APK. Each build has a higher version number,
so you can install it over the old one and keep your world.

---

## Play on your computer (for testing)

You need Node.js installed.
```bash
npm install
npm run serve
```
Then open http://localhost:8080 in Chrome or Edge.

To preview the whole website (landing page + game at `/play/`):
```bash
npm run serve:site
```
Then open http://localhost:8081.

## Controls

| Phone | Computer | Action |
|---|---|---|
| Left joystick (push all the way to run) | WASD (Ctrl to run) | Walk |
| Drag on the right side | Mouse | Look around |
| Tap screen, or the block button | Right click | Place block |
| Hold screen, or the ⛏ button | Left click | Break block |
| ▲ | Space | Jump / swim / fly up |
| FLY | F, or double-tap Space | Toggle flying |
| ▼ (while flying) | Shift | Fly down |
| ⋯ | E | Choose blocks |
| Hotbar | 1–9, mouse wheel | Select block |
| — | Middle click | Pick the block you're looking at |
| ❚❚ / Back button | Esc | Pause |

## Project layout

```
site/                landing page (download + play links, screenshots)
www/                 the game (HTML/CSS/JS), served at /play/ on the website
  js/main.js         game loop, menus, HUD, sky
  js/world.js        chunks, terrain generation, meshing, raycasting
  js/player.js       movement and collision
  js/blocks.js       block list (add new blocks here)
  js/textures.js     pixel-art textures painted in code
  js/input.js        keyboard/mouse + touch controls
scripts/
  copy-libs.mjs      copies three.js into www/lib
  build-site.mjs     builds the website into dist/ (Vercel runs this)
  icon-lib.mjs       paints the grass-block icon PNGs
  android-setup.mjs  landscape, full-screen, app icon, splash, version
android-overrides/   full-screen MainActivity
.github/workflows/   APK build
```

## Tips

- If it lags on your phone, lower **Settings → Render Distance** and turn off **High resolution**.
- The world is saved automatically every 20 seconds and whenever you pause or leave the app.

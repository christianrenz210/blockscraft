// Synthesized sound effects (no audio files needed).
// Each block has a sound material (blocks.js) with its own recipe, used for
// breaking, placing (same sound, lower pitch, like Minecraft) and footsteps.
let ctx = null;
let out = null;
let noise = null;
let enabled = true;

function setup(c) {
  noise = c.createBuffer(1, c.sampleRate, c.sampleRate);
  const d = noise.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  const comp = c.createDynamicsCompressor();
  comp.threshold.value = -12;
  comp.ratio.value = 4;
  out = c.createGain();
  out.gain.value = 2;
  out.connect(comp).connect(c.destination);
}

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    setup(ctx);
  } catch (e) {
    ctx = null;
  }
}

export function setSoundEnabled(on) { enabled = on; }

const rand = (a, b) => a + Math.random() * (b - a);

// Filtered noise burst. `drop` sweeps the filter frequency over the grain.
function grain({ at = 0, freq, q = 1, type = 'bandpass', dur, vol, attack = 0.002, drop = 1 }) {
  const t = ctx.currentTime + at;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq, t);
  if (drop !== 1) f.frequency.exponentialRampToValueAtTime(freq * drop, t + attack + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  src.connect(f).connect(g).connect(out);
  src.start(t, Math.random() * (noise.duration - dur - 0.1));
  src.stop(t + attack + dur + 0.02);
}

// Short decaying oscillator. `drop` bends the pitch (below 1 = down, above 1 = up).
function tone({ at = 0, freq, dur, vol, type = 'sine', drop = 1, attack = 0.002 }) {
  const t = ctx.currentTime + at;
  const o = ctx.createOscillator();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (drop !== 1) o.frequency.exponentialRampToValueAtTime(freq * drop, t + attack + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, t + attack + dur);
  o.connect(g).connect(out);
  o.start(t);
  o.stop(t + attack + dur + 0.02);
}

// Recipes: p = pitch multiplier, v = volume, more = extra debris (breaking).
const RECIPES = {
  grass(p, v, more) {
    const n = more ? 5 : 3;
    for (let i = 0; i < n; i++) {
      grain({ at: i * rand(0.022, 0.04), freq: rand(2600, 4200) * p, q: 0.8, dur: rand(0.05, 0.09), vol: 0.55 * v });
    }
    grain({ freq: 520 * p, type: 'lowpass', q: 0.7, dur: 0.08, vol: 0.45 * v });
  },
  gravel(p, v, more) {
    const n = more ? 8 : 5;
    for (let i = 0; i < n; i++) {
      grain({ at: i * rand(0.014, 0.028), freq: rand(1000, 2400) * p, q: 1.3, dur: rand(0.03, 0.06), vol: rand(0.4, 0.65) * v });
    }
    grain({ freq: 260 * p, type: 'lowpass', q: 1, dur: 0.09, vol: 0.6 * v });
  },
  stone(p, v, more) {
    grain({ freq: 2300 * p, q: 1.2, dur: 0.035, vol: 0.6 * v });
    grain({ freq: 950 * p, q: 3, dur: 0.09, vol: 0.9 * v });
    tone({ freq: 170 * p, drop: 0.6, dur: 0.08, vol: 0.45 * v, type: 'triangle' });
    grain({ at: 0.035, freq: 1500 * p, q: 2, dur: 0.05, vol: 0.3 * v });
    if (more) {
      for (let i = 0; i < 3; i++) grain({ at: 0.05 + i * 0.03, freq: rand(1200, 2600) * p, q: 2, dur: 0.04, vol: 0.25 * v });
    }
  },
  wood(p, v, more) {
    grain({ freq: 520 * p, q: 7, dur: 0.13, vol: 2.2 * v });
    tone({ freq: 240 * p, drop: 0.75, dur: 0.1, vol: 0.4 * v, type: 'triangle' });
    grain({ freq: 2600 * p, q: 1, dur: 0.02, vol: 0.3 * v });
    grain({ at: 0.045, freq: 430 * p, q: 6, dur: 0.08, vol: 1.0 * v });
    if (more) grain({ at: 0.08, freq: 700 * p, q: 3, dur: 0.07, vol: 0.5 * v });
  },
  sand(p, v, more) {
    grain({ freq: 1700 * p, type: 'lowpass', q: 0.5, dur: 0.16, attack: 0.015, vol: 0.7 * v });
    grain({ at: 0.04, freq: 2600 * p, q: 0.6, dur: 0.08, vol: 0.3 * v });
    grain({ at: 0.08, freq: 1200 * p, type: 'lowpass', dur: more ? 0.16 : 0.1, vol: 0.35 * v });
  },
  snow(p, v, more) {
    const n = more ? 4 : 3;
    for (let i = 0; i < n; i++) {
      grain({ at: i * 0.03, freq: rand(1300, 2000) * p, type: 'lowpass', q: 1.5, dur: 0.07, vol: 0.6 * v });
    }
  },
  cloth(p, v) {
    grain({ freq: 700 * p, type: 'lowpass', q: 0.5, dur: 0.13, attack: 0.012, vol: 0.9 * v });
    grain({ at: 0.05, freq: 500 * p, type: 'lowpass', dur: 0.09, vol: 0.45 * v });
  },
  glass(p, v, more) {
    if (!more) return RECIPES.stone(p, v, false); // placing glass sounds like stone
    grain({ freq: 3200 * p, type: 'highpass', q: 0.7, dur: 0.22, vol: 0.5 * v });
    for (let i = 0; i < 7; i++) {
      tone({ at: rand(0, 0.09), freq: rand(1800, 5200) * p, dur: rand(0.08, 0.25), vol: 0.12 * v });
    }
  },
  metal(p, v) {
    [[1, 0.35, 0.3], [2.76, 0.25, 0.16], [5.4, 0.15, 0.08]].forEach(([m, dur, vol]) => {
      tone({ freq: 620 * p * m, dur, vol: vol * v });
    });
    grain({ freq: 3000 * p, q: 1, dur: 0.02, vol: 0.3 * v });
  },
  water(p, v) {
    tone({ freq: 340 * p, drop: 2.6, dur: 0.08, vol: 0.35 * v });
    tone({ at: 0.06, freq: 520 * p, drop: 2.2, dur: 0.06, vol: 0.25 * v });
    grain({ freq: 900 * p, type: 'lowpass', dur: 0.15, vol: 0.3 * v });
  },
};

// Per-material loudness so every block sounds about equally loud.
const GAIN = {
  grass: 0.75, gravel: 1.3, stone: 1.5, wood: 2, sand: 1.8, snow: 1.3, cloth: 1.8, glass: 1.2, metal: 1.6, water: 1.2,
};

/** kind: 'break' | 'place' | 'step' */
export function playBlockSound(material, kind) {
  if (!ctx || !enabled) return;
  const recipe = RECIPES[material] || RECIPES.stone;
  const g = GAIN[material] || 1;
  if (kind === 'place') recipe(rand(0.76, 0.86), 0.9 * g, false);
  else if (kind === 'step') { if (material !== 'water') recipe(rand(0.9, 1.1), 0.22 * g, false); }
  else recipe(rand(0.9, 1.05), g, true);
}

export const sfx = {
  door() {
    if (!ctx || !enabled) return;
    RECIPES.wood(rand(0.62, 0.7), 0.9, false);
    grain({ at: 0.11, freq: 2200, q: 3, dur: 0.03, vol: 0.25 }); // latch
  },
  splash() {
    if (!ctx || !enabled) return;
    grain({ freq: 1400, q: 0.5, dur: 0.35, vol: 0.45, drop: 0.3 });
    RECIPES.water(0.8, 0.8);
  },
  click() {
    if (!ctx || !enabled) return;
    grain({ freq: 2500, q: 4, dur: 0.04, vol: 0.35 });
  },
};

// Test helper: renders one sound offline and reports its loudness.
export async function measureSound(material, kind) {
  const saved = [ctx, out, noise, enabled];
  const off = new OfflineAudioContext(1, 44100, 44100);
  ctx = off; enabled = true;
  setup(off);
  playBlockSound(material, kind);
  [ctx, out, noise, enabled] = saved;
  const buf = await off.startRendering();
  const d = buf.getChannelData(0);
  let peak = 0, sum = 0, last = 0;
  for (let i = 0; i < d.length; i++) {
    const a = Math.abs(d[i]);
    if (a > peak) peak = a;
    sum += d[i] * d[i];
    if (a > 0.01) last = i;
  }
  return { peak: +peak.toFixed(3), rms: +Math.sqrt(sum / d.length).toFixed(4), lengthMs: Math.round((last / 44100) * 1000) };
}

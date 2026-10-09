// Tiny synthesized sound effects (no audio files needed).
let ctx = null;
let noise = null;
let enabled = true;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    noise = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
    const d = noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  } catch (e) {
    ctx = null;
  }
}

export function setSoundEnabled(on) { enabled = on; }

function burst({ freq, q = 1, dur, vol, type = 'bandpass', pitchDrop = 0 }) {
  if (!ctx || !enabled) return;
  const t = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = noise;
  const f = ctx.createBiquadFilter();
  f.type = type;
  f.frequency.setValueAtTime(freq * (0.9 + Math.random() * 0.2), t);
  if (pitchDrop) f.frequency.exponentialRampToValueAtTime(freq * pitchDrop, t + dur);
  f.Q.value = q;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  src.connect(f).connect(g).connect(ctx.destination);
  src.start(t, Math.random() * 0.3);
  src.stop(t + dur + 0.02);
}

export const sfx = {
  break() { burst({ freq: 900, q: 0.8, dur: 0.18, vol: 0.5, pitchDrop: 0.4 }); },
  place() { burst({ freq: 380, q: 1.2, dur: 0.1, vol: 0.55, type: 'lowpass' }); },
  step() { burst({ freq: 600, q: 1.5, dur: 0.06, vol: 0.12 }); },
  splash() { burst({ freq: 1400, q: 0.5, dur: 0.35, vol: 0.25, pitchDrop: 0.3 }); },
  click() { burst({ freq: 2500, q: 4, dur: 0.04, vol: 0.2 }); },
};

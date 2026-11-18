// audio.js — a pocket WebAudio synth: engine hum, two-tone siren, and one-shot
// blips for pickups, punches and mission events. No audio files, everything is
// oscillators and filtered noise. Starts lazily on the first user gesture.

let ctx = null;
let master = null;
let engineOsc = null, engineGain = null;
let sirenOsc = null, sirenGain = null, sirenTimer = 0;
let muted = false;

export function initAudio() {
  if (ctx) { if (ctx.state === 'suspended') ctx.resume(); return; }
  try {
    ctx = new (window.AudioContext || window.webkitAudioContext)();
    master = ctx.createGain();
    master.gain.value = 0.5;
    master.connect(ctx.destination);
  } catch { ctx = null; }
}

export function toggleMute() {
  muted = !muted;
  if (master) master.gain.value = muted ? 0 : 0.5;
  return muted;
}

function blip(freqA, freqB, dur, type = 'square', vol = 0.16, when = 0) {
  if (!ctx || muted) return;
  const t0 = ctx.currentTime + when;
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freqA, t0);
  osc.frequency.exponentialRampToValueAtTime(Math.max(30, freqB), t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0); osc.stop(t0 + dur + 0.02);
}

function thud(vol = 0.25) {
  if (!ctx || muted) return;
  const dur = 0.12;
  const buffer = ctx.createBuffer(1, ctx.sampleRate * dur, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
  const src = ctx.createBufferSource();
  src.buffer = buffer;
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass'; filter.frequency.value = 380;
  const g = ctx.createGain(); g.gain.value = vol;
  src.connect(filter).connect(g).connect(master);
  src.start();
}

export const sfx = {
  cash: () => { blip(880, 1320, 0.09, 'square', 0.12); blip(1320, 1760, 0.12, 'square', 0.1, 0.07); },
  pickup: () => blip(520, 780, 0.14, 'triangle', 0.18),
  punch: () => thud(0.3),
  crash: (hard) => { thud(hard ? 0.5 : 0.28); blip(140, 60, 0.2, 'sawtooth', 0.12); },
  door: () => blip(300, 210, 0.08, 'triangle', 0.14),
  mission: () => { blip(660, 660, 0.1, 'square', 0.12); blip(880, 880, 0.1, 'square', 0.12, 0.11); blip(1100, 1320, 0.2, 'square', 0.12, 0.22); },
  fail: () => { blip(320, 240, 0.18, 'sawtooth', 0.14); blip(240, 160, 0.3, 'sawtooth', 0.14, 0.16); },
  star: () => blip(1180, 1180, 0.07, 'square', 0.1),
};

// Continuous voices, updated once a frame from the game loop.
export function updateAudio(dt, { engineSpeed = 0, sirenNear = 0 } = {}) {
  if (!ctx || muted) return;
  if (engineSpeed > 0.02) {
    if (!engineOsc) {
      engineOsc = ctx.createOscillator(); engineOsc.type = 'sawtooth';
      engineGain = ctx.createGain(); engineGain.gain.value = 0;
      const f = ctx.createBiquadFilter(); f.type = 'lowpass'; f.frequency.value = 320;
      engineOsc.connect(f).connect(engineGain).connect(master);
      engineOsc.start();
    }
    engineOsc.frequency.value = 55 + engineSpeed * 165;
    engineGain.gain.value = Math.min(0.11, 0.03 + engineSpeed * 0.09);
  } else if (engineGain) {
    engineGain.gain.value = 0;
  }
  if (sirenNear > 0.05) {
    if (!sirenOsc) {
      sirenOsc = ctx.createOscillator(); sirenOsc.type = 'triangle';
      sirenGain = ctx.createGain(); sirenGain.gain.value = 0;
      sirenOsc.connect(sirenGain).connect(master);
      sirenOsc.start();
    }
    sirenTimer += dt;
    sirenOsc.frequency.value = (sirenTimer % 0.72) < 0.36 ? 690 : 920;
    sirenGain.gain.value = 0.028 * sirenNear;
  } else if (sirenGain) {
    sirenGain.gain.value = 0;
  }
}

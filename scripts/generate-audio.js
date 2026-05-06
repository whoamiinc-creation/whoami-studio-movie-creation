'use strict';
const fs = require('fs');
const path = require('path');

const SAMPLE_RATE    = 44100;
const DURATION       = 30;
const NUM_SAMPLES    = SAMPLE_RATE * DURATION;
const NUM_CHANNELS   = 2;
const BITS_PER_SAMPLE = 16;
const BYTE_RATE  = SAMPLE_RATE * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);
const DATA_SIZE  = NUM_SAMPLES * NUM_CHANNELS * (BITS_PER_SAMPLE / 8);

// ── Seeded PRNG ─────────────────────────────────────────────
function makePRNG(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x9e3779b9) >>> 0;
    let z = s;
    z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
    z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
    return ((z ^ (z >>> 16)) >>> 0) / 0xffffffff;
  };
}
function dateSeed(str) {
  return Array.from(str).reduce((a, c) => (Math.imul(a, 31) + c.charCodeAt(0)) | 0, 0x811c9dc5);
}

// ── Randomized audio presets ────────────────────────────────
// Solfeggio / healing frequencies as base drone candidates
const BASE_FREQS   = [396, 417, 432, 528, 639];
// Binaural beat targets: [name, Hz]
const BINAURAL_PRESETS = [
  [200, 208],  // alpha 8Hz  — リラックス集中
  [200, 210],  // alpha 10Hz — 穏やかな集中
  [180, 184],  // theta 4Hz  — 深いリラックス
  [210, 214],  // alpha 4Hz  — 瞑想
  [220, 227],  // theta 7Hz  — 創造性
];
const TREMOLO_SPEEDS = [0.04, 0.05, 0.06, 0.07]; // slow LFO Hz
const SHIMMER_FREQS  = [756, 864, 1056, 1320];    // gentle high partials

function writeWavHeader(buf) {
  let o = 0;
  buf.write('RIFF', o); o += 4;
  buf.writeUInt32LE(36 + DATA_SIZE, o); o += 4;
  buf.write('WAVE', o); o += 4;
  buf.write('fmt ', o); o += 4;
  buf.writeUInt32LE(16, o); o += 4;
  buf.writeUInt16LE(1,  o); o += 2;
  buf.writeUInt16LE(NUM_CHANNELS, o); o += 2;
  buf.writeUInt32LE(SAMPLE_RATE, o); o += 4;
  buf.writeUInt32LE(BYTE_RATE,   o); o += 4;
  buf.writeUInt16LE(NUM_CHANNELS * (BITS_PER_SAMPLE / 8), o); o += 2;
  buf.writeUInt16LE(BITS_PER_SAMPLE, o); o += 2;
  buf.write('data', o); o += 4;
  buf.writeUInt32LE(DATA_SIZE, o);
}

function clamp(v) {
  return Math.max(-32768, Math.min(32767, Math.round(v * 32767)));
}

function main() {
  const seedStr = process.argv[2] || new Date().toISOString().slice(0, 10);
  const rng = makePRNG(dateSeed(seedStr));

  const baseFreq    = BASE_FREQS[Math.floor(rng() * BASE_FREQS.length)];
  const binPair     = BINAURAL_PRESETS[Math.floor(rng() * BINAURAL_PRESETS.length)];
  const tremoloHz   = TREMOLO_SPEEDS[Math.floor(rng() * TREMOLO_SPEEDS.length)];
  const shimmerFreq = SHIMMER_FREQS[Math.floor(rng() * SHIMMER_FREQS.length)];
  const noiseAmt    = 0.13 + rng() * 0.08;   // 0.13–0.21
  const droneAmt    = 0.07 + rng() * 0.04;   // 0.07–0.11
  const breathHz    = 0.17 + rng() * 0.07;   // 0.17–0.24 (slow breath rhythm)
  const shimmerDelay = 6 + rng() * 4;        // 6–10s fade-in

  console.log(`Seed: ${seedStr}`);
  console.log(`  Base: ${baseFreq}Hz  Binaural: ${binPair[0]}/${binPair[1]}Hz  Shimmer: ${shimmerFreq}Hz`);

  const outPath = path.join(__dirname, '../public/ambient.wav');
  const buf = Buffer.alloc(44 + DATA_SIZE);
  writeWavHeader(buf);

  let brownL = 0, brownR = 0;
  let offset = 44;

  for (let i = 0; i < NUM_SAMPLES; i++) {
    const t = i / SAMPLE_RATE;

    // Master envelope: 5s fade-in / 5s fade-out
    const env = Math.min(1, t / 5) * Math.min(1, (DURATION - t) / 5);

    // Brown noise
    brownL = brownL * 0.998 + (Math.random() * 2 - 1) * 0.015;
    brownR = brownR * 0.998 + (Math.random() * 2 - 1) * 0.015;
    const noiseL = brownL * noiseAmt;
    const noiseR = brownR * noiseAmt;

    // Binaural beat (alpha/theta)
    const binL = Math.sin(2 * Math.PI * binPair[0] * t) * 0.11;
    const binR = Math.sin(2 * Math.PI * binPair[1] * t) * 0.11;

    // Base drone (selected Solfeggio frequency)
    const slowLFO = 0.85 + 0.15 * Math.sin(2 * Math.PI * tremoloHz * t);
    const drone   = Math.sin(2 * Math.PI * baseFreq       * t) * droneAmt * slowLFO;
    const drone2  = Math.sin(2 * Math.PI * (baseFreq / 2) * t) * (droneAmt * 0.6) * slowLFO;

    // Gentle shimmer (high partial, fades in late)
    const shimmerEnv = Math.min(1, Math.max(0, (t - shimmerDelay) / 5));
    const shimmer = Math.sin(2 * Math.PI * shimmerFreq * t) * 0.035 * shimmerEnv;

    // Breathing pulse
    const breath = 0.7 + 0.3 * Math.sin(2 * Math.PI * breathHz * t - Math.PI / 2);
    const base = (drone + drone2 + shimmer) * breath * env;

    buf.writeInt16LE(clamp((base + noiseL + binL) * env), offset); offset += 2;
    buf.writeInt16LE(clamp((base + noiseR + binR) * env), offset); offset += 2;
  }

  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, buf);
  console.log(`Generated: ${outPath} (${(buf.length / 1024 / 1024).toFixed(1)} MB, ${DURATION}s)`);
}

main();

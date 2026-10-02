// Offline render / sanity check. Runs the DSP core in Node (no browser),
// writes WAVs and prints level statistics.
//
//   node scripts/render.ts                  -> out/<preset>.wav for every preset (short phrase each)
//   node scripts/render.ts preset "Canopy"  -> out/preset.wav (one preset, a chord + phrase)
//   node scripts/render.ts note 60 100      -> out/note.wav (init patch, one note)
//   node scripts/render.ts bench            -> CPU timing only
//   node scripts/render.ts spectrum 84      -> harmonic / alias check of a raw saw at that note
//   node scripts/render.ts raw [dir]        -> <dir>/<preset>.f32, raw float32 stereo, for scripts/null-test.ts

import { writeFileSync, mkdirSync } from 'node:fs';
import { MyceliaEngine } from '../src/dsp/engine.ts';
import { PRESETS } from '../src/dsp/params.ts';

const FS = 48000;
const BLOCK = 128;

type Ev = { t: number; fn: () => void };

function render(e: MyceliaEngine, seconds: number, events: Ev[]): [Float32Array, Float32Array] {
  const total = Math.ceil(seconds * FS / BLOCK) * BLOCK;
  const L = new Float32Array(total), R = new Float32Array(total);
  events.sort((a, b) => a.t - b.t);
  let ev = 0;
  for (let off = 0; off < total; off += BLOCK) {
    const t = off / FS;
    while (ev < events.length && events[ev].t <= t) events[ev++].fn();
    e.process(L.subarray(off, off + BLOCK), R.subarray(off, off + BLOCK), BLOCK);
  }
  return [L, R];
}

function writeWav(path: string, L: Float32Array, R: Float32Array): void {
  const n = L.length;
  const buf = Buffer.alloc(44 + n * 4);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * 4, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(2, 22);
  buf.writeUInt32LE(FS, 24); buf.writeUInt32LE(FS * 4, 28); buf.writeUInt16LE(4, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * 4, 40);
  for (let i = 0; i < n; i++) {
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(L[i] * 32767))), 44 + i * 4);
    buf.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(R[i] * 32767))), 46 + i * 4);
  }
  mkdirSync('out', { recursive: true });
  writeFileSync(path, buf);
  console.log(`wrote ${path} (${(n / FS).toFixed(2)} s)`);
}

const db = (x: number) => (20 * Math.log10(Math.max(1e-9, x))).toFixed(1);

function stats(L: Float32Array, R: Float32Array, label = ''): void {
  let peak = 0, nan = 0, sq = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (!Number.isFinite(a) || !Number.isFinite(b)) nan++;
    if (a > peak) peak = a; if (b > peak) peak = b;
    sq += L[i] * L[i];
  }
  console.log(`${label} peak ${db(peak)} dBFS, rms ${db(Math.sqrt(sq / L.length))} dBFS${nan ? `  !!! ${nan} non-finite samples` : ''}`);
}

function envelope(L: Float32Array, win = 0.25, maxRows = 40): void {
  const w = Math.floor(win * FS);
  const rows: string[] = [];
  for (let off = 0; off + w <= L.length && rows.length < maxRows; off += w) {
    let s = 0;
    for (let i = off; i < off + w; i++) s += L[i] * L[i];
    rows.push(`${(off / FS).toFixed(1)}s ${db(Math.sqrt(s / w)).padStart(6)}`);
  }
  console.log(rows.join(' | '));
}

/** A short phrase that shows a preset off: chord, then a few melody notes. */
function phrase(e: MyceliaEngine, seconds = 7): [Float32Array, Float32Array] {
  const ev: Ev[] = [];
  const play = (t: number, n: number, v: number, dur: number) => {
    ev.push({ t, fn: () => e.noteOn(n, v) });
    ev.push({ t: t + dur, fn: () => e.noteOff(n) });
  };
  play(0.1, 48, 90, 3.2); play(0.1, 55, 85, 3.2); play(0.12, 60, 88, 3.2); play(0.14, 63, 84, 3.2); play(0.16, 67, 92, 3.2);
  play(3.6, 72, 100, 0.5); play(4.0, 70, 90, 0.5); play(4.4, 67, 95, 0.9); play(5.2, 63, 80, 1.2);
  return render(e, seconds, ev);
}

/**
 * How long a preset takes to speak: note-on to the first sample within 20 dB
 * of the peak it reaches in the next second. Patches meant to swell slowly
 * will be slow here; the point is to catch one that is *accidentally* late.
 */
function onset(e: MyceliaEngine, note = 60, vel = 100): number {
  const [L, R] = render(e, 1.5, [{ t: 0, fn: () => e.noteOn(note, vel) }]);
  let peak = 0;
  for (let i = 0; i < L.length; i++) {
    const a = Math.abs(L[i]), b = Math.abs(R[i]);
    if (a > peak) peak = a; if (b > peak) peak = b;
  }
  if (peak < 1e-6) return NaN;
  const thr = peak * 0.1;   // -20 dB
  for (let i = 0; i < L.length; i++) if (Math.abs(L[i]) >= thr || Math.abs(R[i]) >= thr) return (i / FS) * 1000;
  return NaN;
}

const mode = process.argv[2] ?? 'all';
const outDir = 'out';

if (mode === 'onset') {
  // note-on to -20 dB, every preset, sorted slowest first
  const rows = PRESETS.map((pr) => {
    const e = new MyceliaEngine(FS);
    e.loadPreset(pr.values);
    return { name: pr.name, tag: pr.tag, ms: onset(e) };
  }).sort((a, b) => b.ms - a.ms);
  for (const r of rows) console.log(`${r.name.padEnd(18)} ${r.tag.padEnd(9)} ${r.ms.toFixed(1).padStart(7)} ms`);
  const fast = rows.filter((r) => r.ms <= 10).length;
  console.log(`\n${fast}/${rows.length} presets speak within 10 ms`);
} else if (mode === 'note') {
  const note = Number(process.argv[3] ?? 60), vel = Number(process.argv[4] ?? 100);
  const e = new MyceliaEngine(FS);
  const [L, R] = render(e, 4, [
    { t: 0.05, fn: () => e.noteOn(note, vel) },
    { t: 2.0, fn: () => e.noteOff(note) },
  ]);
  stats(L, R, `note ${note} vel ${vel}:`);
  envelope(L, 0.1);
  writeWav(`${outDir}/note.wav`, L, R);
} else if (mode === 'preset') {
  const name = process.argv[3] ?? PRESETS[0].name;
  const pr = PRESETS.find((p) => p.name.toLowerCase().includes(name.toLowerCase()));
  if (!pr) throw new Error(`no preset matching "${name}"`);
  const e = new MyceliaEngine(FS);
  e.loadPreset(pr.values);
  const [L, R] = phrase(e, 9);
  stats(L, R, `${pr.name}:`);
  envelope(L);
  writeWav(`${outDir}/preset.wav`, L, R);
} else if (mode === 'bench') {
  const e = new MyceliaEngine(FS);
  e.loadPreset(PRESETS[0].values);   // Canopy: 5+3 unison, everything on
  const chord = [48, 55, 60, 64, 67, 72, 76, 79];
  for (const n of chord) e.noteOn(n, 100);
  const L = new Float32Array(BLOCK), R = new Float32Array(BLOCK);
  const blocks = Math.floor(5 * FS / BLOCK);
  const t0 = performance.now();
  for (let i = 0; i < blocks; i++) e.process(L, R, BLOCK);
  const ms = performance.now() - t0;
  console.log(`rendered 5 s with ${chord.length} voices of "${PRESETS[0].name}" in ${ms.toFixed(0)} ms  => ${(ms / 5000 * 100).toFixed(1)}% of real time`);
} else if (mode === 'spectrum') {
  // raw saw, filter wide open, no fx: harmonic levels vs. the strongest alias
  const note = Number(process.argv[3] ?? 84);
  const e = new MyceliaEngine(FS);
  e.setParams({ aShape: 0.5, aUnison: 1, drift: 0, cutoff: 18000, res: 0, drive: 0, fEnv: 0, chMix: 0, rvMix: 0, dlMix: 0, warmth: 0, aAtk: 0.001, aSus: 1, fVel: 0, keyTrack: 0 });
  const [L] = render(e, 2.5, [{ t: 0, fn: () => e.noteOn(note, 100) }]);
  const N = 32768, a = FS; // analyse 1 s in
  const f0 = 440 * Math.pow(2, (note - 69) / 12);
  const mag = (f: number) => {
    let re = 0, im = 0;
    for (let i = 0; i < N; i++) { const w = 0.5 - 0.5 * Math.cos(2 * Math.PI * i / N); const ph = 2 * Math.PI * f * i / FS; re += L[a + i] * w * Math.cos(ph); im -= L[a + i] * w * Math.sin(ph); }
    return Math.hypot(re, im) * 2 / N;
  };
  const h1 = mag(f0);
  const rows: string[] = [];
  for (let k = 1; k <= 8; k++) rows.push(`h${k} ${db(mag(k * f0) / h1)}`);
  console.log(`saw at ${f0.toFixed(1)} Hz: ` + rows.join('  '));
  // worst inharmonic bin between harmonics 1 and 2
  let worst = -200;
  for (let f = f0 * 1.1; f < f0 * 1.9; f += f0 * 0.02) worst = Math.max(worst, 20 * Math.log10(mag(f) / h1));
  console.log(`worst alias between h1 and h2: ${worst.toFixed(1)} dB re h1`);
} else if (mode === 'raw') {
  // the same phrases as the default mode, unquantised, to compare against the C++ engine
  const dir = process.argv[3] ?? `${outDir}/ts`;
  mkdirSync(dir, { recursive: true });
  for (const pr of PRESETS) {
    const e = new MyceliaEngine(FS);
    e.loadPreset(pr.values);
    const [L, R] = phrase(e, 8);
    const inter = new Float32Array(L.length * 2);
    for (let i = 0; i < L.length; i++) { inter[2 * i] = L[i]; inter[2 * i + 1] = R[i]; }
    writeFileSync(`${dir}/${pr.name.toLowerCase().replace(/\s+/g, '-')}.f32`, new Uint8Array(inter.buffer));
  }
  console.log(`wrote ${PRESETS.length} presets to ${dir}`);
} else {
  for (const pr of PRESETS) {
    const e = new MyceliaEngine(FS);
    e.loadPreset(pr.values);
    const [L, R] = phrase(e, 8);
    stats(L, R, pr.name.padEnd(18));
    writeWav(`${outDir}/${pr.name.toLowerCase().replace(/\s+/g, '-')}.wav`, L, R);
  }
}

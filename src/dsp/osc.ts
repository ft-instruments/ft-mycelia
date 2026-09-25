// Virtual-analogue oscillator bank: up to 7 detuned, stereo-spread copies
// of one waveform. Saw and pulse edges are PolyBLEP anti-aliased; the
// waveform is a continuous morph tri -> saw -> pulse (with pulse width).
//
// Each copy has its own slow random-walk pitch drift and a fixed small
// tuning error, the way the VCOs of a polysynth never quite agree. That,
// not the detune knob, is what makes a single-oscillator patch sound alive.

import { Rng } from './util.ts';

export const MAX_UNISON = 7;

function polyblep(t: number, dt: number): number {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

export class OscBank {
  n = 1;
  private phase = new Float64Array(MAX_UNISON);
  private inc = new Float64Array(MAX_UNISON);
  private gainL = new Float32Array(MAX_UNISON);
  private gainR = new Float32Array(MAX_UNISON);
  private offsetCt = new Float32Array(MAX_UNISON);   // fixed tuning error per copy
  private drift = new Float32Array(MAX_UNISON);      // slow random walk, cents
  private driftVel = new Float32Array(MAX_UNISON);
  private rng: Rng;

  constructor(seed: number) {
    this.rng = new Rng(seed);
    for (let i = 0; i < MAX_UNISON; i++) {
      this.offsetCt[i] = this.rng.bi() * 2.5;
      this.phase[i] = this.rng.next();
    }
  }

  /** Called at note-on. Randomises phases (free-running VCOs) but keeps drift state. */
  start(): void {
    for (let i = 0; i < MAX_UNISON; i++) this.phase[i] = this.rng.next();
  }

  /**
   * Set pitch for all copies. `detune` in cents (total spread), `spread`
   * 0..1 stereo width, `driftAmt` 0..1 amount of analogue instability.
   */
  setPitch(freq: number, sampleRate: number, unison: number, detune: number, spread: number, driftAmt: number): void {
    const n = Math.max(1, Math.min(MAX_UNISON, unison | 0));
    this.n = n;
    const norm = 1 / Math.sqrt(n);
    const nyq = sampleRate * 0.45;
    for (let i = 0; i < n; i++) {
      // random walk with a spring back to 0 (Ornstein-Uhlenbeck-ish)
      this.driftVel[i] += (this.rng.bi() * 0.06 - this.drift[i] * 0.004);
      this.driftVel[i] *= 0.985;
      this.drift[i] += this.driftVel[i];
      const spreadPos = n === 1 ? 0 : (i / (n - 1)) * 2 - 1;      // -1..1
      const cents = spreadPos * detune * 0.5 + driftAmt * (this.offsetCt[i] + this.drift[i] * 0.6);
      let f = freq * Math.pow(2, cents / 1200);
      if (f > nyq) f = nyq;
      this.inc[i] = f / sampleRate;
      // constant-power pan across the spread
      const pan = spreadPos * spread;                              // -1..1
      const a = (pan + 1) * 0.25 * Math.PI;
      this.gainL[i] = Math.cos(a) * norm;
      this.gainR[i] = Math.sin(a) * norm;
    }
  }

  /**
   * Adds `count` samples of the bank into L/R. `shape` 0..1 (tri/saw/pulse),
   * `pw` pulse width 0.05..0.95, `level` output gain.
   */
  render(L: Float32Array, R: Float32Array, count: number, shape: number, pw: number, level: number): void {
    if (level <= 0) return;
    const n = this.n;
    const phase = this.phase, inc = this.inc, gL = this.gainL, gR = this.gainR;
    // morph weights
    let wTri = 0, wSaw = 0, wPul = 0;
    if (shape < 0.5) { wSaw = shape * 2; wTri = 1 - wSaw; } else { wPul = (shape - 0.5) * 2; wSaw = 1 - wPul; }
    wTri *= level; wSaw *= level; wPul *= level;
    const pulseDC = pw + pw - 1;   // remove the DC a non-square pulse carries (PWM would thump otherwise)
    for (let i = 0; i < n; i++) {
      let t = phase[i];
      const dt = inc[i];
      const gl = gL[i], gr = gR[i];
      for (let s = 0; s < count; s++) {
        let v = 0;
        if (wSaw > 0) v += wSaw * ((t + t - 1) - polyblep(t, dt));
        if (wPul > 0) {
          let t2 = t + 1 - pw; if (t2 >= 1) t2 -= 1;
          v += wPul * ((t < pw ? 1 : -1) - pulseDC + polyblep(t, dt) - polyblep(t2, dt));
        }
        if (wTri > 0) v += wTri * (4 * Math.abs(t - 0.5) - 1);
        L[s] += v * gl;
        R[s] += v * gr;
        t += dt; if (t >= 1) t -= 1;
      }
      phase[i] = t;
    }
  }
}

/** Sub oscillator: sine, square (one octave down) or sine two octaves down. */
export class SubOsc {
  private phase = 0;
  private inc = 0;
  private lp = 0;
  setPitch(freq: number, sampleRate: number): void { this.inc = freq / sampleRate; }
  start(): void { this.phase = 0; }
  render(L: Float32Array, R: Float32Array, count: number, shape: number, level: number): void {
    if (level <= 0) return;
    let t = this.phase; const dt = this.inc;
    for (let s = 0; s < count; s++) {
      let v: number;
      if (shape === 1) {
        // square, rounded by a one-pole so it stays polite
        const sq = (t < 0.5 ? 1 : -1) + polyblep(t, dt) - polyblep(t < 0.5 ? t + 0.5 : t - 0.5, dt);
        this.lp += (sq - this.lp) * 0.35;
        v = this.lp * 0.8;
      } else {
        v = Math.sin(6.283185307 * t);
      }
      v *= level;
      L[s] += v; R[s] += v;
      t += dt; if (t >= 1) t -= 1;
    }
    this.phase = t;
  }
}

/** Gentle pink-ish noise (white through a one-pole). */
export class Noise {
  private rng: Rng;
  private z = 0;
  constructor(seed: number) { this.rng = new Rng(seed); }
  render(L: Float32Array, R: Float32Array, count: number, level: number): void {
    if (level <= 0) return;
    for (let s = 0; s < count; s++) {
      const w = this.rng.bi();
      this.z += (w - this.z) * 0.12;
      const v = this.z * 2.2 * level;
      L[s] += v; R[s] += v;
    }
  }
}

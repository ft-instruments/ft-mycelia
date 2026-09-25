// Transistor-ladder low-pass (Moog style), after Huovilainen's non-linear
// model: four one-pole stages with tanh saturation, global feedback for
// resonance, tuning/resonance corrections for the discretisation, run at
// 2x oversampling. It self-oscillates at full resonance and compresses
// the way the real thing does when driven.

import { tanhf } from './util.ts';

export class Ladder {
  private s0 = 0; private s1 = 0; private s2 = 0; private s3 = 0;
  private t0 = 0; private t1 = 0; private t2 = 0; private t3 = 0;
  private g = 0.1; private k = 0;
  private gT = 0.1; private kT = 0;
  private xPrev = 0;
  private readonly fs2: number;

  constructor(sampleRate: number) {
    this.fs2 = sampleRate * 2;
  }

  reset(): void {
    this.s0 = this.s1 = this.s2 = this.s3 = 0;
    this.t0 = this.t1 = this.t2 = this.t3 = 0;
    this.xPrev = 0;
    this.g = this.gT; this.k = this.kT;
  }

  /** Cutoff in Hz, resonance 0..1 (self-oscillation from ~0.95). */
  set(cutoff: number, res: number): void {
    const fc = Math.min(0.24, Math.max(1e-5, cutoff / this.fs2));
    const x = fc * Math.PI;
    const fcr = ((1.873 * x + 0.4955) * x - 0.649) * x + 0.9988;
    const acr = (-3.9364 * x + 1.8409) * x + 0.9968;
    this.gT = 1 - Math.exp(-2 * Math.PI * fc * fcr);
    this.kT = 4.4 * Math.max(0, Math.min(1, res)) * acr;
  }

  /** Snap the coefficients (at note start so the smoother doesn't sweep). */
  snap(): void { this.g = this.gT; this.k = this.kT; }

  /**
   * In place. `drive` 0..1, `twoPole` takes the output after two stages.
   * `mod` optionally scales the cutoff per sample (used for nothing yet).
   */
  process(buf: Float32Array, count: number, drive: number, twoPole: boolean): void {
    let s0 = this.s0, s1 = this.s1, s2 = this.s2, s3 = this.s3;
    let t0 = this.t0, t1 = this.t1, t2 = this.t2, t3 = this.t3;
    let g = this.g, k = this.k;
    const gT = this.gT, kT = this.kT;
    let xPrev = this.xPrev;
    const inGain = 0.6 + drive * 3;
    const outGain = (1 / (0.6 + drive * 2)) * (1 + kT * 0.35);   // compensate passband loss with resonance
    for (let i = 0; i < count; i++) {
      g += (gT - g) * 0.02;
      k += (kT - k) * 0.02;
      const x = buf[i] * inGain;
      let out = 0;
      // two sub-steps, input linearly interpolated (cheap decimation: average)
      for (let os = 0; os < 2; os++) {
        const xin = os === 0 ? (xPrev + x) * 0.5 : x;
        const tin = tanhf(xin - k * t3);
        s0 += g * (tin - t0); t0 = tanhf(s0);
        s1 += g * (t0 - t1); t1 = tanhf(s1);
        s2 += g * (t1 - t2); t2 = tanhf(s2);
        s3 += g * (t2 - t3); t3 = tanhf(s3);
        out += twoPole ? s1 : s3;
      }
      xPrev = x;
      buf[i] = out * 0.5 * outGain;
    }
    this.s0 = s0; this.s1 = s1; this.s2 = s2; this.s3 = s3;
    this.t0 = t0; this.t1 = t1; this.t2 = t2; this.t3 = t3;
    this.g = g; this.k = k; this.xPrev = xPrev;
  }
}

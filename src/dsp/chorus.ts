// String-machine ensemble (Solina / Roland style): three modulated
// bucket-brigade delay taps per channel, each moved by a slow and a fast
// triangle LFO 120° apart, summed. The BBD's darkness and soft clipping
// are modelled with a one-pole low-pass and a tanh on the wet path.

import { tanhf, readDelay } from './util.ts';

export class Ensemble {
  private bufL: Float32Array;
  private bufR: Float32Array;
  private idx = 0;
  private slowPhase = 0;
  private fastPhase = 0;
  private lpL = 0; private lpR = 0;
  private readonly fs: number;
  private static readonly CENTER_MS = 6;

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    const len = Math.ceil(sampleRate * 0.03);
    this.bufL = new Float32Array(len);
    this.bufR = new Float32Array(len);
  }

  clear(): void { this.bufL.fill(0); this.bufR.fill(0); this.lpL = this.lpR = 0; }

  private static tri(p: number): number {
    p -= Math.floor(p);
    return 4 * Math.abs(p - 0.5) - 1;
  }

  /** In place. `rate` Hz of the slow LFO, `depth` 0..1, `tone` 0..1 (dark..bright), `mix` 0..1. */
  process(L: Float32Array, R: Float32Array, n: number, rate: number, depth: number, tone: number, mix: number): void {
    if (mix <= 0) return;
    const fs = this.fs;
    const bufL = this.bufL, bufR = this.bufR, len = bufL.length;
    let idx = this.idx;
    const slowInc = rate / fs;
    const fastInc = (rate * 9.5 + 0.5) / fs;
    const center = Ensemble.CENTER_MS * 1e-3 * fs;
    const slowDepth = 2.6e-3 * fs * depth;
    const fastDepth = 0.22e-3 * fs * depth;
    const lpA = 1 - Math.exp(-2 * Math.PI * (2500 + tone * 9000) / fs);
    const dryGain = 1 - mix * 0.45;
    const wetGain = mix * 0.75;
    let lpL = this.lpL, lpR = this.lpR;
    let sp = this.slowPhase, fp = this.fastPhase;
    const T = Ensemble.tri;
    for (let i = 0; i < n; i++) {
      const xl = L[i], xr = R[i];
      bufL[idx] = xl; bufR[idx] = xr;
      // three taps per channel; the right channel's LFOs sit 60° further round
      const d0 = center + T(sp) * slowDepth + T(fp) * fastDepth;
      const d1 = center + T(sp + 1 / 3) * slowDepth + T(fp + 1 / 3) * fastDepth;
      const d2 = center + T(sp + 2 / 3) * slowDepth + T(fp + 2 / 3) * fastDepth;
      const e0 = center + T(sp + 1 / 6) * slowDepth + T(fp + 1 / 6) * fastDepth;
      const e1 = center + T(sp + 1 / 2) * slowDepth + T(fp + 1 / 2) * fastDepth;
      const e2 = center + T(sp + 5 / 6) * slowDepth + T(fp + 5 / 6) * fastDepth;
      let wl = (readDelay(bufL, idx, d0) + 0.6 * readDelay(bufL, idx, d1) + 0.3 * readDelay(bufR, idx, d2)) / 1.9;
      let wr = (readDelay(bufR, idx, e2) + 0.6 * readDelay(bufR, idx, e1) + 0.3 * readDelay(bufL, idx, e0)) / 1.9;
      // BBD colour
      wl = tanhf(wl * 1.3) / 1.3; wr = tanhf(wr * 1.3) / 1.3;
      lpL += (wl - lpL) * lpA; lpR += (wr - lpR) * lpA;
      L[i] = xl * dryGain + lpL * wetGain;
      R[i] = xr * dryGain + lpR * wetGain;
      if (++idx >= len) idx = 0;
      sp += slowInc; if (sp >= 1) sp -= 1;
      fp += fastInc; if (fp >= 1) fp -= 1;
    }
    this.idx = idx; this.lpL = lpL; this.lpR = lpR; this.slowPhase = sp; this.fastPhase = fp;
  }
}

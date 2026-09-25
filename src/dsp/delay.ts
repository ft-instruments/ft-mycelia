// Tempo-synced stereo delay with a tape/BBD character: the repeats go
// through a low-pass, a high-pass and a soft clipper, the read head wobbles
// slightly, and time changes slew (so they bend pitch instead of clicking).
// Ping-pong crosses the feedback between channels.

import { tanhf, readDelay } from './util.ts';

const MAX_SECONDS = 2.2;

export class TapeDelay {
  private bufL: Float32Array;
  private bufR: Float32Array;
  private idx = 0;
  private time = 0;          // current (slewed) delay in samples
  private wobble = 0;
  private lpL = 0; private lpR = 0;
  private hpL = 0; private hpR = 0;
  private readonly fs: number;

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    const len = Math.ceil(sampleRate * MAX_SECONDS);
    this.bufL = new Float32Array(len);
    this.bufR = new Float32Array(len);
    this.time = sampleRate * 0.3;
  }

  clear(): void { this.bufL.fill(0); this.bufR.fill(0); this.lpL = this.lpR = this.hpL = this.hpR = 0; }

  /**
   * In place. `seconds` target delay, `feedback` 0..0.95, `tone` 0..1,
   * `pingPong` bool, `mix` 0..1.
   */
  process(L: Float32Array, R: Float32Array, n: number, seconds: number, feedback: number, tone: number, pingPong: boolean, mix: number): void {
    if (mix <= 0 && feedback <= 0) return;
    const fs = this.fs;
    const bufL = this.bufL, bufR = this.bufR, len = bufL.length;
    let idx = this.idx;
    const target = Math.min(len - 4, Math.max(8, seconds * fs));
    const slew = 1 - Math.exp(-1 / (0.08 * fs));       // 80 ms time constant: audible bend when you turn the knob
    const lpA = 1 - Math.exp(-2 * Math.PI * (1500 + tone * 8500) / fs);
    const hpA = 1 - Math.exp(-2 * Math.PI * 110 / fs);
    const wobInc = 2 * Math.PI * 0.37 / fs;
    const wobDepth = 0.25e-3 * fs;
    const fb = feedback;
    const wet = mix * 0.8, dry = 1 - mix * 0.3;
    let time = this.time, wob = this.wobble;
    let lpL = this.lpL, lpR = this.lpR, hpL = this.hpL, hpR = this.hpR;
    for (let i = 0; i < n; i++) {
      time += (target - time) * slew;
      wob += wobInc; if (wob > 6.283185307) wob -= 6.283185307;
      const d = time + Math.sin(wob) * wobDepth;
      let rl = readDelay(bufL, idx, d);
      let rr = readDelay(bufR, idx, d + 0.7e-3 * fs);
      // loop colouring
      lpL += (rl - lpL) * lpA; lpR += (rr - lpR) * lpA;
      hpL += (lpL - hpL) * hpA; hpR += (lpR - hpR) * hpA;
      rl = tanhf((lpL - hpL) * 1.2) / 1.2;
      rr = tanhf((lpR - hpR) * 1.2) / 1.2;
      const xl = L[i], xr = R[i];
      if (pingPong) {
        const mono = (xl + xr) * 0.5;
        bufL[idx] = mono + rr * fb;
        bufR[idx] = rl * fb;
      } else {
        bufL[idx] = xl + rl * fb;
        bufR[idx] = xr + rr * fb;
      }
      L[i] = xl * dry + rl * wet;
      R[i] = xr * dry + rr * wet;
      if (++idx >= len) idx = 0;
    }
    this.idx = idx; this.time = time; this.wobble = wob;
    this.lpL = lpL; this.lpR = lpR; this.hpL = hpL; this.hpR = hpR;
  }
}

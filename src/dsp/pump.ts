// Pump: tempo-synced ducking, the sidechain-compressor sound without a
// kick. On every step the level drops in a few milliseconds, then comes
// back over `release` (a fraction of the step) along a curve: low `curve`
// stays down and swells back late (the breathing trance pad), high
// `curve` snaps back early (a short, tight duck).
//
// The step phase comes from the engine's beat clock, so the pump, the arp
// and synced LFOs all agree on where the beat is.

const ATTACK = 0.004;   // seconds from full level to the bottom of the duck

/**
 * How far down the duck is at `phase` (0..1 through the step): 1 at the
 * bottom, 0 fully recovered. Shared with the UI picture.
 */
export function pumpDuck(phase: number, stepSec: number, release: number, curve: number): number {
  const t = phase * stepSec;
  const atk = Math.min(ATTACK, stepSec * 0.1);
  if (t < atk) return t / atk;
  const relSec = Math.max(atk * 2, release * stepSec) - atk;
  const r = Math.min(1, (t - atk) / relSec);
  const e = Math.pow(2, (0.5 - curve) * 4);   // 4 (late swell) … 0.25 (early snap)
  return 1 - Math.pow(r, e);
}

export class Pump {
  private g = 1;             // smoothed gain
  private readonly a: number;

  constructor(sampleRate: number) {
    this.a = 1 - Math.exp(-1 / (0.0008 * sampleRate));   // ~1 ms: rounds the corners, keeps the snap
  }

  /**
   * Duck `n` samples in place. `beat0` is the beat position of the first
   * sample, `dBeat` the beats per sample, `stepBeats` the pump rate.
   */
  process(L: Float32Array, R: Float32Array, n: number, beat0: number, dBeat: number, stepBeats: number,
    amount: number, release: number, curve: number, tempo: number): void {
    const stepSec = stepBeats * 60 / tempo;
    const a = this.a;
    let g = this.g;
    for (let i = 0; i < n; i++) {
      const b = (beat0 + i * dBeat) / stepBeats;
      const target = 1 - amount * pumpDuck(b - Math.floor(b), stepSec, release, curve);
      g += (target - g) * a;
      L[i] *= g; R[i] *= g;
    }
    this.g = g;
  }
}

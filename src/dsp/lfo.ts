// Control-rate LFO. Shapes: sine, triangle, saw, square, sample & hold,
// and "drift" (smoothly interpolated random, the organic one). Output is
// bipolar -1..1.

import { Rng } from './util.ts';

export const LfoShape = { Sine: 0, Tri: 1, Saw: 2, Square: 3, SH: 4, Drift: 5 } as const;
export type LfoShape = (typeof LfoShape)[keyof typeof LfoShape];

export class LFO {
  private phase = 0;
  private rng: Rng;
  private held = 0;
  private prev = 0; private next = 0;   // for drift interpolation
  value = 0;

  constructor(seed: number, randomPhase = true) {
    this.rng = new Rng(seed);
    if (randomPhase) this.phase = this.rng.next();
    this.held = this.rng.bi();
    this.prev = this.rng.bi(); this.next = this.rng.bi();
  }

  reset(): void { this.phase = 0; }

  /** Advance by `dt` cycles (rate * seconds) and return the new value. */
  tick(shape: LfoShape, dt: number): number {
    let p = this.phase + dt;
    let wrapped = false;
    if (p >= 1) { p -= Math.floor(p); wrapped = true; }
    this.phase = p;
    let v: number;
    switch (shape) {
      case LfoShape.Sine: v = Math.sin(6.283185307 * p); break;
      case LfoShape.Tri: v = 4 * Math.abs(p - 0.5) - 1; v = -v; break;
      case LfoShape.Saw: v = 1 - 2 * p; break;
      case LfoShape.Square: v = p < 0.5 ? 1 : -1; break;
      case LfoShape.SH:
        if (wrapped) this.held = this.rng.bi();
        v = this.held; break;
      default: {
        if (wrapped) { this.prev = this.next; this.next = this.rng.bi(); }
        // smoothstep between two random values
        const t = p * p * (3 - 2 * p);
        v = this.prev + (this.next - this.prev) * t;
      }
    }
    this.value = v;
    return v;
  }
}

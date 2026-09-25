// ADSR with analogue-style RC curves: the attack charges towards a target
// above 1 (so it is convex and hits 1 in the given time, like a capacitor
// through a comparator), decay and release are exponential. Re-triggering
// starts from the current level, never from zero, so there are no clicks.

export const Stage = { Idle: 0, Attack: 1, Decay: 2, Sustain: 3, Release: 4 } as const;
export type Stage = (typeof Stage)[keyof typeof Stage];

export class ADSR {
  stage: Stage = Stage.Idle;
  value = 0;
  private ca = 0.1; private cd = 0.01; private cr = 0.01;
  private sus = 0.7;
  private readonly fs: number;
  private static readonly ATTACK_TARGET = 1.35;

  constructor(sampleRate: number) { this.fs = sampleRate; }

  set(attack: number, decay: number, sustain: number, release: number): void {
    const fs = this.fs;
    // attack: reach 1.0 (of a 1.35 target) after `attack` seconds
    this.ca = 1 - Math.exp(-Math.log(ADSR.ATTACK_TARGET / (ADSR.ATTACK_TARGET - 1)) / Math.max(1, attack * fs));
    // decay/release: get within 1% after the given time
    this.cd = 1 - Math.exp(-4.6 / Math.max(1, decay * fs));
    this.cr = 1 - Math.exp(-4.6 / Math.max(1, release * fs));
    this.sus = sustain;
  }

  gate(on: boolean): void {
    if (on) this.stage = Stage.Attack;
    else if (this.stage !== Stage.Idle) this.stage = Stage.Release;
  }

  get active(): boolean { return this.stage !== Stage.Idle; }

  /** Advance one sample and return the level. */
  tick(): number {
    switch (this.stage) {
      case Stage.Attack:
        this.value += (ADSR.ATTACK_TARGET - this.value) * this.ca;
        if (this.value >= 1) { this.value = 1; this.stage = Stage.Decay; }
        break;
      case Stage.Decay:
        this.value += (this.sus - this.value) * this.cd;
        if (Math.abs(this.value - this.sus) < 1e-4) this.stage = Stage.Sustain;
        break;
      case Stage.Sustain:
        // follow sustain knob movements gently
        this.value += (this.sus - this.value) * 0.001;
        break;
      case Stage.Release:
        this.value += (0 - this.value) * this.cr;
        if (this.value < 1e-4) { this.value = 0; this.stage = Stage.Idle; }
        break;
      default:
        break;
    }
    return this.value;
  }

  /** Advance `n` samples, return the level at the end (for control-rate use). */
  skip(n: number): number {
    let v = this.value;
    for (let i = 0; i < n; i++) v = this.tick();
    return v;
  }
}

// Growth sequencer. A key plants a seed; on every clock step each living
// seed spawns one (sometimes two) children a scale step away, a little
// quieter and one generation older, until the lineage dies out. Holding
// the key keeps re-planting when the lineage is gone, so a held chord is a
// garden that never repeats. Replaces the arpeggiator when it is on.

import { ARP_BEATS } from './arp.ts';

export const SCALES: { name: string; steps: number[] }[] = [
  { name: 'penta', steps: [0, 3, 5, 7, 10] },
  { name: 'major', steps: [0, 2, 4, 5, 7, 9, 11] },
  { name: 'minor', steps: [0, 2, 3, 5, 7, 8, 10] },
  { name: 'dorian', steps: [0, 2, 3, 5, 7, 9, 10] },
  { name: 'lydian', steps: [0, 2, 4, 6, 7, 9, 11] },
  { name: 'whole', steps: [0, 2, 4, 6, 8, 10] },
  { name: 'fifths', steps: [0, 7] },
  { name: 'chroma', steps: [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11] },
];

interface Seed { root: number; note: number; vel: number; gen: number; key: number }
interface Sounding { note: number; off: number }

export interface GardenOut {
  noteOn(note: number, velocity: number): void;
  noteOff(note: number): void;
}

export interface GardenParams {
  rateIdx: number; scaleIdx: number; life: number; branch: number;
  fade: number; reach: number; gate: number; tempo: number;
}

export class Garden {
  private seeds: Seed[] = [];
  private keys = new Map<number, number>();      // held key -> velocity (incl. pedal-held)
  private down = new Set<number>();              // keys physically pressed right now
  private sounding: Sounding[] = [];
  private countdown = 0;
  private rng = 777;
  private readonly fs: number;

  constructor(sampleRate: number) { this.fs = sampleRate; }

  private rand(): number {
    let x = this.rng; x ^= x << 13; x ^= x >>> 17; x ^= x << 5; this.rng = x | 0;
    return (x >>> 0) / 4294967296;
  }

  keyDown(note: number, vel: number): void {
    this.down.add(note);
    this.keys.set(note, vel);
    this.plant(note, vel);
  }

  keyUp(note: number, hold: boolean): void {
    this.down.delete(note);
    if (!hold) this.keys.delete(note);
  }

  /** Pedal released: forget pedal-held keys, keep the ones still physically down. */
  releaseHeld(): void {
    for (const note of this.keys.keys()) if (!this.down.has(note)) this.keys.delete(note);
  }

  private plant(note: number, vel: number): void {
    this.seeds.push({ root: note, note, vel, gen: 0, key: note });
    this.countdown = Math.min(this.countdown, 0);   // fire on the next chunk
  }

  get active(): boolean { return this.seeds.length > 0 || this.keys.size > 0; }

  stop(out: GardenOut): void {
    for (const s of this.sounding) out.noteOff(s.note);
    this.sounding = []; this.seeds = []; this.keys.clear(); this.down.clear(); this.countdown = 0;
  }

  /** Pick a child note: a scale tone (in the seed's key) within reach of the parent. */
  private child(seed: Seed, scale: number[], reach: number): number {
    const candidates: number[] = [];
    const lo = seed.note - 7, hi = seed.note + 7;
    for (let n = lo; n <= hi; n++) {
      if (n === seed.note) continue;
      const deg = ((n - seed.root) % 12 + 12) % 12;
      if (!scale.includes(deg)) continue;
      if (Math.abs(n - seed.root) > 12 * reach) continue;
      candidates.push(n);
    }
    if (candidates.length === 0) return seed.note;
    // bias towards small steps
    const weights = candidates.map((n) => 1 / (1 + Math.abs(n - seed.note) * 0.35));
    let r = this.rand() * weights.reduce((a, b) => a + b, 0);
    for (let i = 0; i < candidates.length; i++) { r -= weights[i]; if (r <= 0) return candidates[i]; }
    return candidates[candidates.length - 1];
  }

  process(n: number, gp: GardenParams, out: GardenOut): void {
    for (let i = this.sounding.length - 1; i >= 0; i--) {
      const s = this.sounding[i];
      s.off -= n;
      if (s.off <= 0) { out.noteOff(s.note); this.sounding.splice(i, 1); }
    }
    // re-seed held keys whose lineage has died
    for (const [note, vel] of this.keys) {
      if (!this.seeds.some((s) => s.key === note)) this.plant(note, vel);
    }
    if (this.seeds.length === 0) { this.countdown = 0; return; }
    this.countdown -= n;
    if (this.countdown > 0) return;
    const beat = ARP_BEATS[gp.rateIdx] ?? 0.5;
    const stepLen = beat * 60 / gp.tempo * this.fs;
    this.countdown += stepLen;
    if (this.countdown < 0) this.countdown = stepLen;
    const gateLen = Math.max(32, stepLen * gp.gate);
    const scale = SCALES[gp.scaleIdx]?.steps ?? SCALES[0].steps;
    const fire = (note: number, vel: number) => {
      if (note < 12 || note > 120) return;
      const existing = this.sounding.findIndex((s) => s.note === note);
      if (existing >= 0) { out.noteOff(note); this.sounding.splice(existing, 1); }
      out.noteOn(note, vel);
      this.sounding.push({ note, off: gateLen });
    };
    const next: Seed[] = [];
    for (const s of this.seeds) {
      fire(s.note, s.vel);
      if (s.gen >= gp.life - 1) continue;
      const kids = this.rand() < gp.branch ? 2 : 1;
      for (let k = 0; k < kids; k++) {
        const vel = s.vel * (1 - gp.fade);
        if (vel < 0.08) continue;
        next.push({ root: s.root, note: this.child(s, scale, gp.reach), vel, gen: s.gen + 1, key: s.key });
      }
    }
    // keep the garden from exploding
    if (next.length > 12) { next.sort((a, b) => b.vel - a.vel); next.length = 12; }
    this.seeds = next;
  }
}

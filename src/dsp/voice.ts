// One polyphonic voice: two oscillator banks + sub + noise -> stereo
// ladder filter -> VCA. Control signals (envelope 2, LFOs, glide) are
// evaluated every SUB samples; the amp envelope and the audio path run
// per sample.

import { OscBank, SubOsc, Noise } from './osc.ts';
import { Ladder } from './ladder.ts';
import { ADSR, Stage } from './env.ts';
import { LFO, LfoShape } from './lfo.ts';
import { midiToFreq, clamp } from './util.ts';
import {
  MOD_SLOTS, MOD_SRC_IDS, MOD_DST_IDS, MOD_AMT_IDS, MOD_DSTS,
  DST_PITCH, DST_SHAPE_A, DST_SHAPE_B, DST_SHAPE_BOTH, DST_WIDTH_A, DST_WIDTH_B, DST_DETUNE,
  DST_LEVEL_A, DST_LEVEL_B, DST_SUB, DST_NOISE, DST_CUTOFF, DST_RES, DST_DRIVE, DST_AMP, DST_PAN,
} from './params.ts';
import type { ParamValues } from './params.ts';

export const SUB = 16;

/** Per-block global modulation shared by all voices. */
export interface GlobalMod {
  lfo2: number;      // -1..1
  bend: number;      // semitones
  modWheel: number;  // 0..1, adds to LFO1 pitch depth
}

export class Voice {
  note = -1;
  velocity = 0;
  age = 0;            // samples since note-on, for stealing
  released = false;

  private oscA: OscBank;
  private oscB: OscBank;
  private sub = new SubOsc();
  private noise: Noise;
  private filtL: Ladder;
  private filtR: Ladder;
  ampEnv: ADSR;
  filtEnv: ADSR;
  private lfo1: LFO;
  private lfoAge = 0;
  private pitch = 60;         // current (glided) note, fractional
  private pitchTarget = 60;
  private bufL = new Float32Array(SUB);
  private bufR = new Float32Array(SUB);
  private readonly fs: number;
  private gainSm = 0;         // smoothed final gain (kills zipper from level/tremolo mods)

  // network modulation, written by the engine per chunk (all zero/one when the network is off)
  netCut = 0;      // octaves
  netPitch = 0;    // cents
  netAmp = 1;
  netInfl = 0;     // smoothed influence received, engine-owned
  lfo1Value = 0;   // last LFO 1 value, read by the engine for the network

  // modulation matrix: one accumulator per destination, refilled each control tick
  private mod = new Float32Array(MOD_DSTS.length);
  private modWasOn = false;   // so the accumulators get cleared once when it goes quiet
  private rnd = 0;            // one random value per note-on, as a matrix source

  constructor(sampleRate: number, seed: number) {
    this.fs = sampleRate;
    this.oscA = new OscBank(seed * 7 + 1);
    this.oscB = new OscBank(seed * 7 + 2);
    this.noise = new Noise(seed * 7 + 3);
    this.filtL = new Ladder(sampleRate);
    this.filtR = new Ladder(sampleRate);
    this.ampEnv = new ADSR(sampleRate);
    this.filtEnv = new ADSR(sampleRate);
    this.lfo1 = new LFO(seed * 7 + 4);
  }

  get active(): boolean { return this.ampEnv.active; }

  /**
   * Start (or, in legato mode, re-pitch) the voice. `glideFrom` is the note
   * to slide from; NaN means start at pitch. `retrigger` false keeps the
   * envelopes where they are (legato).
   */
  noteOn(note: number, velocity: number, p: ParamValues, glideFrom: number, retrigger: boolean): void {
    this.note = note;
    this.velocity = velocity;
    this.age = 0;
    this.released = false;
    this.pitchTarget = note;
    if (retrigger) this.rnd = Math.random() * 2 - 1;
    if (Number.isNaN(glideFrom) || p.glide <= 0) this.pitch = note;
    else this.pitch = glideFrom;
    if (retrigger) {
      const fresh = !this.ampEnv.active;
      this.ampEnv.gate(true);
      this.filtEnv.gate(true);
      this.lfoAge = 0;
      this.lfo1.reset();
      if (fresh) {
        this.oscA.start(); this.oscB.start(); this.sub.start();
        this.filtL.reset(); this.filtR.reset();
        this.gainSm = 0;
        this.updateControl(p, { lfo2: 0, bend: 0, modWheel: 0 }, true);
        this.filtL.snap(); this.filtR.snap();
      }
    }
  }

  noteOff(): void {
    this.released = true;
    this.ampEnv.gate(false);
    this.filtEnv.gate(false);
  }

  kill(): void {
    this.ampEnv.stage = Stage.Idle; this.ampEnv.value = 0;
    this.filtEnv.stage = Stage.Idle; this.filtEnv.value = 0;
    this.note = -1;
  }

  // control-rate values carried between updateControl and render
  private shapeA = 0.5; private pwA = 0.5; private shapeB = 0.5; private pwB = 0.5;
  private velGain = 1; private panL = 0.7071; private panR = 0.7071; private trem = 1;
  private drive = 0; private twoPole = false;
  private levA = 0.8; private levB = 0; private levSub = 0; private levNoise = 0;

  /**
   * Fill `this.mod` from the six matrix slots. Returns false — and leaves the
   * accumulators at zero — when no slot is doing anything, which is the
   * default, so the untouched path below costs one loop over six numbers.
   */
  private matrix(p: ParamValues, g: GlobalMod, env2: number, l1: number, l2: number): boolean {
    let on = false;
    for (let i = 0; i < MOD_SLOTS; i++) {
      if (p[MOD_AMT_IDS[i]] !== 0 && p[MOD_SRC_IDS[i]] >= 1) { on = true; break; }
    }
    if (!on) {
      if (this.modWasOn) { this.mod.fill(0); this.modWasOn = false; }
      return false;
    }
    const m = this.mod;
    m.fill(0);
    for (let i = 0; i < MOD_SLOTS; i++) {
      const amt = p[MOD_AMT_IDS[i]];
      const src = p[MOD_SRC_IDS[i]] | 0;
      if (amt === 0 || src < 1) continue;
      let s: number;
      switch (src) {
        case 1: s = l1; break;                                    // -1..1
        case 2: s = l2; break;                                    // -1..1
        case 3: s = this.ampEnv.value; break;                     //  0..1
        case 4: s = env2; break;                                  //  0..1
        case 5: s = this.velocity; break;                         //  0..1
        case 6: s = (this.note - 60) / 24; break;                 // -1..1 over four octaves
        case 7: s = g.modWheel; break;                            //  0..1
        case 8: s = p.bend > 0 ? g.bend / p.bend : 0; break;      // -1..1
        case 9: s = this.rnd; break;                              // -1..1, one per note
        default: s = Math.min(1, this.netInfl); break;            //  0..1
      }
      const x = s * amt;
      const dst = p[MOD_DST_IDS[i]] | 0;
      if (dst === DST_SHAPE_BOTH) { m[DST_SHAPE_A] += x; m[DST_SHAPE_B] += x; }
      else m[dst] += x;
    }
    this.modWasOn = true;
    return true;
  }

  private updateControl(p: ParamValues, g: GlobalMod, first: boolean): void {
    const fs = this.fs;
    const dtc = SUB / fs;
    // envelopes (filter env at control rate)
    this.ampEnv.set(p.aAtk, p.aDec, p.aSus, p.aRel);
    this.filtEnv.set(p.fAtk, p.fDec, p.fSus, p.fRel);
    const env2 = first ? this.filtEnv.value : this.filtEnv.skip(SUB);
    // LFO 1 with fade-in
    this.lfoAge += dtc;
    const fade = p.l1Fade > 0 ? Math.min(1, this.lfoAge / p.l1Fade) : 1;
    const l1 = this.lfo1.tick(p.l1Shape as LfoShape, p.l1Rate * dtc) * fade;
    this.lfo1Value = l1;
    const l2 = g.lfo2;
    // the matrix, before anything reads a parameter it can reach
    const m = this.mod;
    this.matrix(p, g, env2, l1, l2);
    // glide
    if (p.glide > 0) {
      const c = 1 - Math.exp(-dtc / (p.glide * 0.35));
      this.pitch += (this.pitchTarget - this.pitch) * c;
    } else this.pitch = this.pitchTarget;
    // pitch
    const vibrato = l1 * (p.l1Pitch + g.modWheel * 60) / 100;
    const base = this.pitch + g.bend + vibrato + this.netPitch / 100 + m[DST_PITCH] * 12;
    const detune = m[DST_DETUNE] * 60;
    const fA = midiToFreq(base + p.aOct * 12 + p.aSemi + p.aFine / 100);
    const fB = midiToFreq(base + p.bOct * 12 + p.bSemi + p.bFine / 100);
    this.oscA.setPitch(fA, fs, p.aUnison, clamp(p.aDetune + detune, 0, 60), p.spread, p.drift);
    this.oscB.setPitch(fB, fs, p.bUnison, clamp(p.bDetune + detune, 0, 60), p.spread, p.drift);
    this.sub.setPitch(midiToFreq(base - (p.subShape === 2 ? 24 : 12)), fs);
    // shape / width modulation
    this.shapeA = clamp(p.aShape + l2 * p.l2Shape2 * 0.5 + m[DST_SHAPE_A], 0, 1);
    this.shapeB = clamp(p.bShape + l2 * p.l2Shape2 * 0.5 + m[DST_SHAPE_B], 0, 1);
    const pwm = l1 * p.l1Pw * 0.45;
    this.pwA = clamp(p.aPw + pwm + m[DST_WIDTH_A] * 0.45, 0.05, 0.95);
    this.pwB = clamp(p.bPw - pwm + m[DST_WIDTH_B] * 0.45, 0.05, 0.95);
    // oscillator levels
    this.levA = clamp(p.aLevel + m[DST_LEVEL_A], 0, 1);
    this.levB = clamp(p.bLevel + m[DST_LEVEL_B], 0, 1);
    this.levSub = clamp(p.subLevel + m[DST_SUB], 0, 1) * 0.9;
    this.levNoise = clamp(p.noiseLevel + m[DST_NOISE], 0, 1);
    // filter cutoff, in octaves around the knob
    const vel = this.velocity;
    let oct = p.keyTrack * (this.note - 60) / 12
      + p.fEnv * env2 * 5
      + p.fVel * (vel - 0.75) * 4
      + p.l1Cut * l1 * 3
      + p.l2Cut * l2 * 3
      + m[DST_CUTOFF] * 5
      + this.netCut;
    const cutoff = clamp(p.cutoff * Math.pow(2, oct), 20, 18000);
    const res = clamp(p.res + m[DST_RES], 0, 1);
    this.filtL.set(cutoff, res);
    this.filtR.set(cutoff, res);
    this.drive = clamp(p.drive + m[DST_DRIVE], 0, 1);
    this.twoPole = p.fMode >= 0.5;
    // amp
    this.velGain = ((1 - p.ampVel) + p.ampVel * Math.pow(vel, 1.6)) * this.netAmp * clamp(1 + m[DST_AMP], 0, 2);
    this.trem = 1 - p.l2Amp * (l2 * 0.5 + 0.5);
    const pan = clamp(l2 * p.l2Pan + m[DST_PAN], -1, 1);
    const a = (pan + 1) * 0.25 * Math.PI;
    this.panL = Math.cos(a) * 1.4142; this.panR = Math.sin(a) * 1.4142;
  }

  /** Add `n` samples into outL/outR starting at index `start`. */
  render(outL: Float32Array, outR: Float32Array, start: number, n: number, p: ParamValues, g: GlobalMod): void {
    const bufL = this.bufL, bufR = this.bufR;
    let gain = this.gainSm;
    for (let off = start; off < start + n; off += SUB) {
      const count = Math.min(SUB, start + n - off);
      this.updateControl(p, g, false);
      bufL.fill(0, 0, count); bufR.fill(0, 0, count);
      this.oscA.render(bufL, bufR, count, this.shapeA, this.pwA, this.levA);
      this.oscB.render(bufL, bufR, count, this.shapeB, this.pwB, this.levB);
      this.sub.render(bufL, bufR, count, p.subShape | 0, this.levSub);
      this.noise.render(bufL, bufR, count, this.levNoise);
      this.filtL.process(bufL, count, this.drive, this.twoPole);
      this.filtR.process(bufR, count, this.drive, this.twoPole);
      const target = this.velGain * this.trem;
      const pl = this.panL, pr = this.panR;
      for (let s = 0; s < count; s++) {
        gain += (target - gain) * 0.002;
        const a = this.ampEnv.tick() * gain;
        outL[off + s] += bufL[s] * a * pl;
        outR[off + s] += bufR[s] * a * pr;
      }
      this.age += count;
    }
    this.gainSm = gain;
  }
}

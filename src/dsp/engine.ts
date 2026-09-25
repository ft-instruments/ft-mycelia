// The whole instrument: MIDI in, stereo audio out. Voice allocation
// (poly / mono / legato with glide), sustain pedal, arpeggiator, the
// global LFO, and the effect chain (high-pass -> ensemble -> tape delay ->
// hall reverb -> tape warmth -> DC block -> soft clip).
//
// Shaped like a plugin processor: construct with a sample rate, feed
// noteOn/noteOff/controlChange/pitchBend, call process(L, R, n).

import { Voice, type GlobalMod } from './voice.ts';
import { Arp, ARP_BEATS } from './arp.ts';
import { Garden } from './garden.ts';
import { Ensemble } from './chorus.ts';
import { TapeDelay } from './delay.ts';
import { Reverb } from './reverb.ts';
import { LFO, LfoShape } from './lfo.ts';
import { DCBlock, OnePoleHP, softClip, tanhf } from './util.ts';
import { defaults, PARAM_BY_ID, type ParamId, type ParamValues } from './params.ts';

const MAX_VOICES = 16;
const CHUNK = 32;
const DELAY_BEATS = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2];   // matches DELAY_TIMES

export class MyceliaEngine {
  readonly p: ParamValues = defaults();
  private voices: Voice[] = [];
  private arp: Arp;
  private garden: Garden;
  /** Notes started by the garden / arp, for the UI (optional). */
  onNote: ((note: number, velocity: number) => void) | null = null;
  private pe: ParamValues | null = null;   // effective params when rot / climate are active
  private rotAge = 0;                       // seconds of audio rendered since the last reset
  private ensemble: Ensemble;
  private delay: TapeDelay;
  private reverb: Reverb;
  private lfo2 = new LFO(99, false);
  private hpL: OnePoleHP; private hpR: OnePoleHP;
  private dcL: DCBlock; private dcR: DCBlock;
  private gm: GlobalMod = { lfo2: 0, bend: 0, modWheel: 0 };
  private bendNorm = 0;
  private sustain = false;
  private sustained = new Set<Voice>();
  private monoStack: { note: number; vel: number }[] = [];
  private lastNote = NaN;
  private hpHz = -1;
  private readonly fs: number;
  private arpOut = {
    noteOn: (n: number, v: number) => { this.voiceOn(n, v); this.onNote?.(n, v); },
    noteOff: (n: number) => this.voiceOff(n),
  };

  /** Peak level of the last block (for meters). */
  peakL = 0; peakR = 0;
  /** Recent mono output for a scope; ring buffer. */
  readonly scope = new Float32Array(1024);
  private scopeIdx = 0;

  constructor(sampleRate: number) {
    this.fs = sampleRate;
    for (let i = 0; i < MAX_VOICES; i++) this.voices.push(new Voice(sampleRate, i + 1));
    this.arp = new Arp(sampleRate);
    this.garden = new Garden(sampleRate);
    this.ensemble = new Ensemble(sampleRate);
    this.delay = new TapeDelay(sampleRate);
    this.reverb = new Reverb(sampleRate);
    this.hpL = new OnePoleHP(sampleRate, 20);
    this.hpR = new OnePoleHP(sampleRate, 20);
    this.dcL = new DCBlock(sampleRate);
    this.dcR = new DCBlock(sampleRate);
  }

  get activeVoices(): number {
    let c = 0;
    for (const v of this.voices) if (v.active) c++;
    return c;
  }

  get arpOn(): boolean { return this.p.arpMode >= 1 && this.p.gardenOn < 0.5; }
  get gardenOn(): boolean { return this.p.gardenOn >= 0.5; }

  // ---------------------------------------------------------------- params

  setParam(id: ParamId, value: number): void {
    const def = PARAM_BY_ID[id];
    if (!def) return;
    const v = Math.min(def.max, Math.max(def.min, value));
    if (id === 'arpMode' && v < 1 && this.p.arpMode >= 1) this.arp.stop(this.arpOut);
    if (id === 'gardenOn' && v < 0.5 && this.p.gardenOn >= 0.5) this.garden.stop(this.arpOut);
    if (id === 'gardenOn' && v >= 0.5 && this.p.gardenOn < 0.5) this.arp.stop(this.arpOut);
    if (id === 'rot' || id === 'rotAuto') this.rotAge = 0;
    if (id === 'voiceMode' && v !== this.p.voiceMode) this.allNotesOff();
    this.p[id] = v;
  }

  setParams(values: Partial<ParamValues>): void {
    for (const id in values) this.setParam(id, values[id]!);
  }

  /** Replace every parameter (preset load). Missing ids go to their default. */
  loadPreset(values: Partial<ParamValues>): void {
    const d = defaults();
    for (const id in d) this.setParam(id, values[id] ?? d[id]);
  }

  // ------------------------------------------------------------------ MIDI

  noteOn(note: number, velocity: number): void {
    if (velocity <= 0) { this.noteOff(note); return; }
    const vel = Math.min(1, velocity / 127);
    if (this.gardenOn) this.garden.keyDown(note, vel);
    else if (this.arpOn) this.arp.keyDown(note, vel, this.p.arpHold >= 0.5 || this.sustain);
    else this.voiceOn(note, vel);
  }

  noteOff(note: number): void {
    if (this.gardenOn) this.garden.keyUp(note, this.sustain);
    else if (this.arpOn) this.arp.keyUp(note, this.p.arpHold >= 0.5 || this.sustain);
    else this.voiceOff(note);
  }

  controlChange(cc: number, value: number): void {
    switch (cc) {
      case 1: this.gm.modWheel = value / 127; break;
      case 64: {
        const on = value >= 64;
        if (on === this.sustain) break;
        this.sustain = on;
        if (!on) {
          for (const v of this.sustained) if (v.active && !v.released) v.noteOff();
          this.sustained.clear();
          if (this.arpOn && this.p.arpHold < 0.5) this.arp.release();
          if (this.gardenOn) this.garden.releaseHeld();
        }
        break;
      }
      case 120: case 123: this.allNotesOff(); break;
      default: break;
    }
  }

  /** -1..1 */
  pitchBend(v: number): void { this.bendNorm = Math.max(-1, Math.min(1, v)); }

  allNotesOff(): void {
    this.arp.stop(this.arpOut);
    this.garden.stop(this.arpOut);
    for (const v of this.voices) if (v.active && !v.released) v.noteOff();
    this.sustained.clear();
    this.monoStack = [];
  }

  panic(): void {
    this.allNotesOff();
    for (const v of this.voices) v.kill();
    this.ensemble.clear(); this.delay.clear(); this.reverb.clear();
    this.rotAge = 0;
  }

  // ------------------------------------------------------- "on top" layers

  /**
   * The parameters the voices and effects actually see: `p` with rot and
   * climate applied. Returns `p` itself when both are off, so the default
   * path is untouched.
   */
  private effective(n: number): ParamValues {
    const p = this.p;
    this.rotAge += n / this.fs;
    const rot = Math.min(1, p.rot + (p.rotAuto > 0 ? this.rotAge / (p.rotAuto * 60) : 0));
    const cl = p.climate | 0, ca = p.climateAmt;
    if (rot <= 0 && (cl === 0 || ca <= 0)) return p;
    const e = this.pe ?? (this.pe = { ...p });
    for (const id in p) e[id] = p[id];
    if (rot > 0) {
      // the patch ages: detunes, dulls, blurs, warms, hisses
      e.drift = Math.min(1, e.drift + rot * 0.6);
      e.cutoff *= Math.pow(2, -rot * 1.8);
      e.chTone = Math.max(0, e.chTone - rot * 0.4);
      e.rvDecay = Math.min(30, e.rvDecay * (1 + rot * 3));
      e.rvTone = Math.max(0, e.rvTone - rot * 0.3);
      e.rvMix = Math.min(1, e.rvMix + rot * 0.2);
      e.dlTone = Math.max(0, e.dlTone - rot * 0.3);
      e.warmth = Math.min(1, e.warmth + rot * 0.4);
      e.noiseLevel = Math.min(1, e.noiseLevel + rot * 0.06);
      e.aAtk = Math.min(10, e.aAtk * (1 + rot * 4));
      e.aRel = Math.min(15, e.aRel * (1 + rot * 2));
      e.res = Math.max(0, e.res - rot * 0.15);
    }
    if (cl > 0 && ca > 0) {
      switch (cl) {
        case 1: // sun: bright, open, steady
          e.cutoff *= Math.pow(2, 0.7 * ca); e.chDepth = Math.min(1, e.chDepth + 0.25 * ca); e.chMix = Math.min(1, e.chMix + 0.15 * ca);
          e.rvTone = Math.min(1, e.rvTone + 0.3 * ca); e.drift = Math.max(0, e.drift - 0.25 * ca); e.warmth = Math.min(1, e.warmth + 0.1 * ca);
          break;
        case 2: // rain: thinner, wetter, hiss and echoes
          e.hpf = Math.min(2000, e.hpf * Math.pow(2, 2.5 * ca)); e.cutoff *= Math.pow(2, -0.3 * ca);
          e.dlMix = Math.min(1, e.dlMix + 0.3 * ca); e.dlFb = Math.min(0.95, e.dlFb + 0.15 * ca);
          e.rvDecay = Math.min(30, e.rvDecay * (1 + 0.8 * ca)); e.noiseLevel = Math.min(1, e.noiseLevel + 0.04 * ca);
          e.l2Pan = Math.min(1, e.l2Pan + 0.4 * ca);
          break;
        case 3: // night: dark, wide, distant
          e.cutoff *= Math.pow(2, -1.2 * ca); e.rvMix = Math.min(1, e.rvMix + 0.3 * ca); e.rvDecay = Math.min(30, e.rvDecay * (1 + 2 * ca));
          e.rvSize = Math.min(1, e.rvSize + 0.3 * ca); e.spread = Math.min(1, e.spread + 0.3 * ca); e.warmth = Math.min(1, e.warmth + 0.2 * ca);
          e.aAtk = Math.min(10, e.aAtk * (1 + 3 * ca)); e.volume *= 1 - 0.15 * ca;
          break;
        default: // storm: driven, unstable, resonant
          e.drive = Math.min(1, e.drive + 0.45 * ca); e.res = Math.min(1, e.res + 0.25 * ca); e.drift = Math.min(1, e.drift + 0.5 * ca);
          e.l1Cut = Math.max(-1, Math.min(1, e.l1Cut + 0.35 * ca)); e.dlFb = Math.min(0.95, e.dlFb + 0.25 * ca);
          e.l2Amp = Math.min(1, e.l2Amp + 0.25 * ca); e.rvShimmer = Math.min(1, e.rvShimmer + 0.2 * ca);
          break;
      }
    }
    return e;
  }

  /**
   * Network: each voice receives the "energy" of the others, weighted by
   * how close they are in pitch, pulsing with their LFO 1. The received
   * influence opens/closes its filter, pushes its pitch away from (or
   * towards) the chord's centre, and dims it when crowded.
   */
  private network(p: ParamValues): void {
    const amount = p.netAmount;
    const voices = this.voices;
    if (amount <= 0) {
      for (const v of voices) { v.netCut = 0; v.netPitch = 0; v.netAmp = 1; v.netInfl = 0; }
      return;
    }
    const range = p.netRange;
    let centre = 0, count = 0;
    for (const v of voices) if (v.active) { centre += v.note; count++; }
    if (count === 0) return;
    centre /= count;
    for (const v of voices) {
      if (!v.active) { v.netInfl = 0; v.netCut = 0; v.netPitch = 0; v.netAmp = 1; continue; }
      let infl = 0;
      for (const o of voices) {
        if (o === v || !o.active) continue;
        const w = Math.exp(-Math.abs(v.note - o.note) / range);
        infl += w * o.ampEnv.value * (0.5 + 0.5 * o.lfo1Value);
      }
      v.netInfl += (infl - v.netInfl) * 0.04;
      const x = Math.min(2, v.netInfl) * amount;
      v.netCut = p.netCut * x * 1.5;
      v.netPitch = p.netPitch * x * (v.note >= centre ? 1 : -1);
      v.netAmp = 1 / (1 + p.netDim * x * 1.5);
    }
  }

  // --------------------------------------------------------- allocation

  private voiceOn(note: number, vel: number): void {
    const p = this.p;
    const mode = p.voiceMode | 0;
    const glideFrom = p.glide > 0 ? this.lastNote : NaN;
    if (mode === 0) {
      const v = this.allocate(note);
      v.noteOn(note, vel, p, glideFrom, true);
      this.sustained.delete(v);
    } else {
      // mono / legato: voice 0 only, with a stack of held keys
      this.monoStack = this.monoStack.filter((h) => h.note !== note);
      this.monoStack.push({ note, vel });
      const v = this.voices[0];
      const legato = mode === 2 && v.active && !v.released;
      v.noteOn(note, vel, p, glideFrom, !legato);
      this.sustained.delete(v);
    }
    this.lastNote = note;
  }

  private voiceOff(note: number): void {
    const mode = this.p.voiceMode | 0;
    if (mode === 0) {
      for (const v of this.voices) {
        if (v.note !== note || !v.active || v.released) continue;
        if (this.sustain) this.sustained.add(v); else v.noteOff();
      }
    } else {
      this.monoStack = this.monoStack.filter((h) => h.note !== note);
      const v = this.voices[0];
      if (v.note !== note || !v.active) return;
      if (this.monoStack.length > 0) {
        const back = this.monoStack[this.monoStack.length - 1];
        v.noteOn(back.note, back.vel, this.p, this.p.glide > 0 ? note : NaN, mode === 1 ? true : false);
        this.lastNote = back.note;
      } else if (this.sustain) this.sustained.add(v);
      else v.noteOff();
    }
  }

  private allocate(note: number): Voice {
    const limit = Math.max(1, Math.min(MAX_VOICES, this.p.poly | 0));
    // same note still sounding: reuse it
    for (let i = 0; i < limit; i++) { const v = this.voices[i]; if (v.active && v.note === note && !v.released) return v; }
    for (let i = 0; i < limit; i++) if (!this.voices[i].active) return this.voices[i];
    // steal: quietest released voice, else the oldest
    let best: Voice | null = null, bestScore = Infinity;
    for (let i = 0; i < limit; i++) {
      const v = this.voices[i];
      const score = v.released ? v.ampEnv.value : 10 - v.age * 1e-6;
      if (score < bestScore) { bestScore = score; best = v; }
    }
    return best ?? this.voices[0];
  }

  // ---------------------------------------------------------------- audio

  process(L: Float32Array, R: Float32Array, n: number): void {
    const p = this.effective(n);
    L.fill(0, 0, n); R.fill(0, 0, n);
    const gm = this.gm;
    gm.bend = this.bendNorm * p.bend;
    const arpOn = this.arpOn, gardenOn = this.gardenOn;
    for (let off = 0; off < n; off += CHUNK) {
      const count = Math.min(CHUNK, n - off);
      if (gardenOn) this.garden.process(count, { rateIdx: p.gardenRate | 0, scaleIdx: p.gardenScale | 0, life: p.gardenLife | 0, branch: p.gardenBranch, fade: p.gardenFade, reach: p.gardenReach | 0, gate: p.gardenGate, tempo: p.tempo }, this.arpOut);
      else if (arpOn) this.arp.process(count, p.arpMode | 0, p.arpRate | 0, p.arpOct | 0, p.arpGate, p.arpSwing, p.tempo, this.arpOut);
      this.network(p);
      gm.lfo2 = this.lfo2.tick(p.l2Shape as LfoShape, p.l2Rate * count / this.fs);
      for (const v of this.voices) if (v.active) v.render(L, R, off, count, p, gm);
    }
    // voice sum trim, high-pass
    if (p.hpf !== this.hpHz) { this.hpHz = p.hpf; this.hpL.set(this.fs, p.hpf); this.hpR.set(this.fs, p.hpf); }
    const trim = 0.5;
    for (let i = 0; i < n; i++) {
      L[i] = this.hpL.tick(L[i] * trim);
      R[i] = this.hpR.tick(R[i] * trim);
    }
    // effects
    this.ensemble.process(L, R, n, p.chRate, p.chDepth, p.chTone, p.chMix);
    const dlSeconds = (DELAY_BEATS[p.dlTime | 0] ?? 0.5) * 60 / p.tempo;
    this.delay.process(L, R, n, dlSeconds, p.dlFb, p.dlTone, p.dlPing >= 0.5, p.dlMix);
    this.reverb.process(L, R, n, p.rvSize, p.rvDecay, p.rvTone, p.rvShimmer, p.rvMix);
    // tape warmth, volume, DC, safety clip
    const drive = 1 + p.warmth * 2.2;
    const makeup = (1 / tanhf(drive * 0.5)) * 0.5;   // unity-ish at -6 dB
    const vol = p.volume * p.volume * 1.6;
    let pl = 0, pr = 0;
    const scope = this.scope; let si = this.scopeIdx;
    for (let i = 0; i < n; i++) {
      let l = tanhf(L[i] * drive) * makeup;
      let r = tanhf(R[i] * drive) * makeup;
      l = softClip(this.dcL.tick(l * vol));
      r = softClip(this.dcR.tick(r * vol));
      L[i] = l; R[i] = r;
      const al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > pl) pl = al; if (ar > pr) pr = ar;
      scope[si] = (l + r) * 0.5; si = (si + 1) & 1023;
    }
    this.scopeIdx = si;
    this.peakL = pl; this.peakR = pr;
  }

  /** Beats per arp step, for UI blinking. */
  static arpBeats(rateIdx: number): number { return ARP_BEATS[rateIdx] ?? 0.25; }
}

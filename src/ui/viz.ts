// The picture in each module: what the controls are doing, drawn from the
// parameters with the same maths the DSP uses (the oscillator morph, the RC
// envelope curves, the LFO shapes, the ladder's response). Redrawn when a
// value changes, never per audio block.

import { type ParamValues, LFO_SYNCS, LFO_SYNC_BEATS, PUMP_RATES, PUMP_BEATS } from '../dsp/params.ts';
import { pumpDuck } from '../dsp/pump.ts';

type Draw = (g: Pen, v: ParamValues) => void;

/** A canvas drawing helper with the module's accent and a glow. */
class Pen {
  constructor(public ctx: CanvasRenderingContext2D, public w: number, public h: number, public rgb: string) {}
  c(a: number): string { return `rgba(${this.rgb}, ${a})`; }

  grid(cols: number, rows = 2): void {
    const { ctx, w, h } = this;
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.09)'; ctx.lineWidth = 1;
    ctx.setLineDash([1, 3]);
    ctx.beginPath();
    for (let i = 1; i < cols; i++) { const x = Math.round((i / cols) * w) + 0.5; ctx.moveTo(x, 0); ctx.lineTo(x, h); }
    for (let j = 1; j < rows; j++) { const y = Math.round((j / rows) * h) + 0.5; ctx.moveTo(0, y); ctx.lineTo(w, y); }
    ctx.stroke();
    ctx.setLineDash([]);
  }

  /** A glowing line through the points, with a fading fill down to `base`. */
  trace(pts: [number, number][], opts: { base?: number; alpha?: number; width?: number; fill?: boolean; dash?: number[] } = {}): void {
    if (pts.length < 2) return;
    const { ctx } = this;
    const alpha = opts.alpha ?? 1;
    if (opts.fill !== false && opts.base !== undefined) {
      const grad = ctx.createLinearGradient(0, 0, 0, this.h);
      grad.addColorStop(0, this.c(0.28 * alpha));
      grad.addColorStop(1, this.c(0));
      ctx.fillStyle = grad;
      ctx.beginPath();
      ctx.moveTo(pts[0][0], opts.base);
      for (const [x, y] of pts) ctx.lineTo(x, y);
      ctx.lineTo(pts[pts.length - 1][0], opts.base);
      ctx.closePath(); ctx.fill();
    }
    ctx.setLineDash(opts.dash ?? []);
    ctx.lineJoin = 'miter'; ctx.lineCap = 'butt';
    ctx.beginPath();
    pts.forEach(([x, y], i) => (i ? ctx.lineTo(x, y) : ctx.moveTo(x, y)));
    ctx.shadowColor = this.c(0.9 * alpha); ctx.shadowBlur = 6;
    ctx.strokeStyle = this.c(alpha); ctx.lineWidth = opts.width ?? 1.7;
    ctx.stroke();
    ctx.shadowBlur = 0; ctx.setLineDash([]);
  }

  dot(x: number, y: number, r = 3, a = 1): void {
    const { ctx } = this;
    ctx.shadowColor = this.c(1); ctx.shadowBlur = 12;
    ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fillRect(x - r, y - r, r * 2, r * 2);
    ctx.shadowBlur = 0;
  }

  bar(x: number, y: number, w: number, h: number, a = 1): void {
    const { ctx } = this;
    const grad = ctx.createLinearGradient(0, y, 0, y + h);
    grad.addColorStop(0, this.c(0.95 * a));
    grad.addColorStop(1, this.c(0.15 * a));
    ctx.shadowColor = this.c(0.8 * a); ctx.shadowBlur = 8;
    ctx.fillStyle = grad;
    ctx.fillRect(x, y, w, Math.max(1, h));
    ctx.shadowBlur = 0;
  }

  text(s: string, x: number, y: number, align: CanvasTextAlign = 'left', a = 0.5): void {
    const { ctx } = this;
    ctx.font = '500 9px "Geist Mono", "FT Symbols", ui-monospace, monospace';
    s = s.toUpperCase();
    ctx.textAlign = align; ctx.fillStyle = `rgba(255, 255, 255, ${a})`;
    ctx.fillText(s, x, y);
  }
}

// ---- small maths shared with the DSP ------------------------------------------

/** One sample of the tri -> saw -> pulse morph at phase t (osc.ts, without the BLEPs). */
function oscSample(t: number, shape: number, pw: number): number {
  let wTri = 0, wSaw = 0, wPul = 0;
  if (shape < 0.5) { wSaw = shape * 2; wTri = 1 - wSaw; } else { wPul = (shape - 0.5) * 2; wSaw = 1 - wPul; }
  const pulseDC = pw + pw - 1;
  return wSaw * (t + t - 1) + wPul * ((t < pw ? 1 : -1) - pulseDC) + wTri * (4 * Math.abs(t - 0.5) - 1);
}

/** The RC-curved ADSR (env.ts) as a polyline across the width. */
function envelope(a: number, d: number, s: number, r: number, w: number, h: number, pad: number): [number, number][] {
  // widths follow the square root of each stage so a 2 ms attack and a 10 s
  // release both stay readable; the held part is a fixed slice
  const sa = Math.sqrt(a), sd = Math.sqrt(d), sr = Math.sqrt(r);
  const hold = 0.18;
  const k = (1 - hold) / (sa + sd + sr);
  const wa = sa * k * w, wd = sd * k * w, wh = hold * w, wr = sr * k * w;
  const y = (lvl: number) => h - pad - lvl * (h - pad * 2);
  const pts: [number, number][] = [];
  const T = 1.35, n = 24;
  for (let i = 0; i <= n; i++) {                       // attack: charging towards 1.35, reaching 1 at the end
    const u = i / n;
    const lvl = T * (1 - Math.pow((T - 1) / T, u));
    pts.push([u * wa, y(Math.min(1, lvl))]);
  }
  for (let i = 1; i <= n; i++) {                       // decay: within 1 % of sustain at the end
    const u = i / n;
    pts.push([wa + u * wd, y(s + (1 - s) * Math.exp(-4.6 * u))]);
  }
  pts.push([wa + wd + wh, y(s)]);
  for (let i = 1; i <= n; i++) {                       // release
    const u = i / n;
    pts.push([wa + wd + wh + u * wr, y(s * Math.exp(-4.6 * u))]);
  }
  return pts;
}

function lfoSample(shape: number, p: number, seed: number): number {
  const rnd = (i: number) => { const x = Math.sin((i + 1) * 12.9898 + seed * 78.233) * 43758.5453; return (x - Math.floor(x)) * 2 - 1; };
  switch (shape) {
    case 0: return Math.sin(6.283185307 * p);
    case 1: return -(4 * Math.abs((p % 1) - 0.5) - 1);
    case 2: return 1 - 2 * (p % 1);
    case 3: return (p % 1) < 0.5 ? 1 : -1;
    case 4: return rnd(Math.floor(p * 2));
    default: {
      const i = Math.floor(p * 1.5), f = p * 1.5 - i, t = f * f * (3 - 2 * f);
      return rnd(i) + (rnd(i + 1) - rnd(i)) * t;
    }
  }
}

// ---- the pictures ----------------------------------------------------------------

const osc = (pre: 'a' | 'b'): Draw => (g, v) => {
  const { w, h } = g;
  g.grid(4);
  const shape = v[`${pre}Shape`], pw = v[`${pre}Pw`], uni = Math.round(v[`${pre}Unison`]), det = v[`${pre}Detune`];
  const lvl = Math.max(0.12, v[`${pre}Level`]);
  const amp = (h / 2 - 8) * lvl, mid = h / 2;
  const cycles = 2, n = 220;
  // the unison copies: a little out of phase and pitch, fainter
  for (let u = 0; u < uni; u++) {
    if (uni === 1) break;
    const pos = (u / (uni - 1)) * 2 - 1;
    const stretch = 1 + pos * det * 0.0009, off = pos * 0.07;
    const pts: [number, number][] = [];
    for (let i = 0; i <= n; i++) {
      const x = (i / n) * w;
      const t = (((i / n) * cycles * stretch + off) % 1 + 1) % 1;
      pts.push([x, mid - oscSample(t, shape, pw) * amp * 0.92]);
    }
    g.trace(pts, { alpha: 0.22, width: 1, fill: false });
  }
  const pts: [number, number][] = [];
  for (let i = 0; i <= n; i++) {
    const t = ((i / n) * cycles) % 1;
    pts.push([(i / n) * w, mid - oscSample(t, shape, pw) * amp]);
  }
  g.trace(pts, { base: mid, alpha: v[`${pre}Level`] > 0 ? 1 : 0.35 });
  g.text(['tri', 'saw', 'pulse'][Math.round(shape * 2)] + (uni > 1 ? ` ×${uni}` : ''), w - 8, 13, 'right');
};

const mix: Draw = (g, v) => {
  const { w, h } = g;
  const src = [['A', v.aLevel], ['B', v.bLevel], ['sub', v.subLevel], ['noise', v.noiseLevel]] as const;
  const bw = Math.min(34, w / 7), gap = (w - bw * src.length) / (src.length + 1);
  src.forEach(([name, lvl], i) => {
    const x = gap + i * (bw + gap);
    const top = 8, full = h - 26;
    g.ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
    g.ctx.fillRect(x, top, bw, full);
    g.bar(x, top + full * (1 - lvl), bw, full * lvl, lvl > 0 ? 1 : 0.3);
    g.text(name, x + bw / 2, h - 6, 'center', 0.55);
  });
};

const filter: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(6, 3);
  const fmin = 20, fmax = 20000, lmin = Math.log(fmin), lmax = Math.log(fmax);
  const xOf = (f: number) => ((Math.log(f) - lmin) / (lmax - lmin)) * w;
  const top = 10, dbTop = 18, dbBot = -48;
  const yOf = (db: number) => top + ((dbTop - Math.max(dbBot, Math.min(dbTop, db))) / (dbTop - dbBot)) * (h - top - 4);
  const fc = v.cutoff, k = v.res * 3.9, two = Math.round(v.fMode) === 1, fh = v.hpf;
  // the envelope's reach: where the cutoff travels on a full hit
  const reach = fc * Math.pow(2, v.fEnv * 5);
  const x0 = xOf(Math.min(fc, reach)), x1 = xOf(Math.max(fc, Math.min(fmax, reach)));
  if (Math.abs(x1 - x0) > 2) {
    const grad = g.ctx.createLinearGradient(x0, 0, x1, 0);
    grad.addColorStop(0, g.c(v.fEnv >= 0 ? 0.02 : 0.14));
    grad.addColorStop(1, g.c(v.fEnv >= 0 ? 0.14 : 0.02));
    g.ctx.fillStyle = grad; g.ctx.fillRect(x0, 0, x1 - x0, h);
  }
  const pts: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const f = Math.exp(lmin + (i / 200) * (lmax - lmin));
    const s = f / fc;
    // (1 + jw)^n + k, the ladder's loop with its resonance feedback
    const n = two ? 2 : 4;
    const mag = Math.hypot(1, s), ph = Math.atan(s) * n;
    const re = Math.pow(mag, n) * Math.cos(ph) + k * (two ? 0.5 : 1), im = Math.pow(mag, n) * Math.sin(ph);
    let db = 20 * Math.log10((1 + k * (two ? 0.5 : 1)) / Math.hypot(re, im));
    const q = f / fh;                                       // the high-pass under it
    db += 20 * Math.log10((q * q) / Math.sqrt(1 + q * q * q * q));
    pts.push([xOf(f), yOf(db)]);
  }
  g.trace(pts, { base: h });
  g.dot(xOf(fc), Math.min(h - 6, yOf(0) - (v.res > 0.2 ? 4 : 0)), 3);
  g.text(fc >= 1000 ? `${(fc / 1000).toFixed(1)} k` : `${Math.round(fc)} Hz`, w - 8, 13, 'right');
};

const env: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(5);
  const pad = 8;
  const filt = envelope(v.fAtk, v.fDec, v.fSus, v.fRel, w, h, pad);
  g.trace(filt, { alpha: 0.35, width: 1.2, fill: false, dash: [3, 4] });
  const amp = envelope(v.aAtk, v.aDec, v.aSus, v.aRel, w, h, pad);
  g.trace(amp, { base: h });
  g.text('amp', w - 58, 13, 'right', 0.65);
  g.text('- - filter', w - 8, 13, 'right', 0.4);
};

const voicing: Draw = (g, v) => {
  const { w, h } = g;
  const poly = Math.round(v.poly), mode = Math.round(v.voiceMode);
  const used = mode === 0 ? poly : 1;
  const cols = 8, r = Math.min(6, h / 7), gx = w / (cols + 1), gy = h / 3;
  for (let i = 0; i < 16; i++) {
    const x = gx * (1 + (i % cols)), y = gy * (1 + Math.floor(i / cols));
    if (i < used) g.dot(x, y, r * 0.8, 0.9);
    else { g.ctx.fillStyle = 'rgba(255, 255, 255, 0.07)'; g.ctx.beginPath(); g.ctx.arc(x, y, r * 0.8, 0, Math.PI * 2); g.ctx.fill(); }
  }
  g.text(['poly', 'mono', 'legato'][mode] + (v.glide > 0.001 ? ' · glide' : ''), w - 8, h - 6, 'right');
};

const lfo = (n: 1 | 2): Draw => (g, v) => {
  const { w, h } = g;
  g.grid(4);
  const shape = Math.round(v[`l${n}Shape`]), sync = Math.round(v[`l${n}Sync`]);
  const rate = sync > 0 ? v.tempo / (60 * LFO_SYNC_BEATS[sync]) : v[`l${n}Rate`];
  const cycles = Math.max(1, Math.min(6, Math.round(1 + Math.log2(1 + rate))));
  const pts: [number, number][] = [];
  const fade = n === 1 ? v.l1Fade : 0;
  for (let i = 0; i <= 260; i++) {
    const u = i / 260;
    const f = fade > 0 ? Math.min(1, (u * 3) / Math.max(0.2, fade)) : 1;   // the fade-in, over ~3 s of screen
    pts.push([u * w, h / 2 - lfoSample(shape, u * cycles, n) * (h / 2 - 9) * f]);
  }
  g.trace(pts, { base: h / 2 });
  g.text(sync > 0 ? `${LFO_SYNCS[sync]} · ${Math.round(v.tempo)} bpm` : `${rate >= 1 ? rate.toFixed(1) : rate.toFixed(2)} Hz`, w - 8, 13, 'right');
};

/** Two bars of the pump's gain, a beat line per step. */
const pump: Draw = (g, v) => {
  const { w, h } = g;
  const rate = Math.round(v.pumpRate), beats = PUMP_BEATS[rate] ?? 1;
  const steps = Math.round(8 / beats);
  g.grid(Math.min(16, steps), 1);
  const stepSec = beats * 60 / v.tempo, amt = v.pumpAmt, on = amt > 0;
  const shown = on ? amt : 0.8;   // off: draw the shape faintly, so the curve can be set first
  const pts: [number, number][] = [];
  for (let i = 0; i <= 400; i++) {
    const u = (i / 400) * steps;
    const gain = 1 - shown * pumpDuck(u - Math.floor(u), stepSec, v.pumpRel, v.pumpCurve);
    pts.push([(i / 400) * w, h - 6 - gain * (h - 18)]);
  }
  g.trace(pts, { base: h, alpha: on ? 1 : 0.35 });
  g.text(on ? `${PUMP_RATES[rate]} · ${v.pumpWhere >= 0.5 ? 'dry' : 'all'}` : 'off', w - 8, 13, 'right', on ? 0.6 : 0.35);
};

const arp: Draw = (g, v) => {
  const { w, h } = g;
  const mode = Math.round(v.arpMode), oct = Math.round(v.arpOct), gate = v.arpGate, swing = v.arpSwing;
  const steps = 16, sw = w / steps;
  g.grid(4, 1);
  if (mode === 0) { g.text('off — hold a chord with the arp on', w / 2, h / 2 + 3, 'center', 0.4); return; }
  const chord = [0, 4, 7];                                    // a triad, for the picture
  const seq: number[] = [];
  for (let o = 0; o < oct; o++) for (const n of chord) seq.push(n + o * 12);
  const top = seq[seq.length - 1] || 1;
  for (let i = 0; i < steps; i++) {
    let n: number;
    const L = seq.length;
    if (mode === 1 || mode === 5) n = seq[i % L];
    else if (mode === 2) n = seq[L - 1 - (i % L)];
    else if (mode === 3) { const p = (2 * L - 2) || 1, k = i % p; n = seq[k < L ? k : p - k]; }
    else if (mode === 4) n = seq[Math.floor(Math.abs(Math.sin(i * 91.7) * 1000)) % L];
    else n = -1;                                               // chord: everything at once
    const x = i * sw + (i % 2 ? swing * sw * 0.5 : 0) + 2;
    if (n < 0) {
      for (const c of chord) { const y = h - 8 - ((c + 1) / 13) * (h - 20); g.bar(x, y, Math.max(2, sw * gate - 3), 4, 0.9); }
    } else {
      const y = h - 8 - ((n + 1) / (top + 1)) * (h - 20);
      g.bar(x, y, Math.max(2, sw * gate - 3), 4, 0.95);
    }
  }
};

const ensemble: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(4);
  const depth = v.chDepth, mixv = v.chMix;
  for (let k = 0; k < 3; k++) {
    const pts: [number, number][] = [];
    for (let i = 0; i <= 160; i++) {
      const u = i / 160;
      const y = h / 2 + Math.sin(u * Math.PI * 2 * (1 + v.chRate * 0.6) + (k * Math.PI * 2) / 3) * (h / 2 - 10) * (0.15 + depth * 0.85);
      pts.push([u * w, y]);
    }
    g.trace(pts, { alpha: 0.35 + mixv * 0.65, width: 1.4, fill: false });
  }
};

const delay: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(8, 1);
  const beats = [0.25, 1 / 3, 0.5, 0.75, 1, 1.5, 2][Math.round(v.dlTime)];
  const span = 6, mid = h / 2, bw = 6;
  const ping = v.dlPing >= 0.5;
  const room = mid - 6;
  g.bar(6, mid - room, bw, room * 2, 1);                        // the note itself, both sides
  // each repeat: the mix sets the first, the feedback how fast they fall away
  let a = 0.25 + v.dlMix * 0.75;
  for (let i = 1; i * beats <= span && a > 0.04; i++) {
    const x = 6 + (i * beats / span) * (w - 20);
    const len = room * a;
    const lit = 0.45 + a * 0.55;                                  // the height says how loud; keep it visible
    if (!ping) g.bar(x, mid - len, bw, len * 2, lit);
    else g.bar(x, i % 2 ? mid - len : mid, bw, len, lit);      // left above the line, right below
    a *= Math.max(0.05, v.dlFb);
  }
  g.ctx.fillStyle = 'rgba(255, 255, 255, 0.08)'; g.ctx.fillRect(0, mid, w, 1);
};

const reverb: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(6);
  const span = 12, dec = v.rvDecay;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 200; i++) {
    const t = (i / 200) * span;
    const pre = 0.02 + v.rvSize * 0.08;
    const lvl = t < pre ? t / pre : Math.exp((-6.9 * (t - pre)) / dec);
    pts.push([(i / 200) * w, h - 6 - lvl * (h - 16) * (0.25 + v.rvMix * 0.75)]);
  }
  g.trace(pts, { base: h });
  // shimmer: sparks riding the tail
  const sparks = Math.round(v.rvShimmer * 24);
  for (let i = 0; i < sparks; i++) {
    const u = ((i * 0.618) % 1) * Math.min(1, dec / span), x = u * w;
    const lvl = Math.exp((-6.9 * u * span) / dec);
    g.dot(x, h - 10 - lvl * (h - 22) * (0.4 + ((i * 0.37) % 0.6)), 1.2, 0.8);
  }
  g.text(`${dec >= 10 ? dec.toFixed(0) : dec.toFixed(1)} s`, w - 8, 13, 'right');
};

const warmth: Draw = (g, v) => {
  const { w, h } = g;
  g.grid(2);
  const drive = 1 + v.warmth * 4;
  const pts: [number, number][] = [];
  for (let i = 0; i <= 120; i++) {
    const x = (i / 120) * 2 - 1;
    pts.push([(i / 120) * w, h / 2 - (Math.tanh(x * drive) / Math.tanh(drive)) * (h / 2 - 8)]);
  }
  g.trace(pts, { alpha: 0.9, fill: false });
};

const network: Draw = (g, v) => {
  const { w, h } = g;
  const nodes = [[0.12, 0.6], [0.3, 0.3], [0.5, 0.62], [0.68, 0.28], [0.86, 0.58]].map(([x, y]) => [x * w, y * h]);
  const amt = v.netAmount, reach = v.netRange / 24;
  for (let i = 0; i < nodes.length; i++) for (let j = i + 1; j < nodes.length; j++) {
    if (j - i > 1 + Math.round(reach * 3)) continue;
    g.trace([nodes[i] as [number, number], nodes[j] as [number, number]], { alpha: 0.12 + amt * 0.7, width: 0.8 + amt * 1.6, fill: false });
  }
  for (const [x, y] of nodes) g.dot(x, y, 2.5 + amt * 2, 0.5 + amt * 0.5);
};

const SCALE_STEPS = [5, 7, 7, 7, 7, 6, 2, 12];     // notes per octave for each garden scale

const garden: Draw = (g, v) => {
  const { w, h } = g;
  const on = v.gardenOn >= 0.5;
  const life = Math.round(v.gardenLife), branch = v.gardenBranch, fade = v.gardenFade;
  const per = SCALE_STEPS[Math.round(v.gardenScale)] ?? 7, reach = Math.round(v.gardenReach);
  const rows = per * reach + 1;
  const pad = 10, rowH = (h - pad * 2) / (rows - 1);
  const yOf = (row: number) => h - pad - row * rowH;
  // the scale: one faint line per step, stronger on the octaves
  for (let r = 0; r < rows; r++) {
    g.ctx.fillStyle = r % per === 0 ? 'rgba(255, 255, 255, 0.12)' : 'rgba(255, 255, 255, 0.04)';
    g.ctx.fillRect(0, Math.round(yOf(r)), w, 1);
  }
  const colW = (w - 28) / Math.max(1, life);
  let seed = 11;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const dim = on ? 1 : 0.35;
  // a lineage: each generation a step or two away, quieter, one column on
  const grow = (row: number, gen: number, a: number): void => {
    if (gen >= life || a < 0.06) return;
    const x = 14 + gen * colW, y = yOf(row);
    const kids = 1 + (rnd() < branch ? 1 : 0);
    for (let k = 0; k < kids; k++) {
      const step = (rnd() < 0.5 ? -1 : 1) * (1 + Math.floor(rnd() * 2));
      const nr = Math.max(0, Math.min(rows - 1, row + step));
      const na = a * (1 - fade);
      const nx = x + colW, ny = yOf(nr);
      g.trace([[x, y], [x + colW * 0.5, y], [x + colW * 0.5, ny], [nx, ny]], { alpha: dim * (0.25 + na * 0.75), width: 1.2, fill: false });
      g.dot(nx, ny, 1.5 + na * 1.8, dim * (0.35 + na * 0.65));
      grow(nr, gen + 1, na);
    }
  };
  // a held chord plants three seeds
  for (const r of [0, Math.round(per * 0.4), Math.round(per * 0.6)]) {
    g.dot(14, yOf(r), 3.2, dim);
    grow(r, 0, 1);
  }
  g.text(`${['penta', 'major', 'minor', 'dorian', 'lydian', 'whole', 'fifths', 'chroma'][Math.round(v.gardenScale)]} · ${life} gen`, w - 8, 13, 'right', on ? 0.6 : 0.35);
};

export const VIZ: Record<string, Draw> = {
  oscA: osc('a'), oscB: osc('b'), mix, filter, env, voicing,
  lfo1: lfo(1), lfo2: lfo(2), pump, arp, ensemble, delay, reverb, warmth, network, garden,
};

/** One module's picture: a canvas that redraws itself from the values. */
export class Viz {
  readonly el: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private queued = false;

  constructor(private kind: string, private values: ParamValues, tall = false) {
    const el = document.createElement('canvas');
    el.className = tall ? 'viz tall' : 'viz';
    this.el = el;
    this.ctx = el.getContext('2d')!;
    new ResizeObserver(() => this.redraw()).observe(el);
  }

  /** Coalesced to one draw per frame, however many knobs moved. */
  redraw(): void {
    if (this.queued) return;
    this.queued = true;
    requestAnimationFrame(() => { this.queued = false; this.draw(); });
  }

  private draw(): void {
    const r = { width: this.el.clientWidth, height: this.el.clientHeight };   // layout size: the plugin scales the page
    if (r.width === 0) return;                         // hidden tab: drawn when shown
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const W = Math.round(r.width * dpr), H = Math.round(r.height * dpr);
    if (this.el.width !== W || this.el.height !== H) { this.el.width = W; this.el.height = H; }
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    this.ctx.clearRect(0, 0, r.width, r.height);
    // the module's accent, resolved: the canvas's CSS colour is var(--accent)
    const rgb = getComputedStyle(this.el).color.match(/\d+(\.\d+)?/g)?.slice(0, 3).join(', ') ?? '120, 255, 200';
    VIZ[this.kind]?.(new Pen(this.ctx, r.width, r.height, rgb), this.values);
  }
}

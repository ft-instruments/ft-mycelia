// The user-facing parameters of the instrument, as a flat list, plus the
// factory presets. `PARAMS` is what a plugin host would see as the
// parameter list; every value is a plain number.

export type Scale = 'lin' | 'log' | 'int' | 'enum' | 'bool';

export interface ParamDef {
  id: string;
  name: string;
  group: string;
  min: number;
  max: number;
  def: number;
  scale: Scale;
  unit?: string;
  labels?: string[];   // for enum
}

export const WAVE_LABELS = ['tri', 'saw', 'pulse'];       // shape is continuous between these
export const LFO_SHAPES = ['sine', 'tri', 'saw', 'sqr', 's&h', 'drift'];
export const ARP_MODES = ['off', 'up', 'down', 'up/dn', 'random', 'played', 'chord'];
export const ARP_RATES = ['1/2', '1/4', '1/4T', '1/8', '1/8T', '1/16', '1/16T', '1/32'];
export const DELAY_TIMES = ['1/16', '1/8T', '1/8', '1/8.', '1/4', '1/4.', '1/2'];
export const FILTER_MODES = ['24 dB', '12 dB'];
export const VOICE_MODES = ['poly', 'mono', 'legato'];
export const SUB_SHAPES = ['sine', 'square', '-2 oct'];
export const SCALE_NAMES = ['penta', 'major', 'minor', 'dorian', 'lydian', 'whole', 'fifths', 'chroma'];
export const CLIMATES = ['none', 'sun', 'rain', 'night', 'storm'];
/** LFO rate: free (the Hz knob) or locked to the tempo. */
export const LFO_SYNCS = ['free', '4 bars', '2 bars', '1 bar', '1/2', '1/4.', '1/4', '1/4T', '1/8.', '1/8', '1/8T', '1/16', '1/16T', '1/32'];
export const LFO_SYNC_BEATS = [0, 16, 8, 4, 2, 1.5, 1, 2 / 3, 0.75, 0.5, 1 / 3, 0.25, 1 / 6, 0.125];   // matches LFO_SYNCS
export const PUMP_RATES = ['1/1', '1/2', '1/4', '1/8'];
export const PUMP_BEATS = [4, 2, 1, 0.5];                                                               // matches PUMP_RATES
export const PUMP_WHERE = ['all', 'dry'];

// ---- modulation matrix -----------------------------------------------------
// Six slots, each a source, a destination and a bipolar amount. Every amount
// defaults to 0, so a patch that does not use the matrix renders exactly as it
// did before the matrix existed.

export const MOD_SLOTS = 6;

/** Index 0 is "off"; the rest are read per voice at control rate. */
export const MOD_SRCS = [
  'off', 'lfo 1', 'lfo 2', 'amp env', 'filt env', 'velocity', 'key', 'wheel', 'bend', 'random', 'network', 'pump',
];

/**
 * What a slot can reach. All of these are per voice — the matrix modulates
 * the voice, not the shared effects, so a per-voice source always means
 * something. `shape A+B` moves both oscillator morphs together.
 */
export const MOD_DSTS = [
  'pitch', 'shape A', 'shape B', 'shape A+B', 'width A', 'width B', 'detune',
  'level A', 'level B', 'sub', 'noise', 'cutoff', 'resonance', 'drive', 'level', 'pan',
];

export const MOD_SRC_IDS = Array.from({ length: MOD_SLOTS }, (_, i) => `m${i + 1}Src`);
export const MOD_DST_IDS = Array.from({ length: MOD_SLOTS }, (_, i) => `m${i + 1}Dst`);
export const MOD_AMT_IDS = Array.from({ length: MOD_SLOTS }, (_, i) => `m${i + 1}Amt`);

// Destination indices, for the voice. Plain constants rather than an enum:
// the DSP is run through Node's type stripping, which does not allow enums.
export const DST_PITCH = 0, DST_SHAPE_A = 1, DST_SHAPE_B = 2, DST_SHAPE_BOTH = 3;
export const DST_WIDTH_A = 4, DST_WIDTH_B = 5, DST_DETUNE = 6;
export const DST_LEVEL_A = 7, DST_LEVEL_B = 8, DST_SUB = 9, DST_NOISE = 10;
export const DST_CUTOFF = 11, DST_RES = 12, DST_DRIVE = 13, DST_AMP = 14, DST_PAN = 15;

const P = (id: string, name: string, group: string, min: number, max: number, def: number, scale: Scale = 'lin', unit?: string, labels?: string[]): ParamDef =>
  ({ id, name, group, min, max, def, scale, unit, labels });

export const PARAMS: ParamDef[] = [
  // ---- oscillator A
  P('aShape', 'shape', 'oscA', 0, 1, 0.5),
  P('aPw', 'width', 'oscA', 0.05, 0.95, 0.5),
  P('aOct', 'octave', 'oscA', -2, 2, 0, 'int'),
  P('aSemi', 'semi', 'oscA', -12, 12, 0, 'int'),
  P('aFine', 'fine', 'oscA', -50, 50, 0, 'lin', 'ct'),
  P('aUnison', 'unison', 'oscA', 1, 7, 1, 'int'),
  P('aDetune', 'detune', 'oscA', 0, 60, 12, 'lin', 'ct'),
  P('aLevel', 'level', 'oscA', 0, 1, 0.8),
  // ---- oscillator B
  P('bShape', 'shape', 'oscB', 0, 1, 0.5),
  P('bPw', 'width', 'oscB', 0.05, 0.95, 0.5),
  P('bOct', 'octave', 'oscB', -2, 2, 0, 'int'),
  P('bSemi', 'semi', 'oscB', -12, 12, 0, 'int'),
  P('bFine', 'fine', 'oscB', -50, 50, 7, 'lin', 'ct'),
  P('bUnison', 'unison', 'oscB', 1, 7, 1, 'int'),
  P('bDetune', 'detune', 'oscB', 0, 60, 12, 'lin', 'ct'),
  P('bLevel', 'level', 'oscB', 0, 1, 0.0),
  // ---- sub / noise / mix
  P('subShape', 'sub wave', 'mix', 0, 2, 0, 'enum', undefined, SUB_SHAPES),
  P('subLevel', 'sub', 'mix', 0, 1, 0),
  P('noiseLevel', 'noise', 'mix', 0, 1, 0),
  P('spread', 'spread', 'mix', 0, 1, 0.6),
  P('drift', 'drift', 'mix', 0, 1, 0.35),
  // ---- filter
  P('cutoff', 'cutoff', 'filter', 20, 18000, 2200, 'log', 'Hz'),
  P('res', 'resonance', 'filter', 0, 1, 0.2),
  P('drive', 'drive', 'filter', 0, 1, 0.15),
  P('fMode', 'slope', 'filter', 0, 1, 0, 'enum', undefined, FILTER_MODES),
  P('keyTrack', 'key track', 'filter', 0, 1, 0.5),
  P('fEnv', 'env amount', 'filter', -1, 1, 0.45),
  P('fVel', 'velocity', 'filter', 0, 1, 0.3),
  P('hpf', 'high pass', 'filter', 10, 2000, 20, 'log', 'Hz'),
  // ---- amp envelope
  P('aAtk', 'attack', 'ampEnv', 0.001, 10, 0.01, 'log', 's'),
  P('aDec', 'decay', 'ampEnv', 0.005, 10, 0.4, 'log', 's'),
  P('aSus', 'sustain', 'ampEnv', 0, 1, 0.8),
  P('aRel', 'release', 'ampEnv', 0.005, 15, 0.4, 'log', 's'),
  P('ampVel', 'velocity', 'ampEnv', 0, 1, 0.5),
  // ---- filter envelope
  P('fAtk', 'attack', 'filtEnv', 0.001, 10, 0.01, 'log', 's'),
  P('fDec', 'decay', 'filtEnv', 0.005, 10, 0.6, 'log', 's'),
  P('fSus', 'sustain', 'filtEnv', 0, 1, 0.2),
  P('fRel', 'release', 'filtEnv', 0.005, 15, 0.5, 'log', 's'),
  // ---- LFO 1 (per voice)
  P('l1Shape', 'shape', 'lfo1', 0, 5, 0, 'enum', undefined, LFO_SHAPES),
  P('l1Rate', 'rate', 'lfo1', 0.02, 20, 5, 'log', 'Hz'),
  P('l1Sync', 'sync', 'lfo1', 0, LFO_SYNCS.length - 1, 0, 'enum', undefined, LFO_SYNCS),
  P('l1Fade', 'fade in', 'lfo1', 0, 5, 0.6, 'lin', 's'),
  P('l1Pitch', '→ pitch', 'lfo1', 0, 100, 0, 'lin', 'ct'),
  P('l1Cut', '→ cutoff', 'lfo1', -1, 1, 0),
  P('l1Pw', '→ width', 'lfo1', 0, 1, 0),
  // ---- LFO 2 (global)
  P('l2Shape', 'shape', 'lfo2', 0, 5, 1, 'enum', undefined, LFO_SHAPES),
  P('l2Rate', 'rate', 'lfo2', 0.02, 20, 0.3, 'log', 'Hz'),
  P('l2Sync', 'sync', 'lfo2', 0, LFO_SYNCS.length - 1, 0, 'enum', undefined, LFO_SYNCS),
  P('l2Cut', '→ cutoff', 'lfo2', -1, 1, 0),
  P('l2Shape2', '→ shape', 'lfo2', 0, 1, 0),
  P('l2Pan', '→ pan', 'lfo2', 0, 1, 0),
  P('l2Amp', '→ level', 'lfo2', 0, 1, 0),
  // ---- pump: tempo-synced ducking, the sidechain sound; off at amount 0
  P('pumpAmt', 'amount', 'pump', 0, 1, 0),
  P('pumpRate', 'rate', 'pump', 0, PUMP_RATES.length - 1, 2, 'enum', undefined, PUMP_RATES),
  P('pumpRel', 'release', 'pump', 0.05, 1, 0.7),
  P('pumpCurve', 'curve', 'pump', 0, 1, 0.4),
  P('pumpWhere', 'ducks', 'pump', 0, 1, 0, 'enum', undefined, PUMP_WHERE),
  // ---- modulation matrix: six slots, every amount 0 by default
  ...Array.from({ length: MOD_SLOTS }, (_, i) => [
    P(`m${i + 1}Src`, 'from', 'matrix', 0, MOD_SRCS.length - 1, 0, 'enum', undefined, MOD_SRCS),
    P(`m${i + 1}Dst`, 'to', 'matrix', 0, MOD_DSTS.length - 1, 0, 'enum', undefined, MOD_DSTS),
    P(`m${i + 1}Amt`, 'amount', 'matrix', -1, 1, 0),
  ]).flat(),
  // ---- voice
  P('voiceMode', 'mode', 'voice', 0, 2, 0, 'enum', undefined, VOICE_MODES),
  P('glide', 'glide', 'voice', 0, 2, 0, 'lin', 's'),
  P('poly', 'voices', 'voice', 1, 16, 10, 'int'),
  P('bend', 'bend range', 'voice', 0, 24, 2, 'int', 'st'),
  // ---- arp
  P('arpMode', 'mode', 'arp', 0, 6, 0, 'enum', undefined, ARP_MODES),
  P('arpRate', 'rate', 'arp', 0, 7, 5, 'enum', undefined, ARP_RATES),
  P('arpOct', 'octaves', 'arp', 1, 4, 1, 'int'),
  P('arpGate', 'gate', 'arp', 0.05, 1, 0.5),
  P('arpSwing', 'swing', 'arp', 0, 0.6, 0),
  P('arpHold', 'hold', 'arp', 0, 1, 0, 'bool'),
  P('tempo', 'tempo', 'arp', 40, 240, 110, 'int', 'bpm'),
  // ---- ensemble
  P('chMix', 'mix', 'ensemble', 0, 1, 0.3),
  P('chRate', 'rate', 'ensemble', 0.05, 5, 0.6, 'log', 'Hz'),
  P('chDepth', 'depth', 'ensemble', 0, 1, 0.5),
  P('chTone', 'tone', 'ensemble', 0, 1, 0.5),
  // ---- delay
  P('dlMix', 'mix', 'delay', 0, 1, 0),
  P('dlTime', 'time', 'delay', 0, 6, 3, 'enum', undefined, DELAY_TIMES),
  P('dlFb', 'feedback', 'delay', 0, 0.95, 0.4),
  P('dlTone', 'tone', 'delay', 0, 1, 0.4),
  P('dlPing', 'ping-pong', 'delay', 0, 1, 1, 'bool'),
  // ---- reverb
  P('rvMix', 'mix', 'reverb', 0, 1, 0.25),
  P('rvSize', 'size', 'reverb', 0, 1, 0.6),
  P('rvDecay', 'decay', 'reverb', 0.2, 30, 3, 'log', 's'),
  P('rvTone', 'tone', 'reverb', 0, 1, 0.5),
  P('rvShimmer', 'shimmer', 'reverb', 0, 1, 0),
  // ---- output
  P('warmth', 'warmth', 'out', 0, 1, 0.3),
  P('volume', 'volume', 'out', 0, 1, 0.7),

  // ==== "on top": everything below is off by default and changes nothing at 0
  // ---- network: voices modulate their pitch-neighbours
  P('netAmount', 'amount', 'net', 0, 1, 0),
  P('netRange', 'reach', 'net', 1, 24, 7, 'int', 'st'),
  P('netCut', '→ cutoff', 'net', -1, 1, 0.5),
  P('netPitch', '→ pitch', 'net', -30, 30, 8, 'lin', 'ct'),
  P('netDim', 'crowding', 'net', 0, 1, 0.3),
  // ---- garden: growth sequencer
  P('gardenOn', 'grow', 'garden', 0, 1, 0, 'bool'),
  P('gardenRate', 'rate', 'garden', 0, 7, 3, 'enum', undefined, ARP_RATES),
  P('gardenScale', 'scale', 'garden', 0, 7, 0, 'enum', undefined, SCALE_NAMES),
  P('gardenLife', 'generations', 'garden', 1, 8, 4, 'int'),
  P('gardenBranch', 'branching', 'garden', 0, 1, 0.35),
  P('gardenFade', 'fading', 'garden', 0, 0.6, 0.15),
  P('gardenReach', 'reach', 'garden', 1, 3, 1, 'int', 'oct'),
  P('gardenGate', 'gate', 'garden', 0.1, 2, 0.8),
  // ---- rot: the patch ages
  P('rot', 'rot', 'rot', 0, 1, 0),
  P('rotAuto', 'auto (min)', 'rot', 0, 10, 0, 'lin', 'min'),
  // ---- climate
  P('climate', 'climate', 'climate', 0, 4, 0, 'enum', undefined, CLIMATES),
  P('climateAmt', 'amount', 'climate', 0, 1, 0.5),
];

export type ParamId = string;
export type ParamValues = Record<ParamId, number>;

export const PARAM_BY_ID: Record<string, ParamDef> = Object.fromEntries(PARAMS.map((p) => [p.id, p]));

export function defaults(): ParamValues {
  const v: ParamValues = {};
  for (const p of PARAMS) v[p.id] = p.def;
  return v;
}

/** 0..1 knob position -> value, honouring the parameter's scale. */
export function fromNorm(p: ParamDef, t: number): number {
  t = Math.min(1, Math.max(0, t));
  switch (p.scale) {
    case 'log': return p.min * Math.pow(p.max / p.min, t);
    case 'int': case 'enum': case 'bool': return Math.round(p.min + t * (p.max - p.min));
    default: return p.min + t * (p.max - p.min);
  }
}

export function toNorm(p: ParamDef, v: number): number {
  v = Math.min(p.max, Math.max(p.min, v));
  if (p.scale === 'log') return Math.log(v / p.min) / Math.log(p.max / p.min);
  return (v - p.min) / (p.max - p.min);
}

export function format(p: ParamDef, v: number): string {
  if (p.labels) return p.labels[Math.round(v)] ?? String(v);
  if (p.scale === 'bool') return v >= 0.5 ? 'on' : 'off';
  if (p.scale === 'int') return `${Math.round(v)}${p.unit ? ' ' + p.unit : ''}`;
  if (p.unit === 'Hz') return v >= 1000 ? `${(v / 1000).toFixed(2)} kHz` : v >= 100 ? `${v.toFixed(0)} Hz` : `${v.toFixed(2)} Hz`;
  if (p.unit === 's') return v >= 1 ? `${v.toFixed(2)} s` : `${(v * 1000).toFixed(0)} ms`;
  if (p.unit === 'ct') return `${v.toFixed(0)} ct`;
  if (p.unit === 'min') return v === 0 ? 'off' : `${v.toFixed(1)} min`;
  // plain amounts read as percentages; bipolar ones keep their sign
  if (p.min < 0) return (v >= 0 ? '+' : '−') + `${Math.round(Math.abs(v) * 100)}%`;
  return `${Math.round(v * 100)}%`;
}

export interface Preset {
  name: string;
  tag: string;
  values: Partial<ParamValues>;
}

// Presets only list what differs from the defaults.
export const PRESETS: Preset[] = [
  // ---------------------------------------------------------------------- pads
  {
    name: 'Canopy', tag: 'pad',
    values: {
      aShape: 0.5, aUnison: 5, aDetune: 14, aLevel: 0.7,
      bShape: 0.3, bOct: 1, bFine: -6, bUnison: 3, bDetune: 9, bLevel: 0.35,
      subLevel: 0.3, spread: 0.85, drift: 0.5,
      cutoff: 900, res: 0.18, drive: 0.25, fEnv: 0.35, keyTrack: 0.4, fVel: 0.25,
      aAtk: 0.9, aDec: 1.5, aSus: 0.85, aRel: 2.8,
      fAtk: 1.6, fDec: 3, fSus: 0.35, fRel: 2.5,
      l1Rate: 4.5, l1Fade: 1.5, l1Pitch: 5,
      l2Shape: 5, l2Rate: 0.12, l2Cut: 0.25, l2Shape2: 0.3,
      chMix: 0.5, chRate: 0.5, chDepth: 0.6,
      rvMix: 0.4, rvSize: 0.8, rvDecay: 6, rvTone: 0.45,
      warmth: 0.4,
    },
  },
  {
    name: 'Bioluminescence', tag: 'pad',
    values: {
      aShape: 0.15, aUnison: 3, aDetune: 8, aLevel: 0.75,
      bShape: 0.75, bPw: 0.3, bOct: 1, bSemi: 7, bFine: 4, bLevel: 0.3,
      subLevel: 0.45, spread: 0.7, drift: 0.6,
      cutoff: 650, res: 0.3, drive: 0.2, fEnv: 0.55, keyTrack: 0.55,
      aAtk: 1.8, aDec: 2, aSus: 0.9, aRel: 4,
      fAtk: 3.5, fDec: 4, fSus: 0.2, fRel: 3,
      l1Shape: 0, l1Rate: 0.4, l1Cut: 0.15, l1Pw: 0.4,
      l2Shape: 5, l2Rate: 0.08, l2Pan: 0.5, l2Cut: 0.12,
      chMix: 0.35, chDepth: 0.4, chRate: 0.35,
      dlMix: 0.2, dlTime: 5, dlFb: 0.45, dlTone: 0.3,
      rvMix: 0.5, rvSize: 0.95, rvDecay: 12, rvTone: 0.4, rvShimmer: 0.35,
      warmth: 0.45, volume: 0.65,
    },
  },
  {
    name: 'Understory', tag: 'pad',
    values: {
      aShape: 0.35, aUnison: 3, aDetune: 6, aOct: -1, aLevel: 0.7,
      bShape: 0.5, bOct: 0, bSemi: 7, bFine: 3, bUnison: 3, bDetune: 10, bLevel: 0.3,
      subLevel: 0.4, noiseLevel: 0.04, spread: 0.8, drift: 0.7,
      cutoff: 420, res: 0.4, drive: 0.3, fEnv: 0.4, keyTrack: 0.5, fMode: 1,
      aAtk: 2.5, aDec: 3, aSus: 1, aRel: 5,
      fAtk: 5, fDec: 5, fSus: 0.3, fRel: 4,
      l1Shape: 5, l1Rate: 0.25, l1Cut: 0.2, l1Pw: 0.5,
      l2Shape: 0, l2Rate: 0.05, l2Cut: 0.2, l2Pan: 0.6,
      chMix: 0.55, chRate: 0.3, chDepth: 0.7, chTone: 0.35,
      rvMix: 0.55, rvSize: 1, rvDecay: 18, rvTone: 0.35, rvShimmer: 0.2,
      warmth: 0.5, volume: 0.65,
    },
  },
  {
    name: 'Fog Bank', tag: 'pad',
    values: {
      aShape: 0.05, aUnison: 4, aDetune: 9, aOct: -1, aLevel: 0.7,
      bShape: 0.1, bOct: 0, bFine: -5, bUnison: 2, bDetune: 6, bLevel: 0.45,
      subLevel: 0.2, noiseLevel: 0.06, spread: 0.9, drift: 0.6,
      cutoff: 520, res: 0.1, drive: 0.1, fEnv: 0.2, keyTrack: 0.6, fMode: 1,
      aAtk: 3.5, aDec: 2, aSus: 1, aRel: 6,
      fAtk: 6, fDec: 4, fSus: 0.5, fRel: 5,
      l2Shape: 5, l2Rate: 0.06, l2Cut: 0.15, l2Pan: 0.4,
      chMix: 0.6, chRate: 0.25, chDepth: 0.8, chTone: 0.3,
      rvMix: 0.6, rvSize: 1, rvDecay: 14, rvTone: 0.3,
      warmth: 0.5, volume: 0.65,
    },
  },
  {
    name: 'Solar Strings', tag: 'pad',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 10, aLevel: 0.7,
      bShape: 0.5, bOct: 1, bFine: 4, bUnison: 3, bDetune: 12, bLevel: 0.45,
      spread: 0.7, drift: 0.4,
      cutoff: 1800, res: 0.05, drive: 0.2, fEnv: 0.15, keyTrack: 0.7, fVel: 0.2, hpf: 90,
      aAtk: 0.35, aDec: 1, aSus: 0.9, aRel: 1.4,
      fAtk: 0.5, fDec: 2, fSus: 0.5, fRel: 1,
      l1Rate: 5.2, l1Fade: 1, l1Pitch: 6,
      chMix: 0.75, chRate: 0.6, chDepth: 0.65, chTone: 0.55,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 2.8,
      warmth: 0.4,
    },
  },
  {
    name: 'Tidal Choir', tag: 'pad',
    values: {
      aShape: 0.95, aPw: 0.32, aUnison: 3, aDetune: 7, aLevel: 0.65,
      bShape: 0.95, bPw: 0.62, bOct: 0, bSemi: 0, bFine: -8, bUnison: 3, bDetune: 7, bLevel: 0.55,
      subLevel: 0.25, spread: 0.85, drift: 0.5,
      cutoff: 1400, res: 0.35, drive: 0.15, fEnv: 0.25, keyTrack: 0.6, fMode: 1, hpf: 120,
      aAtk: 1.2, aDec: 1, aSus: 1, aRel: 3,
      fAtk: 2, fDec: 2, fSus: 0.6, fRel: 2,
      l1Shape: 1, l1Rate: 0.35, l1Pw: 0.9,
      l2Shape: 0, l2Rate: 0.09, l2Cut: 0.18,
      chMix: 0.45, chRate: 0.4, chDepth: 0.5,
      rvMix: 0.45, rvSize: 0.9, rvDecay: 8, rvTone: 0.5,
      warmth: 0.35,
    },
  },
  {
    name: 'Deep Sleep', tag: 'pad',
    values: {
      aShape: 0.0, aOct: -1, aUnison: 2, aDetune: 4, aLevel: 0.8,
      bShape: 0.0, bOct: -1, bSemi: 7, bFine: 3, bLevel: 0.35,
      subLevel: 0.6, subShape: 2, spread: 0.5, drift: 0.3,
      cutoff: 300, res: 0.2, drive: 0.4, fEnv: 0.1, keyTrack: 0.3,
      aAtk: 4, aDec: 2, aSus: 1, aRel: 8,
      fAtk: 8, fDec: 4, fSus: 0.6, fRel: 6,
      l2Shape: 0, l2Rate: 0.04, l2Cut: 0.25, l2Amp: 0.15,
      chMix: 0.3, chRate: 0.15, chDepth: 0.9, chTone: 0.2,
      rvMix: 0.5, rvSize: 1, rvDecay: 20, rvTone: 0.25,
      warmth: 0.6, volume: 0.7,
    },
  },
  {
    name: 'Aurora', tag: 'pad',
    values: {
      aShape: 0.3, aUnison: 5, aDetune: 20, aLevel: 0.6,
      bShape: 0.6, bPw: 0.4, bOct: 1, bSemi: 7, bFine: 2, bUnison: 2, bDetune: 8, bLevel: 0.25,
      subLevel: 0.2, spread: 1, drift: 0.7,
      cutoff: 750, res: 0.25, drive: 0.15, fEnv: 0.45, keyTrack: 0.5,
      aAtk: 2.2, aDec: 3, aSus: 0.8, aRel: 5,
      fAtk: 4, fDec: 6, fSus: 0.2, fRel: 4,
      l1Shape: 5, l1Rate: 0.3, l1Cut: 0.2, l1Pw: 0.3,
      l2Shape: 1, l2Rate: 0.05, l2Shape2: 0.5, l2Pan: 0.7,
      chMix: 0.4, chRate: 0.3, chDepth: 0.6,
      dlMix: 0.25, dlTime: 5, dlFb: 0.5, dlTone: 0.3,
      rvMix: 0.55, rvSize: 1, rvDecay: 16, rvTone: 0.45, rvShimmer: 0.5,
      warmth: 0.4, volume: 0.62,
    },
  },
  {
    name: 'First Light', tag: 'pad',
    values: {
      aShape: 0.5, aUnison: 5, aDetune: 11, aLevel: 0.7,
      bShape: 0.45, bOct: -1, bFine: -7, bUnison: 3, bDetune: 7, bLevel: 0.4,
      subLevel: 0.25, spread: 0.8, drift: 0.3,
      cutoff: 1100, res: 0.12, drive: 0.12, fEnv: 0.3, keyTrack: 0.5,
      aAtk: 0.6, aDec: 2, aSus: 0.8, aRel: 3,
      fAtk: 1.2, fDec: 3, fSus: 0.4, fRel: 2.5,
      // the harder you play, the further the filter opens
      m1Src: 5, m1Dst: 11, m1Amt: 0.35,
      chMix: 0.45, chRate: 0.4, chDepth: 0.55,
      dlMix: 0.18, dlTime: 4, dlFb: 0.35, dlTone: 0.45, dlPing: 1,
      rvMix: 0.45, rvSize: 0.85, rvDecay: 7, rvTone: 0.45,
      warmth: 0.35, volume: 0.64,
    },
  },
  {
    name: 'Updraft', tag: 'pad',
    values: {
      aShape: 0.35, aUnison: 6, aDetune: 18, aLevel: 0.65,
      bShape: 0.2, bOct: 1, bSemi: 7, bUnison: 3, bDetune: 12, bLevel: 0.28,
      subLevel: 0.35, noiseLevel: 0.05, spread: 1, drift: 0.6,
      cutoff: 700, res: 0.15, fEnv: 0.4, keyTrack: 0.55, fMode: 1,
      aAtk: 2.5, aDec: 3, aSus: 0.9, aRel: 6,
      fAtk: 5, fDec: 5, fSus: 0.4, fRel: 5,
      l2Shape: 5, l2Rate: 0.07, l2Cut: 0.2, l2Pan: 0.45,
      chMix: 0.5, chRate: 0.22, chDepth: 0.7, chTone: 0.4,
      dlMix: 0.22, dlTime: 5, dlFb: 0.5, dlTone: 0.35, dlPing: 1,
      rvMix: 0.6, rvSize: 1, rvDecay: 16, rvTone: 0.4, rvShimmer: 0.45,
      warmth: 0.45, volume: 0.6,
    },
  },
  {
    name: 'Quartz Bloom', tag: 'pad',
    values: {
      aShape: 0.0, aUnison: 3, aDetune: 7, aLevel: 0.6,
      bShape: 1.0, bPw: 0.12, bOct: 1, bSemi: 7, bUnison: 2, bDetune: 5, bLevel: 0.28,
      subLevel: 0.2, spread: 0.85, drift: 0.25,
      cutoff: 2800, res: 0.2, fEnv: 0.35, keyTrack: 0.7,
      aAtk: 0.9, aDec: 3, aSus: 0.7, aRel: 5,
      fAtk: 2, fDec: 4, fSus: 0.4, fRel: 4,
      l2Shape: 0, l2Rate: 0.15, l2Cut: 0.2, l2Pan: 0.35,
      // the bell brightens while it is loud and rounds off as it rings out
      m1Src: 3, m1Dst: 3, m1Amt: 0.3,
      chMix: 0.45, chRate: 0.3, chDepth: 0.6,
      dlMix: 0.3, dlTime: 4, dlFb: 0.5, dlTone: 0.6, dlPing: 1,
      rvMix: 0.6, rvSize: 0.95, rvDecay: 12, rvTone: 0.6, rvShimmer: 0.65,
      warmth: 0.3, volume: 0.62,
    },
  },
  {
    name: 'Afterglow', tag: 'pad',
    values: {
      aShape: 0.25, aUnison: 4, aDetune: 8, aLevel: 0.65,
      bShape: 0.3, bOct: -1, bFine: -4, bUnison: 2, bDetune: 5, bLevel: 0.4,
      subLevel: 0.3, spread: 0.9, drift: 0.4,
      cutoff: 850, res: 0.1, fEnv: 0.25, keyTrack: 0.55, fMode: 1,
      aAtk: 1.6, aDec: 3, aSus: 0.8, aRel: 7,
      fAtk: 3, fDec: 5, fSus: 0.35, fRel: 6,
      l2Shape: 5, l2Rate: 0.05, l2Cut: 0.12, l2Pan: 0.35,
      m1Src: 4, m1Dst: 9, m1Amt: 0.25,
      chMix: 0.5, chRate: 0.2, chDepth: 0.7, chTone: 0.35,
      dlMix: 0.25, dlTime: 5, dlFb: 0.45, dlTone: 0.3, dlPing: 1,
      rvMix: 0.6, rvSize: 1, rvDecay: 18, rvTone: 0.35, rvShimmer: 0.2,
      warmth: 0.5, volume: 0.6,
    },
  },
  // ---------------------------------------------------------------------- keys
  {
    name: 'Neon Moss', tag: 'keys',
    values: {
      aShape: 0.9, aPw: 0.38, aUnison: 2, aDetune: 5, aLevel: 0.75,
      bShape: 0.0, bOct: -1, bFine: -4, bLevel: 0.5,
      subLevel: 0.1, spread: 0.4, drift: 0.4,
      cutoff: 1100, res: 0.25, drive: 0.35, fEnv: 0.5, fVel: 0.6, keyTrack: 0.6,
      aAtk: 0.002, aDec: 1.4, aSus: 0.55, aRel: 0.6, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.9, fSus: 0.15, fRel: 0.5,
      l1Rate: 5.5, l1Fade: 0.8, l1Pitch: 4, l1Pw: 0.35,
      chMix: 0.4, chRate: 0.8, chDepth: 0.45, chTone: 0.6,
      dlMix: 0.15, dlTime: 3, dlFb: 0.3,
      rvMix: 0.28, rvSize: 0.5, rvDecay: 2.2,
      warmth: 0.5,
    },
  },
  {
    name: 'Velvet Keys', tag: 'keys',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.8,
      bShape: 0.7, bPw: 0.45, bOct: 1, bFine: 3, bLevel: 0.25,
      subLevel: 0.3, spread: 0.3, drift: 0.35,
      cutoff: 700, res: 0.15, drive: 0.35, fEnv: 0.6, fVel: 0.7, keyTrack: 0.7,
      aAtk: 0.002, aDec: 2.2, aSus: 0.3, aRel: 0.5, ampVel: 0.7,
      fAtk: 0.001, fDec: 1.2, fSus: 0.05, fRel: 0.4,
      l1Rate: 5, l1Fade: 1.2, l1Pitch: 3,
      chMix: 0.3, chRate: 0.9, chDepth: 0.35,
      rvMix: 0.3, rvSize: 0.6, rvDecay: 2.5,
      warmth: 0.55,
    },
  },
  {
    name: 'Polymoss', tag: 'keys',
    values: {
      aShape: 0.5, aUnison: 1, aLevel: 0.75,
      bShape: 0.5, bOct: 0, bFine: 10, bLevel: 0.6,
      subLevel: 0.15, spread: 0.6, drift: 0.55,
      cutoff: 1300, res: 0.3, drive: 0.25, fEnv: 0.55, fVel: 0.5, keyTrack: 0.5,
      aAtk: 0.004, aDec: 0.9, aSus: 0.6, aRel: 0.7, ampVel: 0.5,
      fAtk: 0.002, fDec: 0.5, fSus: 0.2, fRel: 0.5,
      chMix: 0.55, chRate: 0.7, chDepth: 0.55, chTone: 0.6,
      rvMix: 0.25, rvSize: 0.55, rvDecay: 2,
      warmth: 0.45,
    },
  },
  {
    name: 'Organelle', tag: 'keys',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.7,
      bShape: 0.0, bOct: 1, bSemi: 7, bLevel: 0.4,
      subLevel: 0.5, subShape: 0, spread: 0.2, drift: 0.2,
      cutoff: 2600, res: 0.0, drive: 0.5, fEnv: 0.0, keyTrack: 0.8, fVel: 0.1,
      aAtk: 0.004, aDec: 0.3, aSus: 1, aRel: 0.08, ampVel: 0.2,
      l1Rate: 6.5, l1Fade: 0.0, l1Pitch: 0, l1Cut: 0.1,
      l2Shape: 0, l2Rate: 5.8, l2Amp: 0.35, l2Pan: 0.2,
      chMix: 0.35, chRate: 1.1, chDepth: 0.4,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 2.2, rvTone: 0.4,
      warmth: 0.7,
    },
  },
  {
    name: 'Amber Keys', tag: 'keys',
    values: {
      // the keys patch: triangle body, a pulse glint on top for the "hammer"
      aShape: 0.08, aUnison: 2, aDetune: 6, aLevel: 0.8,
      bShape: 0.85, bPw: 0.2, bOct: 1, bFine: 4, bLevel: 0.22,
      subLevel: 0.3, spread: 0.5, drift: 0.25,
      cutoff: 2400, res: 0.14, drive: 0.1, fEnv: 0.45, keyTrack: 0.75, fVel: 0.5,
      aAtk: 0.002, aDec: 1.6, aSus: 0.18, aRel: 1.1, ampVel: 0.7,
      fAtk: 0.002, fDec: 0.9, fSus: 0.1, fRel: 0.8,
      // harder = the morph walks towards the pulse edge
      m1Src: 5, m1Dst: 3, m1Amt: 0.2,
      chMix: 0.3, chRate: 0.45, chDepth: 0.35,
      dlMix: 0.26, dlTime: 3, dlFb: 0.42, dlTone: 0.5, dlPing: 1,
      rvMix: 0.42, rvSize: 0.8, rvDecay: 5, rvTone: 0.5,
      warmth: 0.3, volume: 0.76,
    },
  },
  {
    name: 'Chalet', tag: 'keys',
    values: {
      // quieter keys — the one to play a verse on
      aShape: 0.0, aUnison: 2, aDetune: 5, aLevel: 0.75,
      bShape: 0.15, bOct: -1, bFine: 5, bLevel: 0.35,
      subLevel: 0.35, spread: 0.45, drift: 0.2,
      cutoff: 1500, res: 0.1, drive: 0.12, fEnv: 0.35, keyTrack: 0.7, fVel: 0.45,
      aAtk: 0.004, aDec: 2.2, aSus: 0.25, aRel: 1.4, ampVel: 0.65,
      fAtk: 0.003, fDec: 1.2, fSus: 0.15, fRel: 1,
      chMix: 0.35, chRate: 0.35, chDepth: 0.45, chTone: 0.4,
      dlMix: 0.2, dlTime: 4, dlFb: 0.35, dlTone: 0.4, dlPing: 1,
      rvMix: 0.4, rvSize: 0.75, rvDecay: 4.5, rvTone: 0.4,
      warmth: 0.45, volume: 0.66,
    },
  },
  // -------------------------------------------------------------------- synths
  {
    name: 'Chrome Brass', tag: 'synth',
    values: {
      aShape: 0.5, aUnison: 2, aDetune: 6, aLevel: 0.8,
      bShape: 0.5, bOct: 0, bFine: -6, bUnison: 2, bDetune: 6, bLevel: 0.7,
      subLevel: 0.2, spread: 0.5, drift: 0.4,
      cutoff: 500, res: 0.2, drive: 0.5, fEnv: 0.8, fVel: 0.6, keyTrack: 0.4,
      aAtk: 0.04, aDec: 0.6, aSus: 0.8, aRel: 0.35, ampVel: 0.5,
      fAtk: 0.09, fDec: 0.5, fSus: 0.35, fRel: 0.3,
      l1Rate: 5.5, l1Fade: 0.6, l1Pitch: 5,
      chMix: 0.35, chRate: 0.8, chDepth: 0.4,
      rvMix: 0.25, rvSize: 0.6, rvDecay: 2,
      warmth: 0.55,
    },
  },
  {
    name: 'Stack of Six', tag: 'synth',
    values: {
      aShape: 0.5, aUnison: 6, aDetune: 24, aLevel: 0.7,
      bShape: 0.5, bOct: -1, bUnison: 3, bDetune: 10, bLevel: 0.5,
      subLevel: 0.3, spread: 1, drift: 0.4,
      cutoff: 1900, res: 0.1, drive: 0.3, fEnv: 0.35, keyTrack: 0.5, fVel: 0.3, hpf: 60,
      aAtk: 0.01, aDec: 0.8, aSus: 0.85, aRel: 0.6,
      fAtk: 0.01, fDec: 0.8, fSus: 0.4, fRel: 0.5,
      chMix: 0.3, chDepth: 0.4,
      dlMix: 0.2, dlTime: 3, dlFb: 0.35,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3,
      warmth: 0.45,
    },
  },
  {
    name: 'PWM Bloom', tag: 'synth',
    values: {
      aShape: 1.0, aPw: 0.5, aUnison: 2, aDetune: 5, aLevel: 0.8,
      bShape: 1.0, bPw: 0.25, bOct: -1, bLevel: 0.45,
      subLevel: 0.2, spread: 0.6, drift: 0.4,
      cutoff: 1500, res: 0.2, drive: 0.25, fEnv: 0.3, keyTrack: 0.5,
      aAtk: 0.05, aDec: 1, aSus: 0.8, aRel: 1.2,
      fAtk: 0.3, fDec: 1.5, fSus: 0.4, fRel: 1,
      l1Shape: 1, l1Rate: 0.6, l1Pw: 0.85,
      chMix: 0.4, chRate: 0.5, chDepth: 0.5,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3.5,
      warmth: 0.4,
    },
  },
  {
    name: 'Tremolo Grove', tag: 'synth',
    values: {
      // a gated pad: LFO 2 square on the tremolo, and the matrix moving the morph with it
      aShape: 0.5, aUnison: 5, aDetune: 13, aLevel: 0.7,
      bShape: 0.55, bFine: 6, bUnison: 3, bDetune: 9, bLevel: 0.4,
      subLevel: 0.28, spread: 0.8, drift: 0.3,
      cutoff: 1600, res: 0.2, drive: 0.15, fEnv: 0.35, keyTrack: 0.5,
      aAtk: 0.006, aDec: 1.5, aSus: 0.85, aRel: 1.2,
      fAtk: 0.02, fDec: 2, fSus: 0.45, fRel: 1.5,
      l2Shape: 3, l2Rate: 5.9, l2Amp: 0.8,
      m1Src: 2, m1Dst: 3, m1Amt: 0.2,
      tempo: 88,
      chMix: 0.4, chDepth: 0.5,
      dlMix: 0.28, dlTime: 3, dlFb: 0.45, dlTone: 0.5, dlPing: 1,
      rvMix: 0.45, rvSize: 0.85, rvDecay: 6, rvTone: 0.45,
      warmth: 0.35, volume: 0.66,
    },
  },
  {
    name: 'Hyphae Stack', tag: 'synth',
    values: {
      aShape: 0.5, aUnison: 7, aDetune: 24, aLevel: 0.8,
      bShape: 0.5, bOct: -1, bUnison: 3, bDetune: 14, bLevel: 0.45,
      subLevel: 0.3, spread: 0.9, drift: 0.3,
      cutoff: 2600, res: 0.18, drive: 0.28, fEnv: 0.4, fVel: 0.4, keyTrack: 0.6,
      aAtk: 0.006, aDec: 1.2, aSus: 0.8, aRel: 0.6, ampVel: 0.45,
      fAtk: 0.05, fDec: 1, fSus: 0.5, fRel: 0.6,
      l1Shape: 0, l1Rate: 5.2, l1Fade: 0.7, l1Pitch: 14,
      // the wheel spreads the stack wider
      m1Src: 7, m1Dst: 6, m1Amt: 0.4,
      chMix: 0.35, chDepth: 0.45,
      dlMix: 0.25, dlTime: 3, dlFb: 0.4, dlTone: 0.5, dlPing: 1,
      rvMix: 0.35, rvSize: 0.8, rvDecay: 4, rvTone: 0.55,
      warmth: 0.4, volume: 0.64,
    },
  },
  // -------------------------------------------------------------------- plucks
  {
    name: 'Glass Fern', tag: 'pluck',
    values: {
      aShape: 0.0, aUnison: 3, aDetune: 4, aLevel: 0.7,
      bShape: 0.6, bPw: 0.2, bOct: 2, bFine: 2, bLevel: 0.25,
      subLevel: 0.25, spread: 0.7, drift: 0.3,
      cutoff: 2400, res: 0.2, drive: 0.1, fEnv: 0.45, fVel: 0.6, keyTrack: 0.8,
      aAtk: 0.001, aDec: 0.9, aSus: 0.0, aRel: 0.9, ampVel: 0.7,
      fAtk: 0.001, fDec: 0.35, fSus: 0.0, fRel: 0.4,
      arpMode: 1, arpRate: 5, arpOct: 3, arpGate: 0.3, tempo: 124,
      l2Shape: 0, l2Rate: 0.2, l2Pan: 0.35,
      chMix: 0.25, chDepth: 0.3,
      dlMix: 0.4, dlTime: 1, dlFb: 0.55, dlTone: 0.55,
      rvMix: 0.45, rvSize: 0.85, rvDecay: 7, rvShimmer: 0.5, rvTone: 0.6,
      warmth: 0.25,
    },
  },
  {
    name: 'Dewdrop', tag: 'pluck',
    values: {
      aShape: 0.0, aOct: 1, aUnison: 1, aLevel: 0.7,
      bShape: 0.0, bOct: 2, bSemi: 0, bFine: 4, bLevel: 0.3,
      subLevel: 0.2, spread: 0.4, drift: 0.3,
      cutoff: 3000, res: 0.15, drive: 0.1, fEnv: 0.5, fVel: 0.5, keyTrack: 0.8,
      aAtk: 0.001, aDec: 0.5, aSus: 0.0, aRel: 0.5, ampVel: 0.7,
      fAtk: 0.001, fDec: 0.15, fSus: 0.0, fRel: 0.2,
      l2Shape: 0, l2Rate: 0.3, l2Pan: 0.5,
      chMix: 0.2, dlMix: 0.45, dlTime: 1, dlFb: 0.5, dlTone: 0.6, dlPing: 1,
      rvMix: 0.4, rvSize: 0.8, rvDecay: 5, rvTone: 0.6,
      warmth: 0.25, volume: 0.85,
    },
  },
  {
    name: 'Kalimba Circuit', tag: 'pluck',
    values: {
      aShape: 0.75, aPw: 0.2, aUnison: 1, aLevel: 0.7,
      bShape: 0.0, bOct: 1, bSemi: 0, bFine: 2, bLevel: 0.5,
      subLevel: 0.3, spread: 0.3, drift: 0.2,
      cutoff: 1200, res: 0.5, drive: 0.2, fEnv: 0.7, fVel: 0.6, keyTrack: 0.6,
      aAtk: 0.001, aDec: 0.7, aSus: 0.0, aRel: 0.6, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.08, fSus: 0.0, fRel: 0.1,
      chMix: 0.15, dlMix: 0.3, dlTime: 2, dlFb: 0.4, dlTone: 0.5,
      rvMix: 0.35, rvSize: 0.7, rvDecay: 3, rvTone: 0.5,
      warmth: 0.4, volume: 0.85,
    },
  },
  {
    name: 'Sporocarp', tag: 'pluck',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.8,
      bShape: 1.0, bPw: 0.15, bOct: 2, bLevel: 0.25,
      subLevel: 0.2, spread: 0.45, drift: 0.15,
      cutoff: 4200, res: 0.28, fEnv: 0.55, fVel: 0.6, keyTrack: 0.8,
      aAtk: 0.001, aDec: 0.5, aSus: 0.0, aRel: 0.55, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.22, fSus: 0.0, fRel: 0.3,
      chMix: 0.25, chDepth: 0.3,
      dlMix: 0.3, dlTime: 2, dlFb: 0.45, dlTone: 0.6, dlPing: 1,
      rvMix: 0.45, rvSize: 0.75, rvDecay: 4.5, rvTone: 0.6, rvShimmer: 0.35,
      warmth: 0.25, volume: 0.82,
    },
  },
  // --------------------------------------------------------------------- leads
  {
    name: 'Overgrowth', tag: 'lead',
    values: {
      aShape: 0.5, aUnison: 4, aDetune: 18, aLevel: 0.8,
      bShape: 0.5, bOct: 0, bFine: -9, bUnison: 3, bDetune: 22, bLevel: 0.6,
      subLevel: 0.2, spread: 0.9, drift: 0.5,
      cutoff: 1600, res: 0.15, drive: 0.4, fEnv: 0.3, keyTrack: 0.5,
      aAtk: 0.03, aDec: 1, aSus: 0.8, aRel: 0.8,
      fAtk: 0.05, fDec: 1.2, fSus: 0.4, fRel: 0.6,
      l1Rate: 5, l1Fade: 0.4, l1Pitch: 8,
      voiceMode: 0, glide: 0,
      chMix: 0.45, chDepth: 0.7, chRate: 0.4,
      dlMix: 0.25, dlTime: 3, dlFb: 0.45,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3,
      warmth: 0.55,
    },
  },
  {
    name: 'Glowworm', tag: 'lead',
    values: {
      aShape: 0.5, aUnison: 1, aLevel: 0.85,
      bShape: 0.9, bPw: 0.3, bOct: 0, bFine: 6, bLevel: 0.5,
      subLevel: 0.2, spread: 0.2, drift: 0.4,
      cutoff: 1100, res: 0.4, drive: 0.5, fEnv: 0.5, fVel: 0.5, keyTrack: 0.6,
      aAtk: 0.006, aDec: 0.5, aSus: 0.8, aRel: 0.4,
      fAtk: 0.004, fDec: 0.4, fSus: 0.3, fRel: 0.3,
      l1Rate: 5.8, l1Fade: 0.5, l1Pitch: 9,
      voiceMode: 2, glide: 0.08,
      chMix: 0.2, dlMix: 0.35, dlTime: 3, dlFb: 0.45, dlTone: 0.4,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3,
      warmth: 0.6, volume: 0.75,
    },
  },
  {
    name: 'Whistle Fern', tag: 'lead',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.6,
      bLevel: 0, subLevel: 0.0, spread: 0, drift: 0.5, noiseLevel: 0.02,
      cutoff: 900, res: 0.97, drive: 0.1, fEnv: 0.0, keyTrack: 1.0, fVel: 0.2,
      aAtk: 0.03, aDec: 0.3, aSus: 0.9, aRel: 0.5,
      l1Rate: 5.5, l1Fade: 0.8, l1Pitch: 12,
      voiceMode: 2, glide: 0.15,
      chMix: 0.2, dlMix: 0.4, dlTime: 3, dlFb: 0.5, dlTone: 0.5,
      rvMix: 0.4, rvSize: 0.8, rvDecay: 5,
      warmth: 0.3, volume: 0.7,
    },
  },
  {
    name: 'Rust Saw', tag: 'lead',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 14, aLevel: 0.8,
      bShape: 0.5, bOct: -1, bFine: -5, bLevel: 0.5,
      subLevel: 0.15, spread: 0.6, drift: 0.5,
      cutoff: 2200, res: 0.15, drive: 0.85, fEnv: 0.25, fVel: 0.4, keyTrack: 0.5,
      aAtk: 0.01, aDec: 0.4, aSus: 0.9, aRel: 0.5,
      fAtk: 0.01, fDec: 0.5, fSus: 0.5, fRel: 0.4,
      l1Rate: 5, l1Fade: 0.7, l1Pitch: 7,
      voiceMode: 1, glide: 0.04,
      chMix: 0.25, dlMix: 0.3, dlTime: 2, dlFb: 0.4, dlTone: 0.35,
      rvMix: 0.25, rvSize: 0.6, rvDecay: 2.5,
      warmth: 0.8, volume: 0.7,
    },
  },
  // ---------------------------------------------------------------------- bass
  {
    name: 'Root System', tag: 'bass',
    values: {
      aShape: 0.5, aUnison: 1, aLevel: 0.85,
      bShape: 0.85, bPw: 0.5, bOct: -1, bFine: 0, bLevel: 0.6,
      subLevel: 0.7, subShape: 1, spread: 0.1, drift: 0.25,
      cutoff: 380, res: 0.35, drive: 0.55, fEnv: 0.7, fVel: 0.6, keyTrack: 0.2, fMode: 0,
      aAtk: 0.002, aDec: 0.5, aSus: 0.6, aRel: 0.12, ampVel: 0.4,
      fAtk: 0.001, fDec: 0.22, fSus: 0.05, fRel: 0.15,
      voiceMode: 2, glide: 0.06,
      chMix: 0, rvMix: 0.06, rvDecay: 1.2, dlMix: 0,
      warmth: 0.6, volume: 0.75,
    },
  },
  {
    name: 'Taproot', tag: 'bass',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.8,
      bShape: 0.5, bOct: 0, bFine: 0, bLevel: 0.35,
      subLevel: 0.8, subShape: 0, spread: 0, drift: 0.2,
      cutoff: 240, res: 0.1, drive: 0.6, fEnv: 0.45, fVel: 0.5, keyTrack: 0.3,
      aAtk: 0.002, aDec: 0.9, aSus: 0.7, aRel: 0.15, ampVel: 0.3,
      fAtk: 0.001, fDec: 0.3, fSus: 0.0, fRel: 0.1,
      voiceMode: 1, glide: 0.0,
      chMix: 0, rvMix: 0.04, rvDecay: 1, dlMix: 0,
      warmth: 0.75, volume: 0.8,
    },
  },
  {
    name: 'Acid Lichen', tag: 'bass',
    values: {
      aShape: 0.5, aUnison: 1, aLevel: 0.9,
      bLevel: 0, subLevel: 0.1, spread: 0, drift: 0.15,
      cutoff: 300, res: 0.8, drive: 0.5, fEnv: 0.75, fVel: 0.8, keyTrack: 0.2,
      aAtk: 0.002, aDec: 0.4, aSus: 0.5, aRel: 0.1, ampVel: 0.4,
      fAtk: 0.001, fDec: 0.18, fSus: 0.0, fRel: 0.1,
      voiceMode: 2, glide: 0.12,
      chMix: 0, dlMix: 0.2, dlTime: 2, dlFb: 0.35, dlTone: 0.3,
      rvMix: 0.08, rvDecay: 1.2,
      warmth: 0.6, volume: 0.8,
    },
  },
  {
    name: 'Wide Bed', tag: 'bass',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 8, aLevel: 0.7,
      bShape: 0.85, bPw: 0.4, bOct: -1, bLevel: 0.5,
      subLevel: 0.6, subShape: 1, spread: 0.6, drift: 0.3,
      cutoff: 700, res: 0.2, drive: 0.4, fEnv: 0.35, fVel: 0.4, keyTrack: 0.4, hpf: 30,
      aAtk: 0.01, aDec: 0.8, aSus: 0.8, aRel: 0.3,
      fAtk: 0.01, fDec: 0.5, fSus: 0.2, fRel: 0.3,
      chMix: 0.25, chRate: 0.4, chDepth: 0.3, chTone: 0.3,
      rvMix: 0.1, rvDecay: 1.5,
      warmth: 0.55, volume: 0.75,
    },
  },
  {
    name: 'Umbra', tag: 'bass',
    values: {
      // the counter-voice: mono, dark, and it bites when you dig in
      aShape: 0.75, aPw: 0.35, aOct: -1, aUnison: 2, aDetune: 8, aLevel: 0.85,
      bShape: 0.5, bOct: -1, bFine: -8, bUnison: 2, bDetune: 6, bLevel: 0.4,
      subLevel: 0.5, spread: 0.4, drift: 0.35,
      cutoff: 600, res: 0.42, drive: 0.45, fEnv: 0.6, fVel: 0.5, keyTrack: 0.45,
      aAtk: 0.003, aDec: 0.7, aSus: 0.55, aRel: 0.35, ampVel: 0.5,
      fAtk: 0.002, fDec: 0.4, fSus: 0.2, fRel: 0.4,
      voiceMode: 1, glide: 0.06,
      m1Src: 4, m1Dst: 13, m1Amt: 0.35,
      m2Src: 5, m2Dst: 12, m2Amt: 0.2,
      chMix: 0.15,
      dlMix: 0.15, dlTime: 2, dlFb: 0.35, dlTone: 0.35,
      rvMix: 0.22, rvSize: 0.6, rvDecay: 2.5, rvTone: 0.35,
      warmth: 0.5, volume: 0.85,
    },
  },
  {
    name: 'Undertow', tag: 'bass',
    values: {
      aShape: 0.5, aOct: -1, aUnison: 3, aDetune: 10, aLevel: 0.85,
      bShape: 0.8, bPw: 0.3, bOct: -1, bFine: 7, bLevel: 0.4,
      subLevel: 0.55, spread: 0.35, drift: 0.3,
      cutoff: 800, res: 0.3, drive: 0.35, fEnv: 0.5, fVel: 0.45, keyTrack: 0.4,
      aAtk: 0.003, aDec: 0.6, aSus: 0.7, aRel: 0.3, ampVel: 0.45,
      fAtk: 0.002, fDec: 0.35, fSus: 0.25, fRel: 0.3,
      l2Shape: 1, l2Rate: 3.9, l2Cut: 0.18,
      m1Src: 4, m1Dst: 4, m1Amt: 0.4,
      chMix: 0.18,
      dlMix: 0.12, dlTime: 1, dlFb: 0.3, dlTone: 0.3,
      rvMix: 0.2, rvSize: 0.55, rvDecay: 2, rvTone: 0.35,
      warmth: 0.5, volume: 0.66,
    },
  },
  // ---------------------------------------------------------- arps & sequences
  {
    name: 'Spore Drift', tag: 'arp',
    values: {
      aShape: 0.55, aPw: 0.45, aUnison: 2, aDetune: 6, aLevel: 0.8,
      bShape: 0.95, bPw: 0.25, bOct: -1, bFine: 3, bLevel: 0.4,
      subLevel: 0.2, noiseLevel: 0.02, spread: 0.5, drift: 0.3,
      cutoff: 1400, res: 0.45, drive: 0.3, fEnv: 0.6, fVel: 0.5, keyTrack: 0.3,
      aAtk: 0.003, aDec: 0.35, aSus: 0.0, aRel: 0.35,
      fAtk: 0.002, fDec: 0.25, fSus: 0.1, fRel: 0.3,
      l2Shape: 1, l2Rate: 0.07, l2Cut: 0.35,
      arpMode: 3, arpRate: 5, arpOct: 2, arpGate: 0.45, arpSwing: 0.12, tempo: 118,
      chMix: 0.2, dlMix: 0.35, dlTime: 3, dlFb: 0.5, dlTone: 0.5,
      rvMix: 0.3, rvSize: 0.6, rvDecay: 3.5,
      warmth: 0.35, volume: 0.85,
    },
  },
  {
    name: 'Grid Rain', tag: 'arp',
    values: {
      aShape: 0.75, aPw: 0.15, aUnison: 1, aLevel: 0.8,
      bShape: 0.5, bOct: 1, bSemi: 0, bFine: 5, bLevel: 0.35,
      subLevel: 0.3, spread: 0.5, drift: 0.2,
      cutoff: 800, res: 0.55, drive: 0.2, fEnv: 0.75, fVel: 0.4, keyTrack: 0.4,
      aAtk: 0.001, aDec: 0.2, aSus: 0.0, aRel: 0.2,
      fAtk: 0.001, fDec: 0.15, fSus: 0.0, fRel: 0.15,
      l1Shape: 4, l1Rate: 2, l1Cut: 0.2,
      arpMode: 4, arpRate: 5, arpOct: 2, arpGate: 0.35, tempo: 128, arpSwing: 0.05,
      chMix: 0.15,
      dlMix: 0.45, dlTime: 1, dlFb: 0.6, dlTone: 0.35, dlPing: 1,
      rvMix: 0.35, rvSize: 0.7, rvDecay: 4, rvTone: 0.35,
      warmth: 0.35, volume: 0.85,
    },
  },
  {
    name: 'Firefly Sequence', tag: 'arp',
    values: {
      aShape: 0.0, aUnison: 1, aLevel: 0.8,
      bShape: 1.0, bPw: 0.12, bOct: 1, bFine: 0, bLevel: 0.3,
      subLevel: 0.35, spread: 0.6, drift: 0.2,
      cutoff: 3000, res: 0.3, drive: 0.15, fEnv: 0.5, fVel: 0.5, keyTrack: 0.7,
      aAtk: 0.001, aDec: 0.28, aSus: 0.0, aRel: 0.4, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.12, fSus: 0.0, fRel: 0.2,
      arpMode: 6, arpRate: 3, arpOct: 1, arpGate: 0.25, tempo: 96, arpSwing: 0.2,
      l2Shape: 1, l2Rate: 0.11, l2Cut: 0.3,
      chMix: 0.3, chDepth: 0.3,
      dlMix: 0.4, dlTime: 3, dlFb: 0.55, dlTone: 0.6, dlPing: 1,
      rvMix: 0.4, rvSize: 0.75, rvDecay: 5, rvShimmer: 0.6, rvTone: 0.55,
      warmth: 0.3,
    },
  },
  {
    name: 'Mycelial Pulse', tag: 'arp',
    values: {
      aShape: 0.5, aUnison: 1, aLevel: 0.8,
      bShape: 0.9, bPw: 0.3, bOct: 0, bSemi: 0, bFine: 6, bLevel: 0.45,
      subLevel: 0.4, spread: 0.5, drift: 0.3,
      cutoff: 600, res: 0.35, drive: 0.35, fEnv: 0.6, fVel: 0.5, keyTrack: 0.4,
      aAtk: 0.002, aDec: 0.3, aSus: 0.2, aRel: 0.25,
      fAtk: 0.001, fDec: 0.2, fSus: 0.05, fRel: 0.2,
      l2Shape: 1, l2Rate: 0.09, l2Cut: 0.4,
      arpMode: 1, arpRate: 5, arpOct: 2, arpGate: 0.55, tempo: 120,
      chMix: 0.2, dlMix: 0.35, dlTime: 3, dlFb: 0.45, dlTone: 0.4, dlPing: 1,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3.5,
      warmth: 0.45, volume: 0.85,
    },
  },
  {
    name: 'Slow Vines', tag: 'arp',
    values: {
      aShape: 0.2, aUnison: 3, aDetune: 8, aLevel: 0.7,
      bShape: 0.3, bOct: 1, bSemi: 7, bFine: 3, bLevel: 0.3,
      subLevel: 0.3, spread: 0.8, drift: 0.5,
      cutoff: 800, res: 0.2, drive: 0.2, fEnv: 0.4, fVel: 0.3, keyTrack: 0.5,
      aAtk: 0.15, aDec: 1.5, aSus: 0.3, aRel: 2.5,
      fAtk: 0.2, fDec: 1.2, fSus: 0.2, fRel: 1.5,
      arpMode: 3, arpRate: 3, arpOct: 2, arpGate: 0.9, arpHold: 0, tempo: 84,
      l2Shape: 5, l2Rate: 0.1, l2Cut: 0.2, l2Pan: 0.4,
      chMix: 0.45, chRate: 0.35, chDepth: 0.6,
      dlMix: 0.3, dlTime: 3, dlFb: 0.5, dlTone: 0.3,
      rvMix: 0.5, rvSize: 0.9, rvDecay: 9, rvShimmer: 0.3,
      warmth: 0.4, volume: 0.8,
    },
  },
  {
    name: 'Circuit Bees', tag: 'arp',
    values: {
      aShape: 1.0, aPw: 0.1, aUnison: 1, aLevel: 0.8,
      bShape: 0.5, bOct: -1, bLevel: 0.4,
      subLevel: 0.3, spread: 0.4, drift: 0.2,
      cutoff: 1500, res: 0.6, drive: 0.3, fEnv: 0.55, fVel: 0.6, keyTrack: 0.4,
      aAtk: 0.001, aDec: 0.12, aSus: 0.0, aRel: 0.12,
      fAtk: 0.001, fDec: 0.09, fSus: 0.0, fRel: 0.1,
      l1Shape: 4, l1Rate: 6, l1Cut: 0.25,
      arpMode: 4, arpRate: 7, arpOct: 3, arpGate: 0.5, tempo: 132,
      chMix: 0.1, dlMix: 0.4, dlTime: 0, dlFb: 0.55, dlTone: 0.5, dlPing: 1,
      rvMix: 0.3, rvSize: 0.6, rvDecay: 2.5, rvTone: 0.4,
      warmth: 0.35, volume: 0.85,
    },
  },
  {
    name: 'Chord Strobe', tag: 'arp',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 12, aLevel: 0.7,
      bShape: 0.5, bOct: 1, bFine: -5, bUnison: 2, bDetune: 8, bLevel: 0.35,
      subLevel: 0.3, spread: 0.8, drift: 0.4,
      cutoff: 1000, res: 0.25, drive: 0.3, fEnv: 0.5, fVel: 0.4, keyTrack: 0.4,
      aAtk: 0.003, aDec: 0.25, aSus: 0.0, aRel: 0.3,
      fAtk: 0.002, fDec: 0.2, fSus: 0.0, fRel: 0.2,
      arpMode: 6, arpRate: 3, arpOct: 1, arpGate: 0.4, arpSwing: 0.1, tempo: 110,
      chMix: 0.4, chDepth: 0.5,
      dlMix: 0.35, dlTime: 3, dlFb: 0.5, dlTone: 0.35, dlPing: 1,
      rvMix: 0.4, rvSize: 0.8, rvDecay: 4,
      warmth: 0.4, volume: 0.85,
    },
  },
  {
    name: 'Snowfall', tag: 'arp',
    values: {
      aShape: 0.0, aUnison: 1, aOct: 1, aLevel: 0.88,
      bShape: 1.0, bPw: 0.1, bOct: 2, bLevel: 0.26,
      subLevel: 0.15, spread: 0.55, drift: 0.2,
      cutoff: 5000, res: 0.2, fEnv: 0.45, fVel: 0.5, keyTrack: 0.85,
      aAtk: 0.001, aDec: 0.32, aSus: 0.0, aRel: 0.45, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.16, fSus: 0.0, fRel: 0.25,
      arpMode: 3, arpRate: 5, arpOct: 2, arpGate: 0.3, arpSwing: 0.1, tempo: 104,
      // every note lands somewhere else in the stereo field
      m1Src: 9, m1Dst: 15, m1Amt: 0.5,
      chMix: 0.3, chDepth: 0.35,
      dlMix: 0.4, dlTime: 3, dlFb: 0.55, dlTone: 0.6, dlPing: 1,
      rvMix: 0.5, rvSize: 0.85, rvDecay: 7, rvTone: 0.6, rvShimmer: 0.5,
      warmth: 0.25, volume: 0.86,
    },
  },
  {
    name: 'Cassette Loop', tag: 'arp',
    values: {
      aShape: 0.5, aUnison: 2, aDetune: 10, aLevel: 0.75,
      bShape: 0.8, bPw: 0.35, bOct: -1, bLevel: 0.3,
      subLevel: 0.25, noiseLevel: 0.04, spread: 0.6, drift: 0.75,
      cutoff: 1900, res: 0.22, drive: 0.2, fEnv: 0.45, fVel: 0.4, keyTrack: 0.6,
      aAtk: 0.003, aDec: 0.35, aSus: 0.15, aRel: 0.5, ampVel: 0.55,
      fAtk: 0.002, fDec: 0.25, fSus: 0.05, fRel: 0.3,
      arpMode: 1, arpRate: 5, arpOct: 2, arpGate: 0.4, arpSwing: 0.18, tempo: 92,
      // a little tape wobble: each note sits a fraction of a semitone off
      m1Src: 9, m1Dst: 0, m1Amt: 0.012,
      chMix: 0.4, chRate: 0.7, chDepth: 0.6, chTone: 0.3,
      dlMix: 0.35, dlTime: 3, dlFb: 0.5, dlTone: 0.35, dlPing: 1,
      rvMix: 0.35, rvSize: 0.7, rvDecay: 4, rvTone: 0.4,
      warmth: 0.55, rot: 0.22, volume: 0.84,
    },
  },
  {
    name: 'Jitter Spores', tag: 'arp',
    values: {
      aShape: 0.85, aPw: 0.25, aUnison: 2, aDetune: 9, aLevel: 0.92,
      bShape: 0.85, bPw: 0.7, bFine: -9, bLevel: 0.55,
      subLevel: 0.3, spread: 0.6, drift: 0.4,
      cutoff: 1500, res: 0.45, drive: 0.3, fEnv: 0.55, fVel: 0.5, keyTrack: 0.5,
      aAtk: 0.002, aDec: 0.22, aSus: 0.1, aRel: 0.25, ampVel: 0.5,
      fAtk: 0.001, fDec: 0.14, fSus: 0.05, fRel: 0.2,
      arpMode: 4, arpRate: 5, arpOct: 2, arpGate: 0.35, tempo: 132,
      l1Shape: 4, l1Rate: 9, l1Fade: 0, l1Cut: 0.3,
      m1Src: 1, m1Dst: 4, m1Amt: 0.5,
      chMix: 0.2,
      dlMix: 0.3, dlTime: 2, dlFb: 0.5, dlTone: 0.4, dlPing: 1,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3, rvTone: 0.4,
      warmth: 0.4, volume: 0.92,
    },
  },
  // ------------------------------------------------------------------ textures
  {
    name: 'Wind Through Wires', tag: 'texture',
    values: {
      aLevel: 0.1, aShape: 0.0, aOct: 1, bLevel: 0, subLevel: 0, noiseLevel: 0.6, spread: 1, drift: 0.8,
      cutoff: 400, res: 0.9, drive: 0.2, fEnv: 0.0, keyTrack: 1.0, hpf: 80,
      aAtk: 3, aDec: 2, aSus: 1, aRel: 5,
      l1Shape: 5, l1Rate: 0.5, l1Cut: 0.6,
      l2Shape: 5, l2Rate: 0.15, l2Pan: 0.8, l2Cut: 0.3,
      chMix: 0.5, chRate: 0.2, chDepth: 0.8,
      dlMix: 0.3, dlTime: 6, dlFb: 0.6, dlTone: 0.2,
      rvMix: 0.6, rvSize: 1, rvDecay: 12, rvTone: 0.3,
      warmth: 0.3, volume: 0.7,
    },
  },
  {
    name: 'Cathedral Spores', tag: 'texture',
    values: {
      aShape: 0.0, aUnison: 2, aDetune: 3, aLevel: 0.6,
      bShape: 0.0, bOct: 1, bSemi: 7, bFine: 2, bLevel: 0.3,
      subLevel: 0.2, spread: 0.7, drift: 0.4,
      cutoff: 1600, res: 0.1, drive: 0.1, fEnv: 0.2, keyTrack: 0.7,
      aAtk: 0.01, aDec: 1, aSus: 0.0, aRel: 1.5, ampVel: 0.5,
      fAtk: 0.01, fDec: 0.6, fSus: 0.0, fRel: 0.5,
      arpMode: 4, arpRate: 4, arpOct: 3, arpGate: 0.5, tempo: 70,
      chMix: 0.3, dlMix: 0.4, dlTime: 4, dlFb: 0.6, dlTone: 0.4, dlPing: 1,
      rvMix: 0.7, rvSize: 1, rvDecay: 25, rvTone: 0.45, rvShimmer: 0.8,
      warmth: 0.3, volume: 0.7,
    },
  },
  {
    name: 'Tritone Hollow', tag: 'texture',
    values: {
      // the same chord, slightly wrong: a tritone in osc B and the network on
      aShape: 0.6, aUnison: 4, aDetune: 22, aLevel: 0.65,
      bShape: 0.75, bPw: 0.4, bSemi: 6, bUnison: 2, bDetune: 14, bLevel: 0.3,
      subLevel: 0.2, spread: 0.85, drift: 0.7,
      cutoff: 900, res: 0.35, drive: 0.25, fEnv: 0.4, keyTrack: 0.5,
      aAtk: 1.2, aDec: 2.5, aSus: 0.75, aRel: 4,
      fAtk: 2.5, fDec: 3, fSus: 0.3, fRel: 3,
      l1Shape: 5, l1Rate: 0.25, l1Fade: 0,
      l2Shape: 4, l2Rate: 0.9, l2Cut: 0.22,
      m1Src: 1, m1Dst: 6, m1Amt: 0.3,
      chMix: 0.45, chRate: 0.3, chDepth: 0.65,
      dlMix: 0.3, dlTime: 4, dlFb: 0.55, dlTone: 0.3, dlPing: 1,
      rvMix: 0.55, rvSize: 0.95, rvDecay: 11, rvTone: 0.3, rvShimmer: 0.25,
      warmth: 0.4, volume: 0.76,
      netAmount: 0.45, netRange: 7, netCut: 0.5, netPitch: 12, netDim: 0.35,
    },
  },
  // --------------------------------------- drums (the ladder self-oscillating)
  {
    name: 'Kick 808', tag: 'drum',
    values: {
      aShape: 0, aOct: -1, aUnison: 1, aLevel: 0.7, bLevel: 0, subLevel: 0, noiseLevel: 0.25, spread: 0, drift: 0,
      cutoff: 48, res: 1, drive: 0.7, fEnv: 0.6, fVel: 0.2, keyTrack: 0, fMode: 0, hpf: 10,
      aAtk: 0.001, aDec: 0.7, aSus: 0.0, aRel: 0.3, ampVel: 0.5,
      fAtk: 0.001, fDec: 0.06, fSus: 0.0, fRel: 0.05,
      voiceMode: 1, l1Fade: 0,
      chMix: 0, dlMix: 0, rvMix: 0.05, rvDecay: 0.8,
      warmth: 0.8, volume: 1,
    },
  },
  {
    name: 'Tom Grove', tag: 'drum',
    values: {
      aShape: 0, aOct: -1, aUnison: 1, aLevel: 0.7, bLevel: 0, subLevel: 0, noiseLevel: 0.2, spread: 0, drift: 0.2,
      cutoff: 110, res: 0.98, drive: 0.6, fEnv: 0.5, fVel: 0.2, keyTrack: 1.0, hpf: 20,
      aAtk: 0.001, aDec: 0.45, aSus: 0.0, aRel: 0.3, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.09, fSus: 0.0, fRel: 0.05,
      chMix: 0, dlMix: 0, rvMix: 0.2, rvSize: 0.6, rvDecay: 1.5,
      warmth: 0.7, volume: 1,
    },
  },
  {
    name: 'Snare Spark', tag: 'drum',
    values: {
      aLevel: 0, bLevel: 0, subLevel: 0, noiseLevel: 0.7, spread: 0, drift: 0,
      cutoff: 1800, res: 0.55, drive: 0.4, fEnv: 0.35, fVel: 0.3, keyTrack: 0.3, hpf: 200,
      aAtk: 0.001, aDec: 0.18, aSus: 0.0, aRel: 0.15, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.05, fSus: 0.0, fRel: 0.05,
      chMix: 0, dlMix: 0, rvMix: 0.25, rvSize: 0.5, rvDecay: 1.2, rvTone: 0.7,
      warmth: 0.7, volume: 1,
    },
  },
  {
    name: 'Hat Static', tag: 'drum',
    values: {
      aLevel: 0, bLevel: 0, subLevel: 0, noiseLevel: 1, spread: 0, drift: 0,
      cutoff: 9000, res: 0.3, drive: 0.9, fEnv: 0.2, fVel: 0.4, keyTrack: 0, hpf: 1500,
      aAtk: 0.001, aDec: 0.07, aSus: 0.0, aRel: 0.06, ampVel: 0.7,
      fAtk: 0.001, fDec: 0.03, fSus: 0.0, fRel: 0.03,
      chMix: 0, dlMix: 0, rvMix: 0.1, rvDecay: 0.8, rvTone: 0.8,
      warmth: 0.8, volume: 1,
    },
  },
  {
    name: 'Drum Arp', tag: 'drum',
    values: {
      aShape: 0, aOct: -1, aUnison: 1, aLevel: 0.6, bLevel: 0, subLevel: 0, noiseLevel: 0.35, spread: 0.3, drift: 0.1,
      cutoff: 70, res: 0.97, drive: 0.7, fEnv: 0.55, fVel: 0.4, keyTrack: 1.0, hpf: 15,
      aAtk: 0.001, aDec: 0.25, aSus: 0.0, aRel: 0.2, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.05, fSus: 0.0, fRel: 0.04,
      arpMode: 4, arpRate: 5, arpOct: 3, arpGate: 0.3, arpSwing: 0.08, tempo: 100,
      chMix: 0, dlMix: 0.2, dlTime: 2, dlFb: 0.3, dlTone: 0.3,
      rvMix: 0.15, rvSize: 0.5, rvDecay: 1.2,
      warmth: 0.7, volume: 1,
    },
  },
  // ------------------------------------------------ pumped: the pump and synced LFOs
  {
    name: 'Heartwood Pump', tag: 'synth',
    values: {
      aShape: 0.5, aUnison: 7, aDetune: 28, aLevel: 0.75,
      bShape: 0.5, bOct: 1, bFine: 4, bUnison: 5, bDetune: 22, bLevel: 0.4,
      subLevel: 0.25, spread: 0.9, drift: 0.2,
      cutoff: 4200, res: 0.1, drive: 0.2, fEnv: 0.15, keyTrack: 0.5, hpf: 80,
      aAtk: 0.004, aDec: 0.5, aSus: 1, aRel: 0.45,
      fAtk: 0.004, fDec: 0.4, fSus: 0.6, fRel: 0.4,
      pumpAmt: 0.85, pumpRate: 2, pumpRel: 0.85, pumpCurve: 0.3,
      m1Src: 11, m1Dst: 11, m1Amt: -0.25,
      chMix: 0.25, chDepth: 0.4,
      dlMix: 0.18, dlTime: 3, dlFb: 0.35, dlTone: 0.55,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 2.5, rvTone: 0.6,
      tempo: 140, warmth: 0.35, volume: 0.65,
    },
  },
  {
    name: 'Glowcap Lead', tag: 'lead',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 14, aLevel: 0.8,
      bShape: 0.8, bPw: 0.3, bOct: 1, bFine: -3, bLevel: 0.35,
      spread: 0.5, drift: 0.2,
      cutoff: 3000, res: 0.2, drive: 0.35, fEnv: 0.3, fVel: 0.4, keyTrack: 0.6,
      aAtk: 0.003, aDec: 0.4, aSus: 0.9, aRel: 0.3,
      fAtk: 0.003, fDec: 0.35, fSus: 0.5, fRel: 0.3,
      l1Rate: 5.5, l1Fade: 0.5, l1Pitch: 12,
      voiceMode: 2, glide: 0.06, bend: 12,
      pumpAmt: 0.35, pumpRate: 2, pumpRel: 0.6, pumpCurve: 0.4,
      chMix: 0.2, dlMix: 0.3, dlTime: 3, dlFb: 0.4, dlTone: 0.5, dlPing: 1,
      rvMix: 0.3, rvSize: 0.7, rvDecay: 3, rvTone: 0.6,
      tempo: 140, warmth: 0.35, volume: 0.65,
    },
  },
  {
    name: 'Lumen Pulse', tag: 'arp',
    values: {
      aShape: 0.85, aPw: 0.3, aOct: 1, aLevel: 0.9,
      bShape: 0.5, bOct: 2, bFine: 5, bLevel: 0.25,
      spread: 0.6, drift: 0.15,
      cutoff: 2600, res: 0.15, drive: 0.1, fEnv: 0.5, fVel: 0.5, keyTrack: 0.7,
      aAtk: 0.001, aDec: 0.25, aSus: 0.0, aRel: 0.25, ampVel: 0.5,
      fAtk: 0.001, fDec: 0.18, fSus: 0.0, fRel: 0.2,
      arpMode: 3, arpRate: 5, arpOct: 2, arpGate: 0.5, tempo: 140,
      pumpAmt: 0.6, pumpRate: 2, pumpRel: 0.8, pumpCurve: 0.35,
      dlMix: 0.3, dlTime: 3, dlFb: 0.45, dlTone: 0.6, dlPing: 1,
      rvMix: 0.35, rvSize: 0.8, rvDecay: 4, rvTone: 0.65, rvShimmer: 0.25,
      warmth: 0.25, volume: 1,
    },
  },
  {
    name: 'Burrow Wobble', tag: 'bass',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 10, aOct: -1, aLevel: 0.8,
      bShape: 0.95, bPw: 0.5, bOct: -1, bFine: -5, bLevel: 0.5,
      subShape: 1, subLevel: 0.5, spread: 0.3, drift: 0.1,
      cutoff: 220, res: 0.45, drive: 0.6, fEnv: 0.1, keyTrack: 0.3,
      aAtk: 0.003, aDec: 0.3, aSus: 1, aRel: 0.15,
      l1Shape: 0, l1Sync: 9, l1Fade: 0, l1Cut: 0.9,
      voiceMode: 2, glide: 0.04,
      pumpAmt: 0.5, pumpRate: 2, pumpRel: 0.5, pumpCurve: 0.5,
      chMix: 0, rvMix: 0.1, rvDecay: 1.2,
      tempo: 140, warmth: 0.5, volume: 0.7,
    },
  },
  {
    name: 'Tidewood Breath', tag: 'pad',
    values: {
      aShape: 0.45, aUnison: 5, aDetune: 18, aLevel: 0.7,
      bShape: 0.3, bOct: 1, bFine: 5, bUnison: 3, bDetune: 12, bLevel: 0.35,
      subLevel: 0.2, spread: 0.85, drift: 0.3,
      cutoff: 1800, res: 0.12, drive: 0.15, fEnv: 0.2, keyTrack: 0.5, hpf: 60,
      aAtk: 0.35, aDec: 1, aSus: 1, aRel: 1.8,
      fAtk: 0.6, fDec: 1.5, fSus: 0.6, fRel: 1.5,
      pumpAmt: 0.7, pumpRate: 1, pumpRel: 0.95, pumpCurve: 0.15, pumpWhere: 1,
      chMix: 0.4, chDepth: 0.5,
      rvMix: 0.4, rvSize: 0.85, rvDecay: 5, rvTone: 0.55, rvShimmer: 0.15,
      tempo: 120, warmth: 0.4, volume: 0.7,
    },
  },
  {
    name: 'Lichen Tide', tag: 'pad',
    values: {
      aShape: 0.5, aUnison: 6, aDetune: 22, aLevel: 0.75,
      bShape: 0.7, bPw: 0.35, bOct: 0, bFine: -6, bUnison: 3, bDetune: 14, bLevel: 0.4,
      subLevel: 0.15, spread: 0.9, drift: 0.25,
      cutoff: 1100, res: 0.3, drive: 0.2, fEnv: 0.1, keyTrack: 0.5, hpf: 70,
      aAtk: 0.08, aDec: 1, aSus: 1, aRel: 1.2,
      l2Shape: 0, l2Sync: 2, l2Cut: 0.45,
      pumpAmt: 0.75, pumpRate: 2, pumpRel: 0.85, pumpCurve: 0.3,
      chMix: 0.3, chDepth: 0.45,
      dlMix: 0.15, dlTime: 3, dlFb: 0.35, dlTone: 0.5,
      rvMix: 0.35, rvSize: 0.75, rvDecay: 3.5, rvTone: 0.6,
      tempo: 128, warmth: 0.35, volume: 0.65,
    },
  },
  {
    name: 'Lantern Keys', tag: 'keys',
    values: {
      aShape: 0.15, aLevel: 0.8,
      bShape: 0.75, bPw: 0.4, bOct: 1, bFine: 4, bLevel: 0.3,
      subLevel: 0.2, spread: 0.5, drift: 0.2,
      cutoff: 1600, res: 0.1, drive: 0.15, fEnv: 0.45, fVel: 0.6, keyTrack: 0.7,
      aAtk: 0.002, aDec: 1.6, aSus: 0.45, aRel: 0.6, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.7, fSus: 0.2, fRel: 0.5,
      pumpAmt: 0.55, pumpRate: 2, pumpRel: 0.8, pumpCurve: 0.35, pumpWhere: 1,
      chMix: 0.45, chRate: 0.7, chDepth: 0.4,
      dlMix: 0.2, dlTime: 3, dlFb: 0.35, dlTone: 0.45, dlPing: 1,
      rvMix: 0.3, rvSize: 0.65, rvDecay: 2.5, rvTone: 0.55,
      tempo: 116, warmth: 0.4, volume: 0.8,
    },
  },
  {
    name: 'Dew Chords', tag: 'pluck',
    values: {
      aShape: 0.5, aUnison: 4, aDetune: 16, aLevel: 0.8,
      bShape: 0.5, bOct: 1, bFine: 3, bUnison: 2, bDetune: 10, bLevel: 0.3,
      spread: 0.8, drift: 0.2,
      cutoff: 900, res: 0.2, drive: 0.2, fEnv: 0.65, fVel: 0.5, keyTrack: 0.6,
      aAtk: 0.002, aDec: 0.6, aSus: 0.0, aRel: 0.45, ampVel: 0.5,
      fAtk: 0.001, fDec: 0.25, fSus: 0.0, fRel: 0.3,
      pumpAmt: 0.6, pumpRate: 3, pumpRel: 0.9, pumpCurve: 0.4, pumpWhere: 1,
      chMix: 0.3, dlMix: 0.3, dlTime: 3, dlFb: 0.45, dlTone: 0.5, dlPing: 1,
      rvMix: 0.35, rvSize: 0.7, rvDecay: 3, rvTone: 0.6,
      tempo: 124, warmth: 0.3, volume: 1,
    },
  },
  {
    name: 'Glimmer Steps', tag: 'arp',
    values: {
      aShape: 0.3, aOct: 1, aLevel: 0.85,
      bShape: 0.6, bPw: 0.25, bOct: 2, bFine: -4, bLevel: 0.2,
      spread: 0.7, drift: 0.15,
      cutoff: 1500, res: 0.25, drive: 0.1, fEnv: 0.4, fVel: 0.4, keyTrack: 0.7,
      aAtk: 0.001, aDec: 0.35, aSus: 0.0, aRel: 0.4, ampVel: 0.5,
      fAtk: 0.001, fDec: 0.25, fSus: 0.0, fRel: 0.3,
      l2Shape: 1, l2Sync: 1, l2Cut: 0.4,
      arpMode: 1, arpRate: 4, arpOct: 2, arpGate: 0.45, tempo: 110,
      pumpAmt: 0.45, pumpRate: 2, pumpRel: 0.8, pumpCurve: 0.35,
      dlMix: 0.3, dlTime: 4, dlFb: 0.4, dlTone: 0.5, dlPing: 1,
      rvMix: 0.4, rvSize: 0.8, rvDecay: 4.5, rvTone: 0.6, rvShimmer: 0.2,
      warmth: 0.3, volume: 1,
    },
  },
  {
    name: 'Pulsing Loam', tag: 'bass',
    values: {
      aShape: 0.5, aOct: -1, aUnison: 2, aDetune: 8, aLevel: 0.8,
      bShape: 0.0, bOct: -1, bLevel: 0.4,
      subShape: 0, subLevel: 0.6, spread: 0.2, drift: 0.1,
      cutoff: 380, res: 0.2, drive: 0.35, fEnv: 0.3, fVel: 0.3, keyTrack: 0.3,
      aAtk: 0.003, aDec: 0.4, aSus: 1, aRel: 0.2,
      fAtk: 0.002, fDec: 0.3, fSus: 0.3, fRel: 0.2,
      voiceMode: 1,
      pumpAmt: 0.8, pumpRate: 2, pumpRel: 0.75, pumpCurve: 0.55,
      chMix: 0, rvMix: 0.08, rvDecay: 1,
      tempo: 124, warmth: 0.45, volume: 0.62,
    },
  },
  // ----------------------------------------------- living: the "on top" layers
  {
    name: 'Symbiosis', tag: 'living',
    values: {
      aShape: 0.4, aUnison: 3, aDetune: 10, aLevel: 0.7,
      bShape: 0.6, bOct: 1, bFine: -5, bUnison: 2, bDetune: 8, bLevel: 0.3,
      subLevel: 0.3, spread: 0.8, drift: 0.4,
      cutoff: 700, res: 0.25, drive: 0.2, fEnv: 0.3, keyTrack: 0.4,
      aAtk: 0.8, aDec: 1.5, aSus: 0.85, aRel: 2.5,
      fAtk: 1.5, fDec: 3, fSus: 0.4, fRel: 2,
      l1Shape: 0, l1Rate: 0.35, l1Fade: 0,
      netAmount: 0.8, netRange: 9, netCut: 0.8, netPitch: 12, netDim: 0.4,
      chMix: 0.45, chDepth: 0.55, rvMix: 0.4, rvSize: 0.8, rvDecay: 6,
      warmth: 0.4,
    },
  },
  {
    name: 'Seed Garden', tag: 'living',
    values: {
      aShape: 0.0, aOct: 1, aUnison: 1, aLevel: 0.7,
      bShape: 0.6, bPw: 0.25, bOct: 2, bFine: 3, bLevel: 0.25,
      subLevel: 0.25, spread: 0.6, drift: 0.3,
      cutoff: 2400, res: 0.2, drive: 0.1, fEnv: 0.45, fVel: 0.6, keyTrack: 0.8,
      aAtk: 0.001, aDec: 0.7, aSus: 0.0, aRel: 0.8, ampVel: 0.7,
      fAtk: 0.001, fDec: 0.2, fSus: 0.0, fRel: 0.3,
      gardenOn: 1, gardenRate: 5, gardenScale: 0, gardenLife: 5, gardenBranch: 0.35, gardenFade: 0.14, gardenReach: 2, gardenGate: 0.6, tempo: 112,
      l2Shape: 0, l2Rate: 0.2, l2Pan: 0.5,
      chMix: 0.25, dlMix: 0.4, dlTime: 3, dlFb: 0.5, dlTone: 0.5, dlPing: 1,
      rvMix: 0.45, rvSize: 0.85, rvDecay: 6, rvTone: 0.55, rvShimmer: 0.3,
      warmth: 0.3, volume: 0.8,
    },
  },
  {
    name: 'Fifths Forest', tag: 'living',
    values: {
      aShape: 0.3, aUnison: 2, aDetune: 6, aLevel: 0.7,
      bShape: 0.3, bOct: 1, bFine: -4, bLevel: 0.35,
      subLevel: 0.3, spread: 0.7, drift: 0.5,
      cutoff: 900, res: 0.2, drive: 0.2, fEnv: 0.35, fVel: 0.3, keyTrack: 0.5, fMode: 1,
      aAtk: 0.2, aDec: 2, aSus: 0.0, aRel: 3, ampVel: 0.4,
      fAtk: 0.3, fDec: 1.5, fSus: 0.0, fRel: 2,
      gardenOn: 1, gardenRate: 1, gardenScale: 6, gardenLife: 6, gardenBranch: 0.5, gardenFade: 0.1, gardenReach: 3, gardenGate: 1.6, tempo: 72,
      netAmount: 0.5, netRange: 12, netCut: 0.4, netPitch: 6, netDim: 0.5,
      chMix: 0.5, chRate: 0.3, chDepth: 0.7,
      rvMix: 0.6, rvSize: 1, rvDecay: 14, rvTone: 0.4, rvShimmer: 0.5,
      warmth: 0.4, volume: 0.75,
    },
  },
  {
    name: 'Compost', tag: 'living',
    values: {
      aShape: 0.9, aPw: 0.38, aUnison: 2, aDetune: 5, aLevel: 0.75,
      bShape: 0.0, bOct: -1, bFine: -4, bLevel: 0.5,
      subLevel: 0.1, spread: 0.4, drift: 0.4,
      cutoff: 1100, res: 0.25, drive: 0.35, fEnv: 0.5, fVel: 0.6, keyTrack: 0.6,
      aAtk: 0.002, aDec: 1.4, aSus: 0.55, aRel: 0.6, ampVel: 0.6,
      fAtk: 0.001, fDec: 0.9, fSus: 0.15, fRel: 0.5,
      rot: 0.0, rotAuto: 3,
      chMix: 0.4, chRate: 0.8, chDepth: 0.45, chTone: 0.6,
      dlMix: 0.15, dlTime: 3, dlFb: 0.3,
      rvMix: 0.28, rvSize: 0.5, rvDecay: 2.2,
      warmth: 0.5,
    },
  },
  {
    name: 'Night Rain', tag: 'living',
    values: {
      aShape: 0.5, aUnison: 3, aDetune: 10, aLevel: 0.7,
      bShape: 0.5, bOct: 0, bFine: 10, bUnison: 2, bDetune: 8, bLevel: 0.5,
      subLevel: 0.2, spread: 0.7, drift: 0.5,
      cutoff: 1400, res: 0.3, drive: 0.25, fEnv: 0.5, fVel: 0.5, keyTrack: 0.5,
      aAtk: 0.004, aDec: 0.9, aSus: 0.6, aRel: 0.9, ampVel: 0.5,
      fAtk: 0.002, fDec: 0.5, fSus: 0.2, fRel: 0.5,
      climate: 3, climateAmt: 0.7,
      chMix: 0.5, chRate: 0.6, chDepth: 0.55,
      dlMix: 0.25, dlTime: 3, dlFb: 0.45, dlTone: 0.35,
      rvMix: 0.3, rvSize: 0.6, rvDecay: 2.5,
      warmth: 0.45,
    },
  },
  {
    name: 'Storm Cell', tag: 'living',
    values: {
      aShape: 0.5, aUnison: 4, aDetune: 16, aLevel: 0.8,
      bShape: 0.5, bOct: -1, bFine: -7, bUnison: 2, bDetune: 12, bLevel: 0.55,
      subLevel: 0.25, spread: 0.9, drift: 0.4,
      cutoff: 1300, res: 0.15, drive: 0.3, fEnv: 0.3, keyTrack: 0.5,
      aAtk: 0.03, aDec: 1, aSus: 0.8, aRel: 1,
      fAtk: 0.05, fDec: 1.2, fSus: 0.4, fRel: 0.6,
      l1Shape: 5, l1Rate: 1.2, l1Fade: 0,
      climate: 4, climateAmt: 0.8,
      netAmount: 0.6, netRange: 6, netCut: -0.6, netPitch: -10, netDim: 0.2,
      chMix: 0.35, chDepth: 0.6, dlMix: 0.3, dlTime: 2, dlFb: 0.4,
      rvMix: 0.35, rvSize: 0.8, rvDecay: 4,
      warmth: 0.5, volume: 0.65,
    },
  },
  // ---------------------------------------------------------------------- init
  {
    name: 'Init', tag: 'init',
    values: {},
  },
];

import { Synth } from './audio.ts';
import { MidiInput } from './midi.ts';
import { KeyboardView, ComputerKeys, FIRST, LAST } from './keyboard.ts';
import { Organism, Scope } from './ui/organism.ts';
import { makeControl, type Control } from './ui/controls.ts';
import { PARAMS, PARAM_BY_ID, PRESETS, defaults, fromNorm, toNorm, MOD_SLOTS, type ParamValues } from './dsp/params.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const synth = new Synth();
const values: ParamValues = defaults();
const controls = new Map<string, Control>();

// ---- audio start -----------------------------------------------------------

const startBtn = $<HTMLButtonElement>('#start');
async function startAudio(): Promise<void> {
  if (synth.running) return;
  startBtn.disabled = true;
  startBtn.textContent = 'waking…';
  try {
    await synth.start();
    synth.loadPreset(values);
    startBtn.textContent = `awake · ${synth.latencyMs.toFixed(0)} ms`;
  } catch (err) {
    startBtn.disabled = false;
    startBtn.textContent = 'wake';
    console.error(err);
    alert(`Could not start audio: ${(err as Error).message}`);
  }
}
startBtn.addEventListener('click', startAudio);
window.addEventListener('pointerdown', () => void startAudio(), { once: true });
window.addEventListener('keydown', () => void startAudio(), { once: true });

// ---- visuals ---------------------------------------------------------------

const organism = new Organism($<HTMLCanvasElement>('#organism'));
const scope = new Scope($<HTMLCanvasElement>('#scope'));
synth.onNote = (n) => organism.pulse(n.note, n.velocity * 127);

// ---- note routing ----------------------------------------------------------

const handler = {
  noteOn(note: number, velocity: number) {
    void startAudio();
    synth.noteOn(note, velocity);
    keyboard.setPressed(note, true);
    organism.pulse(note, velocity);
  },
  noteOff(note: number) {
    synth.noteOff(note);
    keyboard.setPressed(note, false);
  },
  cc(cc: number, value: number) {
    synth.cc(cc, value);
    if (cc === 64) keyboard.setSustain(value >= 64);
  },
  bend(value: number) { synth.bend(value); },
};

const keyboard = new KeyboardView($<HTMLCanvasElement>('#keyboard'), handler);
const octaveLabel = $('#octave');
new ComputerKeys(handler, (o) => (octaveLabel.textContent = `C${o}`));

const master = $<HTMLInputElement>('#master');
master.addEventListener('input', () => {
  const v = Number(master.value);
  onParam('volume', v);
  controls.get('volume')?.set(v);
});

$<HTMLButtonElement>('#panic').addEventListener('click', () => {
  synth.panic();
  for (let n = FIRST; n <= LAST; n++) keyboard.setPressed(n, false);
});

window.addEventListener('keydown', (e) => {
  if (e.code === 'Space' && !e.repeat && !(e.target instanceof HTMLInputElement) && !(e.target instanceof HTMLSelectElement)) {
    e.preventDefault(); handler.cc(64, 127);
  }
});
window.addEventListener('keyup', (e) => {
  if (e.code === 'Space') { e.preventDefault(); handler.cc(64, 0); }
});

// 1–4 switch family, ` opens the preset browser, Esc closes it. The letter
// keys are all taken by the computer keyboard, hence the backquote.
window.addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.key === 'Escape') { closeBrowser(); return; }
  const t = e.target as HTMLElement | null;
  if (t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA')) return;
  if (e.key === '`') { e.preventDefault(); openBrowser(); return; }
  const i = ['1', '2', '3', '4'].indexOf(e.key);
  if (i >= 0) showTab(TABS[i].id);
});

// ---- panels ----------------------------------------------------------------

interface Group { title?: string; ids: string[]; cls?: string }
interface PanelSpec {
  title: string; sub?: string; cls: string; span: number; tab: string; groups: Group[];
  /** a living layer: the window folds to one line while the layer is off */
  layer?: string;
}

/** Whether each living layer is doing anything; all four are off at zero. */
const LAYER_ON: Record<string, (v: ParamValues) => boolean> = {
  net: (v) => v.netAmount > 0,
  garden: (v) => v.gardenOn >= 0.5,
  rot: (v) => v.rot > 0 || v.rotAuto > 0,
  climate: (v) => Math.round(v.climate) > 0 && v.climateAmt > 0,
};

/**
 * Four families. Everything that makes the tone lives in "voice"; everything
 * that moves it lives in "motion"; everything that places it lives in
 * "space"; the four layers a normal synth does not have live in "living".
 */
const TABS: { id: string; name: string; hint: string }[] = [
  { id: 'voice', name: 'voice', hint: 'oscillators · filter · envelopes' },
  { id: 'motion', name: 'motion', hint: 'lfos · matrix · arpeggiator' },
  { id: 'space', name: 'space', hint: 'ensemble · delay · canopy · out' },
  { id: 'living', name: 'living', hint: 'network · garden · rot · climate' },
];

const LAYOUT: PanelSpec[] = [
  // ---- voice: what the sound is
  { tab: 'voice', title: 'Osc A', sub: 'tri · saw · pulse', cls: 'osc', span: 3, groups: [{ ids: ['aShape', 'aPw', 'aOct', 'aSemi', 'aFine', 'aUnison', 'aDetune', 'aLevel'] }] },
  { tab: 'voice', title: 'Osc B', sub: 'tri · saw · pulse', cls: 'osc', span: 3, groups: [{ ids: ['bShape', 'bPw', 'bOct', 'bSemi', 'bFine', 'bUnison', 'bDetune', 'bLevel'] }] },
  { tab: 'voice', title: 'Mix', sub: 'sub · noise · analogue', cls: 'mix', span: 3, groups: [{ ids: ['subShape', 'subLevel', 'noiseLevel', 'spread', 'drift'] }] },
  { tab: 'voice', title: 'Filter', sub: 'transistor ladder', cls: 'filter', span: 3, groups: [{ ids: ['cutoff', 'res', 'drive', 'fMode', 'keyTrack', 'fEnv', 'fVel', 'hpf'] }] },
  { tab: 'voice', title: 'Envelopes', cls: 'env', span: 6, groups: [
    { title: 'amp', ids: ['aAtk', 'aDec', 'aSus', 'aRel', 'ampVel'] },
    { title: 'filter', ids: ['fAtk', 'fDec', 'fSus', 'fRel'] },
  ] },
  { tab: 'voice', title: 'Voice', sub: 'allocation · glide', cls: 'voice', span: 3, groups: [{ ids: ['voiceMode', 'glide', 'poly', 'bend'] }] },

  // ---- motion: what moves it
  { tab: 'motion', title: 'LFO 1', sub: 'per voice', cls: 'lfo', span: 3, groups: [{ ids: ['l1Shape', 'l1Rate', 'l1Fade', 'l1Pitch', 'l1Cut', 'l1Pw'] }] },
  { tab: 'motion', title: 'LFO 2', sub: 'global', cls: 'lfo', span: 3, groups: [{ ids: ['l2Shape', 'l2Rate', 'l2Cut', 'l2Shape2', 'l2Pan', 'l2Amp'] }] },
  { tab: 'motion', title: 'Arp', sub: 'internal clock', cls: 'arp', span: 6, groups: [{ ids: ['arpMode', 'arpRate', 'arpOct', 'arpGate', 'arpSwing', 'arpHold', 'tempo'] }] },
  { tab: 'motion', title: 'Matrix', sub: 'six slots · anything to anywhere in the voice', cls: 'matrix', span: 12,
    groups: Array.from({ length: MOD_SLOTS }, (_, i) => ({ title: String(i + 1), cls: 'slot', ids: [`m${i + 1}Src`, `m${i + 1}Dst`, `m${i + 1}Amt`] })) },

  // ---- space: where it is
  { tab: 'space', title: 'Ensemble', sub: 'bbd chorus', cls: 'fx', span: 3, groups: [{ ids: ['chMix', 'chRate', 'chDepth', 'chTone'] }] },
  { tab: 'space', title: 'Delay', sub: 'tape · synced', cls: 'fx', span: 3, groups: [{ ids: ['dlMix', 'dlTime', 'dlFb', 'dlTone', 'dlPing'] }] },
  { tab: 'space', title: 'Canopy', sub: 'hall · shimmer', cls: 'out', span: 4, groups: [{ ids: ['rvMix', 'rvSize', 'rvDecay', 'rvTone', 'rvShimmer'] }] },
  { tab: 'space', title: 'Out', sub: 'tape warmth', cls: 'out', span: 2, groups: [{ ids: ['warmth', 'volume'] }] },

  // ---- living: all off by default; at zero the synth above is untouched
  { tab: 'living', title: 'Network', sub: 'voices feed their neighbours', cls: 'living', layer: 'net', span: 3, groups: [{ ids: ['netAmount', 'netRange', 'netCut', 'netPitch', 'netDim'] }] },
  { tab: 'living', title: 'Garden', sub: 'growth sequencer · replaces arp', cls: 'living', layer: 'garden', span: 5, groups: [{ ids: ['gardenOn', 'gardenRate', 'gardenScale', 'gardenLife', 'gardenBranch', 'gardenFade', 'gardenReach', 'gardenGate'] }] },
  { tab: 'living', title: 'Rot', sub: 'the patch ages', cls: 'living', layer: 'rot', span: 2, groups: [{ ids: ['rot', 'rotAuto'] }] },
  { tab: 'living', title: 'Climate', sub: 'one knob, five weathers', cls: 'living', layer: 'climate', span: 2, groups: [{ ids: ['climate', 'climateAmt'] }] },
];

function onParam(id: string, v: number): void {
  values[id] = v;
  synth.setParam(id, v);
  setCurrent(null);
  if (id === 'volume') master.value = String(v);
  refreshLayers();
}

function refreshLayers(expandOn = false): void {
  for (const [layer, { panel, meta }] of layerPanels) {
    const off = !LAYER_ON[layer](values);
    meta.textContent = off ? 'off' : 'on';
    panel.classList.toggle('off', off);
    if (expandOn) panel.classList.toggle('collapsed', off);
  }
}

const panelsEl = $('#panels');
const layerPanels = new Map<string, { panel: HTMLElement; meta: HTMLElement }>();
for (const spec of LAYOUT) {
  const panel = document.createElement('section');
  panel.className = `panel ${spec.cls}`;
  panel.style.gridColumn = `span ${spec.span}`;
  panel.dataset.tab = spec.tab;
  const h = document.createElement('h2');
  h.textContent = spec.title;
  if (spec.sub) { const s = document.createElement('small'); s.textContent = spec.sub; h.append(s); }
  if (spec.layer) {
    // layers fold to one line; the header says whether it is on and toggles
    const meta = document.createElement('span'); meta.className = 'meta';
    h.append(meta);
    h.classList.add('fold');
    h.addEventListener('click', () => panel.classList.toggle('collapsed'));
    layerPanels.set(spec.layer, { panel, meta });
  }
  const body = document.createElement('div');
  body.className = 'body';
  for (const g of spec.groups) {
    let host: HTMLElement = body;
    if (g.title) {
      const sg = document.createElement('div'); sg.className = `subgroup ${g.cls ?? ''}`;
      const t = document.createElement('div'); t.className = 'title'; t.textContent = g.title;
      const row = document.createElement('div'); row.className = 'row';
      sg.append(t, row); body.append(sg); host = row;
    }
    for (const id of g.ids) {
      const def = PARAM_BY_ID[id];
      if (!def) { console.warn('unknown param', id); continue; }
      const c = makeControl(def, values[id], (v) => onParam(id, v), 8);
      controls.set(id, c);
      host.append(c.el);
    }
  }
  panel.append(h, body);
  panelsEl.append(panel);
}

// ---- families (tabs) -------------------------------------------------------

const tabsEl = $('#tabs');
const tabButtons = new Map<string, HTMLButtonElement>();
function showTab(id: string): void {
  for (const [t, b] of tabButtons) b.classList.toggle('on', t === id);
  for (const el of panelsEl.querySelectorAll<HTMLElement>('.panel')) el.hidden = el.dataset.tab !== id;
  try { localStorage.setItem('mycelia.tab', id); } catch { /* private mode */ }
}
for (const t of TABS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tab';
  b.innerHTML = `<span>${t.name}</span><small>${t.hint}</small>`;
  b.addEventListener('click', () => showTab(t.id));
  tabsEl.append(b); tabButtons.set(t.id, b);
}

// ---- presets ---------------------------------------------------------------

// Categories, in the order they should appear in the browser. Anything with a
// tag not listed here is appended at the end under its own name.
const CATEGORY_NAMES: Record<string, string> = {
  ascent: 'the ascent', pad: 'pads', keys: 'keys', pluck: 'plucks', lead: 'leads',
  bass: 'bass', synth: 'synths', arp: 'arps & sequences', drum: 'drums',
  texture: 'textures', living: 'living (on top)', init: 'init',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);
const catRank = (tag: string) => { const i = CATEGORY_ORDER.indexOf(tag); return i < 0 ? CATEGORY_ORDER.length : i; };
const BROWSE_ORDER = [...PRESETS].sort((a, b) => catRank(a.tag) - catRank(b.tag));

const nameEl = $('#preset-name');
const tagEl = $('#preset-tag');
let current: string | null = null;

/** Reflect the loaded preset in the header; null means the patch was edited. */
function setCurrent(name: string | null): void {
  if (current === name) return;
  current = name;
  const p = name ? PRESETS.find((x) => x.name === name) : undefined;
  nameEl.textContent = p ? p.name : (name ?? 'custom');
  tagEl.textContent = p ? (CATEGORY_NAMES[p.tag] ?? p.tag) : 'edited';
  tagEl.dataset.tag = p ? p.tag : 'edited';
  for (const [n, card] of cards) card.classList.toggle('on', n === name);
}

function applyValues(next: ParamValues): void {
  for (const def of PARAMS) {
    values[def.id] = next[def.id];
    controls.get(def.id)?.set(next[def.id]);
  }
  synth.loadPreset(values);
  master.value = String(values.volume);
  refreshLayers(true);
}

function loadPreset(name: string): void {
  const p = PRESETS.find((x) => x.name === name);
  if (!p) return;
  applyValues({ ...defaults(), ...p.values } as ParamValues);
  setCurrent(name);
  try { localStorage.setItem('mycelia.preset', name); } catch { /* private mode */ }
}

const stepPreset = (d: number) => {
  const i = BROWSE_ORDER.findIndex((p) => p.name === current);
  loadPreset(BROWSE_ORDER[(i + d + BROWSE_ORDER.length) % BROWSE_ORDER.length].name);
};
$('#prev').addEventListener('click', () => stepPreset(-1));
$('#next').addEventListener('click', () => stepPreset(1));

// ---- the browser -----------------------------------------------------------

const browserEl = $('#browser');
const listEl = $('#browser-list');
const searchEl = $<HTMLInputElement>('#browser-search');
const cards = new Map<string, HTMLButtonElement>();

{
  let lastTag = '';
  for (const p of BROWSE_ORDER) {
    if (p.tag !== lastTag) {
      lastTag = p.tag;
      const h = document.createElement('div');
      h.className = 'cat'; h.dataset.tag = p.tag;
      h.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
      listEl.append(h);
    }
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'card'; card.dataset.tag = p.tag;
    card.dataset.search = `${p.name} ${CATEGORY_NAMES[p.tag] ?? p.tag}`.toLowerCase();
    card.innerHTML = `<span class="nm"></span><span class="tg"></span>`;
    card.querySelector<HTMLElement>('.nm')!.textContent = p.name;
    card.querySelector<HTMLElement>('.tg')!.textContent = p.tag;
    card.addEventListener('click', () => { loadPreset(p.name); closeBrowser(); });
    listEl.append(card);
    cards.set(p.name, card);
  }
}

function filterBrowser(): void {
  const q = searchEl.value.trim().toLowerCase();
  // while searching, results come from several categories at once, so each
  // card names its own; otherwise the heading above it already does
  listEl.classList.toggle('searching', q.length > 0);
  let shownInCat = 0;
  let cat: HTMLElement | null = null;
  for (const el of listEl.children as HTMLCollectionOf<HTMLElement>) {
    if (el.classList.contains('cat')) {
      if (cat) cat.hidden = shownInCat === 0;
      cat = el; shownInCat = 0;
      continue;
    }
    const hit = !q || (el.dataset.search ?? '').includes(q);
    el.hidden = !hit;
    if (hit) shownInCat++;
  }
  if (cat) cat.hidden = shownInCat === 0;
}

function openBrowser(): void {
  browserEl.hidden = false;
  searchEl.value = '';
  filterBrowser();
  searchEl.focus();
  cards.get(current ?? '')?.scrollIntoView({ block: 'center' });
}
function closeBrowser(): void { browserEl.hidden = true; }

$('#browse').addEventListener('click', openBrowser);
$('#browser-close').addEventListener('click', closeBrowser);
browserEl.addEventListener('click', (e) => { if (e.target === browserEl) closeBrowser(); });
searchEl.addEventListener('input', filterBrowser);
searchEl.addEventListener('keydown', (e) => {
  if (e.key === 'Enter') {
    const first = [...listEl.querySelectorAll<HTMLButtonElement>('.card')].find((c) => !c.hidden);
    if (first) first.click();
  }
});

// "spore": mutate a handful of continuous parameters a little
$('#spore').addEventListener('click', () => {
  const pool = PARAMS.filter((p) => (p.scale === 'lin' || p.scale === 'log') && p.id !== 'volume' && p.id !== 'tempo');
  const next = { ...values };
  for (let i = 0; i < 9; i++) {
    const def = pool[Math.floor(Math.random() * pool.length)];
    const t = toNorm(def, next[def.id]) + (Math.random() - 0.5) * 0.25;
    next[def.id] = fromNorm(def, t);
  }
  applyValues(next);
  setCurrent(null);
});

$('#copy').addEventListener('click', async () => {
  const d = defaults();
  const diff: Record<string, number> = {};
  for (const id in values) if (Math.abs(values[id] - d[id]) > 1e-9) diff[id] = Number(values[id].toFixed(4));
  try { await navigator.clipboard.writeText(JSON.stringify(diff)); } catch { console.log(JSON.stringify(diff)); }
});

let startTab = 'voice';
try { startTab = localStorage.getItem('mycelia.tab') ?? startTab; } catch { /* ignore */ }
showTab(TABS.some((t) => t.id === startTab) ? startTab : 'voice');

let initial = BROWSE_ORDER[0].name;
try { initial = localStorage.getItem('mycelia.preset') ?? initial; } catch { /* ignore */ }
loadPreset(PRESETS.some((p) => p.name === initial) ? initial : BROWSE_ORDER[0].name);

// ---- MIDI ------------------------------------------------------------------

const midiLed = $('#midi-led');
const midiSel = $<HTMLSelectElement>('#midi-port');
const midi = new MidiInput(handler);
let ledTimer = 0;
midi.onActivity = () => {
  midiLed.classList.add('on');
  clearTimeout(ledTimer);
  ledTimer = window.setTimeout(() => midiLed.classList.remove('on'), 120);
};
midi.onPortsChanged = (ports) => {
  const cur = midiSel.value || 'all';
  midiSel.innerHTML = '<option value="all">all MIDI inputs</option>';
  for (const p of ports) {
    const o = document.createElement('option');
    o.value = p.id; o.textContent = p.name;
    midiSel.append(o);
  }
  midiSel.value = ports.some((p) => p.id === cur) ? cur : 'all';
};
midiSel.addEventListener('change', () => midi.select(midiSel.value as string | 'all'));
midi.init().then((ok) => {
  if (!ok) midiSel.innerHTML = `<option>${MidiInput.supported ? 'MIDI denied' : 'no Web MIDI'}</option>`;
});

// ---- stats -----------------------------------------------------------------

const stats = $('#stats');
let lastPeak = 0;
synth.onStats = (s) => {
  stats.textContent = `${s.voices} voices · ${String(Math.round(s.load * 100)).padStart(2, '0')}% dsp`;
  const peak = Math.max(s.peakL, s.peakR);
  lastPeak = peak;
  scope.update(s.scope, peak);
  organism.setLevel(peak);
};
// expose for the headless check
(window as unknown as { __mycelia: unknown }).__mycelia = { synth, values, peak: () => lastPeak, loadPreset };

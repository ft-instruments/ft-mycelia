import { Synth } from './audio.ts';
import { MidiInput } from './midi.ts';
import { KeyboardView, ComputerKeys, FIRST, LAST } from './keyboard.ts';
import { Organism, Scope } from './ui/organism.ts';
import { makeControl, type Control } from './ui/controls.ts';
import { Viz } from './ui/viz.ts';
import { PARAMS, PARAM_BY_ID, PRESETS, defaults, fromNorm, toNorm, MOD_SLOTS, type ParamValues, type Preset } from './dsp/params.ts';

const $ = <T extends HTMLElement>(sel: string): T => document.querySelector(sel) as T;

const synth = new Synth();
const values: ParamValues = defaults();
const controls = new Map<string, Control>();

// ---- audio start -----------------------------------------------------------

const startBtn = $<HTMLButtonElement>('#start');
const startLabel = $('#start-label');
async function startAudio(): Promise<void> {
  if (synth.running) return;
  startBtn.disabled = true;
  startLabel.textContent = 'waking…';
  try {
    await synth.start();
    synth.loadPreset(values);
    startBtn.disabled = false;
    startBtn.classList.add('on');
    startBtn.title = 'awake — click to sleep';
    wokeAt = performance.now();
    startLabel.textContent = `awake · ${synth.latencyMs.toFixed(0)} ms`;
  } catch (err) {
    startBtn.disabled = false;
    startLabel.textContent = 'wake';
    console.error(err);
    alert(`Could not start audio: ${(err as Error).message}`);
  }
}
let wokeAt = 0;
/** Put the synth to sleep: notes stop and the audio device is released. */
async function sleepAudio(): Promise<void> {
  synth.panic();
  for (let n = FIRST; n <= LAST; n++) keyboard.setPressed(n, false);
  await synth.suspend();
  startBtn.classList.remove('on');
  startBtn.title = 'wake the synth';
  startLabel.textContent = 'asleep';
}
// the power button toggles; playing a note (or any first click) also wakes it
startBtn.addEventListener('click', () => {
  if (synth.running) { if (performance.now() - wokeAt > 400) void sleepAudio(); }
  else void startAudio();
});
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
/** The slider's lit part follows its value. */
const setMaster = (v: number) => { master.value = String(v); master.style.setProperty('--fill', `${v * 100}%`); };
master.addEventListener('input', () => {
  const v = Number(master.value);
  master.style.setProperty('--fill', `${v * 100}%`);
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

interface Group {
  title?: string; ids: string[]; cls?: string;
  /** the module's main controls, drawn large */
  hero?: boolean;
}
interface PanelSpec {
  title: string; sub?: string; cls: string; span: number; tab: string; groups: Group[];
  /** a living layer: the window folds to one line while the layer is off */
  layer?: string;
  /** the picture drawn at the top of the module (see ui/viz.ts) */
  viz?: string;
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
  { id: 'motion', name: 'motion', hint: 'lfos · pump · arp · matrix' },
  { id: 'space', name: 'space', hint: 'ensemble · delay · canopy · out' },
  { id: 'living', name: 'living', hint: 'network · garden · rot · climate' },
];

const LAYOUT: PanelSpec[] = [
  // ---- voice: what the sound is
  { tab: 'voice', title: 'Osc A', sub: 'tri · saw · pulse', cls: 'osc', span: 4, viz: 'oscA', groups: [
    { hero: true, ids: ['aShape', 'aLevel'] },
    { ids: ['aPw', 'aOct', 'aSemi', 'aFine', 'aUnison', 'aDetune'] },
  ] },
  { tab: 'voice', title: 'Osc B', sub: 'tri · saw · pulse', cls: 'osc', span: 4, viz: 'oscB', groups: [
    { hero: true, ids: ['bShape', 'bLevel'] },
    { ids: ['bPw', 'bOct', 'bSemi', 'bFine', 'bUnison', 'bDetune'] },
  ] },
  { tab: 'voice', title: 'Mix', sub: 'sub · noise · analogue', cls: 'mix', span: 4, viz: 'mix', groups: [
    { hero: true, ids: ['subLevel', 'noiseLevel'] },
    { ids: ['subShape', 'spread', 'drift'] },
  ] },
  { tab: 'voice', title: 'Filter', sub: 'transistor ladder', cls: 'filter', span: 5, viz: 'filter', groups: [
    { hero: true, ids: ['cutoff', 'res', 'fEnv'] },
    { ids: ['drive', 'fMode', 'keyTrack', 'fVel', 'hpf'] },
  ] },
  { tab: 'voice', title: 'Envelopes', sub: 'rc curves', cls: 'env', span: 4, viz: 'env', groups: [
    { title: 'amp', cls: 'stack', ids: ['aAtk', 'aDec', 'aSus', 'aRel', 'ampVel'] },
    { title: 'filter', cls: 'stack', ids: ['fAtk', 'fDec', 'fSus', 'fRel'] },
  ] },
  { tab: 'voice', title: 'Voice', sub: 'allocation · glide', cls: 'voice', span: 3, viz: 'voicing', groups: [{ ids: ['voiceMode', 'glide', 'poly', 'bend'] }] },

  // ---- motion: what moves it
  { tab: 'motion', title: 'LFO 1', sub: 'per voice', cls: 'lfo', span: 3, viz: 'lfo1', groups: [{ ids: ['l1Shape', 'l1Rate', 'l1Sync', 'l1Fade', 'l1Pitch', 'l1Cut', 'l1Pw'] }] },
  { tab: 'motion', title: 'LFO 2', sub: 'global', cls: 'lfo', span: 3, viz: 'lfo2', groups: [{ ids: ['l2Shape', 'l2Rate', 'l2Sync', 'l2Cut', 'l2Shape2', 'l2Pan', 'l2Amp'] }] },
  { tab: 'motion', title: 'Pump', sub: 'synced ducking', cls: 'pump', span: 2, viz: 'pump', groups: [{ hero: true, ids: ['pumpAmt'] }, { ids: ['pumpRate', 'pumpRel', 'pumpCurve', 'pumpWhere'] }] },
  { tab: 'motion', title: 'Arp', sub: 'internal clock', cls: 'arp', span: 4, viz: 'arp', groups: [{ ids: ['arpMode', 'arpRate', 'arpOct', 'arpGate', 'arpSwing', 'arpHold', 'tempo'] }] },
  { tab: 'motion', title: 'Matrix', sub: 'six slots · anything to anywhere in the voice', cls: 'matrix wide', span: 12,
    groups: Array.from({ length: MOD_SLOTS }, (_, i) => ({ title: String(i + 1), cls: 'slot', ids: [`m${i + 1}Src`, `m${i + 1}Dst`, `m${i + 1}Amt`] })) },

  // ---- space: where it is
  { tab: 'space', title: 'Ensemble', sub: 'bbd chorus', cls: 'fx', span: 3, viz: 'ensemble', groups: [{ hero: true, ids: ['chMix', 'chDepth'] }, { ids: ['chRate', 'chTone'] }] },
  { tab: 'space', title: 'Delay', sub: 'tape · synced', cls: 'fx', span: 3, viz: 'delay', groups: [{ hero: true, ids: ['dlMix', 'dlFb'] }, { ids: ['dlTime', 'dlTone', 'dlPing'] }] },
  { tab: 'space', title: 'Canopy', sub: 'hall · shimmer', cls: 'out', span: 4, viz: 'reverb', groups: [{ hero: true, ids: ['rvMix', 'rvDecay', 'rvShimmer'] }, { ids: ['rvSize', 'rvTone'] }] },
  { tab: 'space', title: 'Out', sub: 'tape warmth', cls: 'out', span: 2, viz: 'warmth', groups: [{ hero: true, ids: ['warmth'] }, { ids: ['volume'] }] },

  // ---- living: all off by default; at zero the synth above is untouched
  { tab: 'living', title: 'Network', sub: 'voices feed their neighbours', cls: 'living', layer: 'net', span: 3, viz: 'network', groups: [{ ids: ['netAmount', 'netRange', 'netCut', 'netPitch', 'netDim'] }] },
  { tab: 'living', title: 'Garden', sub: 'growth sequencer · replaces arp', cls: 'living', layer: 'garden', span: 5, viz: 'garden', groups: [{ ids: ['gardenOn', 'gardenRate', 'gardenScale', 'gardenLife', 'gardenBranch', 'gardenFade', 'gardenReach', 'gardenGate'] }] },
  { tab: 'living', title: 'Rot', sub: 'the patch ages', cls: 'living', layer: 'rot', span: 2, groups: [{ ids: ['rot', 'rotAuto'] }] },
  { tab: 'living', title: 'Climate', sub: 'one knob, five weathers', cls: 'living', layer: 'climate', span: 2, groups: [{ ids: ['climate', 'climateAmt'] }] },
];

const vizzes: Viz[] = [];
const redrawViz = () => { for (const v of vizzes) v.redraw(); };

function onParam(id: string, v: number): void {
  values[id] = v;
  synth.setParam(id, v);
  setCurrent(null);
  if (id === 'volume') setMaster(v);
  refreshLayers();
  redrawViz();
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
  const head = document.createElement('div');
  head.className = 'head';
  const h = document.createElement('h2');
  h.textContent = spec.title;
  head.append(h);
  if (spec.sub) { const s = document.createElement('small'); s.textContent = spec.sub; head.append(s); }
  if (spec.layer) {
    // layers fold to one line; the header says whether it is on and toggles
    const meta = document.createElement('span'); meta.className = 'meta';
    head.append(meta);
    head.classList.add('fold');
    head.addEventListener('click', () => panel.classList.toggle('collapsed'));
    layerPanels.set(spec.layer, { panel, meta });
  }
  panel.append(head);
  if (spec.viz) {
    const v = new Viz(spec.viz, values);
    vizzes.push(v);
    panel.append(v.el);
  }
  const body = document.createElement('div');
  body.className = 'body';
  for (const g of spec.groups) {
    let host: HTMLElement = body;
    if (g.title || g.hero || g.cls) {
      const sg = document.createElement('div'); sg.className = `subgroup ${g.cls ?? ''} ${g.hero ? 'hero' : ''}`;
      if (g.title) { const t = document.createElement('div'); t.className = 'title'; t.textContent = g.title; sg.append(t); }
      const row = document.createElement('div'); row.className = 'row';
      sg.append(row); body.append(sg); host = row;
    }
    for (const id of g.ids) {
      const def = PARAM_BY_ID[id];
      if (!def) { console.warn('unknown param', id); continue; }
      const c = makeControl(def, values[id], (v) => onParam(id, v), { segLimit: 8, hero: g.hero });
      controls.set(id, c);
      host.append(c.el);
    }
  }
  panel.append(body);
  panelsEl.append(panel);
}

// ---- families (tabs) -------------------------------------------------------

const tabsEl = $('#tabs');
const tabLight = tabsEl.querySelector<HTMLElement>('.tab-light')!;
const tabButtons = new Map<string, HTMLButtonElement>();
let shownTab = '';
function placeTabLight(): void {
  const b = tabButtons.get(shownTab);
  if (!b) return;
  tabLight.style.left = `${b.offsetLeft}px`;
  tabLight.style.width = `${b.offsetWidth}px`;
}
function showTab(id: string): void {
  if (id === shownTab) return;
  shownTab = id;
  for (const [t, b] of tabButtons) b.classList.toggle('on', t === id);
  tabsEl.dataset.on = id;
  placeTabLight();
  // the modules of the family rise in, one after another
  let i = 0;
  for (const el of panelsEl.querySelectorAll<HTMLElement>('.panel')) {
    const on = el.dataset.tab === id;
    el.hidden = !on;
    el.classList.remove('enter');
    if (on) { void el.offsetWidth; el.style.setProperty('--i', String(i++)); el.classList.add('enter'); }
  }
  redrawViz();
  try { localStorage.setItem('mycelia.tab', id); } catch { /* private mode */ }
}
for (const t of TABS) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'tab';
  b.innerHTML = `<span class="n">0${TABS.indexOf(t) + 1}</span><span class="nm">${t.name}</span><small>${t.hint}</small>`;
  b.addEventListener('click', () => showTab(t.id));
  tabsEl.append(b); tabButtons.set(t.id, b);
}
new ResizeObserver(placeTabLight).observe(tabsEl);

// ---- presets ---------------------------------------------------------------

// Categories, in the order they should appear in the browser. Anything with a
// tag not listed here is appended at the end under its own name. "user" is
// the sounds saved in this browser.
const CATEGORY_NAMES: Record<string, string> = {
  user: 'yours', pad: 'pads', keys: 'keys', synth: 'synths', pluck: 'plucks', lead: 'leads',
  bass: 'bass', arp: 'arps & sequences', texture: 'textures', living: 'living (on top)',
  drum: 'drums', init: 'init',
};
const CATEGORY_ORDER = Object.keys(CATEGORY_NAMES);
const catRank = (tag: string) => { const i = CATEGORY_ORDER.indexOf(tag); return i < 0 ? CATEGORY_ORDER.length : i; };

// ---- your presets: kept in this browser's storage, as diffs from the defaults
const USER_KEY = 'mycelia.user-presets';
function readUser(): Preset[] {
  try {
    const raw = JSON.parse(localStorage.getItem(USER_KEY) ?? '[]') as { name: string; values: Partial<ParamValues> }[];
    return raw.filter((p) => typeof p?.name === 'string' && p.values).map((p) => ({ name: p.name, tag: 'user', values: p.values }));
  } catch { return []; }
}
let userPresets = readUser();
function writeUser(): void {
  try { localStorage.setItem(USER_KEY, JSON.stringify(userPresets.map((p) => ({ name: p.name, values: p.values })))); }
  catch { /* private mode: they last until the page closes */ }
}

const allPresets = (): Preset[] => [...userPresets, ...PRESETS];
const findPreset = (name: string | null) => (name ? allPresets().find((x) => x.name === name) : undefined);
let browseOrder: Preset[] = [];
const sortPresets = () => { browseOrder = allPresets().sort((a, b) => catRank(a.tag) - catRank(b.tag)); };
sortPresets();

const nameEl = $('#preset-name');
const tagEl = $('#preset-tag');
let current: string | null = null;
let lastLoaded: string | null = null;

/** Reflect the loaded preset in the header; null means the patch was edited. */
function setCurrent(name: string | null): void {
  if (current === name) return;
  current = name;
  if (name) lastLoaded = name;
  const p = findPreset(name);
  nameEl.textContent = p ? p.name : (lastLoaded ?? 'custom');
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
  setMaster(values.volume);
  refreshLayers(true);
  redrawViz();
}

function loadPreset(name: string): void {
  const p = findPreset(name);
  if (!p) return;
  applyValues({ ...defaults(), ...p.values } as ParamValues);
  current = null;                 // force the header to refresh even for the same name
  setCurrent(name);
  nameEl.classList.remove('swap'); void nameEl.offsetWidth; nameEl.classList.add('swap');
  for (let i = 0; i < 5; i++) organism.pulse(40 + i * 11 + Math.floor(Math.random() * 6), 60 + Math.random() * 40);
  try { localStorage.setItem('mycelia.preset', name); } catch { /* private mode */ }
}

const stepPreset = (d: number) => {
  const i = browseOrder.findIndex((p) => p.name === (current ?? lastLoaded));
  loadPreset(browseOrder[(i + d + browseOrder.length) % browseOrder.length].name);
};
$('#prev').addEventListener('click', () => stepPreset(-1));
$('#next').addEventListener('click', () => stepPreset(1));

/** The current sound as a diff from the defaults: what a preset stores. */
function patchDiff(): Partial<ParamValues> {
  const d = defaults();
  const diff: Partial<ParamValues> = {};
  for (const id in values) if (Math.abs(values[id] - d[id]) > 1e-9) diff[id] = Number(values[id].toFixed(4));
  return diff;
}

// ---- the browser -----------------------------------------------------------

const browserEl = $('#browser');
const listEl = $('#browser-list');
const sideEl = $('#browser-side');
const searchEl = $<HTMLInputElement>('#browser-search');
const cards = new Map<string, HTMLButtonElement>();
const heads = new Map<string, HTMLElement>();

/** (Re)build the list and the sidebar from the factory bank and yours. */
function buildBrowser(): void {
  listEl.replaceChildren(); sideEl.replaceChildren(); cards.clear(); heads.clear();
  const counts = new Map<string, number>();
  for (const p of browseOrder) counts.set(p.tag, (counts.get(p.tag) ?? 0) + 1);
  if (!userPresets.length) {
    // keep a place for them, so saving has somewhere to land
    const h = document.createElement('div'); h.className = 'cat'; h.dataset.tag = 'user'; h.textContent = CATEGORY_NAMES.user;
    const empty = document.createElement('div'); empty.className = 'empty';
    empty.textContent = 'nothing saved yet — shape a sound, then “save current” (⌘S)';
    listEl.append(h, empty); heads.set('user', h);
    counts.set('user', 0);
  }
  for (const tag of [...new Set(['user', ...browseOrder.map((p) => p.tag)])]) {
    const s = document.createElement('button');
    s.type = 'button'; s.dataset.tag = tag;
    s.innerHTML = '<span class="nm"></span><span class="count"></span>';
    s.querySelector('.nm')!.textContent = CATEGORY_NAMES[tag] ?? tag;
    s.querySelector('.count')!.textContent = String(counts.get(tag) ?? 0);
    s.addEventListener('click', () => {
      if (searchEl.value) { searchEl.value = ''; filterBrowser(); }
      heads.get(tag)?.scrollIntoView({ block: 'start', behavior: 'smooth' });
    });
    sideEl.append(s);
  }
  let lastTag = '';
  for (const p of browseOrder) {
    if (p.tag !== lastTag) {
      lastTag = p.tag;
      const h = document.createElement('div');
      h.className = 'cat'; h.dataset.tag = p.tag;
      h.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
      listEl.append(h); heads.set(p.tag, h);
    }
    const card = document.createElement('button');
    card.type = 'button'; card.className = 'card'; card.dataset.tag = p.tag;
    card.dataset.search = `${p.name} ${CATEGORY_NAMES[p.tag] ?? p.tag}`.toLowerCase();
    card.innerHTML = `<span class="nm"></span><span class="tg"></span>`;
    card.querySelector<HTMLElement>('.nm')!.textContent = p.name;
    card.querySelector<HTMLElement>('.tg')!.textContent = CATEGORY_NAMES[p.tag] ?? p.tag;
    card.addEventListener('click', () => { loadPreset(p.name); closeBrowser(); });
    if (p.tag === 'user') {
      // yours can be deleted: one click arms it, the second deletes
      const del = document.createElement('span');
      del.className = 'del'; del.title = 'delete'; del.textContent = '×';
      del.addEventListener('click', (e) => {
        e.stopPropagation();
        if (!del.classList.contains('armed')) { del.classList.add('armed'); del.textContent = 'delete?'; return; }
        userPresets = userPresets.filter((x) => x.name !== p.name);
        writeUser(); sortPresets(); buildBrowser(); filterBrowser();
        if (current === p.name) setCurrent(null);
      });
      del.addEventListener('mouseleave', () => { del.classList.remove('armed'); del.textContent = '×'; });
      card.append(del);
    }
    card.classList.toggle('on', p.name === current);
    listEl.append(card);
    cards.set(p.name, card);
  }
}
buildBrowser();

function filterBrowser(): void {
  const q = searchEl.value.trim().toLowerCase();
  // while searching, results come from several categories at once, so each
  // card names its own; otherwise the heading above it already does
  listEl.classList.toggle('searching', q.length > 0);
  let shownInCat = 0;
  let cat: HTMLElement | null = null;
  for (const el of listEl.children as HTMLCollectionOf<HTMLElement>) {
    if (el.classList.contains('cat')) {
      if (cat) cat.hidden = shownInCat === 0 && !!q;
      cat = el; shownInCat = 0;
      continue;
    }
    const hit = !q || (el.dataset.search ?? '').includes(q);
    el.hidden = !hit;
    if (hit) shownInCat++;
  }
  if (cat) cat.hidden = shownInCat === 0 && !!q;
}

// ---- saving: name the current sound
const saveBar = $<HTMLFormElement>('#savebar');
const saveName = $<HTMLInputElement>('#save-name');
const saveOk = $<HTMLButtonElement>('#save-ok');
const saveMsg = $('#save-msg');

function checkName(): 'new' | 'overwrite' | 'taken' | 'empty' {
  const n = saveName.value.trim();
  if (!n) return 'empty';
  if (PRESETS.some((p) => p.name.toLowerCase() === n.toLowerCase())) return 'taken';
  return userPresets.some((p) => p.name.toLowerCase() === n.toLowerCase()) ? 'overwrite' : 'new';
}
function refreshSave(): void {
  const s = checkName();
  saveOk.textContent = s === 'overwrite' ? 'overwrite' : 'save';
  saveOk.disabled = s === 'empty' || s === 'taken';
  saveMsg.textContent = s === 'taken' ? 'a factory preset has that name' : s === 'overwrite' ? 'replaces your sound with that name' : '';
}
function openSave(): void {
  if (browserEl.hidden) openBrowser();
  saveBar.hidden = false;
  const base = findPreset(lastLoaded);
  saveName.value = base?.tag === 'user' ? base.name : current ? '' : (lastLoaded ? `${lastLoaded} (mine)` : '');
  refreshSave();
  saveName.focus(); saveName.select();
}
function closeSave(): void { saveBar.hidden = true; }
saveName.addEventListener('input', refreshSave);
saveBar.addEventListener('submit', (e) => {
  e.preventDefault();
  const s = checkName();
  if (s === 'empty' || s === 'taken') return;
  const name = saveName.value.trim();
  const p: Preset = { name, tag: 'user', values: patchDiff() };
  const i = userPresets.findIndex((x) => x.name.toLowerCase() === name.toLowerCase());
  if (i >= 0) userPresets[i] = p; else userPresets.push(p);
  userPresets.sort((a, b) => a.name.localeCompare(b.name));
  writeUser(); sortPresets(); buildBrowser();
  closeSave(); closeBrowser();
  current = null; setCurrent(name);
  nameEl.classList.remove('swap'); void nameEl.offsetWidth; nameEl.classList.add('swap');
  try { localStorage.setItem('mycelia.preset', name); } catch { /* private mode */ }
});
$('#save-cancel').addEventListener('click', closeSave);
$('#browser-save').addEventListener('click', openSave);
$('#save').addEventListener('click', openSave);
window.addEventListener('keydown', (e) => {
  if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') { e.preventDefault(); openSave(); }
});

function openBrowser(): void {
  browserEl.hidden = false;
  closeSave();
  searchEl.value = '';
  filterBrowser();
  searchEl.focus();
  cards.get(current ?? lastLoaded ?? '')?.scrollIntoView({ block: 'center' });
}
function closeBrowser(): void { browserEl.hidden = true; closeSave(); }

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
  const diff = patchDiff();
  try { await navigator.clipboard.writeText(JSON.stringify(diff)); } catch { console.log(JSON.stringify(diff)); }
  const b = $('#copy');
  b.classList.add('done');
  setTimeout(() => b.classList.remove('done'), 1200);
});

let startTab = 'voice';
try { startTab = localStorage.getItem('mycelia.tab') ?? startTab; } catch { /* ignore */ }
showTab(TABS.some((t) => t.id === startTab) ? startTab : 'voice');

let initial = browseOrder.find((p) => p.tag !== 'user')!.name;
try { initial = localStorage.getItem('mycelia.preset') ?? initial; } catch { /* ignore */ }
loadPreset(findPreset(initial) ? initial : PRESETS[0].name);

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
  stats.textContent = `${s.voices} voices · ${Math.round(s.load * 100)}% dsp`;
  const peak = Math.max(s.peakL, s.peakR);
  lastPeak = peak;
  scope.update(s.scope, peak);
  organism.setLevel(peak);
};
// expose for the headless check
(window as unknown as { __mycelia: unknown }).__mycelia = { synth, values, peak: () => lastPeak, loadPreset };

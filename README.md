# ft-mycelia

**MYCELIA** — a bioluminescent virtual-analogue polysynth. Pads, rich layered
synths, arpeggios; warm rather than harsh. Runs in the browser, written so the
DSP core lifts straight into a VST3/AU plugin (same shape as `ft-piano`).

```
npm install
npm run dev        # open the printed URL in Chrome/Edge (Web MIDI)
npm run build      # static site in dist/
npm run render     # offline render of every preset to out/*.wav, no browser needed
npm run check      # headless Chrome: boots the worklet, plays, screenshots the four views and the browser
```

Play with a MIDI keyboard (notes, velocity, pitch bend, mod wheel = vibrato,
sustain CC64), the on-screen keys (lower on the key = louder), or the computer
keyboard (`A`…`'` / `Z`…`/`, arrows change octave, Space = sustain). Drag
knobs vertically, `Shift` for fine, double-click to reset, wheel works too.
**spore** mutates the current patch a little; **copy** puts the patch JSON on
the clipboard (paste it into `PRESETS` in `params.ts` to keep it).

The panel is split into four families — **voice** (what the sound is),
**motion** (what moves it), **space** (where it is) and **living** (the four
layers a normal synth does not have). `1`–`4` switch between them. The preset
name in the header opens a searchable browser (`` ` ``, `Esc` to close);
`◂ ▸` step through the bank in browser order. Master volume sits in the
header, next to the meter.

## Signal path

```
OSC A ─┐                                    ┌─ ENSEMBLE (BBD chorus)
OSC B ─┤ per voice, stereo → LADDER ×2 → VCA ┤  → TAPE DELAY → HALL / SHIMMER → warmth → out
SUB   ─┤   (unison spread)   (L and R)       │
NOISE ─┘                                     └─ up to 16 voices, poly / mono / legato + glide
```

Everything lives in [`src/dsp/`](src/dsp/) and has no browser dependencies.

| file | what |
|---|---|
| `osc.ts` | Oscillator bank: up to 7 detuned, stereo-spread copies of a continuous **tri → saw → pulse** morph with pulse width. Saw/pulse edges are PolyBLEP anti-aliased (aliases sit ≥ 90 dB down at C8). Every copy has a fixed tuning error and a slow random-walk pitch **drift** — the "several VCO cards that never quite agree" thing that makes analogue polys sound alive. Sub (sine / rounded square / −2 oct) and pinkish noise. |
| `ladder.ts` | **Transistor ladder** low-pass after Huovilainen: four tanh-saturating one-pole stages, resonance feedback from the saturated output, frequency/resonance corrections for the discretisation, 2× oversampled. Self-oscillates from ~0.93 resonance, tuned to within 1 % of the cutoff, compresses when driven. 24 dB or 12 dB tap. |
| `env.ts` | ADSR with RC-style curves (convex attack towards an overshoot target, exponential decay/release). Retriggers from the current level — no clicks. |
| `lfo.ts` | Sine / tri / saw / square / S&H / **drift** (smoothed random). LFO 1 is per voice (with fade-in), LFO 2 is global. |
| `voice.ts` → `matrix()` | The **modulation matrix**: six slots, each a source, a destination and a bipolar amount. Sources are LFO 1 and 2, the two envelopes, velocity, key, mod wheel, bend, a per-note random and the network's received influence. Destinations are everything in the voice that can usefully move — pitch, **either oscillator's morph or both together**, pulse width, detune, the four source levels, cutoff, resonance, drive, level and pan. Every amount is 0 by default, and the whole block is skipped when nothing is routed: with all six slots pointed somewhere at amount 0, all 47 older presets render **bit-identically**. |
| `voice.ts` | One voice: oscillators → two ladder filters (true stereo) → VCA. Modulation is evaluated every 16 samples with smoothed filter coefficients; the amp envelope and audio run per sample. |
| `chorus.ts` | **String-machine ensemble**: three modulated bucket-brigade taps per channel driven by a slow and a fast triangle LFO 120° apart (Solina topology), BBD darkness (one-pole) and soft clipping on the wet path. |
| `delay.ts` | Tempo-synced **tape delay**: low-pass, high-pass and soft clip in the loop, wobbling read head, slewed time changes (pitch bends instead of clicks), optional ping-pong. |
| `reverb.ts` | **Hall**: 8-line FDN with Householder mixing, slowly modulated read positions (no metallic ringing), per-line damping and high-pass, four diffusion allpasses, pre-delay. **Shimmer** feeds an octave-up granular pitch shift of the tail, low-passed, back into the network. |
| `arp.ts` | Arpeggiator on the internal clock: up / down / up-down / random / as played / chord, 1–4 octaves, gate, swing, hold (sustain pedal also holds). |
| `engine.ts` | Voice allocation (poly with same-note reuse and quiet-first stealing; mono and legato with glide), sustain, pitch bend, arp, LFO 2, effect chain, tape-style warmth saturation, DC block, safety clip. `process(L, R, n)` is the whole instrument. |
| `garden.ts` | The growth sequencer (see below). |
| `params.ts` | The flat parameter list (what a host would see) and the factory presets. |

## On top: the living layers

Four things a normal synth doesn't do, in the dashed row at the bottom.
They are all **off by default and bit-identical to off at zero** — every
other preset renders exactly as before (checked by hash).

- **Network** — the mycelium is the modulation. Each voice receives the
  energy of the other voices, weighted by how close they are in pitch and
  pulsing with *their* LFO 1. What it receives opens or closes its filter
  (`→ cutoff`), pushes its pitch away from — or with a negative amount,
  towards — the centre of the chord (`→ pitch`), and dims it when crowded.
  A chord becomes an ecosystem: the voices breathe with each other, and the
  same notes sound different depending on what else is playing.
- **Garden** — a growth sequencer instead of an arpeggiator. A key plants a
  seed; every clock step each living seed spawns a child (sometimes two) a
  scale step away, a little quieter, one generation older, until the
  lineage dies. Hold the key and it re-seeds when the lineage is gone, so a
  held chord is a garden that never repeats. Scale, generations, branching
  probability, fading per generation, reach in octaves, gate.
- **Rot** — the patch ages: detunes, dulls, blurs, warms, hisses, slows.
  `rot` is a manual macro over twelve parameters; `auto` makes it happen
  over N minutes of playing (reset by panic or by touching the knob).
- **Climate** — one amount knob, four weathers, each a fixed set of eight
  offsets: **sun** (bright, open, steady), **rain** (thin, wet, hiss and
  echoes), **night** (dark, wide, distant, slow), **storm** (driven,
  unstable, resonant).

`Symbiosis`, `Seed Garden`, `Fifths Forest`, `Compost`, `Night Rain` and
`Storm Cell` in the *living* category show each one off.

The offline script `scripts/render.ts` drives the same engine in Node:
`node scripts/render.ts` renders every preset, `preset "Canopy"`, `note 60 100`,
`bench` (CPU), `spectrum 84` (harmonic levels vs. worst alias of a raw saw).
The ladder's tuning, resonance and self-oscillation were measured with
sine probes and impulses the same way.

## Presets

Grouped by category in the browser; ◂ ▸ step through them, **spore** mutates.

| category | presets |
|---|---|
| pads | Canopy · Bioluminescence · Understory · Fog Bank · Solar Strings · Tidal Choir · Deep Sleep · Aurora · First Light · Updraft · Quartz Bloom · Afterglow |
| keys | Neon Moss · Velvet Keys · Polymoss · Organelle · Amber Keys · Chalet |
| synths | Chrome Brass · Stack of Six · PWM Bloom · Tremolo Grove (gated pad) · Hyphae Stack |
| plucks | Glass Fern · Dewdrop · Kalimba Circuit · Sporocarp |
| leads | Overgrowth · Glowworm · Whistle Fern (self-oscillating filter) · Rust Saw |
| bass | Root System · Taproot · Acid Lichen · Wide Bed · Umbra (mono counter-voice) · Undertow |
| arps & sequences | Spore Drift · Grid Rain · Firefly Sequence · Mycelial Pulse · Slow Vines · Circuit Bees · Chord Strobe · Snowfall · Cassette Loop · Jitter Spores |
| textures | Wind Through Wires · Cathedral Spores · Tritone Hollow |
| living (on top) | Symbiosis (network) · Seed Garden · Fifths Forest (garden + network) · Compost (auto-rot) · Night Rain · Storm Cell (climates) |
| drums | Kick 808 · Tom Grove · Snare Spark · Hat Static · Drum Arp — the ladder self-oscillating with a fast filter envelope, the way analogue polys did drums |

Several use the modulation matrix — velocity opening the filter on *First
Light*, the amp envelope walking the oscillator morph on *Quartz Bloom*, a
per-note random on the pan for *Snowfall* and on the pitch (a fraction of a
semitone) for *Cassette Loop*'s tape wobble.

`node scripts/render.ts onset` measures note-on to −20 dB for every preset.
Everything meant to be played sits at 2–5 ms; the only slow ones are the pads
and textures whose attack is slow on purpose.

## UI

Bioluminescence on a dark forest floor: the background is a living
mycelium network that lights up from the notes, panels are chamfered glass
with an accent per family (lime for the oscillators, cyan for the filter,
amber for the envelopes, magenta for the LFOs and matrix), Rajdhani and
JetBrains Mono. Four views (`1`–`4`): **voice**, **motion**, **space** and
**living**; the four living layers fold to one line while they are off
(click the header to open one). The preset browser (`` ` ``) is shared with
Siege and Vector, as are the knobs and the keyboard, which reads its colours
from `--key-*` custom properties.

## Porting to a plugin (JUCE)

- `MyceliaEngine(sampleRate)` ↔ `prepareToPlay`
- `noteOn / noteOff / controlChange / pitchBend` ↔ the MIDI buffer in `processBlock`
- `process(L, R, n)` ↔ the audio buffer (any `n`; it chunks internally in 32s)
- `setParam(id, value)` ↔ `AudioProcessorValueTreeState`, using `PARAMS` as the list
- the arp uses the internal `tempo`; in a plugin, feed it the host tempo instead

No allocation on the audio thread; all state is typed arrays and scalars.
About 1 % of one core per voice at 48 kHz in V8 (≈13 % for ten voices of the
fattest preset, effects included); expect the C++ version to run 3–5× faster.

## Known limitations / next steps

- No hard sync, FM or ring mod (on purpose — it's an analogue-flavoured instrument), and no modulation matrix beyond the fixed routings.
- The resonance compensation and drive were set by measurement, not by ear; the filter loses some resonance above ~6 kHz.
- Arp and delay sync to the internal clock only.
- Presets can be copied as JSON but not saved in the browser yet.

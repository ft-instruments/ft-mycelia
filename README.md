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

## Download

Builds of the VST3, the AU (macOS only) and the standalone app for macOS,
Windows and Linux are attached to each
[release](https://github.com/ft-instruments/ft-mycelia/releases).

| | Standalone | VST3 | AU |
|---|---|---|---|
| macOS (Apple silicon + Intel) | yes | yes | yes |
| Windows | yes | yes | no |
| Linux | yes | yes | no |

Unzip and copy the plugin to your plugin folder (macOS
`~/Library/Audio/Plug-Ins/{VST3,Components}`, Windows
`C:\Program Files\Common Files\VST3`, Linux `~/.vst3`). The builds are not
signed or notarized: on macOS right-click the app and choose Open the first
time (or run `xattr -dr com.apple.quarantine` on the files); on Windows
SmartScreen asks once. The Windows editor needs the WebView2 runtime
(included in Windows 11); on Linux it needs WebKitGTK.

## Privacy

MYCELIA makes no network connections: no telemetry, no update check, no
analytics, no accounts. The fonts are bundled ([`src/fonts/`](src/fonts/)),
the plugin serves its UI from memory (`PluginEditor.cpp`, a JUCE resource
provider), and JUCE is built without its networking code
(`JUCE_USE_CURL=0`). Your saved presets are plain files on your disk. To
check it yourself, search the source for `fetch(`, `XMLHttpRequest`,
`WebSocket` and `http` (the only hits are the SVG namespace string and the
local test scripts in `scripts/`, which talk to `127.0.0.1`), or watch the
app with Little Snitch or `nettop`.

## Signal path

```
OSC A ─┐                                    ┌─ ENSEMBLE (BBD chorus)
OSC B ─┤ per voice, stereo → LADDER ×2 → VCA ┤  → TAPE DELAY → HALL / SHIMMER → PUMP → warmth → out
SUB   ─┤   (unison spread)   (L and R)       │
NOISE ─┘                                     └─ up to 16 voices, poly / mono / legato + glide
```

Everything lives in [`src/dsp/`](src/dsp/) and has no browser dependencies.

| file | what |
|---|---|
| `osc.ts` | Oscillator bank: up to 7 detuned, stereo-spread copies of a continuous **tri → saw → pulse** morph with pulse width. Saw/pulse edges are PolyBLEP anti-aliased (aliases sit ≥ 90 dB down at C8). Every copy has a fixed tuning error and a slow random-walk pitch **drift** — the "several VCO cards that never quite agree" thing that makes analogue polys sound alive. Sub (sine / rounded square / −2 oct) and pinkish noise. |
| `ladder.ts` | **Transistor ladder** low-pass after Huovilainen: four tanh-saturating one-pole stages, resonance feedback from the saturated output, frequency/resonance corrections for the discretisation, 2× oversampled. Self-oscillates from ~0.93 resonance, tuned to within 1 % of the cutoff, compresses when driven. 24 dB or 12 dB tap. |
| `env.ts` | ADSR with RC-style curves (convex attack towards an overshoot target, exponential decay/release). Retriggers from the current level — no clicks. |
| `lfo.ts` | Sine / tri / saw / square / S&H / **drift** (smoothed random). LFO 1 is per voice (with fade-in), LFO 2 is global. Either can be **synced** (4 bars … 1/32, dotted and triplet): LFO 1 then runs at the tempo and still restarts at note-on (a wobble per note), LFO 2 is locked to the beat clock (every voice wobbles together, on the beat). |
| `pump.ts` | **Pump**: tempo-synced ducking, the sidechain-compressor sound without a kick. Each step (1/1 … 1/8) the level drops in 4 ms and comes back over `release` (a fraction of the step) along `curve` — low stays down and swells back late (the breathing trance pad), high snaps back early. Ducks `all` (after the reverb, so the tails pump too) or `dry` (before the effects, so they fill the gaps). Its shape is also a matrix source, so it can pump the filter as well — or only the filter, with the amount at 0. |
| `voice.ts` → `matrix()` | The **modulation matrix**: six slots, each a source, a destination and a bipolar amount. Sources are LFO 1 and 2, the two envelopes, velocity, key, mod wheel, bend, a per-note random, the network's received influence and the pump. Destinations are everything in the voice that can usefully move — pitch, **either oscillator's morph or both together**, pulse width, detune, the four source levels, cutoff, resonance, drive, level and pan. Every amount is 0 by default, and the whole block is skipped when nothing is routed: with all six slots pointed somewhere at amount 0, all 47 older presets render **bit-identically**. |
| `voice.ts` | One voice: oscillators → two ladder filters (true stereo) → VCA. Modulation is evaluated every 16 samples with smoothed filter coefficients; the amp envelope and audio run per sample. |
| `chorus.ts` | **String-machine ensemble**: three modulated bucket-brigade taps per channel driven by a slow and a fast triangle LFO 120° apart (Solina topology), BBD darkness (one-pole) and soft clipping on the wet path. |
| `delay.ts` | Tempo-synced **tape delay**: low-pass, high-pass and soft clip in the loop, wobbling read head, slewed time changes (pitch bends instead of clicks), optional ping-pong. |
| `reverb.ts` | **Hall**: 8-line FDN with Householder mixing, slowly modulated read positions (no metallic ringing), per-line damping and high-pass, four diffusion allpasses, pre-delay. **Shimmer** feeds an octave-up granular pitch shift of the tail, low-passed, back into the network. |
| `arp.ts` | Arpeggiator on the internal clock: up / down / up-down / random / as played / chord, 1–4 octaves, gate, swing, hold (sustain pedal also holds). |
| `engine.ts` | Voice allocation (poly with same-note reuse and quiet-first stealing; mono and legato with glide), sustain, pitch bend, arp, LFO 2, the **beat clock** (restarts on the first note after silence, so the pump and synced LFO 2 land on the downbeat you play), effect chain, tape-style warmth saturation, DC block, safety clip. `process(L, R, n)` is the whole instrument. |
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
| pads | Canopy · Bioluminescence · Understory · Fog Bank · Solar Strings · Tidal Choir · Deep Sleep · Aurora · First Light · Updraft · Quartz Bloom · Afterglow · Tidewood Breath · Lichen Tide |
| keys | Neon Moss · Velvet Keys · Polymoss · Organelle · Amber Keys · Chalet · Lantern Keys |
| synths | Chrome Brass · Stack of Six · PWM Bloom · Tremolo Grove (gated pad) · Hyphae Stack · Heartwood Pump (pumping supersaw) |
| plucks | Glass Fern · Dewdrop · Kalimba Circuit · Sporocarp · Dew Chords |
| leads | Overgrowth · Glowworm · Whistle Fern (self-oscillating filter) · Rust Saw · Glowcap Lead |
| bass | Root System · Taproot · Acid Lichen · Wide Bed · Umbra (mono counter-voice) · Undertow · Burrow Wobble (LFO 1 synced to 1/8) · Pulsing Loam |
| arps & sequences | Spore Drift · Grid Rain · Firefly Sequence · Mycelial Pulse · Slow Vines · Circuit Bees · Chord Strobe · Snowfall · Cassette Loop · Jitter Spores · Lumen Pulse · Glimmer Steps |
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

## The plugin (VST3 / AU)

`plugin/` builds MYCELIA as a **VST3** (macOS and Linux), an **AU** (macOS,
for Logic) and a standalone app, with JUCE 8 (fetched by CMake).

```
plugin/build.sh      # web UI + params header + plugins, installed for this user
```

It installs to `~/Library/Audio/Plug-Ins/{VST3,Components}` on macOS and
`~/.vst3` on Linux. On macOS check the AU with `auval -v aumu Myca Ftft`.
On Linux it needs the usual JUCE packages plus WebKitGTK, e.g. on Debian /
Ubuntu:

```
sudo apt install build-essential cmake ninja-build nodejs npm pkg-config \
  libasound2-dev libfreetype-dev libfontconfig1-dev libx11-dev libxcomposite-dev \
  libxcursor-dev libxext-dev libxinerama-dev libxrandr-dev libxrender-dev \
  libgtk-3-dev libwebkit2gtk-4.1-dev libglu1-mesa-dev
```

- **DSP**: `plugin/Source/dsp/` is a line-for-line C++ port of `src/dsp/`.
  Buffers the TS keeps in `Float32Array`s are `float`, everything else is
  `double`, so the two engines agree to rounding: `node scripts/null-test.ts`
  renders every preset with both and subtracts (68 of 72 are bit-identical,
  the rest differ by ≤ −136 dB, last-bit differences in `pow` / `sin`). The
  arp and the garden use fixed arrays instead of JS arrays, sets and maps;
  nothing allocates on the audio thread. About twice as fast as V8.
- **Parameters**: `Params.gen.h` is generated from `params.ts`
  (`node scripts/gen-plugin.ts`, run by `build.sh`), so the host sees the same
  119 parameters with the same knob curves and value text. Everything is
  automatable. The factory bank is the host's program list (Logic's preset
  menu).
- **UI**: the web UI itself (`dist/`, embedded in the binary) in a WebView;
  `src/plugin.ts` stands in for the AudioWorklet and talks to
  `PluginEditor.cpp` over JUCE's event bridge. Knobs become host parameter
  changes, host automation moves the knobs, host MIDI lights the keys. Your
  saved presets are a file shared by every instance
  (`~/Library/Application Support/FT/Mycelia/` or `~/.config/FT/Mycelia/`).
- **Clock**: the host's tempo replaces the tempo knob, and while the host
  plays, its song position drives the beat clock, so the pump and synced
  LFO 2 lock to the bar. The arp and the garden run at the host tempo but
  start from the note you play, not the grid.

After changing anything in `src/dsp/`, port it to `plugin/Source/dsp/` and
run the null test.

## Known limitations / next steps

- No hard sync, FM or ring mod (on purpose — it's an analogue-flavoured instrument), and no modulation matrix beyond the fixed routings.
- The resonance compensation and drive were set by measurement, not by ear; the filter loses some resonance above ~6 kHz.
- In the plugin, the arp and the garden follow the host's tempo but not its grid (a step starts when you play, not on the beat).
- Presets can be copied as JSON but not saved in the browser yet.

## License

Copyright (C) 2026 Filipe F. Thomaz.

MYCELIA is free software under the [GNU AGPL v3](LICENSE). The plugin is built
on [JUCE](https://juce.com), which is itself AGPLv3 (or commercial), so the
whole thing is distributed under the AGPL (the bundled fonts keep their own
[SIL OFL](src/fonts/); see [THIRD-PARTY.md](THIRD-PARTY.md)): you can use it for anything,
including music you sell, and change it and share it, as long as a modified
version you distribute comes with its source under the same license.

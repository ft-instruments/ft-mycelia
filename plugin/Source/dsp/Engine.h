// The whole instrument: MIDI in, stereo audio out. C++ port of
// src/dsp/engine.ts. Construct with a sample rate (allocates), then feed
// noteOn / noteOff / controlChange / pitchBend and call process(L, R, n)
// with any n; nothing allocates after construction.
//
// Two additions over the TS, for running inside a host: setHostTempo()
// replaces the tempo knob with the host's, and setHostPosition() drives the
// beat clock (pump, synced LFO 2) from the host's song position.
#pragma once

#include <memory>
#include <limits>
#include "Voice.h"
#include "Sequencers.h"
#include "Effects.h"

namespace mycelia {

/** Told about notes the arp / garden start (for the UI). Called on the audio thread. */
struct NoteListener {
  virtual ~NoteListener() = default;
  virtual void engineNote(int note, double velocity) = 0;
};

inline ParamValues defaultParams() {
  ParamValues v{};
  for (int i = 0; i < NUM_PARAMS; i++) v[i] = PARAMS[i].def;
  return v;
}

class Engine {
public:
  static constexpr int MAX_VOICES = 16;
  static constexpr int CHUNK = 32;

  ParamValues p = defaultParams();
  NoteListener* listener = nullptr;
  double peakL = 0, peakR = 0;
  float scope[1024] = {};

  explicit Engine(double sampleRate)
    : arp(sampleRate), garden(sampleRate), ensemble(sampleRate), delay(sampleRate), reverb(sampleRate),
      lfo2(99, false), pump(sampleRate), hpL(sampleRate, 20), hpR(sampleRate, 20),
      dcL(sampleRate), dcR(sampleRate), seqOut(*this), fs(sampleRate) {
    for (int i = 0; i < MAX_VOICES; i++) voices[i] = std::make_unique<Voice>(sampleRate, (uint32_t)(i + 1));
  }

  int activeVoices() const {
    int c = 0;
    for (auto& v : voices) if (v->active()) c++;
    return c;
  }

  bool arpOn() const { return p[P::arpMode] >= 1 && p[P::gardenOn] < 0.5; }
  bool gardenOn() const { return p[P::gardenOn] >= 0.5; }

  // ---------------------------------------------------------------- params

  void setParam(int id, double value) {
    if (id < 0 || id >= NUM_PARAMS) return;
    const ParamDef& def = PARAMS[id];
    const double v = std::min(def.max, std::max(def.min, value));
    if (id == P::arpMode && v < 1 && p[P::arpMode] >= 1) arp.stop(seqOut);
    if (id == P::gardenOn && v < 0.5 && p[P::gardenOn] >= 0.5) garden.stop(seqOut);
    if (id == P::gardenOn && v >= 0.5 && p[P::gardenOn] < 0.5) arp.stop(seqOut);
    if (id == P::rot || id == P::rotAuto) rotAge = 0;
    if (id == P::voiceMode && v != p[P::voiceMode]) allNotesOff();
    p[id] = v;
  }

  /** Replace every parameter (preset load). Missing ids go to their default. */
  void loadPreset(const Preset& pr) {
    ParamValues v = defaultParams();
    for (int i = 0; i < pr.count; i++) v[pr.values[i].id] = pr.values[i].value;
    for (int i = 0; i < NUM_PARAMS; i++) setParam(i, v[i]);
  }

  // ------------------------------------------------------------- host sync

  /** The host's tempo, or <= 0 to use the tempo knob. */
  void setHostTempo(double bpm) { hostTempo = bpm; }

  /** While the host plays, the beat clock follows its position (in quarter notes). */
  void setHostPosition(bool playing, double ppq) {
    hostPlaying = playing;
    if (playing) beats = ppq;
  }

  // ------------------------------------------------------------------ MIDI

  void noteOn(int note, double velocity) {
    if (velocity <= 0) { noteOff(note); return; }
    const double vel = std::min(1.0, velocity / 127);
    if (!hostPlaying && silent()) beats = 0;
    if (gardenOn()) garden.keyDown(note, vel);
    else if (arpOn()) arp.keyDown(note, vel, p[P::arpHold] >= 0.5 || sustain);
    else voiceOn(note, vel);
  }

  void noteOff(int note) {
    if (gardenOn()) garden.keyUp(note, sustain);
    else if (arpOn()) arp.keyUp(note, p[P::arpHold] >= 0.5 || sustain);
    else voiceOff(note);
  }

  void controlChange(int cc, int value) {
    switch (cc) {
      case 1: gm.modWheel = value / 127.0; break;
      case 64: {
        const bool on = value >= 64;
        if (on == sustain) break;
        sustain = on;
        if (!on) {
          for (auto& v : voices) {
            if (v->sustained && v->active() && !v->released) v->noteOff();
            v->sustained = false;
          }
          if (arpOn() && p[P::arpHold] < 0.5) arp.release();
          if (gardenOn()) garden.releaseHeld();
        }
        break;
      }
      case 120: case 123: allNotesOff(); break;
      default: break;
    }
  }

  /** -1..1 */
  void pitchBend(double v) { bendNorm = std::max(-1.0, std::min(1.0, v)); }

  void allNotesOff() {
    arp.stop(seqOut);
    garden.stop(seqOut);
    for (auto& v : voices) {
      if (v->active() && !v->released) v->noteOff();
      v->sustained = false;
    }
    monoStack.clear();
  }

  void panic() {
    allNotesOff();
    for (auto& v : voices) v->kill();
    ensemble.clear(); delay.clear(); reverb.clear();
    rotAge = 0;
  }

  // ---------------------------------------------------------------- audio

  void process(float* L, float* R, int n) {
    if (hostTempo > 0) p[P::tempo] = hostTempo;
    const ParamValues& pp = effective(n);
    std::fill(L, L + n, 0.f); std::fill(R, R + n, 0.f);
    gm.bend = bendNorm * pp[P::bend];
    const bool arpIsOn = arpOn(), gardenIsOn = gardenOn();
    const double beat0 = beats, dBeat = pp[P::tempo] / (60 * fs);
    beats = beat0 + n * dBeat;
    const int l2Sync = (int)pp[P::l2Sync];
    const int pumpIdx = (int)pp[P::pumpRate];
    const double pumpBeats = pumpIdx >= 0 && pumpIdx < 4 ? PUMP_BEATS[pumpIdx] : 1;
    const double pumpSec = pumpBeats * 60 / pp[P::tempo];
    for (int off = 0; off < n; off += CHUNK) {
      const int count = std::min(CHUNK, n - off);
      if (gardenIsOn) {
        const GardenParams gp { (int)pp[P::gardenRate], (int)pp[P::gardenScale], (int)pp[P::gardenLife], pp[P::gardenBranch],
                                pp[P::gardenFade], (int)pp[P::gardenReach], pp[P::gardenGate], pp[P::tempo] };
        garden.process(count, gp, seqOut);
      } else if (arpIsOn) {
        arp.process(count, (int)pp[P::arpMode], (int)pp[P::arpRate], (int)pp[P::arpOct], pp[P::arpGate], pp[P::arpSwing], pp[P::tempo], seqOut);
      }
      network(pp);
      const double beat = beat0 + off * dBeat;
      if (l2Sync > 0) {
        const double c = beat / LFO_SYNC_BEATS[l2Sync];
        gm.lfo2 = lfo2.tickAt((int)pp[P::l2Shape], c - std::floor(c));
      } else gm.lfo2 = lfo2.tick((int)pp[P::l2Shape], pp[P::l2Rate] * count / fs);
      const double pb = beat / pumpBeats;
      gm.pump = pumpDuck(pb - std::floor(pb), pumpSec, pp[P::pumpRel], pp[P::pumpCurve]);
      for (auto& v : voices) if (v->active()) v->render(L, R, off, count, pp, gm);
    }
    if (pp[P::hpf] != hpHz) { hpHz = pp[P::hpf]; hpL.set(fs, hpHz); hpR.set(fs, hpHz); }
    const double trim = 0.5;
    for (int i = 0; i < n; i++) {
      L[i] = (float)hpL.tick(L[i] * trim);
      R[i] = (float)hpR.tick(R[i] * trim);
    }
    const bool pumpOn = pp[P::pumpAmt] > 0, pumpDry = pp[P::pumpWhere] >= 0.5;
    if (pumpOn && pumpDry) pump.process(L, R, n, beat0, dBeat, pumpBeats, pp[P::pumpAmt], pp[P::pumpRel], pp[P::pumpCurve], pp[P::tempo]);
    ensemble.process(L, R, n, pp[P::chRate], pp[P::chDepth], pp[P::chTone], pp[P::chMix]);
    const int dlIdx = (int)pp[P::dlTime];
    const double dlSeconds = (dlIdx >= 0 && dlIdx < 7 ? DELAY_BEATS[dlIdx] : 0.5) * 60 / pp[P::tempo];
    delay.process(L, R, n, dlSeconds, pp[P::dlFb], pp[P::dlTone], pp[P::dlPing] >= 0.5, pp[P::dlMix]);
    reverb.process(L, R, n, pp[P::rvSize], pp[P::rvDecay], pp[P::rvTone], pp[P::rvShimmer], pp[P::rvMix]);
    if (pumpOn && !pumpDry) pump.process(L, R, n, beat0, dBeat, pumpBeats, pp[P::pumpAmt], pp[P::pumpRel], pp[P::pumpCurve], pp[P::tempo]);
    const double drive = 1 + pp[P::warmth] * 2.2;
    const double makeup = (1 / tanhf_(drive * 0.5)) * 0.5;
    const double vol = pp[P::volume] * pp[P::volume] * 1.6;
    double pl = 0, pr = 0;
    int si = scopeIdx;
    for (int i = 0; i < n; i++) {
      double l = tanhf_(L[i] * drive) * makeup;
      double r = tanhf_(R[i] * drive) * makeup;
      l = softClip(dcL.tick(l * vol));
      r = softClip(dcR.tick(r * vol));
      L[i] = (float)l; R[i] = (float)r;
      const double al = l < 0 ? -l : l, ar = r < 0 ? -r : r;
      if (al > pl) pl = al;
      if (ar > pr) pr = ar;
      scope[si] = (float)((l + r) * 0.5); si = (si + 1) & 1023;
    }
    scopeIdx = si;
    peakL = pl; peakR = pr;
  }

private:
  static constexpr double DELAY_BEATS[7] = { 0.25, 1.0 / 3, 0.5, 0.75, 1, 1.5, 2 };   // matches DELAY_TIMES

  /** What the arp and the garden play into: straight to the voices. */
  struct SeqOut : NoteSink {
    Engine& e;
    explicit SeqOut(Engine& engine) : e(engine) {}
    void noteOn(int note, double velocity) override {
      e.voiceOn(note, velocity);
      if (e.listener) e.listener->engineNote(note, velocity);
    }
    void noteOff(int note) override { e.voiceOff(note); }
  };

  bool silent() const {
    if (arpOn() && arp.active()) return false;
    for (auto& v : voices) if (v->active()) return false;
    return true;
  }

  const ParamValues& effective(int n) {
    rotAge += n / fs;
    const double rot = std::min(1.0, p[P::rot] + (p[P::rotAuto] > 0 ? rotAge / (p[P::rotAuto] * 60) : 0));
    const int cl = (int)p[P::climate];
    const double ca = p[P::climateAmt];
    if (rot <= 0 && (cl == 0 || ca <= 0)) return p;
    ParamValues& e = pe;
    e = p;
    using std::min; using std::max; using std::pow;
    if (rot > 0) {
      e[P::drift] = min(1.0, e[P::drift] + rot * 0.6);
      e[P::cutoff] *= pow(2.0, -rot * 1.8);
      e[P::chTone] = max(0.0, e[P::chTone] - rot * 0.4);
      e[P::rvDecay] = min(30.0, e[P::rvDecay] * (1 + rot * 3));
      e[P::rvTone] = max(0.0, e[P::rvTone] - rot * 0.3);
      e[P::rvMix] = min(1.0, e[P::rvMix] + rot * 0.2);
      e[P::dlTone] = max(0.0, e[P::dlTone] - rot * 0.3);
      e[P::warmth] = min(1.0, e[P::warmth] + rot * 0.4);
      e[P::noiseLevel] = min(1.0, e[P::noiseLevel] + rot * 0.06);
      e[P::aAtk] = min(10.0, e[P::aAtk] * (1 + rot * 4));
      e[P::aRel] = min(15.0, e[P::aRel] * (1 + rot * 2));
      e[P::res] = max(0.0, e[P::res] - rot * 0.15);
    }
    if (cl > 0 && ca > 0) {
      switch (cl) {
        case 1: // sun: bright, open, steady
          e[P::cutoff] *= pow(2.0, 0.7 * ca); e[P::chDepth] = min(1.0, e[P::chDepth] + 0.25 * ca); e[P::chMix] = min(1.0, e[P::chMix] + 0.15 * ca);
          e[P::rvTone] = min(1.0, e[P::rvTone] + 0.3 * ca); e[P::drift] = max(0.0, e[P::drift] - 0.25 * ca); e[P::warmth] = min(1.0, e[P::warmth] + 0.1 * ca);
          break;
        case 2: // rain: thinner, wetter, hiss and echoes
          e[P::hpf] = min(2000.0, e[P::hpf] * pow(2.0, 2.5 * ca)); e[P::cutoff] *= pow(2.0, -0.3 * ca);
          e[P::dlMix] = min(1.0, e[P::dlMix] + 0.3 * ca); e[P::dlFb] = min(0.95, e[P::dlFb] + 0.15 * ca);
          e[P::rvDecay] = min(30.0, e[P::rvDecay] * (1 + 0.8 * ca)); e[P::noiseLevel] = min(1.0, e[P::noiseLevel] + 0.04 * ca);
          e[P::l2Pan] = min(1.0, e[P::l2Pan] + 0.4 * ca);
          break;
        case 3: // night: dark, wide, distant
          e[P::cutoff] *= pow(2.0, -1.2 * ca); e[P::rvMix] = min(1.0, e[P::rvMix] + 0.3 * ca); e[P::rvDecay] = min(30.0, e[P::rvDecay] * (1 + 2 * ca));
          e[P::rvSize] = min(1.0, e[P::rvSize] + 0.3 * ca); e[P::spread] = min(1.0, e[P::spread] + 0.3 * ca); e[P::warmth] = min(1.0, e[P::warmth] + 0.2 * ca);
          e[P::aAtk] = min(10.0, e[P::aAtk] * (1 + 3 * ca)); e[P::volume] *= 1 - 0.15 * ca;
          break;
        default: // storm: driven, unstable, resonant
          e[P::drive] = min(1.0, e[P::drive] + 0.45 * ca); e[P::res] = min(1.0, e[P::res] + 0.25 * ca); e[P::drift] = min(1.0, e[P::drift] + 0.5 * ca);
          e[P::l1Cut] = max(-1.0, min(1.0, e[P::l1Cut] + 0.35 * ca)); e[P::dlFb] = min(0.95, e[P::dlFb] + 0.25 * ca);
          e[P::l2Amp] = min(1.0, e[P::l2Amp] + 0.25 * ca); e[P::rvShimmer] = min(1.0, e[P::rvShimmer] + 0.2 * ca);
          break;
      }
    }
    return e;
  }

  void network(const ParamValues& pp) {
    const double amount = pp[P::netAmount];
    if (amount <= 0) {
      for (auto& v : voices) { v->netCut = 0; v->netPitch = 0; v->netAmp = 1; v->netInfl = 0; }
      return;
    }
    const double range = pp[P::netRange];
    double centre = 0; int count = 0;
    for (auto& v : voices) if (v->active()) { centre += v->note; count++; }
    if (count == 0) return;
    centre /= count;
    for (auto& vp : voices) {
      Voice& v = *vp;
      if (!v.active()) { v.netInfl = 0; v.netCut = 0; v.netPitch = 0; v.netAmp = 1; continue; }
      double infl = 0;
      for (auto& op : voices) {
        const Voice& o = *op;
        if (&o == &v || !o.active()) continue;
        const double w = std::exp(-std::abs((double)(v.note - o.note)) / range);
        infl += w * o.ampEnv.value * (0.5 + 0.5 * o.lfo1Value);
      }
      v.netInfl += (infl - v.netInfl) * 0.04;
      const double x = std::min(2.0, v.netInfl) * amount;
      v.netCut = pp[P::netCut] * x * 1.5;
      v.netPitch = pp[P::netPitch] * x * (v.note >= centre ? 1 : -1);
      v.netAmp = 1 / (1 + pp[P::netDim] * x * 1.5);
    }
  }

  // --------------------------------------------------------- allocation

  void voiceOn(int note, double vel) {
    const int mode = (int)p[P::voiceMode];
    const double glideFrom = p[P::glide] > 0 ? lastNote : std::numeric_limits<double>::quiet_NaN();
    if (mode == 0) {
      Voice& v = allocate(note);
      v.noteOn(note, vel, p, glideFrom, true);
      v.sustained = false;
    } else {
      removeMono(note);
      monoStack.push({ note, vel });
      Voice& v = *voices[0];
      const bool legato = mode == 2 && v.active() && !v.released;
      v.noteOn(note, vel, p, glideFrom, !legato);
      v.sustained = false;
    }
    lastNote = note;
  }

  void voiceOff(int note) {
    const int mode = (int)p[P::voiceMode];
    if (mode == 0) {
      for (auto& v : voices) {
        if (v->note != note || !v->active() || v->released) continue;
        if (sustain) v->sustained = true; else v->noteOff();
      }
    } else {
      removeMono(note);
      Voice& v = *voices[0];
      if (v.note != note || !v.active()) return;
      if (monoStack.size > 0) {
        const auto back = monoStack[monoStack.size - 1];
        v.noteOn(back.note, back.vel, p, p[P::glide] > 0 ? (double)note : std::numeric_limits<double>::quiet_NaN(), mode == 1);
        lastNote = back.note;
      } else if (sustain) v.sustained = true;
      else v.noteOff();
    }
  }

  void removeMono(int note) {
    int w = 0;
    for (int i = 0; i < monoStack.size; i++) if (monoStack[i].note != note) monoStack[w++] = monoStack[i];
    monoStack.size = w;
  }

  Voice& allocate(int note) {
    const int limit = std::max(1, std::min(MAX_VOICES, (int)p[P::poly]));
    for (int i = 0; i < limit; i++) { Voice& v = *voices[i]; if (v.active() && v.note == note && !v.released) return v; }
    for (int i = 0; i < limit; i++) if (!voices[i]->active()) return *voices[i];
    Voice* best = nullptr; double bestScore = std::numeric_limits<double>::infinity();
    for (int i = 0; i < limit; i++) {
      Voice& v = *voices[i];
      const double score = v.released ? v.ampEnv.value : 10 - v.age * 1e-6;
      if (score < bestScore) { bestScore = score; best = &v; }
    }
    return best ? *best : *voices[0];
  }

  struct Held { int note; double vel; };

  std::unique_ptr<Voice> voices[MAX_VOICES];
  Arp arp;
  Garden garden;
  Ensemble ensemble;
  TapeDelay delay;
  Reverb reverb;
  LFO lfo2;
  Pump pump;
  OnePoleHP hpL, hpR;
  DCBlock dcL, dcR;
  ParamValues pe{};
  double rotAge = 0;
  double beats = 0;
  double hostTempo = 0;
  bool hostPlaying = false;
  GlobalMod gm;
  double bendNorm = 0;
  bool sustain = false;
  FixedList<Held, 128> monoStack;
  double lastNote = std::numeric_limits<double>::quiet_NaN();
  double hpHz = -1;
  int scopeIdx = 0;
  SeqOut seqOut;
  double fs;
};

} // namespace mycelia

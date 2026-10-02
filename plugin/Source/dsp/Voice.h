// One polyphonic voice: two oscillator banks + sub + noise -> stereo ladder
// filter -> VCA. C++ port of src/dsp/voice.ts.
#pragma once

#include <array>
#include <cmath>
#include "Params.gen.h"
#include "Osc.h"
#include "Voicing.h"

namespace mycelia {

using ParamValues = std::array<double, NUM_PARAMS>;

constexpr int SUB = 16;

// matrix destinations, matching MOD_DSTS in params.ts
enum : int {
  DST_PITCH, DST_SHAPE_A, DST_SHAPE_B, DST_SHAPE_BOTH, DST_WIDTH_A, DST_WIDTH_B, DST_DETUNE,
  DST_LEVEL_A, DST_LEVEL_B, DST_SUB, DST_NOISE, DST_CUTOFF, DST_RES, DST_DRIVE, DST_AMP, DST_PAN,
  NUM_DSTS
};

/** Per-block global modulation shared by all voices. */
struct GlobalMod {
  double lfo2 = 0;      // -1..1
  double bend = 0;      // semitones
  double modWheel = 0;  // 0..1
  double pump = 0;      // 0..1
};

class Voice {
public:
  int note = -1;
  double velocity = 0;
  double age = 0;
  bool released = false;
  bool sustained = false;   // engine-owned: held by the pedal

  ADSR ampEnv, filtEnv;

  double netCut = 0, netPitch = 0, netAmp = 1, netInfl = 0;
  double lfo1Value = 0;

  Voice(double sampleRate, uint32_t seed)
    : ampEnv(sampleRate), filtEnv(sampleRate),
      oscA(seed * 7 + 1), oscB(seed * 7 + 2), noise(seed * 7 + 3),
      filtL(sampleRate), filtR(sampleRate), lfo1(seed * 7 + 4), rndGen(seed * 7 + 5), fs(sampleRate) {}

  bool active() const { return ampEnv.active(); }

  void noteOn(int n, double vel, const ParamValues& p, double glideFrom, bool retrigger) {
    note = n;
    velocity = vel;
    age = 0;
    released = false;
    pitchTarget = n;
    if (retrigger) rnd = rndGen.bi();
    if (std::isnan(glideFrom) || p[P::glide] <= 0) pitch = n;
    else pitch = glideFrom;
    if (retrigger) {
      const bool fresh = !ampEnv.active();
      ampEnv.gate(true);
      filtEnv.gate(true);
      lfoAge = 0;
      lfo1.reset();
      if (fresh) {
        oscA.start(); oscB.start(); sub.start();
        filtL.reset(); filtR.reset();
        gainSm = 0;
        updateControl(p, GlobalMod{}, true);
        filtL.snap(); filtR.snap();
      }
    }
  }

  void noteOff() {
    released = true;
    ampEnv.gate(false);
    filtEnv.gate(false);
  }

  void kill() {
    ampEnv.stage = Stage::Idle; ampEnv.value = 0;
    filtEnv.stage = Stage::Idle; filtEnv.value = 0;
    note = -1;
  }

  void render(float* outL, float* outR, int start, int n, const ParamValues& p, const GlobalMod& g) {
    double gain = gainSm;
    for (int off = start; off < start + n; off += SUB) {
      const int count = std::min(SUB, start + n - off);
      updateControl(p, g, false);
      std::fill(bufL, bufL + count, 0.f); std::fill(bufR, bufR + count, 0.f);
      oscA.render(bufL, bufR, count, shapeA, pwA, levA);
      oscB.render(bufL, bufR, count, shapeB, pwB, levB);
      sub.render(bufL, bufR, count, (int)p[P::subShape], levSub);
      noise.render(bufL, bufR, count, levNoise);
      filtL.process(bufL, count, drive, twoPole);
      filtR.process(bufR, count, drive, twoPole);
      const double target = velGain * trem;
      const double pl = panL, pr = panR;
      for (int s = 0; s < count; s++) {
        gain += (target - gain) * 0.002;
        const double a = ampEnv.tick() * gain;
        outL[off + s] += bufL[s] * a * pl;
        outR[off + s] += bufR[s] * a * pr;
      }
      age += count;
    }
    gainSm = gain;
  }

private:
  bool matrix(const ParamValues& p, const GlobalMod& g, double env2, double l1, double l2) {
    bool on = false;
    for (int i = 0; i < MOD_SLOTS; i++) {
      if (p[MOD_AMT_IDX[i]] != 0 && p[MOD_SRC_IDX[i]] >= 1) { on = true; break; }
    }
    if (!on) {
      if (modWasOn) { std::fill(mod, mod + NUM_DSTS, 0.f); modWasOn = false; }
      return false;
    }
    std::fill(mod, mod + NUM_DSTS, 0.f);
    for (int i = 0; i < MOD_SLOTS; i++) {
      const double amt = p[MOD_AMT_IDX[i]];
      const int src = (int)p[MOD_SRC_IDX[i]];
      if (amt == 0 || src < 1) continue;
      double s;
      switch (src) {
        case 1: s = l1; break;
        case 2: s = l2; break;
        case 3: s = ampEnv.value; break;
        case 4: s = env2; break;
        case 5: s = velocity; break;
        case 6: s = (note - 60) / 24.0; break;
        case 7: s = g.modWheel; break;
        case 8: s = p[P::bend] > 0 ? g.bend / p[P::bend] : 0; break;
        case 9: s = rnd; break;
        case 10: s = std::min(1.0, netInfl); break;
        default: s = g.pump; break;
      }
      const double x = s * amt;
      const int dst = (int)p[MOD_DST_IDX[i]];
      if (dst == DST_SHAPE_BOTH) { mod[DST_SHAPE_A] = (float)(mod[DST_SHAPE_A] + x); mod[DST_SHAPE_B] = (float)(mod[DST_SHAPE_B] + x); }
      else if (dst >= 0 && dst < NUM_DSTS) mod[dst] = (float)(mod[dst] + x);
    }
    modWasOn = true;
    return true;
  }

  void updateControl(const ParamValues& p, const GlobalMod& g, bool first) {
    const double dtc = SUB / fs;
    ampEnv.set(p[P::aAtk], p[P::aDec], p[P::aSus], p[P::aRel]);
    filtEnv.set(p[P::fAtk], p[P::fDec], p[P::fSus], p[P::fRel]);
    const double env2 = first ? filtEnv.value : filtEnv.skip(SUB);
    lfoAge += dtc;
    const double fade = p[P::l1Fade] > 0 ? std::min(1.0, lfoAge / p[P::l1Fade]) : 1;
    const int sync = (int)p[P::l1Sync];
    const double rate = sync > 0 ? p[P::tempo] / (60 * LFO_SYNC_BEATS[sync]) : p[P::l1Rate];
    const double l1 = lfo1.tick((int)p[P::l1Shape], rate * dtc) * fade;
    lfo1Value = l1;
    const double l2 = g.lfo2;
    matrix(p, g, env2, l1, l2);
    const float* m = mod;
    if (p[P::glide] > 0) {
      const double c = 1 - std::exp(-dtc / (p[P::glide] * 0.35));
      pitch += (pitchTarget - pitch) * c;
    } else pitch = pitchTarget;
    const double vibrato = l1 * (p[P::l1Pitch] + g.modWheel * 60) / 100;
    const double base = pitch + g.bend + vibrato + netPitch / 100 + m[DST_PITCH] * 12.0;
    const double detune = m[DST_DETUNE] * 60.0;
    const double fA = midiToFreq(base + p[P::aOct] * 12 + p[P::aSemi] + p[P::aFine] / 100);
    const double fB = midiToFreq(base + p[P::bOct] * 12 + p[P::bSemi] + p[P::bFine] / 100);
    oscA.setPitch(fA, fs, p[P::aUnison], clamp(p[P::aDetune] + detune, 0, 60), p[P::spread], p[P::drift]);
    oscB.setPitch(fB, fs, p[P::bUnison], clamp(p[P::bDetune] + detune, 0, 60), p[P::spread], p[P::drift]);
    sub.setPitch(midiToFreq(base - (p[P::subShape] == 2 ? 24 : 12)), fs);
    shapeA = clamp(p[P::aShape] + l2 * p[P::l2Shape2] * 0.5 + m[DST_SHAPE_A], 0, 1);
    shapeB = clamp(p[P::bShape] + l2 * p[P::l2Shape2] * 0.5 + m[DST_SHAPE_B], 0, 1);
    const double pwm = l1 * p[P::l1Pw] * 0.45;
    pwA = clamp(p[P::aPw] + pwm + m[DST_WIDTH_A] * 0.45, 0.05, 0.95);
    pwB = clamp(p[P::bPw] - pwm + m[DST_WIDTH_B] * 0.45, 0.05, 0.95);
    levA = clamp(p[P::aLevel] + m[DST_LEVEL_A], 0, 1);
    levB = clamp(p[P::bLevel] + m[DST_LEVEL_B], 0, 1);
    levSub = clamp(p[P::subLevel] + m[DST_SUB], 0, 1) * 0.9;
    levNoise = clamp(p[P::noiseLevel] + m[DST_NOISE], 0, 1);
    const double vel = velocity;
    const double oct = p[P::keyTrack] * (note - 60) / 12
      + p[P::fEnv] * env2 * 5
      + p[P::fVel] * (vel - 0.75) * 4
      + p[P::l1Cut] * l1 * 3
      + p[P::l2Cut] * l2 * 3
      + m[DST_CUTOFF] * 5.0
      + netCut;
    const double cutoff = clamp(p[P::cutoff] * std::pow(2.0, oct), 20, 18000);
    const double res = clamp(p[P::res] + m[DST_RES], 0, 1);
    filtL.set(cutoff, res);
    filtR.set(cutoff, res);
    drive = clamp(p[P::drive] + m[DST_DRIVE], 0, 1);
    twoPole = p[P::fMode] >= 0.5;
    velGain = ((1 - p[P::ampVel]) + p[P::ampVel] * std::pow(vel, 1.6)) * netAmp * clamp(1 + m[DST_AMP], 0, 2);
    trem = 1 - p[P::l2Amp] * (l2 * 0.5 + 0.5);
    const double pan = clamp(l2 * p[P::l2Pan] + m[DST_PAN], -1, 1);
    const double a = (pan + 1) * 0.25 * PI;
    panL = std::cos(a) * 1.4142; panR = std::sin(a) * 1.4142;
  }

  OscBank oscA, oscB;
  SubOsc sub;
  Noise noise;
  Ladder filtL, filtR;
  LFO lfo1;
  Rng rndGen;
  double lfoAge = 0;
  double pitch = 60, pitchTarget = 60;
  float bufL[SUB] = {}, bufR[SUB] = {};
  double fs;
  double gainSm = 0;

  float mod[NUM_DSTS] = {};
  bool modWasOn = false;
  double rnd = 0;

  double shapeA = 0.5, pwA = 0.5, shapeB = 0.5, pwB = 0.5;
  double velGain = 1, panL = 0.7071, panR = 0.7071, trem = 1;
  double drive = 0; bool twoPole = false;
  double levA = 0.8, levB = 0, levSub = 0, levNoise = 0;
};

} // namespace mycelia

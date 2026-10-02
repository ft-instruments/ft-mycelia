// Per-voice building blocks: transistor ladder, ADSR, LFO.
// C++ ports of src/dsp/ladder.ts, env.ts and lfo.ts.
#pragma once

#include "Util.h"

namespace mycelia {

// ---- ladder.ts -------------------------------------------------------------

class Ladder {
public:
  explicit Ladder(double sampleRate) : fs2(sampleRate * 2) {}

  void reset() {
    s0 = s1 = s2 = s3 = 0;
    t0 = t1 = t2 = t3 = 0;
    xPrev = 0;
    g = gT; k = kT;
  }

  /** Cutoff in Hz, resonance 0..1 (self-oscillation from ~0.95). */
  void set(double cutoff, double res) {
    const double fc = std::min(0.24, std::max(1e-5, cutoff / fs2));
    const double x = fc * PI;
    const double fcr = ((1.873 * x + 0.4955) * x - 0.649) * x + 0.9988;
    const double acr = (-3.9364 * x + 1.8409) * x + 0.9968;
    gT = 1 - std::exp(-2 * PI * fc * fcr);
    kT = 4.4 * std::max(0.0, std::min(1.0, res)) * acr;
  }

  void snap() { g = gT; k = kT; }

  void process(float* buf, int count, double drive, bool twoPole) {
    double S0 = s0, S1 = s1, S2 = s2, S3 = s3;
    double T0 = t0, T1 = t1, T2 = t2, T3 = t3;
    double G = g, K = k;
    const double GT = gT, KT = kT;
    double xp = xPrev;
    const double inGain = 0.6 + drive * 3;
    const double outGain = (1 / (0.6 + drive * 2)) * (1 + KT * 0.35);
    for (int i = 0; i < count; i++) {
      G += (GT - G) * 0.02;
      K += (KT - K) * 0.02;
      const double x = buf[i] * inGain;
      double out = 0;
      for (int os = 0; os < 2; os++) {
        const double xin = os == 0 ? (xp + x) * 0.5 : x;
        const double tin = tanhf_(xin - K * T3);
        S0 += G * (tin - T0); T0 = tanhf_(S0);
        S1 += G * (T0 - T1); T1 = tanhf_(S1);
        S2 += G * (T1 - T2); T2 = tanhf_(S2);
        S3 += G * (T2 - T3); T3 = tanhf_(S3);
        out += twoPole ? S1 : S3;
      }
      xp = x;
      buf[i] = (float)(out * 0.5 * outGain);
    }
    s0 = S0; s1 = S1; s2 = S2; s3 = S3;
    t0 = T0; t1 = T1; t2 = T2; t3 = T3;
    g = G; k = K; xPrev = xp;
  }

private:
  double s0 = 0, s1 = 0, s2 = 0, s3 = 0;
  double t0 = 0, t1 = 0, t2 = 0, t3 = 0;
  double g = 0.1, k = 0, gT = 0.1, kT = 0;
  double xPrev = 0;
  double fs2;
};

// ---- env.ts ----------------------------------------------------------------

enum class Stage { Idle, Attack, Decay, Sustain, Release };

class ADSR {
public:
  Stage stage = Stage::Idle;
  double value = 0;

  explicit ADSR(double sampleRate) : fs(sampleRate) {}

  void set(double attack, double decay, double sustain, double release) {
    ca = 1 - std::exp(-std::log(TARGET / (TARGET - 1)) / std::max(1.0, attack * fs));
    cd = 1 - std::exp(-4.6 / std::max(1.0, decay * fs));
    cr = 1 - std::exp(-4.6 / std::max(1.0, release * fs));
    sus = sustain;
  }

  void gate(bool on) {
    if (on) stage = Stage::Attack;
    else if (stage != Stage::Idle) stage = Stage::Release;
  }

  bool active() const { return stage != Stage::Idle; }

  double tick() {
    switch (stage) {
      case Stage::Attack:
        value += (TARGET - value) * ca;
        if (value >= 1) { value = 1; stage = Stage::Decay; }
        break;
      case Stage::Decay:
        value += (sus - value) * cd;
        if (std::abs(value - sus) < 1e-4) stage = Stage::Sustain;
        break;
      case Stage::Sustain:
        value += (sus - value) * 0.001;
        break;
      case Stage::Release:
        value += (0 - value) * cr;
        if (value < 1e-4) { value = 0; stage = Stage::Idle; }
        break;
      default: break;
    }
    return value;
  }

  double skip(int n) {
    double v = value;
    for (int i = 0; i < n; i++) v = tick();
    return v;
  }

private:
  static constexpr double TARGET = 1.35;
  double ca = 0.1, cd = 0.01, cr = 0.01, sus = 0.7;
  double fs;
};

// ---- lfo.ts ----------------------------------------------------------------

namespace LfoShape { enum : int { Sine, Tri, Saw, Square, SH, Drift }; }

class LFO {
public:
  double value = 0;

  explicit LFO(uint32_t seed, bool randomPhase = true) : rng(seed) {
    if (randomPhase) phase = rng.next();
    held = rng.bi();
    prev = rng.bi(); nxt = rng.bi();
  }

  void reset() { phase = 0; }

  /** Advance by `dt` cycles and return the new value. */
  double tick(int shape, double dt) {
    double p = phase + dt;
    bool wrapped = false;
    if (p >= 1) { p -= std::floor(p); wrapped = true; }
    return shapeAt(shape, p, wrapped);
  }

  /** Jump to phase `p` (0..1), for an LFO locked to the beat clock. */
  double tickAt(int shape, double p) { return shapeAt(shape, p, p < phase); }

private:
  double shapeAt(int shape, double p, bool wrapped) {
    phase = p;
    double v;
    switch (shape) {
      case LfoShape::Sine: v = std::sin(6.283185307 * p); break;
      case LfoShape::Tri: v = 4 * std::abs(p - 0.5) - 1; v = -v; break;
      case LfoShape::Saw: v = 1 - 2 * p; break;
      case LfoShape::Square: v = p < 0.5 ? 1 : -1; break;
      case LfoShape::SH:
        if (wrapped) held = rng.bi();
        v = held; break;
      default: {
        if (wrapped) { prev = nxt; nxt = rng.bi(); }
        const double t = p * p * (3 - 2 * p);
        v = prev + (nxt - prev) * t;
      }
    }
    value = v;
    return v;
  }

  double phase = 0;
  Rng rng;
  double held = 0, prev = 0, nxt = 0;
};

} // namespace mycelia

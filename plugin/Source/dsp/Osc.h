// Virtual-analogue oscillator bank, sub oscillator and noise.
// C++ port of src/dsp/osc.ts.
#pragma once

#include "Util.h"

namespace mycelia {

constexpr int MAX_UNISON = 7;

inline double polyblep(double t, double dt) {
  if (t < dt) { t /= dt; return t + t - t * t - 1; }
  if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
  return 0;
}

class OscBank {
public:
  int n = 1;

  explicit OscBank(uint32_t seed) : rng(seed) {
    for (int i = 0; i < MAX_UNISON; i++) {
      offsetCt[i] = (float)(rng.bi() * 2.5);
      phase[i] = rng.next();
    }
  }

  /** Called at note-on. Randomises phases (free-running VCOs) but keeps drift state. */
  void start() { for (int i = 0; i < MAX_UNISON; i++) phase[i] = rng.next(); }

  void setPitch(double freq, double sampleRate, double unison, double detune, double spread, double driftAmt) {
    const int count = std::max(1, std::min(MAX_UNISON, (int)unison));
    n = count;
    const double norm = 1 / std::sqrt((double)count);
    const double nyq = sampleRate * 0.45;
    for (int i = 0; i < count; i++) {
      driftVel[i] = (float)(driftVel[i] + (rng.bi() * 0.06 - drift[i] * 0.004));
      driftVel[i] = (float)(driftVel[i] * 0.985);
      drift[i] = (float)((double)drift[i] + (double)driftVel[i]);
      const double spreadPos = count == 1 ? 0 : ((double)i / (count - 1)) * 2 - 1;
      const double cents = spreadPos * detune * 0.5 + driftAmt * ((double)offsetCt[i] + drift[i] * 0.6);
      double f = freq * std::pow(2.0, cents / 1200);
      if (f > nyq) f = nyq;
      inc[i] = f / sampleRate;
      const double pan = spreadPos * spread;
      const double a = (pan + 1) * 0.25 * PI;
      gainL[i] = (float)(std::cos(a) * norm);
      gainR[i] = (float)(std::sin(a) * norm);
    }
  }

  void render(float* L, float* R, int count, double shape, double pw, double level) {
    if (level <= 0) return;
    double wTri = 0, wSaw = 0, wPul = 0;
    if (shape < 0.5) { wSaw = shape * 2; wTri = 1 - wSaw; } else { wPul = (shape - 0.5) * 2; wSaw = 1 - wPul; }
    wTri *= level; wSaw *= level; wPul *= level;
    const double pulseDC = pw + pw - 1;
    for (int i = 0; i < n; i++) {
      double t = phase[i];
      const double dt = inc[i];
      const double gl = gainL[i], gr = gainR[i];
      for (int s = 0; s < count; s++) {
        double v = 0;
        if (wSaw > 0) v += wSaw * ((t + t - 1) - polyblep(t, dt));
        if (wPul > 0) {
          double t2 = t + 1 - pw; if (t2 >= 1) t2 -= 1;
          v += wPul * ((t < pw ? 1 : -1) - pulseDC + polyblep(t, dt) - polyblep(t2, dt));
        }
        if (wTri > 0) v += wTri * (4 * std::abs(t - 0.5) - 1);
        L[s] += v * gl;
        R[s] += v * gr;
        t += dt; if (t >= 1) t -= 1;
      }
      phase[i] = t;
    }
  }

private:
  double phase[MAX_UNISON] = {};
  double inc[MAX_UNISON] = {};
  float gainL[MAX_UNISON] = {};
  float gainR[MAX_UNISON] = {};
  float offsetCt[MAX_UNISON] = {};   // fixed tuning error per copy
  float drift[MAX_UNISON] = {};      // slow random walk, cents
  float driftVel[MAX_UNISON] = {};
  Rng rng;
};

/** Sub oscillator: sine, square (one octave down) or sine two octaves down. */
class SubOsc {
public:
  void setPitch(double freq, double sampleRate) { inc = freq / sampleRate; }
  void start() { phase = 0; }
  void render(float* L, float* R, int count, int shape, double level) {
    if (level <= 0) return;
    double t = phase; const double dt = inc;
    for (int s = 0; s < count; s++) {
      double v;
      if (shape == 1) {
        const double sq = (t < 0.5 ? 1 : -1) + polyblep(t, dt) - polyblep(t < 0.5 ? t + 0.5 : t - 0.5, dt);
        lp += (sq - lp) * 0.35;
        v = lp * 0.8;
      } else {
        v = std::sin(6.283185307 * t);
      }
      v *= level;
      L[s] += v; R[s] += v;
      t += dt; if (t >= 1) t -= 1;
    }
    phase = t;
  }
private:
  double phase = 0, inc = 0, lp = 0;
};

/** Gentle pink-ish noise (white through a one-pole). */
class Noise {
public:
  explicit Noise(uint32_t seed) : rng(seed) {}
  void render(float* L, float* R, int count, double level) {
    if (level <= 0) return;
    for (int s = 0; s < count; s++) {
      const double w = rng.bi();
      z += (w - z) * 0.12;
      const double v = z * 2.2 * level;
      L[s] += v; R[s] += v;
    }
  }
private:
  Rng rng;
  double z = 0;
};

} // namespace mycelia

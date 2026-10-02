// The shared effect chain: pump, ensemble, tape delay, hall reverb.
// C++ ports of src/dsp/pump.ts, chorus.ts, delay.ts and reverb.ts.
// Buffers are allocated in the constructors, never while processing.
#pragma once

#include <vector>
#include "Util.h"

namespace mycelia {

// ---- pump.ts ---------------------------------------------------------------

inline double pumpDuck(double phase, double stepSec, double release, double curve) {
  constexpr double ATTACK = 0.004;
  const double t = phase * stepSec;
  const double atk = std::min(ATTACK, stepSec * 0.1);
  if (t < atk) return t / atk;
  const double relSec = std::max(atk * 2, release * stepSec) - atk;
  const double r = std::min(1.0, (t - atk) / relSec);
  const double e = std::pow(2.0, (0.5 - curve) * 4);
  return 1 - std::pow(r, e);
}

class Pump {
public:
  explicit Pump(double sampleRate) : a(1 - std::exp(-1 / (0.0008 * sampleRate))) {}

  void process(float* L, float* R, int n, double beat0, double dBeat, double stepBeats,
               double amount, double release, double curve, double tempo) {
    const double stepSec = stepBeats * 60 / tempo;
    double gg = g;
    for (int i = 0; i < n; i++) {
      const double b = (beat0 + i * dBeat) / stepBeats;
      const double target = 1 - amount * pumpDuck(b - std::floor(b), stepSec, release, curve);
      gg += (target - gg) * a;
      L[i] = (float)(L[i] * gg); R[i] = (float)(R[i] * gg);
    }
    g = gg;
  }

private:
  double g = 1;
  double a;
};

// ---- chorus.ts -------------------------------------------------------------

class Ensemble {
public:
  explicit Ensemble(double sampleRate) : fs(sampleRate) {
    const int len = (int)std::ceil(sampleRate * 0.03);
    bufL.assign(len, 0.f); bufR.assign(len, 0.f);
  }

  void clear() {
    std::fill(bufL.begin(), bufL.end(), 0.f); std::fill(bufR.begin(), bufR.end(), 0.f);
    lpL = lpR = 0;
  }

  void process(float* L, float* R, int n, double rate, double depth, double tone, double mix) {
    if (mix <= 0) return;
    float* bl = bufL.data(); float* br = bufR.data();
    const int len = (int)bufL.size();
    int idx = this->idx;
    const double slowInc = rate / fs;
    const double fastInc = (rate * 9.5 + 0.5) / fs;
    const double center = CENTER_MS * 1e-3 * fs;
    const double slowDepth = 2.6e-3 * fs * depth;
    const double fastDepth = 0.22e-3 * fs * depth;
    const double lpA = 1 - std::exp(-2 * PI * (2500 + tone * 9000) / fs);
    const double dryGain = 1 - mix * 0.45;
    const double wetGain = mix * 0.75;
    double lL = lpL, lR = lpR;
    double sp = slowPhase, fp = fastPhase;
    for (int i = 0; i < n; i++) {
      const double xl = L[i], xr = R[i];
      bl[idx] = (float)xl; br[idx] = (float)xr;
      const double d0 = center + tri(sp) * slowDepth + tri(fp) * fastDepth;
      const double d1 = center + tri(sp + 1.0 / 3) * slowDepth + tri(fp + 1.0 / 3) * fastDepth;
      const double d2 = center + tri(sp + 2.0 / 3) * slowDepth + tri(fp + 2.0 / 3) * fastDepth;
      const double e0 = center + tri(sp + 1.0 / 6) * slowDepth + tri(fp + 1.0 / 6) * fastDepth;
      const double e1 = center + tri(sp + 1.0 / 2) * slowDepth + tri(fp + 1.0 / 2) * fastDepth;
      const double e2 = center + tri(sp + 5.0 / 6) * slowDepth + tri(fp + 5.0 / 6) * fastDepth;
      double wl = (readDelay(bl, len, idx, d0) + 0.6 * readDelay(bl, len, idx, d1) + 0.3 * readDelay(br, len, idx, d2)) / 1.9;
      double wr = (readDelay(br, len, idx, e2) + 0.6 * readDelay(br, len, idx, e1) + 0.3 * readDelay(bl, len, idx, e0)) / 1.9;
      wl = tanhf_(wl * 1.3) / 1.3; wr = tanhf_(wr * 1.3) / 1.3;
      lL += (wl - lL) * lpA; lR += (wr - lR) * lpA;
      L[i] = (float)(xl * dryGain + lL * wetGain);
      R[i] = (float)(xr * dryGain + lR * wetGain);
      if (++idx >= len) idx = 0;
      sp += slowInc; if (sp >= 1) sp -= 1;
      fp += fastInc; if (fp >= 1) fp -= 1;
    }
    this->idx = idx; lpL = lL; lpR = lR; slowPhase = sp; fastPhase = fp;
  }

private:
  static double tri(double p) { p -= std::floor(p); return 4 * std::abs(p - 0.5) - 1; }
  static constexpr double CENTER_MS = 6;
  std::vector<float> bufL, bufR;
  int idx = 0;
  double slowPhase = 0, fastPhase = 0;
  double lpL = 0, lpR = 0;
  double fs;
};

// ---- delay.ts --------------------------------------------------------------

class TapeDelay {
public:
  explicit TapeDelay(double sampleRate) : fs(sampleRate) {
    const int len = (int)std::ceil(sampleRate * MAX_SECONDS);
    bufL.assign(len, 0.f); bufR.assign(len, 0.f);
    time = sampleRate * 0.3;
  }

  void clear() {
    std::fill(bufL.begin(), bufL.end(), 0.f); std::fill(bufR.begin(), bufR.end(), 0.f);
    lpL = lpR = hpL = hpR = 0;
  }

  void process(float* L, float* R, int n, double seconds, double feedback, double tone, bool pingPong, double mix) {
    if (mix <= 0 && feedback <= 0) return;
    float* bl = bufL.data(); float* br = bufR.data();
    const int len = (int)bufL.size();
    int idx = this->idx;
    const double target = std::min((double)(len - 4), std::max(8.0, seconds * fs));
    const double slew = 1 - std::exp(-1 / (0.08 * fs));
    const double lpA = 1 - std::exp(-2 * PI * (1500 + tone * 8500) / fs);
    const double hpA = 1 - std::exp(-2 * PI * 110 / fs);
    const double wobInc = 2 * PI * 0.37 / fs;
    const double wobDepth = 0.25e-3 * fs;
    const double fb = feedback;
    const double wet = mix * 0.8, dry = 1 - mix * 0.3;
    double tm = time, wob = wobble;
    double lL = lpL, lR = lpR, hL = hpL, hR = hpR;
    for (int i = 0; i < n; i++) {
      tm += (target - tm) * slew;
      wob += wobInc; if (wob > 6.283185307) wob -= 6.283185307;
      const double d = tm + std::sin(wob) * wobDepth;
      double rl = readDelay(bl, len, idx, d);
      double rr = readDelay(br, len, idx, d + 0.7e-3 * fs);
      lL += (rl - lL) * lpA; lR += (rr - lR) * lpA;
      hL += (lL - hL) * hpA; hR += (lR - hR) * hpA;
      rl = tanhf_((lL - hL) * 1.2) / 1.2;
      rr = tanhf_((lR - hR) * 1.2) / 1.2;
      const double xl = L[i], xr = R[i];
      if (pingPong) {
        const double mono = (xl + xr) * 0.5;
        bl[idx] = (float)(mono + rr * fb);
        br[idx] = (float)(rl * fb);
      } else {
        bl[idx] = (float)(xl + rl * fb);
        br[idx] = (float)(xr + rr * fb);
      }
      L[i] = (float)(xl * dry + rl * wet);
      R[i] = (float)(xr * dry + rr * wet);
      if (++idx >= len) idx = 0;
    }
    this->idx = idx; time = tm; wobble = wob;
    lpL = lL; lpR = lR; hpL = hL; hpR = hR;
  }

private:
  static constexpr double MAX_SECONDS = 2.2;
  std::vector<float> bufL, bufR;
  int idx = 0;
  double time = 0, wobble = 0;
  double lpL = 0, lpR = 0, hpL = 0, hpR = 0;
  double fs;
};

// ---- reverb.ts -------------------------------------------------------------

class PitchUp {
public:
  explicit PitchUp(double sampleRate) : W((int)std::round(sampleRate * 0.045)) { buf.assign(W + 4, 0.f); }
  void clear() { std::fill(buf.begin(), buf.end(), 0.f); }
  double tick(double x) {
    const int len = (int)buf.size();
    buf[idx] = (float)x;
    const double p = phase;
    double p2 = p + 0.5; if (p2 >= 1) p2 -= 1;
    const double a = readDelay(buf.data(), len, idx, W * (1 - p)) * std::sin(PI * p);
    const double b = readDelay(buf.data(), len, idx, W * (1 - p2)) * std::sin(PI * p2);
    phase += 1.0 / W; if (phase >= 1) phase -= 1;
    if (++idx >= len) idx = 0;
    return a + b;
  }
private:
  std::vector<float> buf;
  int idx = 0;
  double phase = 0;
  int W;
};

class Reverb {
public:
  explicit Reverb(double sampleRate) : shimmer(sampleRate), fs(sampleRate) {
    const double ratio = sampleRate / 48000;
    for (int i = 0; i < N; i++) {
      lines[i].assign((size_t)std::ceil(BASE[i] * ratio * MAX_SCALE + MOD_DEPTH * 2 + 8), 0.f);
      modPhase[i] = (float)((double)i / N);
    }
    for (int i = 0; i < 4; i++) ap[i].assign((size_t)std::max(2.0, std::round(AP_MS[i] * 1e-3 * sampleRate)), 0.f);
    pre.assign((size_t)std::round(0.018 * sampleRate), 0.f);
    setSize(0.6, 3);
  }

  void clear() {
    for (auto& l : lines) std::fill(l.begin(), l.end(), 0.f);
    for (auto& a : ap) std::fill(a.begin(), a.end(), 0.f);
    std::fill(pre.begin(), pre.end(), 0.f);
    std::fill(lp, lp + N, 0.f); std::fill(hp, hp + N, 0.f);
    shimmer.clear(); shimLp = 0;
  }

  void process(float* L, float* R, int n, double size, double decay, double tone, double shim, double mix) {
    if (mix <= 0) return;
    setSize(size, decay);
    const double lpA = 1 - std::exp(-2 * PI * (1200 + tone * 9000) / fs);
    const double hpA = 1 - std::exp(-2 * PI * 70 / fs);
    const double shimLpA = 1 - std::exp(-2 * PI * 3500 / fs);
    const double twoOverN = 2.0 / N;
    const double wet = mix * 0.6, dry = 1 - mix * 0.35;
    const int preLen = (int)pre.size();
    int pi = preIdx;
    const double shimGain = shim * 0.45;
    double sl = shimLp;
    for (int i = 0; i < n; i++) {
      const double xl = L[i], xr = R[i];
      const double inMono = (xl + xr) * 0.5;
      const double preOut = pre[pi]; pre[pi] = (float)inMono; if (++pi >= preLen) pi = 0;
      double x = allpass(allpass(allpass(allpass(preOut, 0), 1), 2), 3);
      double sum = 0, outL = 0, outR = 0;
      for (int j = 0; j < N; j++) {
        double ph = (double)modPhase[j] + MOD_RATE[j] / fs; if (ph >= 1) ph -= 1; modPhase[j] = (float)ph;
        const double d = lengths[j] + std::sin(6.283185307 * ph) * MOD_DEPTH;
        const double v = readDelay(lines[j].data(), (int)lines[j].size(), idx[j], d);
        tmp[j] = (float)v; sum += v;
        if (j & 1) outR += (j & 2) ? v : -v; else outL += (j & 2) ? v : -v;
      }
      if (shimGain > 0) {
        const double sh = shimmer.tick((outL + outR) * 0.25);
        sl += (sh - sl) * shimLpA;
        x += tanhf_(sl * shimGain);
      }
      const double s = sum * twoOverN;
      for (int j = 0; j < N; j++) {
        double v = ((double)tmp[j] - s) * gains[j] + ((j & 1) ? -x : x);
        lp[j] = (float)(lp[j] + (v - lp[j]) * lpA);
        hp[j] = (float)(hp[j] + ((double)lp[j] - hp[j]) * hpA);
        v = (double)lp[j] - hp[j];
        auto& line = lines[j];
        line[idx[j]] = (float)v;
        if (++idx[j] >= (int)line.size()) idx[j] = 0;
      }
      L[i] = (float)(xl * dry + outL * wet);
      R[i] = (float)(xr * dry + outR * wet);
    }
    preIdx = pi; shimLp = sl;
  }

private:
  static constexpr int N = 8;
  static constexpr double BASE[N] = { 1499, 1889, 2311, 2707, 3169, 3559, 4003, 4519 };
  static constexpr double MOD_RATE[N] = { 0.11, 0.17, 0.23, 0.31, 0.13, 0.19, 0.29, 0.37 };
  static constexpr double AP_MS[4] = { 3.1, 5.3, 8.7, 13.9 };
  static constexpr double AP_G = 0.62;
  static constexpr double MAX_SCALE = 1.45;
  static constexpr double MOD_DEPTH = 9;

  void setSize(double size, double decay) {
    if (size == curSize && decay == curDecay) return;
    curSize = size; curDecay = decay;
    const double scale = (0.45 + size) * fs / 48000;
    for (int i = 0; i < N; i++) {
      lengths[i] = BASE[i] * scale;
      gains[i] = (float)std::pow(10.0, (-3 * lengths[i]) / (decay * fs));
    }
  }

  double allpass(double x, int i) {
    auto& buf = ap[i];
    int k = apIdx[i];
    const double d = buf[k];
    const double v = x - AP_G * d;
    buf[k] = (float)v;
    if (++k >= (int)buf.size()) k = 0;
    apIdx[i] = k;
    return d + AP_G * v;
  }

  std::vector<float> lines[N];
  int idx[N] = {};
  double lengths[N] = {};
  float gains[N] = {};
  float lp[N] = {}, hp[N] = {};
  float modPhase[N] = {};
  float tmp[N] = {};
  std::vector<float> ap[4];
  int apIdx[4] = {};
  std::vector<float> pre;
  int preIdx = 0;
  PitchUp shimmer;
  double shimLp = 0;
  double fs;
  double curSize = -1, curDecay = -1;
};

} // namespace mycelia

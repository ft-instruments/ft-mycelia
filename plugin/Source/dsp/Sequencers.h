// Arpeggiator and growth sequencer. C++ ports of src/dsp/arp.ts and garden.ts.
//
// The TS versions use growable arrays, Sets and a Map; here everything is a
// fixed-capacity array so nothing allocates on the audio thread. Iteration
// and removal order match the TS exactly (insertion order, stable sorts),
// so both engines play the same notes.
#pragma once

#include <algorithm>
#include "Util.h"

namespace mycelia {

inline constexpr double ARP_BEATS[] = { 2, 1, 2.0 / 3, 0.5, 1.0 / 3, 0.25, 1.0 / 6, 0.125 };   // matches ARP_RATES
constexpr int NUM_ARP_BEATS = 8;

struct NoteSink {
  virtual ~NoteSink() = default;
  virtual void noteOn(int note, double velocity) = 0;
  virtual void noteOff(int note) = 0;
};

/** A fixed-capacity array with the handful of JS array operations the sequencers use. */
template <typename T, int CAP>
struct FixedList {
  T items[CAP];
  int size = 0;
  void clear() { size = 0; }
  bool push(const T& v) { if (size >= CAP) return false; items[size++] = v; return true; }
  void removeAt(int i) { for (int k = i; k < size - 1; k++) items[k] = items[k + 1]; size--; }
  T& operator[](int i) { return items[i]; }
  const T& operator[](int i) const { return items[i]; }
};

/** The set of keys physically down. */
struct KeySet {
  bool on[128] = {};
  int count = 0;
  void add(int n) { if (n >= 0 && n < 128 && !on[n]) { on[n] = true; count++; } }
  void remove(int n) { if (n >= 0 && n < 128 && on[n]) { on[n] = false; count--; } }
  bool has(int n) const { return n >= 0 && n < 128 && on[n]; }
  void clear() { std::fill(on, on + 128, false); count = 0; }
};

// ---- arp.ts ----------------------------------------------------------------

class Arp {
public:
  explicit Arp(double sampleRate) : fs(sampleRate) {}

  void keyDown(int note, double vel, bool hold) {
    if (hold && down.count == 0) { held.clear(); latched.clear(); }
    down.add(note);
    if (indexOf(held, note) < 0) held.push({ note, vel });
    latched = held;
  }

  void keyUp(int note, bool hold) {
    down.remove(note);
    if (!hold) {
      removeNote(held, note);
      latched = held;
    } else if (down.count == 0) {
      // keep latched; held keeps the chord too until a new key starts one
    } else {
      removeNote(held, note);
    }
  }

  /** Hold (pedal) released: drop everything except the keys still physically down. */
  void release() {
    int w = 0;
    for (int i = 0; i < held.size; i++) if (down.has(held[i].note)) held[w++] = held[i];
    held.size = w;
    latched = held;
  }

  void stop(NoteSink& out) {
    for (int i = 0; i < sounding.size; i++) out.noteOff(sounding[i].note);
    sounding.clear();
    held.clear(); latched.clear(); down.clear();
    countdown = 0; step = 0; wasOn = false;
  }

  bool active() const { return latched.size > 0; }

  void process(int n, int mode, int rateIdx, int octaves, double gate, double swing, double tempo, NoteSink& out) {
    for (int i = sounding.size - 1; i >= 0; i--) {
      auto& s = sounding[i];
      s.off -= n;
      if (s.off <= 0) { out.noteOff(s.note); sounding.removeAt(i); }
    }
    sequence(mode, octaves);
    if (seq.size == 0) {
      wasOn = false;
      countdown = 0;
      return;
    }
    if (!wasOn) { wasOn = true; step = 0; countdown = 0; }
    countdown -= n;
    if (countdown > 0) return;
    const double beat = rateIdx >= 0 && rateIdx < NUM_ARP_BEATS ? ARP_BEATS[rateIdx] : 0.25;
    const double stepLen = beat * 60 / tempo * fs;
    const bool even = (step & 1) == 0;
    const double dur = stepLen * (even ? 1 + swing : 1 - swing);
    countdown += dur;
    if (countdown < 0) countdown = dur;
    const double gateLen = std::max(16.0, dur * gate);
    auto fire = [&](const Held& h) {
      for (int k = 0; k < sounding.size; k++) {
        if (sounding[k].note == h.note) { out.noteOff(h.note); sounding.removeAt(k); break; }
      }
      out.noteOn(h.note, h.vel);
      sounding.push({ h.note, gateLen });
    };
    if (mode == 6) {
      for (int k = 0; k < seq.size; k++) fire(seq[k]);
    } else {
      int i;
      if (mode == 4) i = (int)std::floor(rand() * seq.size);
      else if (mode == 3) {
        const int len = seq.size;
        if (len == 1) i = 0;
        else {
          const int cycle = 2 * len - 2;
          const int k = step % cycle;
          i = k < len ? k : cycle - k;
        }
      } else i = step % seq.size;
      fire(seq[std::min(i, seq.size - 1)]);
    }
    step++;
  }

private:
  struct Held { int note; double vel; };
  struct Sounding { int note; double off; };

  template <typename L>
  static int indexOf(const L& list, int note) {
    for (int i = 0; i < list.size; i++) if (list[i].note == note) return i;
    return -1;
  }
  template <typename L>
  static void removeNote(L& list, int note) {
    int w = 0;
    for (int i = 0; i < list.size; i++) if (list[i].note != note) list[w++] = list[i];
    list.size = w;
  }

  double rand() {
    uint32_t x = rng; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rng = x;
    return x / 4294967296.0;
  }

  void sequence(int mode, int octaves) {
    seq.clear();
    if (latched.size == 0) return;
    notes = latched;
    if (mode == 1 || mode == 2 || mode == 3)
      std::stable_sort(notes.items, notes.items + notes.size, [](const Held& a, const Held& b) { return a.note < b.note; });
    for (int o = 0; o < octaves; o++)
      for (int k = 0; k < notes.size; k++) seq.push({ notes[k].note + 12 * o, notes[k].vel });
    if (mode == 2) std::reverse(seq.items, seq.items + seq.size);
  }

  FixedList<Held, 128> held, latched, notes;
  FixedList<Held, 512> seq;
  FixedList<Sounding, 1024> sounding;
  KeySet down;
  int step = 0;
  double countdown = 0;
  uint32_t rng = 12345;
  bool wasOn = false;
  double fs;
};

// ---- garden.ts -------------------------------------------------------------

struct ScaleDef { const char* name; int steps[12]; int count; };
inline constexpr ScaleDef SCALES[] = {
  { "penta", { 0, 3, 5, 7, 10 }, 5 },
  { "major", { 0, 2, 4, 5, 7, 9, 11 }, 7 },
  { "minor", { 0, 2, 3, 5, 7, 8, 10 }, 7 },
  { "dorian", { 0, 2, 3, 5, 7, 9, 10 }, 7 },
  { "lydian", { 0, 2, 4, 6, 7, 9, 11 }, 7 },
  { "whole", { 0, 2, 4, 6, 8, 10 }, 6 },
  { "fifths", { 0, 7 }, 2 },
  { "chroma", { 0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11 }, 12 },
};
constexpr int NUM_SCALES = 8;

struct GardenParams {
  int rateIdx, scaleIdx, life; double branch, fade; int reach; double gate, tempo;
};

class Garden {
public:
  explicit Garden(double sampleRate) : fs(sampleRate) {}

  void keyDown(int note, double vel) {
    down.add(note);
    int i = keyIndex(note);
    if (i >= 0) keys[i].vel = vel; else keys.push({ note, vel });
    plant(note, vel);
  }

  void keyUp(int note, bool hold) {
    down.remove(note);
    if (!hold) { int i = keyIndex(note); if (i >= 0) keys.removeAt(i); }
  }

  /** Pedal released: forget pedal-held keys, keep the ones still physically down. */
  void releaseHeld() {
    int w = 0;
    for (int i = 0; i < keys.size; i++) if (down.has(keys[i].note)) keys[w++] = keys[i];
    keys.size = w;
  }

  bool active() const { return seeds.size > 0 || keys.size > 0; }

  void stop(NoteSink& out) {
    for (int i = 0; i < sounding.size; i++) out.noteOff(sounding[i].note);
    sounding.clear(); seeds.clear(); keys.clear(); down.clear(); countdown = 0;
  }

  void process(int n, const GardenParams& gp, NoteSink& out) {
    for (int i = sounding.size - 1; i >= 0; i--) {
      auto& s = sounding[i];
      s.off -= n;
      if (s.off <= 0) { out.noteOff(s.note); sounding.removeAt(i); }
    }
    // re-seed held keys whose lineage has died
    for (int k = 0; k < keys.size; k++) {
      bool alive = false;
      for (int i = 0; i < seeds.size; i++) if (seeds[i].key == keys[k].note) { alive = true; break; }
      if (!alive) plant(keys[k].note, keys[k].vel);
    }
    if (seeds.size == 0) { countdown = 0; return; }
    countdown -= n;
    if (countdown > 0) return;
    const double beat = gp.rateIdx >= 0 && gp.rateIdx < NUM_ARP_BEATS ? ARP_BEATS[gp.rateIdx] : 0.5;
    const double stepLen = beat * 60 / gp.tempo * fs;
    countdown += stepLen;
    if (countdown < 0) countdown = stepLen;
    const double gateLen = std::max(32.0, stepLen * gp.gate);
    const ScaleDef& scale = SCALES[gp.scaleIdx >= 0 && gp.scaleIdx < NUM_SCALES ? gp.scaleIdx : 0];
    auto fire = [&](int note, double vel) {
      if (note < 12 || note > 120) return;
      for (int k = 0; k < sounding.size; k++) {
        if (sounding[k].note == note) { out.noteOff(note); sounding.removeAt(k); break; }
      }
      out.noteOn(note, vel);
      sounding.push({ note, gateLen });
    };
    next.clear();
    for (int i = 0; i < seeds.size; i++) {
      const Seed s = seeds[i];
      fire(s.note, s.vel);
      if (s.gen >= gp.life - 1) continue;
      const int kids = rand() < gp.branch ? 2 : 1;
      for (int k = 0; k < kids; k++) {
        const double vel = s.vel * (1 - gp.fade);
        if (vel < 0.08) continue;
        next.push({ s.root, child(s, scale, gp.reach), vel, s.gen + 1, s.key });
      }
    }
    // keep the garden from exploding
    if (next.size > 12) {
      std::stable_sort(next.items, next.items + next.size, [](const Seed& a, const Seed& b) { return b.vel < a.vel; });
      next.size = 12;
    }
    seeds.size = 0;
    for (int i = 0; i < next.size; i++) seeds.push(next[i]);
  }

private:
  struct Seed { int root; int note; double vel; int gen; int key; };
  struct Key { int note; double vel; };
  struct Sounding { int note; double off; };

  int keyIndex(int note) const {
    for (int i = 0; i < keys.size; i++) if (keys[i].note == note) return i;
    return -1;
  }

  double rand() {
    uint32_t x = rng; x ^= x << 13; x ^= x >> 17; x ^= x << 5; rng = x;
    return x / 4294967296.0;
  }

  void plant(int note, double vel) {
    seeds.push({ note, note, vel, 0, note });
    countdown = std::min(countdown, 0.0);
  }

  int child(const Seed& seed, const ScaleDef& scale, int reach) {
    int candidates[16]; int nc = 0;
    const int lo = seed.note - 7, hi = seed.note + 7;
    for (int n = lo; n <= hi; n++) {
      if (n == seed.note) continue;
      const int deg = ((n - seed.root) % 12 + 12) % 12;
      bool inScale = false;
      for (int k = 0; k < scale.count; k++) if (scale.steps[k] == deg) { inScale = true; break; }
      if (!inScale) continue;
      if (std::abs(n - seed.root) > 12 * reach) continue;
      candidates[nc++] = n;
    }
    if (nc == 0) return seed.note;
    double weights[16]; double sum = 0;
    for (int i = 0; i < nc; i++) weights[i] = 1 / (1 + std::abs(candidates[i] - seed.note) * 0.35);
    for (int i = 0; i < nc; i++) sum += weights[i];
    double r = rand() * sum;
    for (int i = 0; i < nc; i++) { r -= weights[i]; if (r <= 0) return candidates[i]; }
    return candidates[nc - 1];
  }

  FixedList<Seed, 512> seeds;
  FixedList<Seed, 1024> next;
  FixedList<Key, 128> keys;
  FixedList<Sounding, 1024> sounding;
  KeySet down;
  double countdown = 0;
  uint32_t rng = 777;
  double fs;
};

} // namespace mycelia

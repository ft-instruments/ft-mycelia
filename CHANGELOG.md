# Changelog

All notable changes to ft-mycelia. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## Unreleased

## [0.1.1] - 2026-11-21

### Changed
- The plugin window is now a wide 16:10 layout (1360 × 850) that fits the screen, scales to the window and never scrolls. A new window opens as large as fits, up to that size.
- Ensemble, delay, canopy, pump and arp modules dim and show an OFF tag while they are doing nothing, so it is clear what is active.
- The Space tab keeps its graphs at a normal size and its panels reach the bottom like the other tabs. The Living tab is unchanged.
- The plugin header no longer overlaps: the stats and tempo readouts are fixed width, and the live activity graph no longer sits on top of the buttons.
- Knob readouts are fixed width, so the knobs no longer move as values change.

## [0.1.0] - 2026-11-14

First public release.

### Added
- MYCELIA, a bioluminescent virtual-analogue polysynth for pads, layered synths and arpeggios. It runs in the browser, with the DSP core written to lift into a plugin.
- VST3, AU and standalone builds under `plugin/`, built by GitHub Actions for macOS, Windows and Linux (JUCE 8, WebView editor).
- FT Instrument look, saved presets, a real power switch, and two preset banks including 86 extra presets in a compact browser.
- Fonts (Tektur, Geist, Geist Mono, a small symbol fallback; all SIL OFL) bundled in `src/fonts/`: the UI and the plugin make no network connections.
- AGPL-3.0 license and third-party notices.

[Unreleased]: https://github.com/ft-instruments/ft-mycelia/compare/v0.1.1...HEAD
[0.1.1]: https://github.com/ft-instruments/ft-mycelia/compare/v0.1.0...v0.1.1
[0.1.0]: https://github.com/ft-instruments/ft-mycelia/releases/tag/v0.1.0

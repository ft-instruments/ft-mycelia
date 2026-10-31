# Changelog

All notable changes to ft-mycelia. Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## Unreleased

### Added
- AGPL-3.0 license, a Download section in the README and a GitHub Actions workflow that builds the plugin for macOS, Windows and Linux.

### Changed
- `plugin/CMakeLists.txt`: `MYCELIA_INSTALL` option (off in CI) and `NEEDS_WEBVIEW2` for Windows.

## [0.1.0] - 2026-10-04

First tracked release. The version file already said 0.1.0, so this tags the project as it stands today.

### Added
- A bioluminescent virtual-analogue polysynth that runs in the browser, with the DSP core written to lift into a plugin.
- FT Instrument look, saved presets and a real power switch; the shared UI is unified with Vector and Siege.
- Pulse.
- Compact preset browser and a second bank of 86 presets; the ascent bank is folded into the regular categories.
- AU / VST plugin build under `plugin/`.
- The header width stays steady as the DSP readout changes digits.

[Unreleased]: https://github.com/filipefthomaz-gd/ft-mycelia/compare/v0.1.0...HEAD
[0.1.0]: https://github.com/filipefthomaz-gd/ft-mycelia/releases/tag/v0.1.0

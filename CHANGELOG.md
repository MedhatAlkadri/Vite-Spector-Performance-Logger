# Changelog

All notable changes to this project are documented here. This project follows [Semantic Versioning](https://semver.org/).

## [1.0.1] - 2026-10-06

### Fixed
- README quick-start imported `initPerfLogger`, which the package does not export. It now uses the real export, `initPerfBridge`.
- README said output files land in the project root; they are written to the `.traces` folder (or the configured `outDir`).
- README claimed WebGPU support; Spector.js captures WebGL only.
- README described a "5-line" report; the report is a short Markdown summary with a variable length.

### Added
- `LICENSE` file (MIT), matching the license declared in `package.json`.
- README *Notes* section: dev-server-only scope, open CORS headers on the dev endpoint, Chromium-only metrics, optional `window.sceneManager` integration, and output files.
- This changelog.

## [1.0.0] - 2026-06-26

- Initial release.

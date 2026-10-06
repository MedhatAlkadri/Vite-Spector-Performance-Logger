# Vite-Spector Performance Logger

A standalone, token-efficient middleware package designed to bridge the gap between Three.js visual performance metrics (Spector.js / CPU Long Tasks) and readable Markdown summaries.

## The Problem
Running a full performance trace using standard tools generates a massive, multi-megabyte JSON payload. This raw data is difficult for human developers to scan quickly, and impossible to feed into AI coding assistants (due to Token Poisoning and context limits).

## The Solution
This package solves the data-bloat issue by:
1. **Manual Trigger:** You visually navigate to the Three.js view you want to test and press `F9`.
2. **Distillation Bridge:** A Vite server middleware intercepts the massive JSON payload, discards the noise, and outputs a short Markdown report containing only the critical symptoms (Draw Calls, Textures, Shaders, JS Heap, CPU Long Tasks).
3. **Readable Output:** You (or your AI agent) read the newly generated `.traces/trace_TIMESTAMP.md` file to instantly identify performance bottlenecks without digging through endless buffers.

## Requirements
- **Vite** ^2.0.0 || ^3.0.0 || ^4.0.0 || ^5.0.0
- **Node.js** >= 14.x
- Any Three.js (WebGL) project. Spector.js captures WebGL only, so WebGPU renderers are not supported.

## Installation

Install the package as a dev dependency via NPM:

```bash
npm install vite-plugin-spector-perf-logger --save-dev
```

## How to Use

### 1. Vite Config (`vite.config.js`)
Import the plugin and add it to your Vite configuration. You can optionally specify a custom output directory (defaults to `.traces`):

```javascript
import { defineConfig } from 'vite';
import { spectorPerfLogger } from 'vite-plugin-spector-perf-logger';

export default defineConfig({
  plugins: [
    spectorPerfLogger({ outDir: './custom-reports-folder' })
  ]
});
```

### 2. Frontend Hook (`main.js` or `app.js`)
Import the client hook and bind it to your Three.js canvas. It is highly recommended to place this in your main entry file or your Three.js Scene Manager script.

```javascript
import { initPerfBridge } from 'vite-plugin-spector-perf-logger/client';

// Initialize the logger, binding it to your canvas element and setting the trigger key
initPerfBridge('canvas', { key: 'F9', showUI: true });
```

### 3. Usage Flow
1. Run your dev server (`npm run dev`).
2. You will see a small overlay in the bottom right corner of your screen indicating the plugin is ready.
3. Navigate your application to the WebGL scene you want to audit.
4. Press **F9** (or click the UI button) to start tracking CPU long tasks, then press **F9** again to capture the GPU state.
5. Check the output folder (`.traces` by default, or your `outDir`). A new timestamped Markdown file (e.g. `trace_2024-05-12T12-30-00-000Z.md`) has been generated with your token-efficient metrics, next to a sanitized `.json` capture of the draw commands. *Note: older traces are no longer overwritten, allowing you to compare performance over time!*
6. Open the newly generated Markdown trace to instantly spot your bottlenecks!

## Notes
- **Development only.** The trace endpoint exists only on the Vite dev server (`configureServer`) and sends open CORS headers so a page served from another origin (e.g. LocalWP) can post to it. Do not expose the dev server to untrusted networks.
- **Browser support.** CPU long-task counting uses the Long Tasks API, which is available in Chromium-based browsers. JS heap size uses `performance.memory`, also Chromium-only.
- **Optional scene integration.** If `window.sceneManager` exposes a `renderer` (and optionally `scene` and `camera`), the logger captures that renderer's canvas and forces one render frame so idle scenes can still be captured. Without it, the canvas is found with the selector you pass in.
- **Output.** Each capture writes a Markdown report and a sanitized JSON capture (command names, text and markers only) to the output folder.
- **License.** MIT, see `LICENSE`.

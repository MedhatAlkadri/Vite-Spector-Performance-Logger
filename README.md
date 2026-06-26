# Vite-Spector Performance Logger

A standalone, token-efficient middleware package designed to bridge the gap between Three.js visual performance metrics (Spector.js / CPU Long Tasks) and readable Markdown summaries.

## The Problem
Running a full performance trace using standard tools generates a massive, multi-megabyte JSON payload. This raw data is difficult for human developers to scan quickly, and impossible to feed into AI coding assistants (due to Token Poisoning and context limits).

## The Solution
This package solves the data-bloat issue by:
1. **Manual Trigger:** You visually navigate to the Three.js view you want to test and press `F9`.
2. **Distillation Bridge:** A Vite server middleware intercepts the massive JSON payload, discards the noise, and outputs a tiny 5-line Markdown file containing only the critical symptoms (Draw Calls, Textures, Shaders, JS Heap, CPU Long Tasks).
3. **Readable Output:** You (or your AI agent) read the newly generated `.traces/trace_TIMESTAMP.md` file to instantly identify performance bottlenecks without digging through endless buffers.

## Requirements
- **Vite** ^2.0.0 || ^3.0.0 || ^4.0.0 || ^5.0.0
- **Node.js** >= 14.x
- Any Three.js project (or any WebGL/WebGPU project that Spector.js supports)

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
import { initPerfLogger } from 'vite-plugin-spector-perf-logger/client';

// Initialize the logger, binding it to your canvas element and setting the trigger key
initPerfLogger('canvas', { key: 'F9', showUI: true });
```

### 3. Usage Flow
1. Run your dev server (`npm run dev`).
2. You will see a small overlay in the bottom right corner of your screen indicating the plugin is ready.
3. Navigate your application to the WebGL scene you want to audit.
4. Press **F9** (or click the UI button) to start tracking CPU long tasks, then press **F9** again to capture the GPU state.
5. Check your project root. A new timestamped file (e.g. `trace_2024-05-12T12-30-00-000Z.md`) has been generated with your token-efficient metrics. *Note: older traces are no longer overwritten, allowing you to compare performance over time!*
6. Open the newly generated Markdown trace to instantly spot your bottlenecks!

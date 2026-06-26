import fs from 'fs';
import path from 'path';

export function spectorPerfLogger(options = {}) {
  const outDirName = options.outDir || '.traces';

  return {
    name: 'vite-plugin-spector-perf-logger',
    configureServer(server) {
      server.middlewares.use('/__capture_threejs_trace', (req, res, next) => {
        // [Elite Fix] Inject open CORS headers to accept cross-origin requests from WordPress/LocalWP
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
        res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

        if (req.method === 'OPTIONS') {
          res.statusCode = 200;
          res.end();
          return;
        }

        if (req.method === 'POST') {
          let body = '';
          req.on('data', chunk => {
            body += chunk.toString();
          });
          req.on('end', () => {
            try {
              const data = JSON.parse(body);
              
              // Extract Critical Symptoms
              const drawCalls = data.drawCalls || 0;
              const totalElements = data.totalElements || 0;
              const resolution = data.resolution || 'Unknown';
              const textureCount = data.textureCount || 0;
              const shaderCount = data.shaderCount || 0;
              const longTasks = data.longTasks || 0;
              const jsHeapMB = data.jsHeapMB ? data.jsHeapMB.toFixed(2) : 0;
              const redundantBinds = data.redundantBinds || 0;
              const topDraws = data.topDraws || [];
              const stutters = data.stutterDetectors || { compileShaders: 0, textureUploads: 0 };

              let summary = `# Latest WebGL Performance Trace\n\n`;
              
              // [ADVANCED DIAGNOSTICS WARNINGS]
              let hasWarning = false;
              
              // 1. Stutter Detectors
              if (stutters.compileShaders > 0) {
                 summary += `> ⚠️ **STUTTER: MID-FRAME SHADER COMPILATION**\n> ${stutters.compileShaders} shaders compiled mid-frame. This forces a CPU/GPU sync. Pre-compile materials.\n\n`;
                 hasWarning = true;
              }
              if (stutters.textureUploads > 0) {
                 summary += `> ⚠️ **STUTTER: MID-FRAME TEXTURE UPLOAD**\n> ${stutters.textureUploads} textures uploaded (texImage2D) mid-frame. Ensure textures are decoded before use.\n\n`;
                 hasWarning = true;
              }
              if (data.longTasks > 0) {
                 summary += `> ⚠️ **STUTTER: CPU LONG TASKS**\n> ${data.longTasks} synchronous JS tasks exceeded 50ms. Check math loops or garbage collection.\n\n`;
                 hasWarning = true;
              }

              // 2. Bottleneck & Bloat Detectors
              if (drawCalls > 150) {
                 summary += `> ⚠️ **CPU BOTTLENECK: DRAW CALL OVERLOAD**\n> ${drawCalls} draw calls detected. Exceeding 150 will kill mobile performance. Use InstancedMesh or merge geometries.\n\n`;
                 hasWarning = true;
              }
              if (redundantBinds > 20) {
                 summary += `> ⚠️ **CPU OVERHEAD: REDUNDANT STATE CHANGES**\n> ${redundantBinds} consecutive redundant shader/texture binds. Group objects by material in the scene graph.\n\n`;
                 hasWarning = true;
              }
              if (jsHeapMB > 300) {
                 summary += `> ⚠️ **MEMORY: HIGH HEAP USAGE**\n> JS Heap is at ${jsHeapMB} MB. Watch out for memory leaks (forgetting to call dispose()).\n\n`;
                 hasWarning = true;
              }
              
              const bloatedDraws = topDraws.filter(d => d.count > 100000);
              if (bloatedDraws.length > 0) {
                 summary += `> ⚠️ **GPU BOTTLENECK: VERTEX BLOAT**\n> Detected ${bloatedDraws.length} draw calls exceeding 100,000 vertices/indices. This will destroy fill-rate and battery. Decimate meshes or use LODs.\n\n`;
                 hasWarning = true;
              }
              
              if (totalElements > 500000) {
                 summary += `> ⚠️ **GPU BOTTLENECK: MASSIVE POLYCOUNT**\n> The frame is pushing ${totalElements.toLocaleString()} vertices/indices. Exceeding 500k is dangerous for mobile GPUs.\n\n`;
                 hasWarning = true;
              }

              if (!hasWarning) {
                 summary += `> ✅ **FRAME HEALTHY**\n> No stutters, memory leaks, draw call overloads, or vertex bloat detected.\n\n`;
              }

              summary += `## High-Level Metrics\n` +
                `- **Resolution:** ${resolution}\n` +
                `- **Total Elements (Verts/Indices):** ${totalElements.toLocaleString()}\n` +
                `- **Draw Calls:** ${drawCalls} / 150 budget\n` +
                `- **Texture Count:** ${textureCount}\n` +
                `- **Shader Swaps:** ${shaderCount}\n` +
                `- **Redundant State Changes:** ${redundantBinds}\n` +
                `- **JS Heap Size:** ${jsHeapMB} MB\n\n` +
                `## Top 5 Heaviest Draw Calls (By Vertex/Element Count)\n`;
                
              if (topDraws.length > 0) {
                 topDraws.forEach(draw => {
                    summary += `- **Cmd #${draw.id}:** \`${draw.text}\` (Count: ${draw.count.toLocaleString()})\n`;
                 });
              } else {
                 summary += `- None detected.\n`;
              }
                
              summary += `\n*Generated by Vite-Spector Performance Bridge*`;

              // Determine output directory based on user option (defaults to .ai)
              const outDir = path.resolve(process.cwd(), outDirName);
              if (!fs.existsSync(outDir)) {
                fs.mkdirSync(outDir, { recursive: true });
              }
              
              // Generate unique timestamped filenames
              const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
              const mdFilename = `trace_${timestamp}.md`;
              const jsonFilename = `trace_${timestamp}.json`;
              
              const mdFile = path.join(outDir, mdFilename);
              fs.writeFileSync(mdFile, summary, 'utf-8');
              
              if (data.captureData) {
                const jsonFile = path.join(outDir, jsonFilename);
                fs.writeFileSync(jsonFile, JSON.stringify(data.captureData, null, 2), 'utf-8');
              }
              
              console.log(`\n[ThreePerfBridge] Performance trace captured and distilled to ${outDirName}/${mdFilename}`);
              res.statusCode = 200;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ success: true, mdFile: mdFilename, outDir: outDirName }));
            } catch (err) {
              console.error('[ThreePerfBridge] Error parsing trace payload', err);
              res.statusCode = 500;
              res.setHeader('Content-Type', 'application/json');
              res.end(JSON.stringify({ error: err.message }));
            }
          });
        } else {
          next();
        }
      });
    }
  };
}

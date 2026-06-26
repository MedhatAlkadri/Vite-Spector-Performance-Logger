export function initPerfBridge(canvasSelector = 'canvas', options = { key: 'F9', showUI: true }) {
  if (typeof window === 'undefined') return;

  console.log(`[ThreePerfBridge] Initialized. Press ${options.key} or use the UI to capture AI-readable trace.`);

  let spectorInstance = null;
  let longTasksCount = 0;
  let isRecording = false;

  // Initialize PerformanceObserver once to avoid memory leaks
  if ('PerformanceObserver' in window) {
    const observer = new PerformanceObserver((list) => {
      if (isRecording) {
        longTasksCount += list.getEntries().length;
      }
    });
    observer.observe({ type: 'longtask', buffered: true });
  }

  // EAGERLY load SpectorJS so it can hook into HTMLCanvasElement.prototype.getContext 
  // BEFORE Three.js creates the WebGLRenderer.
  import('spectorjs').then(SPECTOR => {
    spectorInstance = new SPECTOR.Spector();
    console.log('[ThreePerfBridge] SpectorJS successfully hooked into WebGL context.');
    
    // Attach listener ONCE to prevent stacking infinite event handlers
    spectorInstance.onCapture.add((capture) => {
      let drawCalls = 0;
      let textures = new Set();
      let shaders = new Set();
      
      let heavyDraws = [];
      let redundantBinds = 0;
      let lastShader = null;
      let lastTexture = null;
      
      // [Stutter Detectors]
      let compileShaderCount = 0;
      let textureUploadCount = 0;
      let totalElements = 0;

      capture.commands.forEach((cmd, index) => {
        if (cmd.name === 'drawElements' || cmd.name === 'drawArrays') {
          drawCalls++;
          let count = 0;
          if (cmd.name === 'drawElements' && cmd.commandArguments.length >= 2) count = cmd.commandArguments[1];
          if (cmd.name === 'drawArrays' && cmd.commandArguments.length >= 3) count = cmd.commandArguments[2];
          
          totalElements += count;
          
          heavyDraws.push({ 
             id: index, 
             text: cmd.text, 
             count: count 
          });
        }
        
        if (cmd.name === 'bindTexture') {
          textures.add(cmd.text); 
          if (cmd.text === lastTexture) redundantBinds++;
          lastTexture = cmd.text;
        }
        
        if (cmd.name === 'useProgram') {
          shaders.add(cmd.text);
          if (cmd.text === lastShader) redundantBinds++;
          lastShader = cmd.text;
        }

        // Detect synchronous blocking operations
        if (cmd.name === 'compileShader' || cmd.name === 'linkProgram') {
            compileShaderCount++;
        }
        if (cmd.name === 'texImage2D' || cmd.name === 'texSubImage2D') {
            textureUploadCount++;
        }
      });

      // Get top 5 heaviest draw calls
      heavyDraws.sort((a, b) => b.count - a.count);
      const top5Draws = heavyDraws.slice(0, 5);

      let jsHeapMB = 0;
      if (performance.memory) {
        jsHeapMB = performance.memory.usedJSHeapSize / 1048576;
      }
      
      let canvasWidth = 0;
      let canvasHeight = 0;
      if (capture.canvas) {
         canvasWidth = capture.canvas.width;
         canvasHeight = capture.canvas.height;
      }

      // [Context Window Protection]
      // Spector's raw capture object contains massive typed arrays and deeply nested WebGL objects.
      // We surgically strip out everything except the human-readable text and markers to save AI tokens!
      const sanitizedCaptureData = {
         commands: capture.commands.map((cmd, i) => {
            const cleanCmd = { id: i, name: cmd.name, text: cmd.text };
            if (cmd.marker) cleanCmd.marker = cmd.marker;
            return cleanCmd;
         })
      };

      const payload = {
        drawCalls: drawCalls,
        totalElements: totalElements,
        resolution: `${canvasWidth}x${canvasHeight}`,
        textureCount: textures.size,
        shaderCount: shaders.size,
        longTasks: longTasksCount,
        jsHeapMB: jsHeapMB,
        topDraws: top5Draws,
        redundantBinds: redundantBinds,
        stutterDetectors: {
            compileShaders: compileShaderCount,
            textureUploads: textureUploadCount
        },
        captureData: sanitizedCaptureData
      };

      // Post explicitly to Vite Middleware (bypassing WordPress proxy)
      const viteOrigin = new URL(import.meta.url).origin;
      fetch(`${viteOrigin}/__capture_threejs_trace`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      }).then(res => {
        if (!res.ok) {
           throw new Error('Server rejected the trace payload.');
        }
        return res.json();
      }).then(data => {
        if (data.success) {
          console.log(`[ThreePerfBridge] Trace distilled and saved locally to ${data.outDir}/${data.mdFile}`);
          updateUI(false, '✅ Trace Saved!');
          setTimeout(() => updateUI(false), 2000);
        } else {
          console.error('[ThreePerfBridge] Server rejected the trace payload.');
          updateUI(false, '❌ Save Failed');
          setTimeout(() => updateUI(false), 2000);
        }
      }).catch(err => {
        console.error('[ThreePerfBridge] Failed to post trace to Vite server.', err);
        updateUI(false, '❌ Network Error');
        setTimeout(() => updateUI(false), 2000);
      });
    });
  }).catch(err => {
    console.error('[ThreePerfBridge] Failed to eagerly load spectorjs.', err);
  });

  // UI State Variables
  let uiContainer, statusDot, startBtn, stopBtn;

  if (options.showUI !== false) {
    // Inject Premium UI Overlay
    uiContainer = document.createElement('div');
    uiContainer.style.cssText = `
      position: fixed;
      bottom: 20px;
      right: 20px;
      z-index: 999999;
      background: rgba(10, 10, 15, 0.85);
      backdrop-filter: blur(12px);
      -webkit-backdrop-filter: blur(12px);
      border: 1px solid rgba(255, 255, 255, 0.1);
      border-radius: 12px;
      padding: 12px 16px;
      display: flex;
      align-items: center;
      gap: 12px;
      font-family: system-ui, -apple-system, sans-serif;
      color: white;
      box-shadow: 0 8px 32px rgba(0, 0, 0, 0.3);
      transition: all 0.3s ease;
    `;

    statusDot = document.createElement('div');
    statusDot.style.cssText = `
      width: 10px;
      height: 10px;
      border-radius: 50%;
      background: #4ade80;
      box-shadow: 0 0 10px #4ade80;
      transition: all 0.3s ease;
    `;

    const btnStyle = `
      background: transparent;
      border: none;
      color: white;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      padding: 4px 8px;
      outline: none;
      border-radius: 6px;
      transition: background 0.2s ease;
    `;

    startBtn = document.createElement('button');
    startBtn.innerText = `Start Trace (${options.key})`;
    startBtn.style.cssText = btnStyle;
    startBtn.onmouseover = () => startBtn.style.background = 'rgba(255, 255, 255, 0.1)';
    startBtn.onmouseout = () => startBtn.style.background = 'transparent';

    stopBtn = document.createElement('button');
    stopBtn.innerText = 'Stop & Capture';
    stopBtn.style.cssText = btnStyle + ' opacity: 0.5; cursor: not-allowed;';
    stopBtn.disabled = true;

    uiContainer.appendChild(statusDot);
    uiContainer.appendChild(startBtn);
    uiContainer.appendChild(stopBtn);
    document.body.appendChild(uiContainer);
  }

  const updateUI = (recording, customText = null) => {
    if (options.showUI === false) return;
    
    if (recording) {
      statusDot.style.background = '#f87171';
      statusDot.style.boxShadow = '0 0 15px #f87171';
      uiContainer.style.borderColor = 'rgba(248, 113, 113, 0.4)';
      
      startBtn.disabled = true;
      startBtn.style.opacity = '0.5';
      startBtn.style.cursor = 'not-allowed';
      startBtn.innerText = 'Recording...';
      
      stopBtn.disabled = false;
      stopBtn.style.opacity = '1';
      stopBtn.style.cursor = 'pointer';
      stopBtn.onmouseover = () => stopBtn.style.background = 'rgba(248, 113, 113, 0.2)';
      stopBtn.onmouseout = () => stopBtn.style.background = 'transparent';
    } else {
      statusDot.style.background = '#4ade80';
      statusDot.style.boxShadow = '0 0 10px #4ade80';
      uiContainer.style.borderColor = 'rgba(255, 255, 255, 0.1)';
      
      startBtn.disabled = false;
      startBtn.style.opacity = '1';
      startBtn.style.cursor = 'pointer';
      startBtn.innerText = customText || `Start Trace (${options.key})`;
      
      stopBtn.disabled = true;
      stopBtn.style.opacity = '0.5';
      stopBtn.style.cursor = 'not-allowed';
      stopBtn.style.background = 'transparent';
      stopBtn.onmouseover = null;
      stopBtn.onmouseout = null;
    }
  };

  const startRecording = () => {
    if (!spectorInstance) {
      console.warn('[ThreePerfBridge] SpectorJS not ready yet.');
      if (startBtn) startBtn.innerText = 'Loading...';
      return;
    }
    if (isRecording) return;

    isRecording = true;
    longTasksCount = 0; // Reset CPU task counter
    updateUI(true);
    console.log('[ThreePerfBridge] ⏺ Recording started. Tracking CPU long tasks...');
  };

  const stopRecording = () => {
    if (!isRecording) return;
    
    isRecording = false;
    if (stopBtn) stopBtn.innerText = 'Capturing GPU...';
    console.log(`[ThreePerfBridge] ⏹ Recording stopped. Captured ${longTasksCount} long tasks. Triggering GPU capture...`);
    
    try {
      let canvas = document.querySelector(canvasSelector);
      
      // [Elite Fix] If sceneManager exists, ALWAYS use its explicit WebGL canvas. 
      // A generic querySelector('canvas') might grab a 2D UI canvas by mistake!
      if (window.sceneManager && window.sceneManager.renderer) {
          canvas = window.sceneManager.renderer.domElement;
      }

      if (!canvas) {
        console.error(`[ThreePerfBridge] Canvas not found: ${canvasSelector}`);
        updateUI(false);
        return;
      }
      
      // This captures the exact frame when Stop is pressed
      spectorInstance.captureCanvas(canvas);

      // [Elite Fix] If the 3D scene is currently idle/asleep to save battery, 
      // Spector will hang forever waiting for a WebGL command. 
      // We force an artificial render frame right now to guarantee a capture!
      if (window.sceneManager && window.sceneManager.renderer && window.sceneManager.scene && window.sceneManager.camera) {
         console.log('[ThreePerfBridge] Forcing artificial render frame to wake up GPU...');
         requestAnimationFrame(() => {
             if (typeof window.sceneManager.render === 'function') {
                 window.sceneManager.render();
             } else if (window.sceneManager.composer) {
                 window.sceneManager.composer.render();
             } else {
                 window.sceneManager.renderer.render(window.sceneManager.scene, window.sceneManager.camera);
             }
         });
      } else {
         // Fallback to waking up generic event listeners
         window.dispatchEvent(new Event('pointermove'));
         window.dispatchEvent(new Event('resize'));
      }

    } catch (err) {
      console.error('[ThreePerfBridge] Error during trace capture.', err);
      updateUI(false, '❌ Error');
      setTimeout(() => updateUI(false), 2000);
    }
  };

  if (options.showUI !== false) {
    startBtn.addEventListener('click', startRecording);
    stopBtn.addEventListener('click', stopRecording);
  }

  window.addEventListener('keydown', (e) => {
    if (e.key === options.key) {
      if (isRecording) {
        stopRecording();
      } else {
        startRecording();
      }
    }
  });
}


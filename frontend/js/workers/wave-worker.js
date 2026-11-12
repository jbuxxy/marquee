// Off-main-thread host for the header waveform + watch-card waves (js/waveform/engine.js).
// The page transfers its <canvas> elements here as OffscreenCanvases and then only sends
// small state updates; every frame is drawn in this thread.
self.window = self; // js/waveform/*.js modes attach to window.MarqueeWaveform

importScripts('../waveform/engine.js');

let renderer = null;

function loadMode(name, cb) {
  if (!/^[a-z]+$/.test(name)) return;
  try { importScripts(`../waveform/${name}.js`); cb(); } catch (err) { console.warn(`[wave-worker] failed to load mode ${name}:`, err); }
}

self.onmessage = ({ data: msg }) => {
  switch (msg.type) {
    case 'init': renderer = self.MarqueeWaveform.createRenderer(msg.surfaces, loadMode); break;
    case 'surface': renderer?.addSurface(msg.id, msg.canvas); break;
    case 'threads': renderer?.setThreads(msg.threads); break;
    case 'size': renderer?.setSize(msg.id, msg.w, msg.h, msg.dpr); break;
    case 'counts': renderer?.setCounts(msg.counts); break;
    case 'mode': renderer?.setMode(msg.mode); break;
    case 'state': renderer?.setState(msg.running, msg.staticOnly); break;
  }
};

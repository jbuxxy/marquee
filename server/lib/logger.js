function log(...args) { console.log('[marquee]', ...args); }
function warn(...args) { console.warn('[marquee]', ...args); }
function error(...args) { console.error('[marquee]', ...args); }

module.exports = { log, warn, error };

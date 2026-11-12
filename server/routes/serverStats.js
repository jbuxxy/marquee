const fs = require('fs/promises');
const { sendJson } = require('../lib/http');

async function cpuSnapshot() {
  const line = (await fs.readFile('/proc/stat', 'utf8')).split('\n')[0].split(/\s+/).slice(1).map(Number);
  const idle = line[3] + line[4];
  const total = line.reduce((a, b) => a + b, 0);
  return { idle, total };
}

async function memUsagePercent() {
  const meminfo = await fs.readFile('/proc/meminfo', 'utf8');
  const total = parseInt(meminfo.match(/^MemTotal:\s+(\d+)/m)?.[1] || '0', 10);
  const available = parseInt(meminfo.match(/^MemAvailable:\s+(\d+)/m)?.[1] || '0', 10);
  if (!total) return 0;
  return Math.round(((total - available) / total) * 100);
}

// No config gating — CPU/RAM percentages aren't sensitive and this needs no
// credentials, matching marquee's other always-on routes like /healthz.
async function handleServerStats(req, res) {
  try {
    const before = await cpuSnapshot();
    await new Promise((resolve) => setTimeout(resolve, 200));
    const after = await cpuSnapshot();
    const totalDiff = after.total - before.total;
    const idleDiff = after.idle - before.idle;
    const cpu = totalDiff > 0 ? Math.round((1 - idleDiff / totalDiff) * 100) : 0;
    const mem = await memUsagePercent();
    sendJson(res, 200, { cpu, mem });
  } catch {
    sendJson(res, 200, { cpu: null, mem: null });
  }
}

module.exports = { handleServerStats };

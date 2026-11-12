const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.MARQUEE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marquee-test-csp-'));

const { CONTENT_SECURITY_POLICY } = require('../server/static');

const FRONTEND = path.join(__dirname, '..', 'frontend');
function walk(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((d) => {
    const p = path.join(dir, d.name);
    return d.isDirectory() ? walk(p) : [p];
  });
}
const sources = walk(FRONTEND).filter((f) => /\.(html|js)$/.test(f));

test('the policy forbids inline script', () => {
  const scriptSrc = CONTENT_SECURITY_POLICY.split(';').map((s) => s.trim()).find((s) => s.startsWith('script-src'));
  assert.ok(scriptSrc);
  assert.doesNotMatch(scriptSrc, /'unsafe-inline'|'unsafe-eval'/);
  assert.match(CONTENT_SECURITY_POLICY, /object-src 'none'/);
});

test('no page has an inline <script> body', () => {
  for (const f of sources.filter((x) => x.endsWith('.html'))) {
    const inline = fs.readFileSync(f, 'utf8').match(/<script(?![^>]*\bsrc=)[^>]*>\s*\S/g);
    assert.equal(inline, null, `${path.relative(FRONTEND, f)} has an inline <script>; move it to a file`);
  }
});

test('no inline on* event handler attributes in markup or templates', () => {
  for (const f of sources) {
    const hits = fs.readFileSync(f, 'utf8').match(/\son(click|error|load|change|input|submit|key\w+|mouse\w+|focus|blur)\s*=\s*["']/gi);
    assert.equal(hits, null, `${path.relative(FRONTEND, f)}: use data-action / data-img-fallback (js/util.js) instead`);
  }
});

test('every data-action used in markup is allow-listed', () => {
  const util = fs.readFileSync(path.join(FRONTEND, 'js', 'util.js'), 'utf8');
  const allowed = new Set([...util.matchAll(/'(\w+)'|^\s+(\w+):/gm)].map((m) => m[1] || m[2]));
  for (const f of sources.filter((x) => !x.endsWith(path.join('js', 'util.js')))) {
    for (const [, name] of fs.readFileSync(f, 'utf8').matchAll(/data-action="(\w+)"/g)) {
      assert.ok(allowed.has(name), `${path.relative(FRONTEND, f)} uses data-action="${name}", which js/util.js doesn't allow`);
    }
  }
});

test('third-party scripts come only from origins the policy allows', () => {
  for (const f of sources) {
    // <script> elements created at runtime (named `s` or `script` throughout the codebase)
    for (const [, url] of fs.readFileSync(f, 'utf8').matchAll(/\b(?:s|script)\.src\s*=\s*['`](https:\/\/[^'`]+)/g)) {
      assert.ok(url.startsWith('https://cdn.jsdelivr.net/'), `${path.relative(FRONTEND, f)} loads ${url}`);
    }
  }
});

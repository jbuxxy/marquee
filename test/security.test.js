const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'marquee-test-security-'));
process.env.MARQUEE_CONFIG_DIR = tmpDir;

const { redactForMember, tokenizeIp, resolveIpToken, isPrivateIp } = require('../server/lib/memberRedact');
const { parseCookies, cookieFromRequest } = require('../server/lib/cookies');
const { buildSetCookie } = require('../server/auth/session');
const { jellyfinAuthHeaders } = require('../server/lib/httpProxy');
const { createIpLimiter, createWindowLimiter } = require('../server/auth/rateLimit');
const { clientIp, isJsonRequest } = require('../server/lib/http');
const { sanitizeJellyfinSessionsForGuest, sanitizePlexSessionsForGuest } = require('../server/lib/guestRedact');

test('member redaction tokenizes public IPs, masks private ones, drops paths and emails', () => {
  const raw = {
    MediaContainer: {
      Metadata: [{
        title: 'Movie',
        Player: { address: '203.0.113.57', remotePublicAddress: '198.51.100.4', title: 'Living Room' },
        Media: [{ Part: [{ file: '/mnt/media/Movie.mkv' }] }],
        User: { title: 'alice', email: 'alice@example.com' },
      }],
    },
  };
  const out = redactForMember(raw);
  const m = out.MediaContainer.Metadata[0];
  assert.equal(m.title, 'Movie');
  assert.match(m.Player.address, /^ip-[0-9a-f]{16}$/);
  assert.equal(resolveIpToken(m.Player.address), '203.0.113.57');
  assert.equal(m.Media[0].Part[0].file, undefined);
  assert.equal(m.User.email, undefined);
  assert.equal(tokenizeIp('192.168.1.20'), '10.0.0.0');
  assert.equal(tokenizeIp('203.0.113.57:32400'), m.Player.address, 'port is ignored');
  assert.ok(isPrivateIp('fd00::1') && isPrivateIp('100.64.1.1') && !isPrivateIp('8.8.8.8'));
});

test('guest sanitizers keep no titles, device names or IPs', () => {
  const jf = sanitizeJellyfinSessionsForGuest([{
    UserName: 'bob', Client: 'Jellyfin Web', DeviceName: "Bob's iPhone", RemoteEndPoint: '203.0.113.9',
    NowPlayingItem: { Name: 'Secret', Type: 'Movie', RunTimeTicks: 1 },
  }])[0];
  assert.equal(jf.NowPlayingItem.Name, 'Hidden Title');
  assert.equal(jf.DeviceName, undefined);
  assert.equal(jf.RemoteEndPoint, undefined);
  assert.notEqual(jf.UserName, 'bob');
  const plex = sanitizePlexSessionsForGuest({ MediaContainer: { Metadata: [{ title: 'Secret', Player: { title: 'Den TV', address: '203.0.113.9', product: 'Plex Web' } }] } });
  assert.deepEqual(Object.keys(plex.MediaContainer.Metadata[0].Player).sort(), ['product', 'state']);
});

test('cookies: malformed encodings do not throw; __Host- names win over plain ones', () => {
  assert.deepEqual(parseCookies('a=%E0%A4%A; b=ok'), { a: '%E0%A4%A', b: 'ok' });
  const req = { headers: { cookie: 'marquee_visitor=plain; __Host-marquee_visitor=prefixed' } };
  assert.equal(cookieFromRequest(req, 'marquee_visitor'), 'prefixed');
});

test('Set-Cookie uses the __Host- prefix only over trusted HTTPS', () => {
  const plain = buildSetCookie({ headers: {} }, 'marquee_session', 'v', { maxAgeSeconds: 60 });
  assert.match(plain, /^marquee_session=v; Path=\/; SameSite=Lax; HttpOnly; Max-Age=60$/);
  process.env.TRUST_PROXY = 'true';
  try {
    const secure = buildSetCookie({ headers: { 'x-forwarded-proto': 'https' } }, 'marquee_session', 'v', { maxAgeSeconds: 60 });
    assert.match(secure, /^__Host-marquee_session=v; Path=\/;.*; Secure$/);
    assert.doesNotMatch(secure, /Domain=/);
  } finally {
    delete process.env.TRUST_PROXY;
  }
});

test('client IP: X-Real-IP only behind a trusted proxy', () => {
  const req = { headers: { 'x-real-ip': '203.0.113.5' }, socket: { remoteAddress: '172.18.0.2' } };
  assert.equal(clientIp(req), '172.18.0.2');
  process.env.TRUST_PROXY = 'true';
  try { assert.equal(clientIp(req), '203.0.113.5'); } finally { delete process.env.TRUST_PROXY; }
});

test('login bodies must be JSON', () => {
  assert.ok(isJsonRequest({ headers: { 'content-type': 'application/json; charset=utf-8' } }));
  assert.ok(!isJsonRequest({ headers: { 'content-type': 'application/x-www-form-urlencoded' } }));
  assert.ok(!isJsonRequest({ headers: {} }));
});

test('Jellyfin auth uses the Authorization header form Jellyfin 12 accepts', () => {
  const h = jellyfinAuthHeaders('abc123');
  assert.match(h.Authorization, /^MediaBrowser .*Token="abc123"/);
  assert.equal(h['X-Emby-Token'], undefined);
});

test('rate limiters: lockout after repeated failures; separate limiters are independent', () => {
  const a = createIpLimiter({ maxAttempts: 2 });
  const b = createIpLimiter({ maxAttempts: 2 });
  a.recordIpFailure('1.1.1.1');
  assert.equal(a.ipLockedUntil('1.1.1.1'), 0);
  a.recordIpFailure('1.1.1.1');
  assert.ok(a.ipLockedUntil('1.1.1.1') > Date.now());
  assert.equal(b.ipLockedUntil('1.1.1.1'), 0);
  const take = createWindowLimiter({ limit: 2, windowMs: 60000 });
  assert.deepEqual([take('k'), take('k'), take('k')], [true, true, false]);
});

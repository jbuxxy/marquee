const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('os');
const path = require('path');
const fs = require('fs');

process.env.MARQUEE_CONFIG_DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'marquee-test-parsing-'));

const { parseBingeBase } = require('../server/services/digitalDates');
const { truncateIp } = require('../server/services/geo');

test('BingeBase: original layout', () => {
  const html = '<h2 class="date-group-header">Monday, November 2, 2026</h2>'
    + '<img alt="The Long Walk poster"><img alt="Tom &amp; Jerry&#39;s Movie poster">';
  assert.deepEqual(parseBingeBase(html), {
    'the long walk': '2026-11-02',
    'tom jerrys movie': '2026-11-02',
  });
});

test('BingeBase: late-2026 redesign (rc-date, nbsp separators, data attribute titles)', () => {
  const html = '<h2 class="rc-date text-lg">Tuesday, 3 November 2026</h2>'
    + '<div data-ds--poster-card-title-value="Weapons"><img alt=""></div>'
    + '<h2 class="rc-date">Friday, 13 November 2026</h2>'
    + '<div data-ds--poster-card-title-value="Weapons"></div><div data-ds--poster-card-title-value="Nobody 2"></div>';
  assert.deepEqual(parseBingeBase(html), { weapons: '2026-11-03', 'nobody 2': '2026-11-13' });
});

test('BingeBase: empty or unrecognized HTML yields nothing', () => {
  assert.deepEqual(parseBingeBase(''), {});
  assert.deepEqual(parseBingeBase('<h2 class="rc-date">Soon</h2><div data-ds--poster-card-title-value="X">'), {});
});

test('geo: only the network part of an address is ever sent', () => {
  assert.equal(truncateIp('203.0.113.57'), '203.0.113.0');
  assert.equal(truncateIp('2001:db8:abcd:12::1'), '2001:db8:abcd::');
  assert.equal(truncateIp('2001:db8::1'), '2001:db8:0::');
  assert.equal(truncateIp('192.168.1.5'), null);
  assert.equal(truncateIp('not-an-ip'), null);
});

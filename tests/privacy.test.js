const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'manifest.json'), 'utf8'));
const background = fs.readFileSync(path.join(root, 'background.js'), 'utf8');
const content = fs.readFileSync(path.join(root, 'content.js'), 'utf8');

test('limits page access and network hosts', () => {
  assert.deepEqual(manifest.content_scripts[0].matches, ['http://*/*', 'https://*/*', 'file:///*']);
  assert.deepEqual(manifest.host_permissions, [
    'https://api.yadio.io/*',
    'https://api.kraken.com/*',
    'https://open.er-api.com/*',
    'https://api.binance.com/*',
    'https://api.fxratesapi.com/*'
  ]);
  assert.ok(!manifest.permissions.includes('scripting'));
  assert.ok(!manifest.host_permissions.includes('<all_urls>'));

  const requestedOrigins = [...background.matchAll(/fetchJson\('(https:\/\/[^/]+)/g)].map(match => match[1]).sort();
  const allowedOrigins = manifest.host_permissions.map(pattern => pattern.replace(/\/\*$/, '')).sort();
  assert.deepEqual(requestedOrigins, allowedOrigins);
});

test('does not enumerate tabs or programmatically inject scripts', () => {
  assert.doesNotMatch(background, /chrome\.tabs\.(?:query|onUpdated)/);
  assert.doesNotMatch(background, /chrome\.scripting/);
});

test('excludes native and ARIA editable controls from scanning', () => {
  assert.match(content, /isContentEditable/);
  assert.match(content, /role="textbox"/);
  assert.match(content, /role="searchbox"/);
  assert.match(content, /role="combobox"/);
});

#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

const base = JSON.parse(fs.readFileSync('manifest.json', 'utf8'));
const dist = path.join(__dirname, 'dist');

const browsers = {
  chrome: {},
  edge: {},
  brave: {},
  firefox: {
    background: { scripts: ['price-service.js', 'background.js'] }
  }
};

for (const [browser, overrides] of Object.entries(browsers)) {
  const dir = path.join(dist, browser);
  fs.mkdirSync(dir, { recursive: true });

  const manifest = { ...base, ...overrides };
  fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  for (const f of ['content.js', 'background.js', 'price-parser.js', 'price-service.js']) {
    fs.copyFileSync(path.join(__dirname, f), path.join(dir, f));
  }

  const iconsDir = path.join(dir, 'icons');
  fs.mkdirSync(iconsDir, { recursive: true });
  for (const f of fs.readdirSync(path.join(__dirname, 'icons'))) {
    fs.copyFileSync(path.join(__dirname, 'icons', f), path.join(iconsDir, f));
  }

  console.log(`✓ ${browser}: ${dir}`);
}

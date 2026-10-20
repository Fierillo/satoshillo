const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function detect({ documentLanguage = '', bodyText = '', browserLanguage = 'es-AR' } = {}) {
  const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
  const context = vm.createContext({
    document: { documentElement: { lang: documentLanguage }, body: { innerText: bodyText } },
    navigator: { language: browserLanguage }
  });
  vm.runInContext(source.slice(source.indexOf('function detectPageLanguage'), source.indexOf('let activeAnchor')), context);
  return context.detectPageLanguage();
}

test('detects the page language from the page, not from the browser locale', () => {
  assert.equal(detect({ bodyText: 'Add to cart for $25' }), 'en');
  assert.equal(detect({ documentLanguage: 'en', bodyText: 'Add to cart for $25' }), 'en');
});

test('detects Spanish pages from the document language or the page text', () => {
  assert.equal(detect({ documentLanguage: 'es-AR', bodyText: 'Comprar' }), 'es');
  assert.equal(detect({ bodyText: 'El precio es de 500 pesos' }), 'es');
});

test('keeps English as the fallback when the browser is in Spanish', () => {
  assert.equal(detect({ documentLanguage: 'en-US', bodyText: '', browserLanguage: 'es-AR' }), 'en');
});

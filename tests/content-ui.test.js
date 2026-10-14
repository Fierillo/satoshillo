const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('currency button opens its menu on hover without a native tooltip', () => {
  const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
  const listeners = {};
  const attributes = {};
  const candidate = {};
  const button = {
    title: '', parentNode: candidate,
    style: { setProperty() {} },
    setAttribute(name, value) { attributes[name] = value; },
    addEventListener(name, handler) { listeners[name] = handler; }
  };
  let opened;
  const context = vm.createContext({
    document: { createElement: () => button },
    cancelClose() {}, scheduleClose() {},
    openCurrencyMenu(anchor, parent) { opened = { anchor, parent }; }
  });
  vm.runInContext(source.slice(source.indexOf('function lockFloatButtonShape'), source.indexOf('async function getPricesWithAttempts')), context);

  context.createFloatButton();
  assert.equal(button.title, '', 'the button must not trigger a native tooltip');
  assert.equal(attributes['aria-label'], 'ARS / USD / EUR / JPY');
  listeners.mouseenter();
  assert.equal(opened.anchor, button);
  assert.equal(opened.parent, candidate);
});

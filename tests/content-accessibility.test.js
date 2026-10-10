const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const parser = require('../price-parser.js');

function element(tag, attributes = {}, children = []) {
  const node = {
    nodeType: 1, tagName: tag, attributes, childNodes: [], dataset: {}, style: {},
    getBoundingClientRect() { return { top: 0, right: 0 }; },
    getAttribute(name) { return this.attributes[name] ?? null; },
    matches(selector) {
      if (selector.includes('[role=')) return ['textbox', 'searchbox', 'combobox'].includes(this.attributes.role);
      return selector.split(',').includes(this.tagName);
    },
    closest() { return null; },
    classList: { contains() { return false; } },
    appendChild(child) { child.parentNode = child.parentElement = this; this.childNodes.push(child); return child; },
    insertBefore(child, next) {
      child.parentNode = child.parentElement = this;
      const index = this.childNodes.indexOf(next);
      this.childNodes.splice(index < 0 ? this.childNodes.length : index, 0, child);
    },
    get nextSibling() { const list = this.parentNode.childNodes; return list[list.indexOf(this) + 1] || null; },
    get isConnected() { return !!this.parentNode; }
  };
  children.forEach(child => node.appendChild(typeof child === 'string' ? { nodeType: 3, textContent: child } : child));
  return node;
}

function harness() {
  const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
  const context = vm.createContext({
    Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 }, document: { body: element('BODY') },
    SatoshilloParser: parser, pageLanguage: 'es',
    selectionIntersectsNode: () => false, isInsideSatoshillo: () => false,
    buildCandidateSpan: (raw, amount, currency) => {
      const node = element('SPAN'); node.dataset = { amount, currency }; return node;
    }
  });
  vm.runInContext(source.slice(source.indexOf('function isInEditableContext'), source.indexOf('const SATOSHILLO_SELECTOR')), context);
  return context;
}

test('numeric accessible labels are read once and annotated outside animated content', () => {
  const context = harness();
  const digits = [element('SPAN', {}, ['38.500']), ...'38.500'.split('').map(digit => element('SPAN', { 'aria-hidden': 'true' }, [digit]))];
  const counter = element('SPAN', { role: 'text', 'aria-label': '38.500' }, digits);
  const block = element('DIV', {}, [element('SPAN', {}, ['$']), counter, element('SPAN', {}, [' ARS'])]);
  assert.equal(context.flattenBlock(block).text, '$38.500 ARS');
  context.processBlock(block);
  assert.equal(counter.childNodes.length, digits.length);
  assert.equal(counter.nextSibling.dataset.amount, 38500);
  assert.equal(counter.nextSibling.dataset.currency, 'ARS');
});

test('accessible price updates reuse the annotation without altering the counter', () => {
  const context = harness();
  const counter = element('SPAN', { 'aria-label': '125,50' }, [element('SPAN', {}, ['animated'])]);
  const block = element('DIV', {}, [counter, element('SPAN', {}, [' EUR'])]);
  context.processBlock(block);
  const annotation = counter.nextSibling;
  assert.equal(annotation.dataset.amount, 125.5);
  counter.attributes['aria-label'] = '250,75';
  context.processBlock(block);
  assert.equal(counter.nextSibling, annotation);
  assert.equal(annotation.dataset.amount, 250.75);
  assert.equal(block.childNodes.length, 3);
  assert.equal(counter.childNodes[0].childNodes[0].textContent, 'animated');
});

test('changes to accessible labels schedule a price rescan', () => {
  const context = harness();
  const source = fs.readFileSync(require.resolve('../content.js'), 'utf8');
  let options;
  let callback;
  let scheduled = false;
  context.MutationObserver = class {
    constructor(handler) { callback = handler; }
    observe(node, config) { options = config; }
    disconnect() {}
  };
  context.detectPageLanguage = () => 'es';
  context.startPricePreload = () => {};
  vm.runInContext(source.slice(source.indexOf('const SATOSHILLO_SELECTOR'), source.indexOf('chrome.runtime.onMessage.addListener')), context);
  context.scanSubtree = () => {};
  context.scheduleScan = () => { scheduled = true; };
  context.startWatching();
  assert.equal(options.attributes, true);
  assert.ok(options.attributeFilter.includes('aria-label'));
  callback([{ type: 'attributes', attributeName: 'aria-label', target: element('SPAN', { 'aria-label': '100' }), addedNodes: [], removedNodes: [] }]);
  assert.equal(scheduled, true);
});

test('accessible numbers still require monetary evidence and exclude editable controls', () => {
  const context = harness();
  const count = element('SPAN', { 'aria-label': '123' }, [element('SPAN', {}, ['123'])]);
  const block = element('DIV', {}, [count]);
  context.processBlock(block);
  assert.equal(block.childNodes.length, 1);
  for (const role of ['textbox', 'searchbox', 'combobox']) {
    const control = element('SPAN', { role, 'aria-label': '123' }, ['private']);
    const form = element('DIV', {}, [control, element('SPAN', {}, [' EUR'])]);
    assert.equal(context.flattenBlock(form).text, ' EUR');
    context.processBlock(form);
    assert.equal(form.childNodes.length, 2);
    assert.equal(control.childNodes[0].textContent, 'private');
  }
});

test('external annotations align with the top of the accessible number rather than its baseline', () => {
  const context = harness();
  const build = context.buildCandidateSpan;
  context.buildCandidateSpan = (...args) => {
    const annotation = build(...args);
    annotation.getBoundingClientRect = () => ({ top: 145, right: 320 });
    return annotation;
  };
  const counter = element('SPAN', { 'aria-label': '38.500' }, ['38.500']);
  counter.getBoundingClientRect = () => ({ top: 100, right: 300 });
  const block = element('DIV', {}, [counter, element('SPAN', {}, [' ARS'])]);
  context.processBlock(block);
  assert.equal(counter.nextSibling.style.top, '-45px');
  assert.equal(counter.nextSibling.style.left, '-20px');
  counter.getBoundingClientRect = () => ({ top: 110, right: 310 });
  context.processBlock(block);
  assert.equal(counter.nextSibling.style.top, '-35px');
  assert.equal(counter.nextSibling.style.left, '-10px');
});

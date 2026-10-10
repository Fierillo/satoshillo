const satoshisPerBitcoin = 100000000;
const CURRENCIES = ['ARS', 'USD', 'EUR', 'JPY'];

let pageLanguage = 'en';

function formatThousands(value) {
  const parts = String(value).split('.');
  parts[0] = parts[0].replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  return parts.join('.');
}

function formatSatoshis(satoshis) {
  if (satoshis >= satoshisPerBitcoin) {
    const btc = satoshis / satoshisPerBitcoin;
    if (btc >= 100) return formatThousands(Math.round(btc)) + ' BTC';
    return formatThousands(btc.toFixed(2)) + ' BTC';
  }
  if (satoshis >= 1000000) return formatThousands((satoshis / 1000000).toFixed(1)) + 'M sats';
  if (satoshis >= 1000) return formatThousands((satoshis / 1000).toFixed(1)) + 'k sats';
  return formatThousands(satoshis) + ' sats';
}

function calculateSatoshis(fiatAmount, currency, bitcoinPrice) {
  const bitcoinValue = fiatAmount / bitcoinPrice;
  const satoshis = Math.round(bitcoinValue * satoshisPerBitcoin);
  return formatSatoshis(satoshis);
}

let cachedPrices = null;
let cachedAt = 0;
let cachedProvisional = false;
let preloadTimer = null;

function getPricesFromBackground() {
  if (cachedPrices && Date.now() - cachedAt < 60000) {
    return Promise.resolve({ prices: cachedPrices, provisional: cachedProvisional, at: cachedAt });
  }
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getPrices' }, response => {
      if (response && response.prices) {
        cachedPrices = response.prices;
        cachedAt = typeof response.at === 'number' ? response.at : 0;
        cachedProvisional = !!response.provisional;
      }
      resolve({
        prices: response && response.prices,
        provisional: !!(response && response.provisional),
        at: response && response.at
      });
    });
  });
}

function hasFreshPrices() {
  return !!cachedPrices && Date.now() - cachedAt < 60000;
}

function formatAge(ms) {
  const min = Math.floor(ms / 60000);
  if (min < 1) {
    const sec = Math.max(0, Math.floor(ms / 1000));
    return sec + 's';
  }
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60);
  const m = min % 60;
  return h + 'h' + (m ? ' ' + m + 'm' : '');
}

function selectionActive() {
  const sel = document.getSelection();
  return !!sel && !sel.isCollapsed && sel.toString().length > 0;
}

function selectionIntersectsNode(node) {
  if (!selectionActive()) return false;
  const sel = document.getSelection();
  const range = sel.rangeCount > 0 ? sel.getRangeAt(0) : null;
  if (!range) return false;
  try {
    return range.intersectsNode(node);
  } catch {
    return false;
  }
}

function startPricePreload() {
  if (preloadTimer) clearInterval(preloadTimer);
  getPricesFromBackground();
  preloadTimer = setInterval(() => getPricesFromBackground(), 60000);
}

function stopPricePreload() {
  if (preloadTimer) {
    clearInterval(preloadTimer);
    preloadTimer = null;
  }
}

function detectPageLanguage() {
  const documentLanguage = (document.documentElement.lang || '').toLowerCase();
  if (documentLanguage.startsWith('es')) return 'es';
  const pageText = document.body.innerText.toLowerCase();
  const spanishKeywords = ['pesos', 'argentinos', 'argentina', 'dólares', 'precio'];
  for (const keyword of spanishKeywords) {
    if (pageText.includes(keyword)) return 'es';
  }
  const browserLanguage = (navigator.language || '').toLowerCase();
  if (browserLanguage.startsWith('es')) return 'es';
  return 'en';
}

let activeAnchor = null;
let activeCandidate = null;
let closeTimer = null;

function cancelClose() {
  clearTimeout(closeTimer);
  closeTimer = null;
}

function scheduleClose() {
  cancelClose();
  closeTimer = setTimeout(closeActive, 180);
}

function removeExistingMenus() {
  document.querySelectorAll('.satoshillo-menu').forEach(menu => menu.remove());
}

function removeAllUi() {
  document.querySelectorAll('.satoshillo-candidate').forEach(el => {
    if (el.dataset.accessible === 'true') {
      el.remove();
      return;
    }
    const value = el.querySelector(':scope > .satoshillo-value');
    const firstChild = el.childNodes[0];
    if (value) {
      el.parentNode.replaceChild(document.createTextNode(value.textContent), el);
    } else if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
      el.parentNode.replaceChild(firstChild.cloneNode(true), el);
    } else {
      el.remove();
    }
  });
  document.querySelectorAll('.satoshillo-menu').forEach(menu => menu.remove());
  activeCandidate = null;
  activeAnchor = null;
}

function hideResult(candidate) {
  const result = candidate.querySelector('.satoshillo-result');
  if (result) result.remove();
  const button = candidate.querySelector('.satoshillo-float');
  if (button) button.style.display = '';
}

function closeActive() {
  cancelClose();
  removeExistingMenus();
  if (activeCandidate) {
    hideResult(activeCandidate);
    activeCandidate = null;
  }
  activeAnchor = null;
}

function buildCandidateSpan(raw, amount, currency) {
  const span = document.createElement('span');
  span.className = 'satoshillo-candidate';
  span.dataset.amount = amount;
  span.dataset.currency = currency;
  const value = document.createElement('span');
  value.className = 'satoshillo-value';
  value.textContent = raw;
  span.appendChild(value);
  span.appendChild(createFloatButton());
  span.addEventListener('mouseenter', cancelClose);
  span.addEventListener('mouseleave', scheduleClose);
  return span;
}

function createFloatButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'satoshillo-float';
  button.title = 'ARS / USD / EUR / JPY';
  button.addEventListener('mouseenter', () => {
    cancelClose();
    openCurrencyMenu(button, button.parentNode);
  });
  button.addEventListener('mouseleave', scheduleClose);
  return button;
}

async function getPricesWithAttempts() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const result = await getPricesFromBackground();
    if (result.prices && result.prices.ARS && result.prices.USD && result.prices.EUR && result.prices.JPY) return result;
    await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
  }
  return { prices: cachedPrices, provisional: cachedProvisional, at: cachedAt };
}

async function openCurrencyMenu(anchor, candidate) {
  if (activeAnchor === anchor) return;
  closeActive();
  activeAnchor = anchor;
  const menu = document.createElement('div');
  menu.className = 'satoshillo-menu';
  const rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  menu.addEventListener('mouseenter', cancelClose);
  menu.addEventListener('mouseleave', scheduleClose);
  document.body.appendChild(menu);

  const options = CURRENCIES.map(currency => {
    const option = document.createElement('button');
    option.type = 'button';
    option.addEventListener('click', e => {
      e.preventDefault();
      e.stopPropagation();
      cancelClose();
      selectCurrency(candidate, currency);
    });
    menu.appendChild(option);
    return { currency, option };
  });

  const render = (result, loading) => {
    const prices = result && result.prices;
    const provisional = result && result.provisional;
    const priceAt = result && result.at;
    options.forEach(({ currency, option }) => {
      const isSelected = currency === candidate.dataset.currency;
      option.className = 'satoshillo-option' + (isSelected ? ' satoshillo-selected' : '');
      const bitcoinPrice = prices && prices[currency];
      const priceLabel = loading ? '…'
        : bitcoinPrice ? ' ' + calculateSatoshis(parseFloat(candidate.dataset.amount), currency, bitcoinPrice)
        : ' —';
      option.textContent = currency + priceLabel;
      if (provisional) {
        option.title = priceAt
          ? 'TC provisorio (actualizado hace ' + formatAge(Date.now() - priceAt) + ')'
          : 'TC provisorio';
      } else {
        option.title = '';
      }
    });
  };

  render(null, true);
  if (hasFreshPrices()) {
    render({ prices: cachedPrices, provisional: cachedProvisional, at: cachedAt }, false);
  } else {
    getPricesWithAttempts().then(result => {
      render(result, false);
    });
  }
}

async function selectCurrency(candidate, currency) {
  cancelClose();
  const resultData = await getPricesWithAttempts();
  const prices = resultData.prices;
  const bitcoinPrice = prices && prices[currency];
  if (!bitcoinPrice) {
    showPriceUnavailable(candidate);
    return;
  }
  const satoshisDisplay = calculateSatoshis(parseFloat(candidate.dataset.amount), currency, bitcoinPrice);
  candidate.dataset.currency = currency;
  let result = candidate.querySelector('.satoshillo-result');
  if (!result) {
    result = document.createElement('span');
    result.className = 'satoshillo-result';
    candidate.appendChild(result);
  }
  const provisional = resultData.provisional;
  result.textContent = satoshisDisplay;
  if (provisional) {
    result.textContent = '🕒 ' + result.textContent;
    result.title = resultData.at
      ? 'TC provisorio (actualizado hace ' + formatAge(Date.now() - resultData.at) + ')'
      : 'TC provisorio';
  } else {
    result.title = '';
  }
  activeCandidate = candidate;
  cancelClose();
  const button = candidate.querySelector('.satoshillo-float');
  if (button) button.style.display = 'none';
  removeExistingMenus();
  activeAnchor = null;
}

function showPriceUnavailable(candidate) {
  let result = candidate.querySelector('.satoshillo-result');
  if (!result) {
    result = document.createElement('span');
    result.className = 'satoshillo-result satoshillo-error';
    candidate.appendChild(result);
  }
  result.textContent = 'sin precio';
  setTimeout(() => {
    const button = candidate.querySelector('.satoshillo-float');
    if (button) button.style.display = '';
  }, 2000);
  removeExistingMenus();
  activeAnchor = null;
}

function isInEditableContext(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (el && el !== document.body) {
    if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    if (el.matches && el.matches('[role="textbox"], [role="searchbox"], [role="combobox"]')) return true;
    if (el.tagName === 'A' || el.tagName === 'BUTTON') return true;
    el = el.parentElement;
  }
  return false;
}

const CONTEXT_BLOCKS = 'P,DIV,TD,TH,LI,BLOCKQUOTE,FIGCAPTION,H1,H2,H3,H4,H5,H6,DT,DD';

function contextBlock(node) {
  let element = node.nodeType === Node.TEXT_NODE ? node.parentElement : node;
  while (element && element !== document.body) {
    if (element.matches && element.matches(CONTEXT_BLOCKS)) return element;
    element = element.parentElement;
  }
  return document.body;
}

function processableTextNode(node) {
  if (!node.textContent || !node.textContent.trim()) return false;
  if (isInsideSatoshillo(node) || isInEditableContext(node)) return false;
  const tag = node.parentElement && node.parentElement.tagName;
  return tag !== 'SCRIPT' && tag !== 'STYLE' && tag !== 'TEXTAREA';
}

function replaceTextNode(node, matches) {
  if (!node.parentNode || selectionIntersectsNode(node)) return;
  const text = node.textContent;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = text.slice(match.index, match.index + match.length);
    if (match.amount > 0 && Number.isFinite(match.amount) && match.currency) {
      fragment.appendChild(buildCandidateSpan(raw, match.amount, match.currency));
    } else {
      fragment.appendChild(document.createTextNode(raw));
    }
    lastIndex = match.index + raw.length;
  });
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  if (node.parentNode) node.parentNode.replaceChild(fragment, node);
}

const accessibleCandidates = new WeakMap();

function flattenBlock(block) {
  const runs = [];
  let text = '';

  function append(node) {
    if (node.nodeType === Node.TEXT_NODE) {
      if (!processableTextNode(node) || contextBlock(node) !== block) return;
      const start = text.length;
      text += node.textContent;
      runs.push({ node, start, end: text.length, candidate: null });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    if (node.dataset.accessible === 'true') return;
    if (isInEditableContext(node)) return;
    const label = node.getAttribute('aria-label');
    if (label && /^\d+(?:[.,]\d+)*$/.test(label.trim())) {
      const start = text.length;
      text += label.trim();
      runs.push({ node, start, end: text.length, accessible: true });
      return;
    }
    if (node.classList.contains('satoshillo-candidate')) {
      const value = node.querySelector(':scope > .satoshillo-value');
      const valueNode = value && value.firstChild;
      if (valueNode && valueNode.nodeType === Node.TEXT_NODE) {
        const start = text.length;
        text += valueNode.textContent;
        runs.push({ node: valueNode, start, end: text.length, candidate: node });
      }
      return;
    }
    if (isInsideSatoshillo(node) || isInEditableContext(node)) return;
    if (node.tagName === 'BR' && contextBlock(node) === block) {
      text += '\n';
      return;
    }
    node.childNodes.forEach(append);
  }

  append(block);
  return { text, runs };
}

function processBlock(block) {
  if (!block || isInsideSatoshillo(block) || isInEditableContext(block) || selectionIntersectsNode(block)) return;
  const { text, runs } = flattenBlock(block);
  if (!text) return;

  const grouped = new Map();
  for (const candidate of SatoshilloParser.findPriceCandidates(text, { locale: pageLanguage })) {
    const run = runs.find(item => candidate.numberStart >= item.start && candidate.numberEnd <= item.end);
    if (!run) continue;
    if (run.accessible) {
      let annotation = accessibleCandidates.get(run.node);
      if (!annotation || !annotation.isConnected) {
        annotation = buildCandidateSpan('', candidate.amount, candidate.currency);
        annotation.dataset.accessible = 'true';
        run.node.parentNode.insertBefore(annotation, run.node.nextSibling);
        accessibleCandidates.set(run.node, annotation);
      }
      annotation.dataset.amount = candidate.amount;
      annotation.dataset.currency = candidate.currency;
      annotation.style.top = '0px';
      annotation.style.left = '0px';
      const numberRect = run.node.getBoundingClientRect();
      const annotationRect = annotation.getBoundingClientRect();
      annotation.style.top = (numberRect.top - annotationRect.top) + 'px';
      annotation.style.left = (numberRect.right - annotationRect.right) + 'px';
      continue;
    }
    if (run.candidate) {
      run.candidate.dataset.amount = candidate.amount;
      run.candidate.dataset.currency = candidate.currency;
      continue;
    }
    const matches = grouped.get(run.node) || [];
    matches.push({
      ...candidate,
      index: candidate.numberStart - run.start,
      length: candidate.numberEnd - candidate.numberStart
    });
    grouped.set(run.node, matches);
  }
  grouped.forEach((matches, textNode) => replaceTextNode(textNode, matches.sort((a, b) => a.index - b.index)));
}

const SATOSHILLO_SELECTOR = '.satoshillo-candidate, .satoshillo-result, .satoshillo-float, .satoshillo-menu, .satoshillo-option';

function isInsideSatoshillo(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.parentNode ? node.parentNode.closest(SATOSHILLO_SELECTOR) : false;
  }
  return node.closest ? node.closest(SATOSHILLO_SELECTOR) : false;
}

let scanTimer = null;

function observeDom() {
  if (activeObserver) {
    activeObserver.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ['aria-label'] });
  }
}

function scheduleScan() {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => {
    if (activeObserver) activeObserver.disconnect();
    scanSubtree(document.body);
    observeDom();
  }, 200);
}

function scanSubtree(root) {
  const blocks = new Set();
  if (root.nodeType === Node.TEXT_NODE && processableTextNode(root)) blocks.add(contextBlock(root));
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  let node;
  while ((node = walker.nextNode())) {
    if (processableTextNode(node)) blocks.add(contextBlock(node));
  }
  blocks.forEach(processBlock);
}

let activeObserver = null;

function scanAndConvertPrices() {
  chrome.runtime.sendMessage({ action: 'getDisabled' }, response => {
    const disabled = response && response.disabled ? response.disabled : [];
    const origin = window.location.origin;
    if (disabled.includes(origin)) return;
    startWatching();
  });
}

function startWatching() {
  if (activeObserver) activeObserver.disconnect();

  pageLanguage = detectPageLanguage();
  startPricePreload();
  scanSubtree(document.body);

  activeObserver = new MutationObserver(mutations => {
    for (const mutation of mutations) {
      if (isInsideSatoshillo(mutation.target)) continue;
      if (mutation.type === 'attributes' && !isInEditableContext(mutation.target)) return scheduleScan();
      const changedNodes = [...mutation.addedNodes, ...mutation.removedNodes];
      if (changedNodes.some(node => !isInsideSatoshillo(node))) return scheduleScan();
      if (mutation.type === 'characterData' && !isInsideSatoshillo(mutation.target) && !isInEditableContext(mutation.target)) {
        return scheduleScan();
      }
    }
  });
  observeDom();
}

function stopWatching() {
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
  clearTimeout(scanTimer);
  stopPricePreload();
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'toggleDisabled') {
    if (request.disabled) {
      stopWatching();
      removeAllUi();
    } else {
      startWatching();
    }
  }
});

const style = document.createElement('style');
style.textContent = `
  .satoshillo-candidate { position: relative; display: inline; white-space: normal; }
  .satoshillo-value { white-space: nowrap; }
  .satoshillo-float { position: absolute; top: -10px; right: -14px; padding: 0 3px; border: 1px solid #f7931a; border-radius: 3px; background: #fff; color: #f7931a; font-size: 12px; cursor: pointer; font-family: inherit; line-height: 14px; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,.25); opacity: 0.4; transition: opacity 0.15s; user-select: none; }
  .satoshillo-float::after { content: '₿'; }
  .satoshillo-float:hover { border-color: #b86a0e; background: #fff7ed; opacity: 1; }
  .satoshillo-menu { position: fixed; z-index: 2147483647; background: #fff !important; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 2px; color: #000 !important; font-family: Arial, Helvetica, sans-serif !important; }
  .satoshillo-option { display: block; width: 100%; padding: 4px 10px; font-size: 12px; border: none; background: #fff !important; color: #000 !important; cursor: pointer; text-align: left; font-family: inherit; }
  .satoshillo-option:disabled { color: #999 !important; cursor: default; }
  .satoshillo-option.satoshillo-selected { font-weight: 700; }
  .satoshillo-option:hover { background: #f0f0f0 !important; }
  .satoshillo-result.satoshillo-error { color: #999 !important; border-color: #ccc !important; background: #fafafa !important; }
  .satoshillo-selected { font-weight: 700; }
  .satoshillo-result { position: static; display: inline-block; margin-left: 3px; white-space: nowrap; vertical-align: middle; font-size: 10px; font-weight: 600; line-height: 1; color: #f7931a; background: #fff; border: 1px solid #f7931a; border-radius: 3px; padding: 1px 3px; pointer-events: none; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
`;
document.head.appendChild(style);

window.addEventListener('scroll', () => {
  closeActive();
}, { capture: true, passive: true });

scanAndConvertPrices();

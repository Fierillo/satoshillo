const satoshisPerBitcoin = 100000000;
const PRELOAD_FACTOR = 1.5;
const CURRENCIES = ['ARS', 'USD', 'EUR'];
const MAGNITUDES = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const CURRENCY_WORDS = 'ars|usd|eur|euros|pesos|dolares|dollars';
const NUMBER_TOKEN = '\\d[\\d,]*\\.?\\d*';
const MAGNITUDE_TOKEN = '(?:mil\\s?millones|billones|billón|trillones|trillón|millones|millón|million|millions|mill\\b|billion|billions|bill\\b|trillion|trillions|trill\\b|[kmbt]\\b)';
const CANDIDATE_PATTERN = new RegExp(
  '[$€]\\s?' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')?|' +
  '\\b(?:' + CURRENCY_WORDS + ')\\s*' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')?|' +
  '\\b' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')(?:\\s*(?:' + CURRENCY_WORDS + '))?|' +
  '\\b' + NUMBER_TOKEN + '\\s*(?:' + CURRENCY_WORDS + ')', 'gi');

let pageLanguage = 'en';

function formatSatoshis(satoshis) {
  if (satoshis >= satoshisPerBitcoin) {
    const btc = satoshis / satoshisPerBitcoin;
    if (btc >= 100) return Math.round(btc) + ' BTC';
    return btc.toFixed(2) + ' BTC';
  }
  if (satoshis >= 1000000) return (satoshis / 1000000).toFixed(1) + 'M sats';
  if (satoshis >= 1000) return (satoshis / 1000).toFixed(1) + 'k sats';
  return satoshis + ' sats';
}

function calculateSatoshis(fiatAmount, currency, bitcoinPrice) {
  const bitcoinValue = fiatAmount / bitcoinPrice;
  const satoshis = Math.round(bitcoinValue * satoshisPerBitcoin);
  return formatSatoshis(satoshis);
}

let cachedPrices = null;
let cachedAt = 0;

function getPricesFromBackground() {
  if (cachedPrices && Date.now() - cachedAt < 60000) {
    return Promise.resolve(cachedPrices);
  }
  return new Promise(resolve => {
    chrome.runtime.sendMessage({ action: 'getPrices' }, response => {
      if (response && response.prices) {
        cachedPrices = response.prices;
        cachedAt = Date.now();
      }
      resolve(response.prices);
    });
  });
}

function getScanBounds() {
  const preloadRange = window.innerHeight * PRELOAD_FACTOR;
  return {
    top: -preloadRange,
    bottom: window.innerHeight + preloadRange,
    left: -preloadRange,
    right: window.innerWidth + preloadRange
  };
}

function isElementInBounds(element, bounds) {
  const rect = element.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return false;
  return rect.bottom >= bounds.top &&
    rect.top <= bounds.bottom &&
    rect.right >= bounds.left &&
    rect.left <= bounds.right;
}

const ES_MARKERS = ['precio', 'pago', 'pagas', 'cuota', 'envío', 'envio', 'comprar', 'importe', 'argentin'];
const EN_MARKERS = ['price', 'payment', 'shipping', 'cost', 'buy', 'amount', 'total'];

function extractNumberToken(raw) {
  const match = raw.match(/[\d]+(?:[\s.,]\d+)*/);
  return match ? match[0] : '';
}

function parseNumber(token, isSpanish) {
  const cleaned = token.replace(/[\s\u00A0]+/g, '');
  const dot = cleaned.lastIndexOf('.');
  const comma = cleaned.lastIndexOf(',');
  const hasDot = dot > -1;
  const hasComma = comma > -1;

  let integerPart = '';
  let decimalPart = '';

  if (hasDot && hasComma) {
    const lastSep = Math.max(dot, comma);
    integerPart = cleaned.slice(0, lastSep).replace(/[.,]/g, '');
    decimalPart = cleaned.slice(lastSep + 1);
  } else if (hasDot || hasComma) {
    const sep = hasDot ? dot : comma;
    const char = cleaned[sep];
    const integerRaw = cleaned.slice(0, sep);
    const trailing = cleaned.slice(sep + 1);
    const isThousands = trailing.length === 3;
    if (isThousands) {
      integerPart = integerRaw.replace(/[.,]/g, '') + trailing;
    } else {
      integerPart = integerRaw.replace(/[.,]/g, '');
      decimalPart = trailing;
    }
  } else {
    integerPart = cleaned.replace(/[.,]/g, '');
  }

  const value = parseFloat((integerPart || '0') + '.' + decimalPart);
  return isNaN(value) ? NaN : value;
}

function detectMagnitude(text) {
  const wordMagnitudes = [
    [/mil\s?millones/, 1e9],
    [/billones/, 1e12],
    [/billón/, 1e12],
    [/trillones/, 1e18],
    [/trillón/, 1e18],
    [/millones/, 1e6],
    [/millón/, 1e6],
    [/millon\b/, 1e6],
    [/millions?/, 1e6],
    [/mill\b/, 1e6],
    [/billions?/, 1e9],
    [/bill\b/, 1e9],
    [/trillions?/, 1e12],
    [/trill\b/, 1e12]
  ];
  for (const [regex, multiplier] of wordMagnitudes) {
    if (regex.test(text)) return multiplier;
  }
  const letter = text.match(/\d[kmbt]\b/);
  if (letter && MAGNITUDES[letter[0][1]] !== undefined) return MAGNITUDES[letter[0][1]];
  return 1;
}

function parseCandidate(raw) {
  const normalized = raw.toLowerCase();
  const token = extractNumberToken(normalized);
  let amount = token ? parseNumber(token, pageLanguage === 'es') : NaN;
  const magnitude = detectMagnitude(normalized);
  const hasMagnitude = magnitude > 1;
  amount *= magnitude;
  const wordMatch = normalized.match(/\b(ars|usd|eur|euros|pesos|dolares|dollars)\b/);
  let currencyHint = null;
  if (wordMatch) {
    const word = wordMatch[1];
    if (word === 'ars' || word === 'pesos') currencyHint = 'ARS';
    else if (word === 'eur' || word === 'euros') currencyHint = 'EUR';
    else currencyHint = 'USD';
  } else if (normalized.startsWith('€')) {
    currencyHint = 'EUR';
  }
  const hasCurrencyWord = currencyHint !== null;
  const hasSymbol = /[$€]/.test(normalized);
  const valid = hasCurrencyWord || hasSymbol || hasMagnitude;
  return { amount, currencyHint, valid };
}

function detectPageLanguage() {
  const pageText = document.body.innerText.toLowerCase();
  const spanishKeywords = ['pesos', 'argentinos', 'argentina', 'dólares', 'precio'];
  for (const keyword of spanishKeywords) {
    if (pageText.includes(keyword)) return 'es';
  }
  return 'en';
}

function inferCurrency(contextText, pageLanguage) {
  const context = contextText.toLowerCase();
  if (/\b(ars|pesos|peso)\b/.test(context)) return 'ARS';
  if (/\b(usd|dolares|dólares|dollars|dollar|dolar)\b/.test(context)) return 'USD';
  if (context.includes('€') || /\b(eur|euros|euro)\b/.test(context)) return 'EUR';
  let spanishHits = 0;
  let englishHits = 0;
  for (const word of ES_MARKERS) if (context.includes(word)) spanishHits++;
  for (const word of EN_MARKERS) if (context.includes(word)) englishHits++;
  if (spanishHits > englishHits) return 'ARS';
  if (englishHits > spanishHits) return 'USD';
  return pageLanguage === 'es' ? 'ARS' : 'USD';
}

const HIDE_DISTANCE = 120;

let activeAnchor = null;
let activeCandidate = null;

function removeExistingMenus() {
  document.querySelectorAll('.satoshillo-menu').forEach(menu => menu.remove());
}

function hideResult(candidate) {
  const result = candidate.querySelector('.satoshillo-result');
  if (result) result.remove();
  const button = candidate.querySelector('.satoshillo-float');
  if (button) button.style.display = '';
}

function closeActive() {
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
  span.appendChild(document.createTextNode(raw));
  span.appendChild(createFloatButton(span));
  return span;
}

function createFloatButton(candidate) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'satoshillo-float';
  button.title = 'ARS / USD / EUR';
  button.textContent = '₿';
  button.addEventListener('mouseenter', () => {
    openCurrencyMenu(button, candidate);
  });
  return button;
}

async function getPricesWithAttempts() {
  for (let attempt = 0; attempt < 3; attempt++) {
    const prices = await getPricesFromBackground();
    if (prices && prices.ARS && prices.USD && prices.EUR) return prices;
    await new Promise(r => setTimeout(r, 250 * (attempt + 1)));
  }
  return cachedPrices;
}

async function openCurrencyMenu(anchor, candidate) {
  if (activeAnchor === anchor) return;
  removeExistingMenus();
  activeAnchor = anchor;
  const menu = document.createElement('div');
  menu.className = 'satoshillo-menu';
  const rect = anchor.getBoundingClientRect();
  menu.style.top = (rect.bottom + 4) + 'px';
  menu.style.left = rect.left + 'px';
  document.body.appendChild(menu);

  const render = (prices, loading) => {
    menu.textContent = '';
    CURRENCIES.forEach(currency => {
      const option = document.createElement('button');
      const isSelected = currency === candidate.dataset.currency;
      option.className = 'satoshillo-option' + (isSelected ? ' satoshillo-selected' : '');
      option.type = 'button';
      const bitcoinPrice = prices && prices[currency];
      const priceLabel = loading ? '…'
        : bitcoinPrice ? ' ' + calculateSatoshis(parseFloat(candidate.dataset.amount), currency, bitcoinPrice)
        : ' —';
      option.textContent = currency + priceLabel;
      option.addEventListener('click', e => {
        e.preventDefault();
        e.stopPropagation();
        selectCurrency(candidate, currency);
      });
      menu.appendChild(option);
    });
  };

  render(null, true);
  getPricesWithAttempts().then(prices => {
    render(prices, false);
  });
}

async function selectCurrency(candidate, currency) {
  const prices = await getPricesWithAttempts();
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
  result.textContent = satoshisDisplay;
  activeCandidate = candidate;
  const button = candidate.querySelector('.satoshillo-float');
  if (button) button.style.display = 'none';
  removeExistingMenus();
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
}

function processTextNode(node) {
  const parentTag = node.parentNode && node.parentNode.tagName;
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'TEXTAREA') return;
  const text = node.textContent;
  if (!text) return;
  const matches = [...text.matchAll(CANDIDATE_PATTERN)];
  if (matches.length === 0) return;

  const context = node.parentNode ? node.parentNode.textContent : '';
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    const parsed = parseCandidate(raw);
    if (parsed.amount && !isNaN(parsed.amount) && parsed.valid) {
      const currency = parsed.currencyHint || inferCurrency(context, pageLanguage);
      fragment.appendChild(buildCandidateSpan(raw, parsed.amount, currency));
    } else {
      fragment.appendChild(document.createTextNode(raw));
    }
    lastIndex = match.index + raw.length;
  });
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  node.parentNode.replaceChild(fragment, node);
}

function processContainer(element) {
  const text = element.textContent;
  if (!text) return;
  const matches = [...text.matchAll(CANDIDATE_PATTERN)];
  if (matches.length === 0) return;

  const context = element.parentNode ? element.parentNode.textContent : text;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    const parsed = parseCandidate(raw);
    if (parsed.amount && !isNaN(parsed.amount) && parsed.valid) {
      const currency = parsed.currencyHint || inferCurrency(context, pageLanguage);
      fragment.appendChild(buildCandidateSpan(raw, parsed.amount, currency));
    } else {
      fragment.appendChild(document.createTextNode(raw));
    }
    lastIndex = match.index + raw.length;
  });
  if (lastIndex < text.length) {
    fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
  }
  element.replaceChildren(fragment);
}

function isInsideSatoshillo(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.parentNode ? node.parentNode.closest('.satoshillo-candidate, .satoshillo-result, .satoshillo-menu, .satoshillo-option') : false;
  }
  return node.closest ? node.closest('.satoshillo-candidate, .satoshillo-result, .satoshillo-menu, .satoshillo-option') : false;
}

function isLeafTextContainer(element) {
  return element.childElementCount === 0 && element.childNodes.length > 0;
}

function walkDomTree(node, bounds) {
  if (node.nodeType === Node.TEXT_NODE) {
    processTextNode(node);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE) return;
  if (node.classList && node.classList.contains('satoshillo-candidate')) return;
  if (node.classList && (node.classList.contains('satoshillo-menu') || node.classList.contains('satoshillo-option'))) return;
  if (!isElementInBounds(node, bounds)) return;
  if (isLeafTextContainer(node)) {
    processContainer(node);
    return;
  }
  node.childNodes.forEach(child => {
    walkDomTree(child, bounds);
  });
}

let scanTimer = null;

function scheduleScan(root) {
  clearTimeout(scanTimer);
  scanTimer = setTimeout(() => scanSubtree(root), 200);
}

function scanSubtree(root) {
  if (root.nodeType === Node.TEXT_NODE) {
    processTextNode(root);
    return;
  }
  if (root.nodeType === Node.ELEMENT_NODE) {
    walkDomTree(root, getScanBounds());
    return;
  }
  if (root.nodeType === Node.DOCUMENT_FRAGMENT_NODE && root.childNodes) {
    root.childNodes.forEach(child => scanSubtree(child));
  }
}

let activeObserver = null;
let activeInterval = null;

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
  if (activeInterval) clearInterval(activeInterval);

  pageLanguage = detectPageLanguage();
  scanSubtree(document.body);

  activeObserver = new MutationObserver(mutations => {
    let pending = null;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!isInsideSatoshillo(node)) pending = pending || node;
      }
      if (mutation.type === 'characterData' && !isInsideSatoshillo(mutation.target)) {
        pending = pending || mutation.target;
      }
    }
    if (pending) scheduleScan(pending);
  });
  activeObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  activeInterval = setInterval(() => scanSubtree(document.body), 2000);
}

function stopWatching() {
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
  if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
}

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === 'toggleDisabled') {
    if (request.disabled) {
      stopWatching();
      document.querySelectorAll('.satoshillo-candidate').forEach(el => {
        const firstChild = el.childNodes[0];
        if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
          el.parentNode.replaceChild(firstChild.cloneNode(true), el);
        }
      });
      document.querySelectorAll('.satoshillo-menu').forEach(el => el.remove());
    } else {
      startWatching();
    }
  }
});

const style = document.createElement('style');
style.textContent = `
  .satoshillo-candidate { position: relative; display: inline; white-space: nowrap; }
  .satoshillo-float { position: absolute; top: -10px; right: -14px; padding: 0 3px; border: 1px solid #f7931a; border-radius: 3px; background: #fff; color: #f7931a; font-size: 12px; cursor: pointer; font-family: inherit; line-height: 14px; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
  .satoshillo-float:hover { border-color: #b86a0e; background: #fff7ed; }
  .satoshillo-menu { position: fixed; z-index: 2147483647; background: #fff !important; border: 1px solid #ddd; border-radius: 4px; box-shadow: 0 2px 8px rgba(0,0,0,.15); padding: 2px; color: #000 !important; font-family: Arial, Helvetica, sans-serif !important; }
  .satoshillo-option { display: block; width: 100%; padding: 4px 10px; font-size: 12px; border: none; background: #fff !important; color: #000 !important; cursor: pointer; text-align: left; font-family: inherit; }
  .satoshillo-option:disabled { color: #999 !important; cursor: default; }
  .satoshillo-option.satoshillo-selected { font-weight: 700; }
  .satoshillo-option:hover { background: #f0f0f0 !important; }
  .satoshillo-result.satoshillo-error { color: #999 !important; border-color: #ccc !important; background: #fafafa !important; }
  .satoshillo-selected { font-weight: 700; }
  .satoshillo-result { position: absolute; left: 0; top: -1.2em; white-space: nowrap; font-size: 10px; font-weight: 600; line-height: 1; color: #f7931a; background: #fff; border: 1px solid #f7931a; border-radius: 3px; padding: 1px 3px; pointer-events: none; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
`;
document.head.appendChild(style);

document.addEventListener('mousemove', e => {
  if (e.target.closest('.satoshillo-menu')) return;
  const ref = activeCandidate || activeAnchor;
  if (!ref) return;
  const rect = ref.getBoundingClientRect();
  if (rect.width === 0 && rect.height === 0) return;
  const cx = rect.left + rect.width / 2;
  const cy = rect.top + rect.height / 2;
  if (Math.hypot(e.clientX - cx, e.clientY - cy) > HIDE_DISTANCE) {
    closeActive();
  }
});

window.addEventListener('scroll', () => {
  removeExistingMenus();
}, { capture: true, passive: true });

scanAndConvertPrices();

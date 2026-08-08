const satoshisPerBitcoin = 100000000;
const PRELOAD_FACTOR = 1.5;
const CURRENCIES = ['ARS', 'USD', 'EUR', 'JPY'];
const MAGNITUDES = { k: 1e3, m: 1e6, b: 1e9, t: 1e12 };
const CURRENCY_WORDS = 'ars|usd|eur|euros|pesos|dolares|dollars';
const FOREX_PAIRS = 'usd|eur|gbp|jpy|chf|aud|nzd|cad';
const NUMBER_TOKEN = '\\d[\\d,]*\\.?\\d*';
const MAGNITUDE_TOKEN = '(?:mil\\s?millones|billones|billón|trillones|trillón|millones|millón|million|millions|mill\\b|billion|billions|bill\\b|trillion|trillions|trill\\b|[kmbt]\\b)';
const CURRENCY_PAIR_PATTERN = '(?:' + FOREX_PAIRS + ')\\/(?:' + FOREX_PAIRS + ')';
const FOREX_PAIR_REGEX = new RegExp('\\b' + CURRENCY_PAIR_PATTERN + '\\b', 'i');
const BARE_NUMBER_PATTERN = new RegExp('\\b' + NUMBER_TOKEN + '\\b', 'g');
const CANDIDATE_PATTERN = new RegExp(
  '[$€]\\s?' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')?|' +
  '\\b(?:' + CURRENCY_WORDS + ')\\s*' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')?|' +
  '\\b' + NUMBER_TOKEN + '\\s?(?:' + MAGNITUDE_TOKEN + ')(?:\\s*(?:' + CURRENCY_WORDS + '))?|' +
  '\\b' + NUMBER_TOKEN + '\\s*(?:' + CURRENCY_WORDS + ')|' +
  CURRENCY_PAIR_PATTERN + '\\b[^\\d]{0,30}\\b(' + NUMBER_TOKEN + ')', 'gi');

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
let preloadTimer = null;

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

function hasFreshPrices() {
  return !!cachedPrices && Date.now() - cachedAt < 60000;
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

const NEGATIVE_INDICATORS = [
  // Index / chart terms
  /\b(?:dxy|s&p|nasdaq|dow|index|candle|support|resistance|breakout|trend|fibonacci|rally|plunge|surge)\b/i,
  // Pip / points
  /\b(?:pips?|points?|ticks?)\b/i,
  // Economic / jobs
  /\b(?:jobs?|unemploy|payroll|gdp|inflation|deflation|recession|economy|economic|report|data)\b/i,
  // Movement verbs
  /\b(?:dropped|fell|rose|gained|increased|decreased|climbed|slid|tumbled|soared|crashed|rallied|plunged|surged|dipped|rebounded|slumped)\b/i,
  // Forex / trading
  /\b(?:forex|fx|pair|trade|trading|position|margin|leverage|spread)\b/i,
  // Rate / yield
  /\b(?:rate|yield|basis\s*points?|bps)\b/i,
  // Audience / metric counts
  /\b(?:impresiones|impressions|vistas|views|visualizaciones|usuarios|users|seguidores|followers|suscriptores|subscribers|lectores|readers|miembros|members|audiencia|audience|reproducciones|plays|descargas|downloads|participantes|attendees|registros|signups|menciones|mentions|hits|clicks|clics)\b/i,
  // Spanish equivalents
  /\b(?:par|índice|vela|soporte|resistencia|ruptura|tendencia|pip|punto|dato|informe|economía|económico|desempleo|empleo|subió|bajó|cayó|suba|baja)\b/i
];

const POSITIVE_INDICATORS = [
  // Price / shopping
  /\b(?:price|cost|buy|pay|total|amount|sale|deal|purchase|order|cart|checkout|item|product|service|subscribe|membership|fee|charge|bill|invoice)\b/i,
  // Spanish equivalents
  /\b(?:precio|costo|comprar|pagar|total|importe|oferta|producto|servicio|suscripción|cargo|factura)\b/i,
  // Currency symbols or words explicitly
  /[$€]/,
  /\b(?:ars|usd|eur|euros|pesos|dolares|dollars)\b/i
];

function isLikelyPrice(context, candidateText) {
  const text = context.toLowerCase();
  const candidate = candidateText.toLowerCase();

  // If candidate has a currency symbol, almost certainly a price
  if (/[$€]/.test(candidate)) return true;

  // If candidate has a currency word, likely a price
  if (/\b(?:ars|usd|eur|euros|pesos|dolares|dollars)\b/i.test(candidate)) return true;

  // If forex pair is in the same sentence, it's a price (bypass negatives)
  const candidateRegex = new RegExp('\\b' + candidate.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\b');
  const candidateMatch = text.match(candidateRegex);
  const candidateIndex = candidateMatch ? candidateMatch.index : -1;
  if (candidateIndex !== -1 && hasForexPairInSentence(text, candidateIndex)) return true;

  // Check for negative indicators in context (exclude the candidate itself)
  const contextWithoutCandidate = text.replace(candidate, '');
  for (const regex of NEGATIVE_INDICATORS) {
    if (regex.test(contextWithoutCandidate)) return false;
  }

  // If context has a forex pair near the candidate, it's a price
  if (candidateIndex !== -1 && hasForexPairNear(text, candidateIndex, 80)) return true;

  // Check for positive indicators
  for (const regex of POSITIVE_INDICATORS) {
    if (regex.test(text)) return true;
  }

  // Default: uncertain
  return null;
}

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

function parseCandidate(raw, context) {
  const normalized = raw.toLowerCase();
  const token = extractNumberToken(normalized);
  let amount = token ? parseNumber(token, pageLanguage === 'es') : NaN;
  const magnitude = detectMagnitude(normalized);
  const hasMagnitude = magnitude > 1;
  amount *= magnitude;
  const wordMatch = normalized.match(/\b(ars|usd|eur|euros|pesos|dolares|dollars)\b/);
  let currencyHint = null;

  // Forex pair: use quote currency (USD/JPY → JPY)
  const pairInRaw = normalized.match(new RegExp('\\b(' + FOREX_PAIRS + ')\\/(' + FOREX_PAIRS + ')\\b'));
  if (pairInRaw) {
    const quote = pairInRaw[2];
    if (CURRENCY_CODE_MAP[quote]) currencyHint = CURRENCY_CODE_MAP[quote];
  } else if (wordMatch) {
    const word = wordMatch[1];
    if (word === 'ars' || word === 'pesos') currencyHint = 'ARS';
    else if (word === 'eur' || word === 'euros') currencyHint = 'EUR';
    else currencyHint = 'USD';
  } else if (/€/.test(normalized)) {
    currencyHint = 'EUR';
  } else if (/\$/.test(normalized)) {
    currencyHint = 'USD';
  }
  const hasCurrencyWord = currencyHint !== null;
  const hasSymbol = /[$€]/.test(normalized);
  const hasForexContext = context && FOREX_PAIR_REGEX.test(context);
  const hasValidSignal = hasCurrencyWord || hasSymbol || hasMagnitude || hasForexContext;

  // Semantic check: is this likely a price?
  const semanticResult = context ? isLikelyPrice(context, raw) : null;
  if (semanticResult === false) return { amount, currencyHint, valid: false };

  const valid = hasValidSignal && semanticResult !== false;
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

const CURRENCY_CODE_MAP = { usd: 'USD', eur: 'EUR', gbp: 'GBP', jpy: 'JPY', chf: 'CHF', aud: 'AUD', nzd: 'NZD', cad: 'CAD', ars: 'ARS' };

function inferCurrency(contextText, pageLanguage) {
  const context = contextText.toLowerCase();

  // Forex pair: number is in the second currency
  const pairMatch = context.match(new RegExp('\\b(' + FOREX_PAIRS + ')\\/(' + FOREX_PAIRS + ')\\b'));
  if (pairMatch) {
    const quote = pairMatch[2];
    if (CURRENCY_CODE_MAP[quote]) return CURRENCY_CODE_MAP[quote];
  }

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

function removeAllUi() {
  document.querySelectorAll('.satoshillo-candidate').forEach(el => {
    const firstChild = el.childNodes[0];
    if (firstChild && firstChild.nodeType === Node.TEXT_NODE) {
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
  span.appendChild(createFloatButton());
  return span;
}

function createFloatButton() {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'satoshillo-float';
  button.title = 'ARS / USD / EUR';
  button.addEventListener('mouseenter', () => {
    openCurrencyMenu(button, button.parentNode);
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
  if (hasFreshPrices()) {
    render(cachedPrices, false);
  } else {
    getPricesWithAttempts().then(prices => {
      render(prices, false);
    });
  }
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

function getAncestorContext(node) {
  let el = node.parentNode;
  let best = el ? el.textContent : '';
  let depth = 0;
  while (el && depth < 5) {
    const t = el.textContent;
    if (t && t.length > best.length) best = t;
    if (t && t.length > 200) break;
    el = el.parentElement;
    depth++;
  }
  return best || '';
}

function hasForexPairNear(text, index, range) {
  const start = Math.max(0, index - range);
  const end = Math.min(text.length, index + range);
  return FOREX_PAIR_REGEX.test(text.slice(start, end));
}

function hasForexPairInSentence(text, index) {
  const beforeMatches = [...text.slice(0, index).matchAll(/[.!?]\s/g)];
  const before = beforeMatches.length > 0 ? beforeMatches[beforeMatches.length - 1].index + 1 : 0;
  const afterIndex = text.slice(index).search(/[.!?](?:\s|$)/);
  const end = afterIndex === -1 ? text.length : index + afterIndex;
  const sentence = text.slice(before, end);
  const pairMatch = sentence.match(FOREX_PAIR_REGEX);
  if (!pairMatch) return false;
  const pairIndex = sentence.indexOf(pairMatch[0]);
  const pairEnd = pairIndex + pairMatch[0].length;
  const relIndex = index - before;
  if (pairEnd > relIndex) return false;
  const between = sentence.slice(pairEnd, relIndex);
  const wordDist = between.split(/\s+/).filter(Boolean).length;
  return wordDist <= 6;
}

function isInEditableContext(node) {
  let el = node.nodeType === Node.TEXT_NODE ? node.parentNode : node;
  while (el && el !== document.body) {
    if (el.isContentEditable || el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT') return true;
    el = el.parentElement;
  }
  return false;
}

function getMergedMatches(text, context) {
  const candidateMatches = [...text.matchAll(CANDIDATE_PATTERN)];
  const ctxLower = context.toLowerCase();
  const ctxIndex = ctxLower.indexOf(text.toLowerCase());
  if (ctxIndex === -1 || !hasForexPairNear(ctxLower, ctxIndex, 80)) return candidateMatches;
  const ranges = candidateMatches.map(m => [m.index, m.index + m[0].length]);
  const extra = [...text.matchAll(BARE_NUMBER_PATTERN)].filter(b => {
    return !ranges.some(([s, e]) => b.index < e && b.index + b[0].length > s);
  });
  return candidateMatches.concat(extra).sort((a, b) => a.index - b.index);
}

function processTextNode(node) {
  if (isInEditableContext(node)) return;
  if (selectionIntersectsNode(node)) return;
  const parentTag = node.parentNode && node.parentNode.tagName;
  if (parentTag === 'SCRIPT' || parentTag === 'STYLE' || parentTag === 'TEXTAREA') return;
  const text = node.textContent;
  if (!text) return;
  const context = getAncestorContext(node);
  const matches = getMergedMatches(text, context);

  if (matches.length === 0) return;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    const parsed = parseCandidate(raw, context);
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
  if (isInEditableContext(element)) return;
  if (selectionIntersectsNode(element)) return;
  const text = element.textContent;
  if (!text) return;
  const context = element.parentNode ? element.parentNode.textContent : text;
  const matches = getMergedMatches(text, context);

  if (matches.length === 0) return;
  const fragment = document.createDocumentFragment();
  let lastIndex = 0;
  matches.forEach(match => {
    if (match.index > lastIndex) {
      fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
    }
    const raw = match[0];
    const parsed = parseCandidate(raw, context);
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

const SATOSHILLO_SELECTOR = '.satoshillo-candidate, .satoshillo-result, .satoshillo-float, .satoshillo-menu, .satoshillo-option';

function isInsideSatoshillo(node) {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.parentNode ? node.parentNode.closest(SATOSHILLO_SELECTOR) : false;
  }
  return node.closest ? node.closest(SATOSHILLO_SELECTOR) : false;
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
  if (node.tagName === 'INPUT' || node.tagName === 'TEXTAREA' || node.tagName === 'SELECT') return;
  if (node.isContentEditable) return;
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
  startPricePreload();
  scanSubtree(document.body);

  activeObserver = new MutationObserver(mutations => {
    let pending = null;
    for (const mutation of mutations) {
      for (const node of mutation.addedNodes) {
        if (!isInsideSatoshillo(node) && !isInEditableContext(node)) pending = pending || node;
      }
      if (mutation.type === 'characterData' && !isInsideSatoshillo(mutation.target) && !isInEditableContext(mutation.target)) {
        pending = pending || mutation.target;
      }
    }
    if (pending) scheduleScan(pending);
  });
  activeObserver.observe(document.body, { childList: true, subtree: true, characterData: true });

  activeInterval = setInterval(() => {
    if (!selectionActive()) scanSubtree(document.body);
  }, 2000);
}

function stopWatching() {
  if (activeObserver) { activeObserver.disconnect(); activeObserver = null; }
  if (activeInterval) { clearInterval(activeInterval); activeInterval = null; }
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
  .satoshillo-candidate { position: relative; display: inline; white-space: nowrap; }
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
  .satoshillo-result { position: absolute; left: 0; top: -1.2em; white-space: nowrap; font-size: 10px; font-weight: 600; line-height: 1; color: #f7931a; background: #fff; border: 1px solid #f7931a; border-radius: 3px; padding: 1px 3px; pointer-events: none; z-index: 10; box-shadow: 0 1px 2px rgba(0,0,0,.25); }
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
  if (activeCandidate) closeActive();
}, { capture: true, passive: true });

scanAndConvertPrices();

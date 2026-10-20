(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SatoshilloParser = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const NUMBER = /\d+(?:[.,]\d+)*|\bun(?=\s+bill[oó]n\b)/gi;
  const PAIR = /\b(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|ARS)\/(USD|EUR|GBP|JPY|CHF|AUD|NZD|CAD|ARS)\b/gi;
  const CURRENCY = /\b(ARS|USD|EUR|JPY|pesos?|d[oó]lar(?:es)?|dollars?|euros?|yen)\b/i;
  const MONEY_WORD = /\b(price|cost|buy|pay|total|amount|fee|charge|bill|invoice|precio|costo|comprar|pagar|importe|oferta|factura|presupuesto|deuda|subscription|suscripci[oó]n|alquiler|spent|owe)\b/i;
  const SPANISH_WORD = /\b(precio|costo|comprar|pagar|importe|oferta|factura|presupuesto|deuda|suscripci[oó]n|alquiler|cuesta)\b/i;
  const ENGLISH_WORD = /\b(price|cost|buy|pay|amount|fee|charge|bill|invoice|subscription|rent|spent|owe|sale)\b/i;
  const NON_MONEY_UNIT = /^\s*(?:%|[-–]?\s*(?:minutes?|minutos?|pips?|points?|ticks?|users?|usuarios?|views?|vistas?|impressions?|impresiones|followers?|seguidores|downloads?|descargas|readers?|lectores|votes?|votos?|jobs?|empleos?|puestos|stars?|estrellas))\b/i;
  const FOREX_CUE = /(?:^|\b)(at|(?<!due\s)to|from|around|near|rate|closed\s+at|trading\s+at|quoted\s+at|cotiza(?:\s+(?:a|en))?|desde|hasta)\s*$/i;
  const CURRENCY_MAP = {
    ars: 'ARS', peso: 'ARS', pesos: 'ARS',
    usd: 'USD', dolar: 'USD', 'dólar': 'USD', dolares: 'USD', 'dólares': 'USD', dollar: 'USD', dollars: 'USD',
    eur: 'EUR', euro: 'EUR', euros: 'EUR',
    jpy: 'JPY', yen: 'JPY'
  };

  function scanNumbers(text) {
    const tokens = [];
    const regex = new RegExp(NUMBER.source, 'gi');
    let match;
    while ((match = regex.exec(text))) {
      tokens.push({ raw: match[0], start: match.index, end: match.index + match[0].length });
    }
    return tokens;
  }

  function splitClauses(text, locale) {
    const sentences = [...new Intl.Segmenter(locale, { granularity: 'sentence' }).segment(text)];
    const clauses = [];
    for (const sentence of sentences) {
      const delimiter = /[;\n]|,\s+(?=\p{L})/gu;
      let cursor = 0;
      let match;
      while ((match = delimiter.exec(sentence.segment))) {
        if (match.index > cursor) {
          const start = sentence.index + cursor;
          clauses.push({ text: sentence.segment.slice(cursor, match.index), start, end: sentence.index + match.index });
        }
        cursor = match.index + match[0].length;
      }
      if (cursor < sentence.segment.length) {
        const start = sentence.index + cursor;
        clauses.push({ text: sentence.segment.slice(cursor), start, end: sentence.index + sentence.segment.length });
      }
    }
    return clauses;
  }

  function parseLocalizedNumber(token, locale, explicitMoney) {
    const value = String(token).replace(/[\s\u00a0]/g, '');
    if (!/^\d+(?:[.,]\d+)*$/.test(value)) return NaN;
    const dots = value.split('.').length - 1;
    const commas = value.split(',').length - 1;

    if (dots && commas) {
      const decimal = value.lastIndexOf('.') > value.lastIndexOf(',') ? '.' : ',';
      const grouping = decimal === '.' ? ',' : '.';
      const decimalIndex = value.lastIndexOf(decimal);
      const integer = value.slice(0, decimalIndex);
      const fraction = value.slice(decimalIndex + 1);
      const groups = integer.split(grouping);
      if (!fraction || (groups.length > 1 && !(/^\d{1,3}$/.test(groups[0]) && groups.slice(1).every(group => /^\d{3}$/.test(group))))) return NaN;
      return Number(integer.replaceAll(grouping, '') + '.' + fraction);
    }

    const separator = dots ? '.' : commas ? ',' : null;
    if (!separator) return Number(value);
    const groups = value.split(separator);
    if (groups.length > 2) {
      if (!/^\d{1,3}$/.test(groups[0]) || !groups.slice(1).every(group => /^\d{3}$/.test(group))) return NaN;
      return Number(groups.join(''));
    }
    const fraction = groups[1];
    if (fraction.length !== 3) return Number(groups[0] + '.' + fraction);
    if (explicitMoney) return Number(groups.join(''));
    const localeDecimal = locale === 'es' ? ',' : '.';
    return separator === localeDecimal ? Number(groups[0] + '.' + fraction) : Number(groups.join(''));
  }

  function localLocale(text, fallback) {
    const spanish = SPANISH_WORD.test(text);
    const english = ENGLISH_WORD.test(text);
    if (spanish !== english) return spanish ? 'es' : 'en';
    return fallback;
  }

  function magnitudeAfter(text, end) {
    const rest = text.slice(end);
    const match = rest.match(/^\s*(mil\s+millones|billones|billón|billon|trillones|trillón|millones|millón|millions?|billions?|trillions?|[kmbt])\b/i);
    if (!match) return { multiplier: 1, end, currency: null };
    const value = match[1].toLowerCase();
    let multiplier = 1;
    let currency = null;
    if (value === 'k') multiplier = 1e3;
    else if (value === 'm' || /^mill(?:ion|ón|ones)/.test(value)) multiplier = 1e6;
    else if (value === 'billon') { multiplier = 1e12; currency = 'USD'; }
    else if (value === 'billón') { multiplier = 1e12; currency = 'ARS'; }
    else if (value === 'b' || /^billions?/.test(value) || /^mil\s+millones/.test(value)) multiplier = 1e9;
    else if (/^bill(?:ón|ones)/.test(value)) multiplier = 1e12;
    else if (value === 't' || /^trillions?/.test(value)) multiplier = 1e12;
    else if (/^trill(?:ón|ones)/.test(value)) multiplier = 1e18;
    return { multiplier, end: end + match[0].length, currency };
  }

  function currencyFromWord(word) {
    return word ? CURRENCY_MAP[word.toLowerCase()] || null : null;
  }

  function currencyCodeInClause(clause) {
    const regex = /\b(ARS|USD|EUR|JPY)\b/gi;
    const currencies = new Set();
    let match;
    while ((match = regex.exec(clause.text))) {
      const globalStart = clause.start + match.index;
      const before = globalStart > 0 ? clause.text[match.index - 1] : '';
      const after = clause.text[match.index + match[0].length];
      if (before !== '/' && after !== '/') currencies.add(currencyFromWord(match[1]));
    }
    return currencies.size === 1 ? [...currencies][0] : null;
  }

  function currencyRelation(text, token, expressionEnd, clause) {
    const beforeStart = Math.max(clause.start, token.start - 24);
    const before = text.slice(beforeStart, token.start);
    const prefix = before.match(/(ARS|USD|EUR|JPY|pesos?|d[oó]lar(?:es)?|dollars?|euros?|yen)\s*[:=]?\s*\$?\s*$/i);
    if (prefix) {
      const start = token.start - prefix[0].length;
      if (text[start - 1] !== '/') return { currency: currencyFromWord(prefix[1]), start, end: expressionEnd };
    }
    const after = text.slice(expressionEnd, Math.min(clause.end, expressionEnd + 28));
    const suffix = after.match(/^\s*(?:(?:de|of|in)\s+)?(ARS|USD|EUR|JPY|pesos?|d[oó]lar(?:es)?|dollars?|euros?|yen)\b/i);
    if (suffix) return { currency: currencyFromWord(suffix[1]), start: token.start, end: expressionEnd + suffix[0].length };
    return null;
  }

  function symbolRelation(text, token, locale, clause) {
    const before = text.slice(Math.max(clause.start, token.start - 4), token.start);
    const match = before.match(/(AR\$|US\$|[$€])\s*$/i);
    if (!match) return null;
    const symbol = match[1].toUpperCase();
    let currency;
    if (symbol === 'AR$') currency = 'ARS';
    else if (symbol === 'US$') currency = 'USD';
    else if (symbol === '€') currency = 'EUR';
    else currency = localLocale(clause.text, locale) === 'es' ? 'ARS' : 'USD';
    return { currency, start: token.start - match[0].length, end: token.end, ambiguous: symbol === '$' };
  }

  function isDateToken(text, token) {
    const around = text.slice(Math.max(0, token.start - 6), token.end + 6);
    return /\b\d{4}[-/]\d{1,2}[-/]\d{1,2}\b/.test(around) ||
      (/^\d{4}$/.test(token.raw) && Number(token.raw) >= 1900 && Number(token.raw) <= 2099);
  }

  function isOrderedListMarker(text, token) {
    const lineStart = text.lastIndexOf('\n', token.start - 1) + 1;
    return /^\s*$/.test(text.slice(lineStart, token.start)) && /^\.\s/.test(text.slice(token.end));
  }

  function forexRelation(clause, token, text, magnitude) {
    if (isDateToken(text, token)) return null;
    if (magnitude.multiplier > 1) return null;
    if (NON_MONEY_UNIT.test(text.slice(token.end, token.end + 24))) return null;
    const relativeNumberStart = token.start - clause.start;
    const pairs = [];
    const regex = new RegExp(PAIR.source, 'gi');
    let pair;
    while ((pair = regex.exec(clause.text))) {
      if (pair.index + pair[0].length <= relativeNumberStart) pairs.push(pair);
    }
    pairs.sort((a, b) => b.index - a.index);
    for (const candidatePair of pairs) {
      const quote = currencyFromWord(candidatePair[2]);
      if (!quote) continue;
      const pairEnd = candidatePair.index + candidatePair[0].length;
      const between = clause.text.slice(pairEnd, relativeNumberStart);
      const direct = /^\s*(?:[:=])?\s*$/.test(between);
      const cue = /[:=]\s*$/.test(between) || FOREX_CUE.test(between.slice(-48));
      if (direct || cue) return { currency: quote, start: token.start, end: token.end };
    }
    return null;
  }

  function isolatedClause(clause, token, magnitude) {
    const before = clause.text.slice(0, token.start - clause.start);
    const after = clause.text.slice(magnitude.end - clause.start);
    return !/[\p{L}\d]/u.test(before + after);
  }

  function currencyFromEvidence(text, locale) {
    if (/AR\$/i.test(text)) return 'ARS';
    if (/US\$/i.test(text)) return 'USD';
    if (/€/.test(text)) return 'EUR';
    const word = text.match(CURRENCY);
    if (word) return currencyFromWord(word[1]);
    if (/\$/.test(text)) return localLocale(text, locale) === 'es' ? 'ARS' : 'USD';
    return null;
  }

  function classifyNumber(text, token, clause, clauses, clauseIndex, fallbackLocale) {
    const locale = localLocale(clause.text, fallbackLocale);
    const magnitude = magnitudeAfter(text, token.end);
    const forex = forexRelation(clause, token, text, magnitude);
    const symbol = symbolRelation(text, token, fallbackLocale, clause);
    const currency = currencyRelation(text, token, magnitude.end, clause);
    const numberLocale = forex ? 'en' : locale;
    const baseAmount = /^un$/i.test(token.raw) ? 1 : parseLocalizedNumber(token.raw, numberLocale, !!(symbol || currency));
    const amount = baseAmount * magnitude.multiplier;
    if (!Number.isFinite(amount) || amount <= 0) return null;
    if (forex) return { ...forex, raw: text.slice(forex.start, forex.end), amount, numberStart: token.start, numberEnd: token.end, evidence: 'forex' };

    const explicit = symbol && !symbol.ambiguous ? symbol : currency || symbol;
    if (explicit) {
      const start = symbol ? symbol.start : currency.start;
      const end = Math.max(magnitude.end, explicit.end);
      return { start, end, raw: text.slice(start, end), amount, currency: explicit.currency, numberStart: token.start, numberEnd: token.end, evidence: 'currency' };
    }

    if (magnitude.multiplier > 1) {
      if (NON_MONEY_UNIT.test(text.slice(magnitude.end, magnitude.end + 24))) return null;
      let evidence = clause.text;
      if (isolatedClause(clause, token, magnitude)) {
        evidence = [clauses[clauseIndex - 1], clauses[clauseIndex + 1]].filter(Boolean).map(item => item.text).join(' ');
      }
      if (MONEY_WORD.test(evidence)) {
        const currencyHint = magnitude.currency || currencyCodeInClause(clause) || (localLocale(evidence, fallbackLocale) === 'es' ? 'ARS' : 'USD');
        return { start: token.start, end: magnitude.end, raw: text.slice(token.start, magnitude.end), amount, currency: currencyHint, numberStart: token.start, numberEnd: token.end, evidence: 'money-word' };
      }
    }

    if (isolatedClause(clause, token, magnitude)) {
      const evidence = [clauses[clauseIndex - 1], clauses[clauseIndex + 1]].filter(Boolean).map(item => item.text).join(' ');
      const adjacentCurrency = currencyFromEvidence(evidence, fallbackLocale);
      if (adjacentCurrency || MONEY_WORD.test(evidence)) {
        const currencyHint = adjacentCurrency || (localLocale(evidence, fallbackLocale) === 'es' ? 'ARS' : 'USD');
        return { start: token.start, end: token.end, raw: token.raw, amount, currency: currencyHint, numberStart: token.start, numberEnd: token.end, evidence: 'adjacent-label' };
      }
    }
    return null;
  }

  function findPriceCandidates(text, options) {
    const fallbackLocale = options && options.locale === 'es' ? 'es' : 'en';
    const clauses = splitClauses(text, fallbackLocale);
    const candidates = [];
    for (const token of scanNumbers(text)) {
      if (isOrderedListMarker(text, token)) continue;
      const clauseIndex = clauses.findIndex(clause => token.start >= clause.start && token.end <= clause.end);
      if (clauseIndex === -1) continue;
      const candidate = classifyNumber(text, token, clauses[clauseIndex], clauses, clauseIndex, fallbackLocale);
      if (candidate) candidates.push(candidate);
    }
    return candidates;
  }

  return { findPriceCandidates, parseLocalizedNumber, scanNumbers, splitClauses };
});

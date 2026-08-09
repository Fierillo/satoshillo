const test = require('node:test');
const assert = require('node:assert/strict');

const {
  findPriceCandidates,
  parseLocalizedNumber,
  scanNumbers,
  splitClauses
} = require('../price-parser.js');

function compact(text, locale = 'en') {
  return findPriceCandidates(text, { locale }).map(({ raw, amount, currency, start }) => ({
    raw,
    amount,
    currency,
    start
  }));
}

test('parses English and Spanish number formats', () => {
  assert.equal(parseLocalizedNumber('1,234.56', 'en'), 1234.56);
  assert.equal(parseLocalizedNumber('1.234,56', 'es'), 1234.56);
  assert.equal(parseLocalizedNumber('1,000,000', 'en'), 1000000);
  assert.equal(parseLocalizedNumber('1.000.000', 'es'), 1000000);
  assert.equal(parseLocalizedNumber('158.123', 'en'), 158.123);
  assert.equal(parseLocalizedNumber('10,50', 'es'), 10.5);
});

test('runs lexical scanning and sentence segmentation as separate stages', () => {
  assert.deepEqual(scanNumbers('Price 10.50, page 2.'), [
    { raw: '10.50', start: 6, end: 11 },
    { raw: '2', start: 18, end: 19 }
  ]);
  assert.equal(splitClauses('Price: 10. Next sentence: 20.', 'en').length, 2);
});

test('uses an adjacent sentence only for an isolated number', () => {
  assert.deepEqual(compact('Price.\n100', 'en'), [
    { raw: '100', amount: 100, currency: 'USD', start: 7 }
  ]);
  assert.deepEqual(compact('Precio.\n100', 'es'), [
    { raw: '100', amount: 100, currency: 'ARS', start: 8 }
  ]);
  assert.deepEqual(compact('Users.\n100', 'en'), []);
  assert.deepEqual(compact('USD\n100 users', 'en'), []);
  assert.deepEqual(compact('$\n100 users', 'en'), []);
});

test('rejects malformed grouping', () => {
  assert.ok(Number.isNaN(parseLocalizedNumber('1,23,456', 'en')));
  assert.ok(Number.isNaN(parseLocalizedNumber('1.23.456', 'es')));
});

test('resolves ambiguous dollar signs from local currency evidence and locale', () => {
  assert.deepEqual(compact('Precio: $10.000', 'es'), [{ raw: '$10.000', amount: 10000, currency: 'ARS', start: 8 }]);
  assert.deepEqual(compact('Price: $10,000', 'en'), [{ raw: '$10,000', amount: 10000, currency: 'USD', start: 7 }]);

  const mixed = 'ARS: $100; USD: $100';
  assert.deepEqual(compact(mixed, 'es'), [
    { raw: '$100', amount: 100, currency: 'ARS', start: mixed.indexOf('$100') },
    { raw: '$100', amount: 100, currency: 'USD', start: mixed.lastIndexOf('$100') }
  ]);
});

test('requires positive local evidence for magnitude-only candidates', () => {
  assert.deepEqual(compact('The service has 10 million users.'), []);
  assert.deepEqual(compact('The race is 10m long.'), []);
  assert.deepEqual(compact('The startup reached 5k downloads.'), []);

  const text = 'Asking price: 10 million.';
  assert.deepEqual(compact(text), [{
    raw: '10 million',
    amount: 10000000,
    currency: 'USD',
    start: text.indexOf('10 million')
  }]);
});

test('keeps repeated candidates isolated to their local clauses', () => {
  const text = 'ARS price: 100 million; Audience: 100 million users; USD price: 100 million.';
  assert.deepEqual(compact(text), [
    { raw: '100 million', amount: 100000000, currency: 'ARS', start: text.indexOf('100 million') },
    { raw: '100 million', amount: 100000000, currency: 'USD', start: text.lastIndexOf('100 million') }
  ]);
});

test('extracts qualified forex rates and quote currencies', () => {
  const text = 'USD/JPY dropped from 158.48 to 156.65 in a single 15-minute candle, over 180 pips.';
  assert.deepEqual(compact(text), [
    { raw: '158.48', amount: 158.48, currency: 'JPY', start: text.indexOf('158.48') },
    { raw: '156.65', amount: 156.65, currency: 'JPY', start: text.indexOf('156.65') }
  ]);

  const eur = 'EUR/USD is trading at 1.0850.';
  assert.deepEqual(compact(eur), [
    { raw: '1.0850', amount: 1.085, currency: 'USD', start: eur.indexOf('1.0850') }
  ]);
});

test('forex detection ignores dates, percentages and unrelated counts', () => {
  const dated = 'EUR/USD on 2024-06-10 closed at 1.0850.';
  assert.deepEqual(compact(dated), [
    { raw: '1.0850', amount: 1.085, currency: 'USD', start: dated.indexOf('1.0850') }
  ]);

  const percent = 'EUR/USD fell 2% to 1.0750.';
  assert.deepEqual(compact(percent), [
    { raw: '1.0750', amount: 1.075, currency: 'USD', start: percent.indexOf('1.0750') }
  ]);

  assert.deepEqual(compact('EUR/USD is discussed by 12 analysts.'), []);
  assert.deepEqual(compact('EUR/USD outlook for 2025. The report had 500 readers.'), []);
  assert.deepEqual(compact('USD/JPY 2025 outlook.'), []);
  assert.deepEqual(compact('USD/JPY 2024-06-10 market outlook.'), []);
  assert.deepEqual(compact('USD/JPY outlook improved due to 12 analysts.'), []);
  assert.deepEqual(compact('EUR/USD fell to support, with volume at 500 million users.'), []);

  const datedLabel = 'USD/JPY on 8 Aug: 158.123';
  assert.deepEqual(compact(datedLabel), [
    { raw: '158.123', amount: 158.123, currency: 'JPY', start: datedLabel.indexOf('158.123') }
  ]);
});

test('does not leak monetary evidence across comma-separated clauses', () => {
  assert.deepEqual(compact('The price fell, while valuation reached 5 million.', 'en'), []);
});

test('parses three-digit grouping on explicit symbol amounts', () => {
  const text = 'Bitcoin está a $67,000';
  assert.deepEqual(compact(text, 'es'), [
    { raw: '$67,000', amount: 67000, currency: 'ARS', start: text.indexOf('$67,000') }
  ]);
});

test('multiple forex pairs do not duplicate one rate', () => {
  const text = 'EUR/USD and GBP/USD at 1.2';
  assert.deepEqual(compact(text), [
    { raw: '1.2', amount: 1.2, currency: 'USD', start: text.indexOf('1.2') }
  ]);
});

test('supports singular Spanish currency and magnitude words', () => {
  const million = 'Precio: 1 millón de pesos';
  assert.deepEqual(compact(million, 'es'), [
    { raw: '1 millón de pesos', amount: 1000000, currency: 'ARS', start: million.indexOf('1 millón') }
  ]);

  const billion = 'Precio: 1 billón de dólar';
  assert.deepEqual(compact(billion, 'es'), [
    { raw: '1 billón de dólar', amount: 1000000000000, currency: 'USD', start: billion.indexOf('1 billón') }
  ]);
});

test('uses accent to distinguish currency while keeping long-scale billon', () => {
  const usd = 'Presupuesto: 1 billon';
  assert.deepEqual(compact(usd, 'es'), [
    { raw: '1 billon', amount: 1000000000000, currency: 'USD', start: usd.indexOf('1 billon') }
  ]);

  const ars = 'Presupuesto: 1 billón';
  assert.deepEqual(compact(ars, 'es'), [
    { raw: '1 billón', amount: 1000000000000, currency: 'ARS', start: ars.indexOf('1 billón') }
  ]);

  const written = 'La deuda alcanzó un billón';
  assert.deepEqual(compact(written, 'es'), [
    { raw: 'un billón', amount: 1000000000000, currency: 'ARS', start: written.indexOf('un billón') }
  ]);

  const dollars = 'La deuda es de un billon de dolares';
  assert.deepEqual(compact(dollars, 'es'), [
    { raw: 'un billon de dolares', amount: 1000000000000, currency: 'USD', start: dollars.indexOf('un billon') }
  ]);
});

test('explicit money remains valid in forex prose', () => {
  const text = 'It spent $160 billion this year trying to push USD/JPY down.';
  assert.deepEqual(compact(text), [{
    raw: '$160 billion',
    amount: 160000000000,
    currency: 'USD',
    start: text.indexOf('$160 billion')
  }]);
});

test('covers the HTML regression cases under a Spanish page locale', () => {
  const cases = [
    ['USD/JPY dropped from 158.48 to 156.65', '158.48', 158.48, 'JPY'],
    ['El precio es de 500 pesos', '500 pesos', 500, 'ARS'],
    ['Total a pagar: $2.50', '$2.50', 2.5, 'ARS'],
    ['La suscripción sale $9.99 al mes', '$9.99', 9.99, 'ARS'],
    ['The price dropped to $2.50 after the crash', '$2.50', 2.5, 'USD'],
    ['EUR/USD is trading at 1.0850', '1.0850', 1.085, 'USD'],
    ['El presupuesto es de 1 millón de pesos', '1 millón de pesos', 1000000, 'ARS']
  ];

  for (const [text, raw, amount, currency] of cases) {
    const candidates = compact(text, 'es');
    assert.ok(candidates.some(candidate => {
      return candidate.raw === raw && candidate.amount === amount && candidate.currency === currency;
    }), text);
  }
});

test('matches all 21 expectations from test-satoshillo.html', () => {
  const cases = [
    ['Buy this laptop for $1,500', '1,500', true],
    ['USD/JPY dropped from 158.48 to 156.65', '158.48', true],
    ['El precio es de 500 pesos', '500', true],
    ['The economy lost 23,000 jobs', '23,000', false],
    ['Total a pagar: $2.50', '2.50', true],
    ['The DXY fell from 99.90 to 99.40', '99.90', false],
    ['El producto cuesta €49,99', '49,99', true],
    ['The index gained 180 points', '180', false],
    ['La suscripción sale $9.99 al mes', '9.99', true],
    ['El dólar blue cotiza a $1.200', '1.200', true],
    ['Se perdieron 85,000 puestos de trabajo', '85,000', false],
    ['The price dropped to $2.50 after the crash', '2.50', true],
    ['EUR/USD is trading at 1.0850', '1.0850', true],
    ['El presupuesto es de 1 millón de pesos', '1', true],
    ['El artículo 1.500 del catálogo cuesta $25', '1.500', false],
    ['You owe me €20', '20', true],
    ['Bitcoin está a $67,000', '67,000', true],
    ['La inflación subió a 8.3 por ciento', '8.3', false],
    ['El producto tiene 4.5 estrellas de 5', '4.5', false],
    ['La deuda es de 1 billón de dólares', '1', true],
    ['Page 42 of the report shows inflation at 8%', '42', false]
  ];

  for (const [text, target, expected] of cases) {
    const targetStart = text.indexOf(target);
    const found = findPriceCandidates(text, { locale: 'es' }).some(candidate => {
      return candidate.numberStart === targetStart && candidate.numberEnd === targetStart + target.length;
    });
    assert.equal(found, expected, text);
  }
});

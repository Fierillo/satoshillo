const test = require('node:test');
const assert = require('node:assert/strict');

const {
  aggregatePrices,
  createPriceService,
  fetchSource
} = require('../price-service.js');

const currencies = ['ARS', 'USD', 'EUR', 'JPY'];

test('requires three agreeing real observations and rejects outliers', () => {
  const result = aggregatePrices([
    { USD: 100, EUR: 90 },
    { USD: 102, EUR: 91 },
    { USD: 101, EUR: 90.5 },
    { USD: 1000, EUR: Infinity }
  ], { currencies, quorum: 3, maxDeviation: 0.15 });

  assert.equal(result.USD, 101);
  assert.equal(result.EUR, 90.5);
  assert.equal(result.ARS, undefined);
  assert.equal(result.JPY, undefined);
});

test('rejects non-finite, zero, negative and one-source values', () => {
  assert.equal(aggregatePrices([
    { USD: Infinity, ARS: 10 },
    { USD: 0, ARS: -1 },
    { USD: -5, ARS: 12 }
  ], { currencies, quorum: 3 }), null);
});

test('a hanging source is aborted and cannot block aggregation', async () => {
  let aborted = false;
  const source = {
    fetch(signal) {
      signal.addEventListener('abort', () => { aborted = true; });
      return new Promise(() => {});
    }
  };

  const result = await fetchSource(source, 10);
  assert.equal(result, null);
  assert.equal(aborted, true);
});

function createStorage(initial = {}) {
  let data = structuredClone(initial);
  let gets = 0;
  const sets = [];
  return {
    async get() {
      gets++;
      return structuredClone(data);
    },
    async set(value) {
      sets.push(structuredClone(value));
      data = { ...data, ...structuredClone(value) };
    },
    getCount: () => gets,
    sets
  };
}

test('cold MV3 wake hydrates persisted cache without waiting for network', async () => {
  const now = 1_000_000;
  const prices = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const storage = createStorage({ cachedPrices: prices, cachedAt: now });
  let calls = 0;
  const service = createPriceService({
    currencies,
    sources: [{ fetch: async () => { calls++; return prices; } }],
    storage,
    now: () => now,
    quorum: 3
  });

  const result = await service.getPrices();
  assert.deepEqual(result.prices, prices);
  assert.equal(result.provisional, false);
  assert.equal(calls, 0);
});

test('partial refresh preserves previously cached currencies', async () => {
  let now = 2_000_000;
  const old = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const storage = createStorage({ cachedPrices: old, cachedAt: now - 120000 });
  const sources = [
    { fetch: async () => ({ USD: 2 }) },
    { fetch: async () => ({ USD: 2.02 }) },
    { fetch: async () => ({ USD: 1.98 }) }
  ];
  const service = createPriceService({ currencies, sources, storage, now: () => now, quorum: 3 });

  await service.refreshPrices();
  const result = await service.getPrices();
  assert.equal(result.prices.USD, 2);
  assert.equal(result.prices.ARS, old.ARS);
  assert.equal(result.prices.EUR, old.EUR);
  assert.equal(result.prices.JPY, old.JPY);
  assert.equal(result.provisional, true);
});

test('failed refresh preserves stale fallback', async () => {
  const now = 3_000_000;
  const old = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const storage = createStorage({ cachedPrices: old, cachedAt: now - 300000 });
  const service = createPriceService({
    currencies,
    sources: [{ fetch: async () => null }],
    storage,
    now: () => now,
    quorum: 3
  });

  await service.refreshPrices();
  const result = await service.getPrices();
  assert.deepEqual(result.prices, old);
  assert.equal(result.provisional, true);
});

test('concurrent cold-wake refreshes share initialization and source calls', async () => {
  const storage = createStorage({});
  let calls = 0;
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const sources = [0, 1, 2].map(() => ({
    async fetch() {
      calls++;
      await deferred;
      return { USD: 100 };
    }
  }));
  const service = createPriceService({ currencies, sources, storage, quorum: 3 });

  const pending = [service.refreshPrices(), service.refreshPrices(), service.getPrices()];
  release();
  await Promise.all(pending);
  assert.equal(storage.getCount(), 1);
  assert.equal(calls, 3);
});

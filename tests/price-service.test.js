const test = require('node:test');
const assert = require('node:assert/strict');

const {
  createPriceService,
  fetchSource,
  selectPrices
} = require('../price-service.js');

const currencies = ['ARS', 'USD', 'EUR', 'JPY'];

test('takes the first complete source without averaging', () => {
  const primary = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const fallback = { ARS: 200, USD: 2, EUR: 1.8, JPY: 300 };
  assert.deepEqual(selectPrices([primary, fallback], currencies), primary);
});

test('skips invalid or incomplete sources and uses the next fallback', () => {
  const fallback = { ARS: 200, USD: 2, EUR: 1.8, JPY: 300 };
  assert.deepEqual(selectPrices([
    { ARS: 100, USD: 1 },
    { ARS: Infinity, USD: 2, EUR: 1.8, JPY: 300 },
    fallback
  ], currencies), fallback);
  assert.equal(selectPrices([{ ARS: 1, USD: 1 }], currencies), null);
});

test('a hanging source is aborted and cannot block fallback selection', async () => {
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
  const storage = createStorage({ cachedPrices: prices, cachedAt: now, priceStrategyVersion: 'priority-v1' });
  let calls = 0;
  const service = createPriceService({
    currencies,
    sources: [{ fetch: async () => { calls++; return prices; } }],
    storage,
    now: () => now,
    strategyVersion: 'priority-v1'
  });

  const result = await service.getPrices();
  assert.deepEqual(result.prices, prices);
  assert.equal(result.provisional, false);
  assert.equal(calls, 0);
});

test('incomplete primary is skipped and complete fallback replaces the cache', async () => {
  let now = 2_000_000;
  const old = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const storage = createStorage({ cachedPrices: old, cachedAt: now - 120000, priceStrategyVersion: 'priority-v1' });
  const fallback = { ARS: 200, USD: 2, EUR: 1.8, JPY: 300 };
  const sources = [
    { fetch: async () => ({ USD: 2 }) },
    { fetch: async () => fallback },
    { fetch: async () => ({ ARS: 300, USD: 3, EUR: 2.7, JPY: 450 }) }
  ];
  const service = createPriceService({ currencies, sources, storage, now: () => now, strategyVersion: 'priority-v1' });

  await service.refreshPrices();
  const result = await service.getPrices();
  assert.deepEqual(result.prices, fallback);
  assert.equal(result.provisional, false);
});

test('failed refresh preserves stale fallback', async () => {
  const now = 3_000_000;
  const old = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const storage = createStorage({ cachedPrices: old, cachedAt: now - 300000, priceStrategyVersion: 'priority-v1' });
  const service = createPriceService({
    currencies,
    sources: [{ fetch: async () => null }],
    storage,
    now: () => now,
    strategyVersion: 'priority-v1'
  });

  await service.refreshPrices();
  const result = await service.getPrices();
  assert.deepEqual(result.prices, old);
  assert.equal(result.provisional, true);
});

test('concurrent cold-wake refreshes share one primary source call', async () => {
  const storage = createStorage({});
  let calls = 0;
  let release;
  const deferred = new Promise(resolve => { release = resolve; });
  const sources = [0, 1, 2].map(index => ({
    async fetch() {
      calls++;
      await deferred;
      return { ARS: 100 + index, USD: 1, EUR: 0.9, JPY: 150 };
    }
  }));
  const service = createPriceService({ currencies, sources, storage, strategyVersion: 'priority-v1' });

  const pending = [service.refreshPrices(), service.refreshPrices(), service.getPrices()];
  release();
  await Promise.all(pending);
  assert.equal(storage.getCount(), 1);
  assert.equal(calls, 1);
});

test('old averaging cache is ignored after strategy migration', async () => {
  const old = { ARS: 100, USD: 1, EUR: 0.9, JPY: 150 };
  const fresh = { ARS: 200, USD: 2, EUR: 1.8, JPY: 300 };
  const storage = createStorage({ cachedPrices: old, cachedAt: Date.now() });
  const service = createPriceService({
    currencies,
    sources: [{ fetch: async () => fresh }],
    storage,
    strategyVersion: 'priority-v1'
  });

  const result = await service.getPrices();
  assert.deepEqual(result.prices, fresh);
});

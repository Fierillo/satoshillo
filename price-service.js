(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SatoshilloPriceService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isValidPrice(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  function selectPrices(sourceValues, currencies) {
    for (const value of sourceValues) {
      if (!value || !currencies.every(currency => isValidPrice(value[currency]))) continue;
      return Object.fromEntries(currencies.map(currency => [currency, value[currency]]));
    }
    return null;
  }

  function fetchSource(source, timeoutMs) {
    const controller = new AbortController();
    let timeout;
    const request = Promise.resolve().then(() => source.fetch(controller.signal)).catch(() => null);
    const deadline = new Promise(resolve => {
      timeout = setTimeout(() => {
        controller.abort();
        resolve(null);
      }, timeoutMs);
    });
    return Promise.race([request, deadline]).finally(() => clearTimeout(timeout));
  }

  function createPriceService(options) {
    const currencies = options.currencies;
    const sources = options.sources;
    const storage = options.storage;
    const now = options.now || Date.now;
    const ttlMs = options.ttlMs || 60000;
    const sourceTimeoutMs = options.sourceTimeoutMs || 5000;
    const strategyVersion = options.strategyVersion || 'priority-v1';
    let cachedPrices = null;
    let cachedAt = 0;
    let initializationPromise = null;
    let refreshPromise = null;

    function validTimestamp(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now();
    }

    function initialize() {
      if (initializationPromise) return initializationPromise;
      initializationPromise = Promise.resolve()
        .then(() => storage.get(['cachedPrices', 'cachedAt', 'priceStrategyVersion']))
        .catch(() => ({}))
        .then(data => {
          if (!data || data.priceStrategyVersion !== strategyVersion || !validTimestamp(data.cachedAt)) return;
          const selected = selectPrices([data.cachedPrices], currencies);
          if (selected) {
            cachedPrices = selected;
            cachedAt = data.cachedAt;
          }
        });
      return initializationPromise;
    }

    function snapshot() {
      if (!cachedPrices) return { prices: null, provisional: false, at: 0 };
      return {
        prices: { ...cachedPrices },
        provisional: !validTimestamp(cachedAt) || now() - cachedAt >= ttlMs,
        at: cachedAt
      };
    }

    function refreshPrices() {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        await initialize();
        let selected = null;
        for (const source of sources) {
          const value = await fetchSource(source, sourceTimeoutMs);
          selected = selectPrices([value], currencies);
          if (selected) break;
        }
        if (selected) {
          cachedPrices = selected;
          cachedAt = now();
          await Promise.resolve(storage.set({
            cachedPrices,
            cachedAt,
            priceStrategyVersion: strategyVersion
          })).catch(() => {});
        }
        return snapshot();
      })().finally(() => {
        refreshPromise = null;
      });
      return refreshPromise;
    }

    async function getPrices() {
      await initialize();
      const current = snapshot();
      if (!current.prices) return refreshPrices();
      if (current.provisional || now() - current.at >= ttlMs / 2) refreshPrices();
      return current;
    }

    return { getPrices, initialize, refreshPrices };
  }

  return { createPriceService, fetchSource, isValidPrice, selectPrices };
});

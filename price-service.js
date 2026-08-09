(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.SatoshilloPriceService = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function isValidPrice(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0;
  }

  function aggregatePrices(sourceValues, options) {
    const currencies = options.currencies;
    const quorum = options.quorum == null ? 3 : options.quorum;
    const maxDeviation = options.maxDeviation == null ? 0.15 : options.maxDeviation;
    const prices = {};

    for (const currency of currencies) {
      const values = sourceValues
        .map(value => value && value[currency])
        .filter(isValidPrice)
        .sort((a, b) => a - b);
      if (values.length < quorum) continue;
      const middle = Math.floor(values.length / 2);
      const median = values.length % 2 ? values[middle] : (values[middle - 1] + values[middle]) / 2;
      const inliers = values.filter(value => Math.abs(value - median) / median <= maxDeviation);
      if (inliers.length < quorum) continue;
      prices[currency] = inliers.reduce((sum, value) => sum + value, 0) / inliers.length;
    }

    return Object.keys(prices).length ? prices : null;
  }

  function fetchSource(source, timeoutMs) {
    const controller = new AbortController();
    let timeout;
    const request = Promise.resolve()
      .then(() => source.fetch(controller.signal))
      .catch(() => null);
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
    const quorum = options.quorum == null ? 3 : options.quorum;
    const maxDeviation = options.maxDeviation == null ? 0.15 : options.maxDeviation;
    let cachedPrices = null;
    let cachedAtByCurrency = {};
    let initializationPromise = null;
    let refreshPromise = null;

    function validTimestamp(value) {
      return typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= now();
    }

    function initialize() {
      if (initializationPromise) return initializationPromise;
      initializationPromise = Promise.resolve()
        .then(() => storage.get(['cachedPrices', 'cachedAt', 'cachedAtByCurrency']))
        .catch(() => ({}))
        .then(data => {
          const persisted = data && data.cachedPrices;
          if (!persisted || typeof persisted !== 'object') return;
          const prices = {};
          const timestamps = {};
          for (const currency of currencies) {
            if (!isValidPrice(persisted[currency])) continue;
            prices[currency] = persisted[currency];
            const perCurrency = data.cachedAtByCurrency && data.cachedAtByCurrency[currency];
            const timestamp = validTimestamp(perCurrency) ? perCurrency : data.cachedAt;
            if (validTimestamp(timestamp)) timestamps[currency] = timestamp;
          }
          if (Object.keys(prices).length) {
            cachedPrices = prices;
            cachedAtByCurrency = timestamps;
          }
        });
      return initializationPromise;
    }

    function snapshot() {
      if (!cachedPrices || !Object.keys(cachedPrices).length) {
        return { prices: null, provisional: false, at: 0 };
      }
      const timestamps = Object.keys(cachedPrices)
        .map(currency => cachedAtByCurrency[currency] || 0)
        .filter(Boolean);
      const at = timestamps.length ? Math.min(...timestamps) : 0;
      const complete = currencies.every(currency => isValidPrice(cachedPrices[currency]));
      const fresh = complete && currencies.every(currency => {
        const timestamp = cachedAtByCurrency[currency];
        return validTimestamp(timestamp) && now() - timestamp < ttlMs;
      });
      return { prices: { ...cachedPrices }, provisional: !fresh, at };
    }

    function refreshPrices() {
      if (refreshPromise) return refreshPromise;
      refreshPromise = (async () => {
        await initialize();
        const values = await Promise.all(sources.map(source => fetchSource(source, sourceTimeoutMs)));
        const refreshed = aggregatePrices(values, { currencies, quorum, maxDeviation });
        if (refreshed) {
          const timestamp = now();
          cachedPrices = { ...(cachedPrices || {}), ...refreshed };
          for (const currency of Object.keys(refreshed)) cachedAtByCurrency[currency] = timestamp;
          const times = Object.values(cachedAtByCurrency).filter(validTimestamp);
          const cachedAt = times.length ? Math.min(...times) : 0;
          await Promise.resolve(storage.set({ cachedPrices, cachedAtByCurrency, cachedAt })).catch(() => {});
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
      const shouldRefresh = current.provisional || !current.at || now() - current.at >= ttlMs / 2;
      if (shouldRefresh) refreshPrices();
      return current;
    }

    return { getPrices, initialize, refreshPrices };
  }

  return { aggregatePrices, createPriceService, fetchSource, isValidPrice };
});

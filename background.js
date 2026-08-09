if (typeof SatoshilloPriceService === 'undefined') importScripts('price-service.js');

const CURRENCIES = ['ARS', 'USD', 'EUR', 'JPY'];

function storageGet(keys) {
  return new Promise(resolve => {
    chrome.storage.local.get(keys, data => resolve(data || {}));
  });
}

function storageSet(value) {
  return new Promise(resolve => {
    chrome.storage.local.set(value, resolve);
  });
}

async function fetchJson(url, signal) {
  const response = await fetch(url, { signal });
  if (!response.ok) throw new Error('HTTP ' + response.status);
  return response.json();
}

function fromUsd(usd, rates) {
  return {
    USD: usd,
    ARS: usd * rates.ARS,
    EUR: usd * rates.EUR,
    JPY: usd * rates.JPY
  };
}

function createCachedLoader(ttlMs, load) {
  let value = null;
  let loadedAt = 0;
  let pending = null;
  return async signal => {
    if (value && Date.now() - loadedAt < ttlMs) return value;
    if (pending) return pending;
    pending = load(signal).then(result => {
      value = result;
      loadedAt = Date.now();
      return result;
    }).finally(() => {
      pending = null;
    });
    return pending;
  };
}

const loadFxRatesApi = createCachedLoader(5 * 60000, async signal => {
  const data = await fetchJson('https://api.fxratesapi.com/latest?base=USD&currencies=ARS,EUR,JPY', signal);
  if (!data.success || !data.rates) throw new Error('Invalid FXRatesAPI response');
  return data.rates;
});

const loadExchangeRateApi = createCachedLoader(60 * 60000, async signal => {
  const data = await fetchJson('https://open.er-api.com/v6/latest/USD', signal);
  if (data.result !== 'success' || !data.rates) throw new Error('Invalid ExchangeRate-API response');
  return data.rates;
});

const sources = [
  {
    name: 'CoinGecko',
    fetch: async signal => {
      const d = await fetchJson('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ars,usd,eur,jpy&include_last_updated_at=true', signal);
      return { ARS: d.bitcoin.ars, USD: d.bitcoin.usd, EUR: d.bitcoin.eur, JPY: d.bitcoin.jpy };
    }
  },
  {
    name: 'Yadio',
    fetch: async signal => {
      const d = await fetchJson('https://api.yadio.io/exrates/BTC', signal);
      return { ARS: d.BTC.ARS, USD: d.BTC.USD, EUR: d.BTC.EUR, JPY: d.BTC.JPY };
    }
  },
  {
    name: 'Binance + FXRatesAPI',
    fetch: async signal => {
      const [ticker, rates] = await Promise.all([
        fetchJson('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT', signal),
        loadFxRatesApi(signal)
      ]);
      return fromUsd(parseFloat(ticker.price), rates);
    }
  },
  {
    name: 'Kraken + ExchangeRate-API',
    fetch: async signal => {
      const [ticker, rates] = await Promise.all([
        fetchJson('https://api.kraken.com/0/public/Ticker?pair=XBTUSD&assetVersion=1', signal),
        loadExchangeRateApi(signal)
      ]);
      if (ticker.error && ticker.error.length) throw new Error(ticker.error.join(', '));
      const pair = Object.values(ticker.result || {})[0];
      if (!pair || !pair.c) throw new Error('Invalid Kraken response');
      return fromUsd(parseFloat(pair.c[0]), rates);
    }
  }
];

const priceService = SatoshilloPriceService.createPriceService({
  currencies: CURRENCIES,
  sources,
  storage: { get: storageGet, set: storageSet },
  ttlMs: 60000,
  sourceTimeoutMs: 7000,
  quorum: 3,
  maxDeviation: 0.15
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPrices') {
    priceService.getPrices().then(result => {
      sendResponse(result);
    });
    return true;
  }
  if (request.action === 'getDisabled') {
    chrome.storage.local.get('disabledSites', data => {
      const disabled = data.disabledSites || [];
      sendResponse({ disabled });
    });
    return true;
  }
  if (request.action === 'toggleSite') {
    const url = new URL(request.url);
    const origin = url.origin;
    chrome.storage.local.get('disabledSites', data => {
      const disabled = data.disabledSites || [];
      const idx = disabled.indexOf(origin);
      if (idx === -1) disabled.push(origin);
      else disabled.splice(idx, 1);
      chrome.storage.local.set({ disabledSites: disabled }, () => {
        sendResponse({ disabled, origin });
      });
    });
    return true;
  }
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status !== 'complete' || !tab.url) return;
  try {
    const origin = new URL(tab.url).origin;
    chrome.storage.local.get('disabledSites', data => {
      const disabled = data.disabledSites || [];
      const isDisabled = disabled.includes(origin);
      chrome.action.setBadgeText({ text: isDisabled ? 'OFF' : '', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId });
    });
  } catch {}
});

chrome.action.onClicked.addListener(async (tab) => {
  if (!tab.url) return;
  const url = new URL(tab.url);
  const origin = url.origin;
  chrome.storage.local.get('disabledSites', data => {
    const disabled = data.disabledSites || [];
    const idx = disabled.indexOf(origin);
    if (idx === -1) disabled.push(origin);
    else disabled.splice(idx, 1);
    chrome.storage.local.set({ disabledSites: disabled }, () => {
      const isDisabled = disabled.includes(origin);
      chrome.action.setBadgeText({ text: isDisabled ? 'OFF' : '', tabId: tab.id });
      chrome.action.setBadgeBackgroundColor({ color: '#F44336', tabId: tab.id });
      chrome.tabs.sendMessage(tab.id, { action: 'toggleDisabled', disabled: isDisabled });
    });
  });
});

chrome.runtime.onInstalled.addListener(() => {
  priceService.refreshPrices();
  chrome.alarms.create('refreshPrices', { periodInMinutes: 1 });
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['price-parser.js', 'content.js']
        }).catch(() => {});
      }
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  priceService.refreshPrices();
  chrome.alarms.create('refreshPrices', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'refreshPrices') priceService.refreshPrices();
});

const CURRENCIES = ['ARS', 'USD', 'EUR', 'JPY'];

const PRICE_TTL = 60000;

let cachedPrices = null;
let cachedAt = 0;
let fetchPromise = null;

function freshPrices() {
  if (cachedPrices && Date.now() - cachedAt < PRICE_TTL) return cachedPrices;
  return null;
}

function persistPrices() {
  chrome.storage.local.set({ cachedPrices, cachedAt }).catch(() => {});
}

async function loadPersistedPrices() {
  const data = await chrome.storage.local.get(['cachedPrices', 'cachedAt']).catch(() => ({}));
  if (data && data.cachedPrices) {
    cachedPrices = data.cachedPrices;
    cachedAt = data.cachedAt || 0;
  }
}

async function refreshPrices() {
  if (fetchPromise) return fetchPromise;
  fetchPromise = fetchBitcoinPrices()
    .then(prices => {
      fetchPromise = null;
      if (prices) {
        cachedPrices = prices;
        cachedAt = Date.now();
        persistPrices();
      }
      return prices;
    })
    .catch(() => {
      fetchPromise = null;
      return null;
    });
  return fetchPromise;
}

async function getPrices() {
  const fresh = freshPrices();
  if (fresh) {
    if (Date.now() - cachedAt > PRICE_TTL / 2) refreshPrices();
    return fresh;
  }
  const persisted = cachedPrices;
  if (persisted) {
    refreshPrices();
    return persisted;
  }
  return refreshPrices();
}

const sources = [
  {
    name: 'CoinGecko',
    fetch: async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ars,usd,eur,jpy');
      if (!r.ok) return null;
      const d = await r.json();
      return { ARS: d.bitcoin.ars, USD: d.bitcoin.usd, EUR: d.bitcoin.eur, JPY: d.bitcoin.jpy };
    }
  },
  {
    name: 'Yadio',
    fetch: async () => {
      const r = await fetch('https://api.yadio.io/exrates/BTC');
      if (!r.ok) return null;
      const d = await r.json();
      return { ARS: d.BTC.ARS, USD: d.BTC.USD, EUR: d.BTC.EUR, JPY: d.BTC.JPY };
    }
  },
  {
    name: 'CoinCap',
    fetch: async () => {
      const r = await fetch('https://api.coincap.io/v2/assets/bitcoin');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.data.priceUsd);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050, JPY: usd * 155 };
    }
  },
  {
    name: 'Binance',
    fetch: async () => {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.price);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050, JPY: usd * 155 };
    }
  },
  {
    name: 'Kraken',
    fetch: async () => {
      const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.result.XBTUSD.c[0]);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050, JPY: usd * 155 };
    }
  }
];

async function fetchBitcoinPrices() {
  const results = await Promise.allSettled(sources.map(s => s.fetch()));

  const prices = {};
  CURRENCIES.forEach(currency => {
    const values = [];
    results.forEach((result, i) => {
      if (result.status === 'fulfilled' && result.value && typeof result.value[currency] === 'number' && !isNaN(result.value[currency])) {
        values.push(result.value[currency]);
      }
    });
    if (values.length > 0) {
      prices[currency] = values.reduce((a, b) => a + b, 0) / values.length;
    }
  });

  return Object.keys(prices).length > 0 ? prices : null;
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'getPrices') {
    getPrices().then(prices => {
      sendResponse({ prices });
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
  loadPersistedPrices().then(refreshPrices);
  chrome.alarms.create('refreshPrices', { periodInMinutes: 1 });
  chrome.tabs.query({}, tabs => {
    for (const tab of tabs) {
      if (tab.url && !tab.url.startsWith('chrome://') && !tab.url.startsWith('about:')) {
        chrome.scripting.executeScript({
          target: { tabId: tab.id },
          files: ['content.js']
        }).catch(() => {});
      }
    }
  });
});

chrome.runtime.onStartup.addListener(() => {
  loadPersistedPrices().then(refreshPrices);
  chrome.alarms.create('refreshPrices', { periodInMinutes: 1 });
});

chrome.alarms.onAlarm.addListener(alarm => {
  if (alarm.name === 'refreshPrices') refreshPrices();
});

const CURRENCIES = ['ARS', 'USD', 'EUR'];

const sources = [
  {
    name: 'CoinGecko',
    fetch: async () => {
      const r = await fetch('https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ars,usd,eur');
      if (!r.ok) return null;
      const d = await r.json();
      return { ARS: d.bitcoin.ars, USD: d.bitcoin.usd, EUR: d.bitcoin.eur };
    }
  },
  {
    name: 'Yadio',
    fetch: async () => {
      const r = await fetch('https://api.yadio.io/exrates/BTC');
      if (!r.ok) return null;
      const d = await r.json();
      return { ARS: d.BTC.ARS, USD: d.BTC.USD, EUR: d.BTC.EUR };
    }
  },
  {
    name: 'CoinCap',
    fetch: async () => {
      const r = await fetch('https://api.coincap.io/v2/assets/bitcoin');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.data.priceUsd);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050 };
    }
  },
  {
    name: 'Binance',
    fetch: async () => {
      const r = await fetch('https://api.binance.com/api/v3/ticker/price?symbol=BTCUSDT');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.price);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050 };
    }
  },
  {
    name: 'Kraken',
    fetch: async () => {
      const r = await fetch('https://api.kraken.com/0/public/Ticker?pair=XBTUSD');
      if (!r.ok) return null;
      const d = await r.json();
      const usd = parseFloat(d.result.XBTUSD.c[0]);
      return { USD: usd, EUR: usd * 0.92, ARS: usd * 1050 };
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
  if (request.action !== 'getPrices') return;
  fetchBitcoinPrices().then(prices => {
    sendResponse({ prices });
  });
  return true;
});

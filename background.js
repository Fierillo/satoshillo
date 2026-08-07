const coinGeckoUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=ars,usd,eur';
const yadioUrl = 'https://api.yadio.io/exrates/BTC';
const currencies = ['ARS', 'USD', 'EUR'];

async function fetchFromCoinGecko() {
  try {
    const response = await fetch(coinGeckoUrl);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      ARS: data.bitcoin.ars,
      USD: data.bitcoin.usd,
      EUR: data.bitcoin.eur
    };
  } catch {
    return null;
  }
}

async function fetchFromYadio() {
  try {
    const response = await fetch(yadioUrl);
    if (!response.ok) return null;
    const data = await response.json();
    return {
      ARS: data.BTC.ARS,
      USD: data.BTC.USD,
      EUR: data.BTC.EUR
    };
  } catch {
    return null;
  }
}

async function fetchBitcoinPrices() {
  const [coinGeckoPrices, yadioPrices] = await Promise.all([fetchFromCoinGecko(), fetchFromYadio()]);

  const prices = {};
  currencies.forEach(currency => {
    const coinGeckoPrice = coinGeckoPrices && typeof coinGeckoPrices[currency] === 'number' ? coinGeckoPrices[currency] : null;
    const yadioPrice = yadioPrices && typeof yadioPrices[currency] === 'number' ? yadioPrices[currency] : null;
    if (coinGeckoPrice && yadioPrice) prices[currency] = (coinGeckoPrice + yadioPrice) / 2;
    else if (coinGeckoPrice) prices[currency] = coinGeckoPrice;
    else if (yadioPrice) prices[currency] = yadioPrice;
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

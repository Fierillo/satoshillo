# Satoshillo

A Chrome extension that converts ARS, USD, and EUR prices to satoshis in real time on any website.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-F44336?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4CAF50?logo=google&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2021-F7DF1E?logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

## About

Satoshillo is a lightweight Chrome extension that instantly converts fiat prices you encounter while browsing into Bitcoin satoshis. It detects prices on any webpage — whether they're written as `$1.500`, `€2.4B`, or `50 mil millones de pesos` — and shows you the equivalent in sats with a single click.

The goal is to make Bitcoin the default unit of account in your daily browsing, helping you think in sats rather than depreciating fiat currencies.

## Stack

| Technology | Purpose |
|------------|---------|
| ![JS](https://img.shields.io/badge/JavaScript-raw?logo=javascript&logoColor=white&color=F7DF1E) | Extension logic (content script + background) |
| ![Chrome](https://img.shields.io/badge/Chrome_Extension-raw?logo=googlechrome&logoColor=white&color=4285F4) | Platform (Manifest V3) |
| ![CoinGecko](https://img.shields.io/badge/CoinGecko-API-raw?logo=bitcoin&logoColor=white&color=F7931A) | BTC price feed |
| ![Yadio](https://img.shields.io/badge/Yadio-API-raw?color=6C63FF) | BTC/ARS price feed |
| ![CoinCap](https://img.shields.io/badge/CoinCap-API-raw?color=1B1B1B) | BTC price feed |
| ![Binance](https://img.shields.io/badge/Binance-API-raw?logo=binance&logoColor=white&color=F0B90B) | BTC price feed |
| ![Kraken](https://img.shields.io/badge/Kraken-API-raw?color=7B61FF) | BTC price feed |
| ![Pixel Art](https://img.shields.io/badge/Logo-Pixel_Art-raw?color=FF9800) | Satoshi symbol icons (Node.js) |

## Features

- Detects prices on any webpage (with `$`/`€` symbols, currency words, or magnitudes like `76M`, `2.4B`)
- Word magnitudes: `1 million`, `50 billion`, `1 trillion`, `1 mill`, `1 bill`
- Floating menu with live conversion to sats / k sats / M sats / BTC
- Currency inference by context (ARS / USD / EUR)
- Localized number parsing (respects `.` `,` separators based on page language)
- 5 price sources (CoinGecko, Yadio, CoinCap, Binance, Kraken) with robust averaging — if a source fails, the average adjusts automatically
- Pixel-art Satoshi symbol logo

## Installation

### From release (recommended)

1. Download [`satoshillo-v1.0.0.zip`](https://github.com/Fierillo/satoshillo/releases/tag/v1.0.0) from the latest release
2. Unzip the file
3. Open `chrome://extensions/`
4. Enable **Developer mode**
5. Click **Load unpacked**
6. Select the unzipped folder

### From source

```bash
git clone https://github.com/Fierillo/satoshillo.git
```

Then follow steps 3–6 above.

## License

[ISC](LICENSE)

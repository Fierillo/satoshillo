# Satoshillo

A browser extension that converts ARS, USD, and EUR prices to satoshis in real time on any website.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-F44336?logo=googlechrome&logoColor=white)
![Firefox Add-on](https://img.shields.io/badge/Firefox-Add--on-FF7139?logo=firefox&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4CAF50?logo=google&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2021-F7DF1E?logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/License-ISC-blue)

## About

Satoshillo is a lightweight browser extension that instantly converts fiat prices you encounter while browsing into Bitcoin satoshis. It detects prices on any webpage — whether they're written as `$1.500`, `€2.4B`, `USD/JPY 158.48`, or `50 mil millones de pesos` — and shows you the equivalent in sats with a single click.

The goal is to make Bitcoin the default unit of account in your daily browsing, helping you think in sats rather than depreciating fiat currencies.

## Stack

| Technology | Purpose |
|------------|---------|
| ![JS](https://img.shields.io/badge/JavaScript-raw?logo=javascript&logoColor=white&color=F7DF1E) | Extension logic (content script + background) |
| ![Manifest V3](https://img.shields.io/badge/Manifest_V3-raw?logo=google&logoColor=white&color=4285F4) | Cross-browser extension platform |
| ![CoinGecko](https://img.shields.io/badge/CoinGecko-API-raw?logo=bitcoin&logoColor=white&color=F7931A) | BTC price feed |
| ![Yadio](https://img.shields.io/badge/Yadio-API-raw?color=6C63FF) | BTC/ARS price feed |
| ![CoinCap](https://img.shields.io/badge/CoinCap-API-raw?color=1B1B1B) | BTC price feed |
| ![Binance](https://img.shields.io/badge/Binance-API-raw?logo=binance&logoColor=white&color=F0B90B) | BTC price feed |
| ![Kraken](https://img.shields.io/badge/Kraken-API-raw?color=7B61FF) | BTC price feed |
| ![Pixel Art](https://img.shields.io/badge/Logo-Pixel_Art-raw?color=FF9800) | Satoshi symbol icons (Node.js) |

## Features

- Detects prices on any webpage (with `$`/`€` symbols, currency words, or magnitudes like `76M`, `2.4B`)
- Word magnitudes: `1 million`, `50 billion`, `1 trillion`, `1 mill`, `1 bill`
- Forex pair detection: `USD/JPY 158.48`, `EUR/USD 1.0850`
- Floating menu with live conversion to sats / k sats / M sats / BTC
- Currency inference by context (ARS / USD / EUR / forex quote currency)
- Localized number parsing (respects `.` `,` separators based on page language)
- Toggle per site: click the icon to disable on any domain (badge shows "OFF")
- 5 price sources (CoinGecko, Yadio, CoinCap, Binance, Kraken) with robust averaging — if a source fails, the average adjusts automatically
- Pixel-art Satoshi symbol logo

## Installation

### From release (recommended)

1. Download the latest release zip for your browser from [Releases](https://github.com/Fierillo/satoshillo/releases)
2. Unzip the file
3. Follow the instructions for your browser below

### From source

```bash
git clone https://github.com/Fierillo/satoshillo.git
cd satoshillo
node build.js
```

This generates browser-specific builds in `dist/`:

```
dist/
├── chrome/     # Chrome, Brave
├── edge/       # Microsoft Edge
├── brave/      # Brave
└── firefox/    # Firefox
```

### Load in Chrome / Brave / Edge

1. Open `chrome://extensions/` (or `edge://extensions/`)
2. Enable **Developer mode**
3. Click **Load unpacked**
4. Select `dist/chrome/` (or `dist/edge/`, `dist/brave/`)

### Load in Firefox

1. Open `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on**
3. Select `dist/firefox/manifest.json`

## License

[ISC](LICENSE)

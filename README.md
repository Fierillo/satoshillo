# Satoshillo

A browser extension that converts ARS, USD, EUR, and JPY prices to satoshis in real time on any website.

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
| ![Yadio](https://img.shields.io/badge/Yadio-API-raw?color=6C63FF) | Primary BTC/fiat price feed |
| ![Binance](https://img.shields.io/badge/Binance-API-raw?logo=binance&logoColor=white&color=F0B90B) | BTC price feed |
| ![Kraken](https://img.shields.io/badge/Kraken-API-raw?color=7B61FF) | BTC price feed |
| FXRatesAPI / ExchangeRate-API | Live fiat exchange rates |
| ![Pixel Art](https://img.shields.io/badge/Logo-Pixel_Art-raw?color=FF9800) | Satoshi symbol icons (Node.js) |

## Features

- Detects prices on any webpage (with `$`/`€` symbols, currency words, or magnitudes like `76M`, `2.4B`)
- Word magnitudes: `1 million`, `50 billion`, `1 trillion`
- Forex pair detection: `USD/JPY 158.48`, `EUR/USD 1.0850`
- Floating menu with live conversion to sats / k sats / M sats / BTC
- Deterministic currency inference from the local sentence (ARS / USD / EUR / JPY)
- Localized number parsing (respects `.` `,` separators based on page language)
- One DOM extraction per semantic block; no periodic rescanning or site-specific rules
- Toggle per site: click the icon to disable on any domain (badge shows "OFF")
- Priority-based real-rate routes: Yadio, Kraken + ExchangeRate-API, then Binance + FXRatesAPI
- One complete source per update; no averaging and no fixed fiat multipliers
- Automated parser, fallback selection, timeout, and cache-lifecycle tests with Node's built-in test runner
- Pixel-art Satoshi symbol logo

## Price detection

Satoshillo uses one deterministic pipeline instead of page-specific heuristics:

1. Extract visible text once from each semantic block and preserve DOM offsets.
2. Scan numeric tokens and segment the text into sentences and clauses with `Intl.Segmenter`.
3. Classify each number from structural monetary evidence: symbols/currency words, valid forex syntax, or a magnitude connected to a monetary sentence.
4. Check adjacent sentences only when the number is isolated. Ambiguous values are ignored.
5. Map accepted numbers back to their exact text nodes, including layouts split across multiple spans.

Dynamic content is handled by a debounced `MutationObserver`. The observer is disconnected while Satoshillo updates the DOM, preventing self-triggered scan loops.

## Exchange rates

Every update uses one complete source for all supported currencies (ARS, USD, EUR, JPY), following this priority:

- Yadio direct BTC/fiat prices (primary).
- Kraken BTC/USD combined with live ExchangeRate-API rates (first fallback).
- Binance BTC/USDT combined with live FXRatesAPI rates (second fallback).

Sources are never averaged or mixed: the first route returning all four valid rates wins. No fixed fiat multipliers are used. Rates are cached globally, persisted across browser sessions, refreshed every minute, and served as provisional values if the network is temporarily unavailable.

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

Run the automated tests with:

```bash
npm test
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

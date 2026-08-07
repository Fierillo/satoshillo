# Satoshillo

Convierte precios en ARS, USD y EUR a satoshis en tiempo real en cualquier página web.

![Chrome Extension](https://img.shields.io/badge/Chrome-Extension-F44336?logo=googlechrome&logoColor=white)
![Manifest V3](https://img.shields.io/badge/Manifest-V3-4CAF50?logo=google&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-ES2021-F7DF1E?logo=javascript&logoColor=white)
![License](https://img.shields.io/badge/License-MIT-green)

## Stack

| Tecnología | Uso |
|------------|-----|
| ![JS](https://img.shields.io/badge/JavaScript-raw?logo=javascript&logoColor=white&color=F7DF1E) | Lógica de la extensión (content script + background) |
| ![Chrome](https://img.shields.io/badge/Chrome_Extension-raw?logo=googlechrome&logoColor=white&color=4285F4) | Plataforma (Manifest V3) |
| ![CoinGecko](https://img.shields.io/badge/CoinGecko-API-raw?logo=bitcoin&logoColor=white&color=F7931A) | Precio BTC/USD |
| ![Yadio](https://img.shields.io/badge/Yadio-API-raw?color=6C63FF) | Precio BTC/ARS |
| ![Pixel Art](https://img.shields.io/badge/Logo-Pixel_Art-raw?color=FF9800) | Iconos generados en Node.js |

## Funcionalidades

- Detecta precios en páginas web (con símbolo `$`/`€`, palabras clave o magnitudes como `76M`, `2.4B`)
- Magnitudes en palabras: `1 millón`, `50 mil millones`, `1 billón`, `1 trillón`
- Menú flotante con conversión en vivo a sats/k sats/M sats/BTC
- Inference de moneda por contexto (ARS/USD/EUR)
- Parseo localizado de números (separadores `.` `,` según idioma)
- Logo pixel-art del símbolo Satoshi

## Instalación

```bash
git clone https://github.com/Fierillo/satoshillo.git
```

1. Abrí `chrome://extensions/`
2. Activá "Modo desarrollador"
3. Clickeá "Cargar extensión sin empaquetar"
4. Seleccioná la carpeta `satoshillo`

## Licencia

[MIT](LICENSE)

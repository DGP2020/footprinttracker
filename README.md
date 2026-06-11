# 🌿 EcoStep — Kerala Carbon Footprint Tracker

A lightweight, zero-dependency web application that helps individuals across Kerala's 14 districts track, understand, and reduce their daily carbon emissions through contextual activity logging, localized insights, and intelligent recommendations.

![Status](https://img.shields.io/badge/status-active-brightgreen) ![Size](https://img.shields.io/badge/size-<150KB-blue) ![Dependencies](https://img.shields.io/badge/dependencies-0-green) ![PWA](https://img.shields.io/badge/PWA-offline--ready-purple)

---

## ✨ Features

| Feature | Description |
|---------|-------------|
| 📊 **Dashboard** | Real-time CO₂ summary with progress ring, streak counter, and national average comparison |
| 🚌 **Transport Logging** | District-aware transport modes — Kochi Metro, Water Metro, KSRTC, auto-rickshaw, and more |
| 🍽️ **Diet Tracking** | Visual meal selector with Kerala-specific options (fish, veg, vegan, chicken, beef) |
| ⚡ **Energy Monitoring** | KSEB electricity, LPG, and AC usage tracking with real-time CO₂ preview |
| 💡 **Smart Insights** | Context-aware, impact-ranked reduction tips personalized to your district and habits |
| 📈 **Charts** | Animated progress ring, 7-day stacked bar chart, and category donut — all hand-coded |
| 📥 **Data Export** | Download your data as CSV or JSON with date range filtering |
| 🔒 **Secure Profiles** | 6-digit PIN with PBKDF2 hashing, AES-GCM encrypted storage, rate-limited login |
| 🔑 **PIN Reset** | 3 security questions with hashed answers for self-service PIN recovery |
| 📱 **PWA** | Installable on phones, works fully offline after first visit |
| ♿ **Accessible** | WCAG 2.1 AA — ARIA labels, focus management, screen reader support, reduced motion |
| 🧪 **Tested** | 50+ built-in unit tests, run via `?test=true` query parameter |

---

## 🚀 Getting Started

### Option 1: Open directly
Simply open `index.html` in any modern browser.

> **Note:** For full AES-GCM encryption, serve via a local HTTP server (required for `crypto.subtle`). A simple fallback is used when opened from `file://`.

### Option 2: Local server (recommended)
```bash
# Python
python -m http.server 8000

# Node.js
npx serve .

# Then visit http://localhost:8000
```

### Option 3: Install as PWA
1. Open the app in Chrome/Edge
2. Click the install prompt in the address bar
3. The app works offline after first load

---

## 🧪 Running Tests

Open the app with the test query parameter:

```
http://localhost:8000/index.html?test=true
```

This runs 50+ unit tests across all modules and displays results in a styled overlay. Results are also logged to the browser console in JSON format.

---

## 📁 Project Structure

```
footprinttracker/
├── index.html           ← Single entry point with CSP headers
├── manifest.json        ← PWA manifest
├── sw.js                ← Service worker (offline-first)
├── css/
│   └── style.css        ← Design system (dark/light, glassmorphism)
├── js/
│   ├── data.js          ← Emission factors, 14 Kerala districts
│   ├── a11y.js          ← Accessibility utilities
│   ├── storage.js       ← AES-GCM encrypted localStorage
│   ├── auth.js          ← PIN auth, security questions, rate limiting
│   ├── export.js        ← CSV & JSON export
│   ├── tracker.js       ← Activity input UI
│   ├── insights.js      ← Smart reduction tips engine
│   ├── charts.js        ← Canvas/SVG charts
│   ├── tests.js         ← Built-in test suite
│   └── app.js           ← Main controller
├── README.md
└── LICENSE
```

**Total size: ~120 KB** — zero npm dependencies, zero build step.

---

## 🌍 Emission Factor Sources

| Source | Used For |
|--------|----------|
| IPCC AR6 | Diet emission factors (per-meal estimates) |
| CEA India Grid Report | KSEB electricity factor (0.82 kg CO₂/kWh) |
| Indian Transport Studies | Vehicle per-km emission estimates |
| KMRL Reports | Kochi Metro emission estimates |
| Standard LPG Data | LPG combustion factor (2.98 kg CO₂/kg) |

> ⚠️ These are **approximations** for educational/awareness purposes, not certified audit values.

---

## 🔒 Security Design

- **PIN**: 6-digit, hashed with PBKDF2 (100,000 iterations, SHA-256)
- **Data encryption**: AES-256-GCM via Web Crypto API
- **Key management**: Random DEK wrapped by PIN-derived KEK and question-derived KEK
- **Rate limiting**: 5 failed attempts → 60-second lockout
- **Auto-logout**: Session expires after 14 days of inactivity
- **Input sanitization**: All user strings HTML-escaped before DOM insertion
- **CSP**: Content-Security-Policy meta tag blocks inline scripts
- **No eval()**: Zero use of eval, innerHTML with unsanitized data, or document.write

---

## ♿ Accessibility (WCAG 2.1 AA)

- Skip navigation link
- ARIA roles: `tablist`, `tab`, `tabpanel`, `status`, `alert`, `list`, `img`
- `aria-live` regions for dynamic announcements
- Focus trapping in modals
- Visible focus indicators (3px outline on `:focus-visible`)
- `@media (prefers-reduced-motion: reduce)` — disables all animations
- `@media (prefers-contrast: more)` — increases borders/contrast
- All font sizes in `rem` (respects browser zoom)
- Minimum 44×44px touch targets
- Chart alternative text via `aria-label` + hidden data tables

---

## 📄 License

See [LICENSE](./LICENSE) for details.
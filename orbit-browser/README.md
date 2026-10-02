# Orbit Browser

A custom desktop web browser built on **Electron**, so every tab is a real, sandboxed **Chromium** page - not an iframe. Sites that refuse to be embedded (X-Frame-Options / CSP `frame-ancestors`) open normally because tabs use top-level navigation. There is no AI in this project.

## Run
```bash
npm install
npm start            # Linux sandbox problems? use: npm run start:nosandbox
npm test             # offline syntax + URL-validator tests
npm run dist         # build an installer (Windows/macOS/Linux) with electron-builder
```

## Features
- **Tabs**: new, close, switch, duplicate, reopen closed, background tabs, middle-click close, overflow scrolling, spinner, favicon, title. Each tab is its own Chromium view; switching never reloads others.
- **Omnibox**: URL-vs-search detection (ports, paths, query, fragments, unicode/punycode, localhost/IP), suggestions from bookmarks + history, unsafe schemes blocked.
- **Search providers**: DuckDuckGo, Bing, Google, Wikipedia, Custom (adapter map in `src/main/url.js`).
- **Navigation**: back/forward/reload/stop/home with correct enabled states; all shortcuts from the spec (Ctrl+T/W/Shift+T/L/R/D/H/J, Alt+Left/Right, Esc).
- **Bookmarks** (folders, bar, edit, search, import/export), **History** (search, delete, clear by range), **Downloads** (progress, speed, pause/resume/cancel/retry/open, sanitized names).
- **Permissions** prompts per origin (camera, mic, location, notifications, clipboard), persisted and revocable.
- **Security indicator** from real Chromium certificate verification; HTTPS-only mode; sandboxed renderers; context isolation; navigation guard; pop-up rate limiting.
- **Network**: Direct / HTTP / HTTPS / SOCKS5 proxy you configure, connection tester, optional automatic fallback to a second profile you configure, credentials encrypted with the OS keychain (`safeStorage`) and never logged. Status shows **only** what a real test request verified.
- **VPN**: read-only detection of system VPN interfaces. Orbit does not create or control VPNs.
- **Private windows** (in-memory session, no history). **Diagnostics** (`browser://diagnostics`). Themes: light / dark / system. Internal `browser://` pages.

## Layout
```
src/main/      main.js (windows, tabs, network, downloads, permissions, IPC) · url.js · store.js
src/preload/   ui.js (chrome API) · page.js (API only for browser:// pages)
src/ui/        browser chrome (tabs, toolbar, panels)
src/pages/     browser:// internal pages
scripts/       test.js
```

## Honest limitations
- Pop-up blocking is heuristic (Electron does not expose "user gesture"): link-opened tabs are allowed, script pop-ups are rate-limited.
- Cookies/site data can only be cleared for all time, not by time range.
- Extensions, sync, password manager, PDF viewer UI and Widevine/DRM media are not included (stock Electron lacks Widevine).
- Orbit cannot act as a system VPN and does not bypass school/work filters or website security policies.

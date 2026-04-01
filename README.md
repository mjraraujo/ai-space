# AI Space

Privacy-first personal AI environment that runs entirely on your device.

## What is this?

AI Space is a progressive web app (PWA) that brings AI to your phone and browser without sending your data anywhere. Models run locally via WebGPU, conversations are encrypted on-device, and you control every bit of data.

## Try it

```bash
git clone https://github.com/mjraraujo/ai-space.git
cd ai-space
npm install
npm run dev
```

Open `http://localhost:5173` in Chrome 113+ (WebGPU required for local mode).

## Features

- **Local AI inference** via WebGPU (web-llm) — no server needed
- **Encrypted storage** — AES-256-GCM with device-derived keys
- **Three operating modes** — local, hybrid, cloud
- **Trust dashboard** — see exactly where your data lives
- **Audit log** — every AI action is logged transparently
- **iOS Shortcuts integration** — automate with Siri
- **Share target** — share content directly to AI Space
- **Offline-first** — full service worker caching

## Architecture

```
┌──────────────────────────────────────────┐
│                 UI Layer                  │
│          Pure DOM, no framework           │
├──────────────────────────────────────────┤
│               App Controller             │
│     State machine, event wiring          │
├──────────┬───────────┬───────────────────┤
│ AI Engine│  Memory   │    Shortcuts      │
│ (WebGPU) │(IndexedDB)│  (iOS relay)      │
│          │ AES-256   │                   │
├──────────┴───────────┴───────────────────┤
│           Service Worker                  │
│    Cache-first, share target, offline     │
├──────────────────────────────────────────┤
│             Audit Logger                  │
│     Every action logged transparently     │
└──────────────────────────────────────────┘
```

## Three Modes

| Mode | Data Location | AI Provider | Privacy |
|------|--------------|-------------|---------|
| **Local** | Device only | WebGPU (on-device) | Maximum |
| **Hybrid** | Device + approved calls | Local first, cloud assist | High (you approve each call) |
| **Cloud** | Device + cloud | Cloud API | Standard |

## Self-hosting

1. Clone and build:
   ```bash
   npm install
   npm run build
   ```

2. Serve the `dist/` directory with any static file server:
   ```bash
   npx serve dist
   ```

3. For full PWA features, serve over HTTPS with these headers:
   ```
   Cross-Origin-Opener-Policy: same-origin
   Cross-Origin-Embedder-Policy: require-corp
   ```

## Supported Models

- **Qwen 2.5 0.5B** (~350MB) — Default, good balance
- **Llama 3.2 1B** (~700MB) — Better reasoning
- **SmolLM2 360M** (~200MB) — Fastest, basic tasks

## Privacy

- Zero-knowledge architecture: we never see your data
- All conversations encrypted with AES-256-GCM
- Encryption keys derived from device fingerprint via PBKDF2
- No analytics, no tracking, no telemetry
- Full audit log of every AI action
- See [Privacy Documentation](docs/privacy.md) for details

## License

MIT — see [LICENSE](LICENSE)

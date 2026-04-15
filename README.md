<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="https://capsule-render.vercel.app/api?type=venom&height=300&color=0:0a0a0a,100:1a1a2e&text=AI%20SPACE&fontSize=90&fontColor=ffffff&animation=fadeIn&stroke=333333&strokeWidth=1">
    <img src="https://capsule-render.vercel.app/api?type=venom&height=300&color=0:0a0a0a,100:1a1a2e&text=AI%20SPACE&fontSize=90&fontColor=ffffff&animation=fadeIn&stroke=333333&strokeWidth=1" width="100%" alt="AI SPACE">
  </picture>
</p>

<h2 align="center">Your space. Your AI. Your device.</h2>

---

<p align="center">
  <a href="https://mjraraujo.github.io/ai-space/"><img src="https://img.shields.io/badge/LIVE_DEMO-ENTER_YOUR_SPACE-white?style=for-the-badge&labelColor=0a0a0a" /></a>
  <img src="https://img.shields.io/badge/LICENSE-MIT-A2CC00?style=for-the-badge&labelColor=333" />
  <img src="https://img.shields.io/badge/INSTALL-NO_APP_STORE-FFD700?style=for-the-badge&labelColor=333" />
  <img src="https://img.shields.io/badge/PRIVACY-ZERO_TRUST-9B51E0?style=for-the-badge&labelColor=333" />
  <img src="https://img.shields.io/badge/RUNS-100%25_LOCAL-5865F2?style=for-the-badge&labelColor=333" />
</p>

---

**The personal AI that lives entirely on your phone.** No cloud. No account. No app store. Open a link, and it's yours — forever. AI Space runs a local language model directly in your browser using WebGPU, encrypts everything on-device with AES-256-GCM, and never sends a single byte of your data anywhere.

It's not an assistant with a personality. It's a **space** — a private environment where AI works for you, controlled by you, visible to you. Switch to airplane mode. It still works. Delete your browser history. It's still there. That's the promise.

---

| | |
|:---|:---|
| **No install, no app store** | Open a URL. Add to Home Screen. That's the install. No App Store review, no approval, no download. One link and you're running a full AI environment on your phone. Share the link — anyone can have their own in 30 seconds. |
| **Runs locally on your hardware** | AI models execute directly on-device via WebGPU. Qwen 0.5B at ~25 tok/s on iPhone 15 Pro. No server, no API calls, no latency. Your phone's GPU does the work. |
| **Encrypted by default** | Every conversation, every memory, every preference — encrypted with AES-256-GCM. Keys derived via PBKDF2 from your device. Not even we can read your data, because we never have it. |
| **iOS Shortcuts as device relay** | Your AI gets eyes and hands through Apple Shortcuts. Summarize clipboard, read calendar, draft replies — all piped through native iOS automation. Install skills with one tap. |
| **Three trust modes** | **Local**: zero network, ever. **Hybrid**: local-first, cloud when you approve. **Cloud**: full power, your choice. A trust shield shows exactly what mode you're in and how many cloud calls were made. |
| **Offline forever** | Service Worker caches everything — UI, model weights, memory. First visit downloads it all. After that, airplane mode is full-power mode. Works on a plane, in a tunnel, off the grid. |
| **Full audit trail** | Every context read, every suggestion, every action, every cloud call — logged and browseable. Nothing happens in the dark. You can export or delete the entire trail at any time. |

---

### Try it now

Visit **[mjraraujo.github.io/ai-space](https://mjraraujo.github.io/ai-space/)** on your phone. That's it.

Or self-host:

```bash
git clone https://github.com/mjraraujo/ai-space.git
cd ai-space
npm install
npm run build
npx serve dist
```

Serve over HTTPS with `Cross-Origin-Opener-Policy: same-origin` and `Cross-Origin-Embedder-Policy: credentialless` headers for WebGPU support.

---

### Models

| Model | Size | Speed (iPhone 15 Pro) | Best for |
|:------|:-----|:---------------------|:---------|
| **Qwen 2.5 0.5B** | ~350 MB | ~25 tok/s | Default — great balance |
| **SmolLM2 360M** | ~200 MB | ~30 tok/s | Ultra-fast, basic tasks |
| **Llama 3.2 1B** | ~700 MB | ~12 tok/s | Better reasoning |

All models quantized to 4-bit. Downloaded once, cached permanently in Origin Private File System.

---

### Architecture

```
┌─────────────────────────────────────────────────┐
│              Landing / Chat / Settings           │
│             Pure DOM, zero frameworks            │
├─────────────────────────────────────────────────┤
│                  App Controller                  │
│      State machine · Mode routing · Events       │
├────────────┬──────────────┬─────────────────────┤
│  AI Engine │   Memory     │     Shortcuts        │
│  (WebGPU)  │ (IndexedDB)  │   (iOS relay)        │
│  web-llm   │  AES-256-GCM │  x-callback-url      │
├────────────┴──────────────┴─────────────────────┤
│              Service Worker                      │
│    Eternal cache · Share target · Background sync │
├─────────────────────────────────────────────────┤
│                Audit Logger                      │
│       Every action logged · Exportable           │
└─────────────────────────────────────────────────┘
```

---

### Three Modes

| | Local (Zero Trust) | Hybrid (Smart) | Cloud (Max Power) |
|:---|:---|:---|:---|
| **Data** | Device only | Device + approved calls | Device + cloud |
| **AI** | On-device WebGPU | Local first, cloud assist | Cloud API |
| **Network** | None. Ever. | Selective, you approve | Always |
| **Privacy** | Maximum | High | Standard |
| **Speed** | Instant | Adaptive | Fastest |

---

### Skills

AI Space connects to your phone through iOS Shortcuts. Install skills with one tap:

| Skill | What it does |
|:------|:-------------|
| **Summarize Clipboard** | Reads what you copied, summarizes it instantly |
| **Morning Briefing** | Pulls calendar + reminders, gives you your day in 30 seconds |
| **Reply Drafter** | Takes a message, drafts a reply that sounds like you |
| **Quick Capture** | Voice → text → stored in your AI memory |
| **Email Summary** | Summarizes recent emails, extracts action items |

Build your own skills with the [Skills API](docs/skills-api.md).

---

### Privacy

This isn't a privacy policy. It's an architecture decision.

- **Zero-knowledge**: we never see, store, or process your data
- **AES-256-GCM** encryption on all stored data
- **PBKDF2** key derivation — keys never leave the device
- **No analytics**. No tracking pixels. No telemetry. No fingerprinting.
- **Audit log** proves what happened — export it, verify it, delete it
- **Local mode** makes zero network calls — verifiable in browser DevTools

Read the full [Privacy Documentation](docs/privacy.md).

---

### Documentation

- [Architecture](docs/architecture.md) — system design, data flow, security model
- [Privacy Whitepaper](docs/privacy.md) — encryption specs, threat model, guarantees
- [Skills API](docs/skills-api.md) — build custom skills and shortcuts
- [Product Vision](docs/vision/) — the full vision docs

---

<p align="center">
  <sub>Open source. MIT License. Built for people who want AI without surveillance.</sub>
</p>

<p align="center">
  <sub>© 2026 <a href="https://github.com/mjraraujo">mjraraujo</a></sub>
</p>

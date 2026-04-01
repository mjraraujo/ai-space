# AI Space — V2 Roadmap

## V1 (current) — PWA + Local AI
- Local inference via WebGPU (SmolLM2, Qwen, Llama, Phi)
- Cloud providers (ChatGPT Plus OAuth, OpenAI, Claude, Gemini)
- Voice conversation mode (push-to-talk + continuous)
- Encrypted local memory (AES-256-GCM)
- Persistent chat history
- Onboarding wizard
- Offline-first PWA

---

## V2 — Device Relay + Real Integrations

### 1. iOS Shortcuts Relay
The phone becomes the AI's hands via Apple Shortcuts.

**How it works:**
- PWA generates downloadable .shortcut files (signed plist)
- Each shortcut pipes data TO the PWA via URL callback: `https://domain/?skill=ID&data=BASE64`
- PWA processes the data and can send commands BACK via clipboard + shortcut trigger

**Skills to ship:**
- `summarize-clipboard` — reads clipboard, sends to AI, shows summary
- `morning-briefing` — grabs calendar + reminders → AI summarizes your day
- `reply-drafter` — shares text → AI drafts a reply
- `email-digest` — forwards emails → AI extracts action items
- `quick-note` — voice dictation → stored in AI memory

**Automations (run without user tap):**
- When iMessage received → forward to AI for context
- When email arrives → auto-summarize
- Time-based → morning/evening briefing
- Location-based → "you're at the office" context switch

**Implementation:**
- Build shortcut generator that creates proper Apple Shortcut plist files
- Host generated shortcuts as downloadable links from the PWA
- Build the callback receiver (URL param parser + action executor)
- Test with real iOS Shortcuts app

### 2. Browser Relay
Turn the browser into a device relay — read web content, fill forms, navigate.

**Capabilities:**
- Content extraction from any open tab (via Share Target API)
- Form filling assistance (clipboard injection)
- Web page summarization (user shares URL → AI reads it)
- Screenshot analysis (user screenshots → shares to AI → gets description)

**Implementation:**
- Enhance Share Target to handle URLs, images, files
- Build a content parser that extracts readable text from shared URLs
- Add "web actions" — AI suggests what to do with shared content

### 3. iOS Device Relay (Advanced)
Deep device integration via Shortcuts + MDM-style profiles.

**Context capture (via Shortcuts automations):**
- Notification forwarding (limited — iMessage, Mail)
- Calendar events and reminders
- Contacts metadata
- Current location
- Battery/connectivity status
- Focus mode (Do Not Disturb, Work, etc.)

**Action execution:**
- Create reminders and calendar events
- Send messages (via Shortcuts)
- Set timers and alarms
- Control smart home (HomeKit via Shortcuts)
- Open apps and deep links

**Trust model:**
- Every action requires the shortcut to run (user sees it)
- High-risk actions show confirmation in Shortcuts
- Full audit log in PWA of what was captured and executed
- User can revoke any skill by deleting the shortcut

### 4. Enhanced Voice
- Integrate with ElevenLabs or OpenAI TTS API for natural voices (cloud mode)
- Local Whisper WASM for better speech-to-text offline
- Voice cloning — AI learns to sound like a preferred style
- Multi-language support (detect language, switch automatically)

### 5. Agentic Capabilities
- Task decomposition — break complex requests into steps
- Action suggestions — chips below AI response ("Create reminder", "Draft reply", "Save to notes")
- Proactive assistance — AI notices patterns and suggests before asked
- Multi-step workflows — "Plan my trip" → research + calendar + reminders + packing list

### 6. Plugin System
- Skill SDK for third-party developers
- Sandboxed execution (skills run in iframe)
- Skill marketplace in the PWA
- Revenue sharing for skill creators

---

## V3 — AI-Native Phone Layer
- MDM profile for deeper device access
- Background execution via Shortcuts automations
- Cross-app context (what app is open, what's on screen)
- Proactive notifications ("You have a meeting in 10 min, here's the prep")
- Offline-first with smart cloud escalation
- The phone stops feeling like a bag of apps and starts feeling like one coherent environment

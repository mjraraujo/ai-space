# Architecture

## Overview

AI Space is a client-side PWA with zero server dependencies. All computation and storage happens in the browser.

## Components

### UI Layer (`src/ui.js`)
Pure DOM manipulation. No framework, no virtual DOM. Three views managed via CSS class toggling:
- **Onboarding**: First-visit experience with model download progress
- **Chat**: Message list with streaming responses
- **Settings**: Mode selector, trust dashboard, data management

### App Controller (`src/app.js`)
Central state machine managing application lifecycle:
```
onboarding → downloading → ready → chat
```
Coordinates all modules, wires event listeners, handles URL-based inputs (share target, shortcuts).

### AI Engine (`src/ai-engine.js`)
WebGPU-based local inference using web-llm (MLC):
- Loads quantized models directly in the browser
- Streams token-by-token responses
- Falls back gracefully when WebGPU is unavailable

### Memory (`src/memory.js`)
Encrypted IndexedDB storage:
- **Encryption**: AES-256-GCM via Web Crypto API
- **Key derivation**: PBKDF2 (100k iterations) from device fingerprint
- **Stores**: conversations, preferences, audit_log, shared_content
- All data encrypted at rest, decrypted only in memory during use

### Audit Logger (`src/audit.js`)
Transparent logging of every AI action:
- `context_read` — when user input is processed
- `suggestion` — when AI generates a response
- `action` — when AI performs an action
- `cloud_call` — when data is sent to cloud (hybrid/cloud mode)
- `approval` — when user approves a cloud action
- `model_load` — when a model is loaded

### Shortcuts (`src/shortcuts.js`)
iOS Shortcuts integration:
- Generates `shortcuts://` install URLs
- Parses callback parameters from URL
- Builds prompts from skill definitions

### Service Worker (`sw.js`)
- Cache-first strategy for app shell
- Separate cache for model weights
- Share target POST handler via IndexedDB
- Versioned caching with automatic cleanup

## Data Flow

```
User Input → App Controller → AI Engine (local) → Streaming Response → UI
                ↓                                        ↓
            Audit Log                              Memory (encrypted)
                ↓
         Trust Dashboard
```

## Security Model

1. **At rest**: All IndexedDB data encrypted with AES-256-GCM
2. **Key derivation**: PBKDF2 with device fingerprint as input material
3. **In transit**: No network calls in local mode
4. **Audit**: Every action logged with type, timestamp, and mode
5. **User control**: Export or delete all data at any time

## Shortcut Relay Protocol

1. iOS Shortcut captures input (clipboard, dictation, etc.)
2. Opens AI Space URL with `?skill=<id>&input=<data>`
3. App controller detects skill parameter
4. Shortcuts module maps skill ID to prompt template
5. Combined prompt sent to AI engine
6. Response displayed in chat

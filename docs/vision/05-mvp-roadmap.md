# AI Space — MVP Roadmap

## Recommended MVP
iOS-first, privacy-first AI layer for the phone.

## V1 capabilities
- local ML inference via MLX Swift
- context injection via iOS Share Extension and Clipboard
- workflow triggers via Siri and App Intents
- draft replies
- Approval Center dashboard
- audit log
- encrypted memory vault

## 12-week implementation shape

### Phase 0 — Week 1-2
- Product requirements document (PRD)
- Architecture doc (Swift SPM, MLX)
- iOS Module skeleton (AISpaceUI, AISpaceRelay, Share Extension)
- Risk model & Action-state model

### Phase 1 — Week 3-5
- SwiftUI mobile shell & Approval center UI
- Local models integration (Llama 8B / MLX)
- DeviceRelay protocols implementation
- Secure encrypted vault (Keychain/SwiftData)

### Phase 2 — Week 6-8
- iOS Share Extension ingress parsing
- Apple Shortcuts integration (`AppIntent` generation)
- Prompt/Completion loop UI

### Phase 3 — Week 9-10
- Biometric gates (FaceID/TouchID)
- End-to-end execution of a "Summarize and Draft Task" loop
- Action State enforcement testing

### Phase 4 — Week 11-12
- UI Polish and Apple App Store compliance
- Observability and local telemetry
- Threat model review

## Explicit non-goals for V1
- full financial automation
- universal app automation guarantees
- new mobile operating system
- broad platform ecosystem on day one

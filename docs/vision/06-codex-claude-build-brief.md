# AI Space — Build Brief for Codex or Claude Code

Build a product architecture and implementation plan for a mobile-first platform called **AI Space**.

## Vision
AI Space is a privacy-first personal AI environment that uses the smartphone as the trusted execution layer. It should begin as an app-layer assistant and evolve toward an AI-native operating system model.

## Core principles
- local-first where possible
- no training on user data by default
- user-controlled permissions
- biometrics for sensitive approvals
- tool mode or assistant mode selectable by the user
- low-latency voice/text experience
- phone acts as the trust anchor, not raw API key management by the user

## V1 scope
- Android-first MVP
- summarize notifications/messages
- extract tasks and reminders
- draft replies
- assist with guided cross-app actions
- keep encrypted local memory
- maintain a full audit log of observed context, suggestions, and executed actions

## Need from the coding agent
1. Product requirements doc
2. System architecture
3. Module breakdown
4. Threat model
5. MVP tech stack
6. Repo structure
7. Milestone plan for 12 weeks
8. API/interface contracts
9. Local vs cloud inference strategy
10. Risk register with mitigations

## Constraints
- optimize for demoability and realistic delivery
- assume a small founding team
- design for future plugin architecture
- avoid overpromising unsupported iOS/Android automation capabilities

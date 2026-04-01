# AI Space — Device Relay

## Definition
The Device Relay is the trusted bridge between the user's phone and the AI Space brain.

AI Space = planner / reasoning layer
Device Relay = eyes, ears, hands, and trust channel

## Core responsibilities

### 1. Context capture
With permission, observe:
- notifications
- current screen/app context
- voice input
- camera input
- clipboard
- selected text/share input
- calendar/contact/task metadata

### 2. Intent handoff
Convert user requests into structured execution context, including:
- active app
- visible data
- permission scope
- risk level
- biometric requirement

### 3. Local execution
Handle:
- app launch
- deep links
- navigation support
- controlled text fill
- clipboard injection
- accessibility actions
- overlay guidance

### 4. Security enforcement
Enforce:
- action scopes
- biometrics for high-risk actions
- secure storage
- policy rules

### 5. Audit logging
Record:
- what was read
- what stayed local
- what was sent to cloud
- what was suggested
- what was executed
- what required approval

## Execution paths
1. Native integrations
2. Deep links / intents
3. Accessibility automation
4. Human-in-the-loop guidance

## Preferred implementation strategy
Hybrid relay:
- local voice and routing
- local risk scoring
- local secure state
- optional cloud reasoning for harder tasks

## Best V1
Android-first relay with:
- notification listener
- voice I/O
- local routing
- accessibility-guided execution
- biometric gate
- encrypted local vault
- audit log

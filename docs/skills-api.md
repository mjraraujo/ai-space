# Skills API

## Overview

Skills are automations that connect AI Space to iOS Shortcuts and other automation platforms. Each skill defines a prompt template and input handling.

## Background Runtime Capability

AI Space now includes a local-first background runtime (beta) that runs in a Web Worker as a mini virtual terminal.

- Location: Settings -> Background Runtime (Beta)
- Execution model: non-blocking background job with live logs
- Script model: restricted DSL commands (no arbitrary JavaScript execution)
- Runtime power levels:
  - `Strict`: restricted DSL interpreter (default)
  - `Trusted`: executes script with higher local power for advanced users
- DSL commands:
  - `LOG <text>`
  - `RUN <terminal-command> [-> var]` where terminal commands are: `help`, `now`, `echo`, `wait`, `fetch`, `json`
  - `WAIT <ms>`
  - `NAVIGATE <url>`
  - `RETURN <text>` / `RETURNJSON <json>`
  - Variable interpolation with `{{var.path}}`
- Presets: health check, relay artifact builder, workflow audit snapshot, and navigate flow

This runtime is browser-compiled and sandboxed to web APIs, and does not execute host shell commands directly. Arbitrary JavaScript is blocked in `Strict` mode and allowed only in `Trusted` mode.

### Local Model Skill Routing

Relay and Runtime are also integrated as local-model skills triggered by chat intent.

- Runtime examples:
  - "run runtime health check"
  - "run runtime relay artifact"
  - "stop runtime"
  - custom script in code block with "run runtime"
- Relay examples:
  - "create relay for browser web extract"
  - "create relay to draft reply"
  - "create a relay workflow plan for my trip"
  - "send relay now"

### Workflow Studio (Imported Advanced Skill)

AI Space now includes `workflow-studio`, a high-complexity local-first skill inspired by the bundled skill architecture from the imported source bundle.

- Trigger it from chat with prompts like:
  - `create a skill for my weekly review`
  - `show my saved skills`
  - `workflow studio: plan my next launch checklist`
- Or trigger it from iOS Shortcuts with `?skill=workflow-studio&data=BASE64`
- Output shape: Goal, Inputs, Workflow Steps, Approval Checkpoints, Success Criteria, and `SkillManifestJSON`

When detected, these intents execute locally in the app controller before normal local inference.

## Local Internet Assist

The local model can optionally consult internet context when online:

- Setting: `Local Internet Assist`
- Behavior: fetches lightweight web context (Wikipedia OpenSearch) and injects it into the local request context
- Policy: still local-first and optional (no cloud API key required)

## Skill Manifest

Each skill is defined with the following structure:

```javascript
{
  id: 'skill-id',              // Unique identifier (kebab-case)
  name: 'Human Readable Name', // Display name
  description: 'What it does', // Short description
  icon: 'sf.symbol.name',      // SF Symbol identifier for iOS
  prompt: 'Template prompt:',  // System prompt prepended to input
  shortcutActions: [            // iOS Shortcut action sequence
    { type: 'getClipboard' },
    { type: 'openURL', template: '{{APP_URL}}?skill={{ID}}&input={{CLIPBOARD}}' }
  ]
}
```

## Built-in Skills

| ID | Name | Description |
|----|------|-------------|
| `summarize-clipboard` | Summarize Clipboard | Summarize clipboard contents |
| `morning-briefing` | Morning Briefing | Daily briefing and priorities |
| `reply-drafter` | Reply Drafter | Draft a reply to a message |
| `quick-capture` | Quick Capture | Capture a note or thought |
| `quick-note` | Quick Note | Voice/text quick note saved locally |
| `calendar-sync` | Calendar Sync | Summarize upcoming events and conflicts |
| `workflow-studio` | Workflow Studio | Turn a complex routine into a reusable, approval-aware local skill |

## Protocol

### Invocation Flow

1. **Trigger**: User runs an iOS Shortcut (via Siri, widget, etc.)
2. **Capture**: Shortcut captures input (clipboard, dictation, manual entry)
3. **Relay**: Shortcut opens AI Space URL with encoded parameters
4. **Parse**: `Shortcuts.parseIncoming()` extracts skill ID and input
5. **Build**: `Shortcuts.buildPrompt()` combines skill prompt template with input
6. **Execute**: App controller sends the built prompt to the AI engine
7. **Display**: Response appears in the chat interface

### URL Parameters

```
https://your-domain/?skill=<skill-id>&input=<url-encoded-input>
```

| Parameter | Required | Description |
|-----------|----------|-------------|
| `skill` | Yes | Skill identifier |
| `input` | No | User input text (URL-encoded) |
| `time` | No | Timestamp for time-based skills |

### Installation URL

Generate an iOS Shortcuts installation URL:

```javascript
const shortcuts = new Shortcuts();
const url = shortcuts.generateInstallURL('summarize-clipboard');
// Returns: shortcuts://x-callback-url/open?name=...
```

## Creating Custom Skills

To add a new skill, add an entry to the `SKILLS` object in `src/shortcuts.js`:

```javascript
'my-custom-skill': {
  id: 'my-custom-skill',
  name: 'My Custom Skill',
  description: 'Does something custom',
  icon: 'star',
  prompt: 'Your prompt template here:',
  shortcutActions: [
    { type: 'getClipboard' },
    { type: 'openURL', template: '{{APP_URL}}?skill=my-custom-skill&input={{CLIPBOARD}}' }
  ]
}
```

### Prompt Design Tips

1. Be specific about the desired output format
2. Keep prompts concise — small models have limited context windows
3. Include examples if the task is complex
4. End prompts with a colon to signal where user input begins

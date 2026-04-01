# Skills API

## Overview

Skills are automations that connect AI Space to iOS Shortcuts and other automation platforms. Each skill defines a prompt template and input handling.

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
| `email-summary` | Email Summary | Summarize and extract action items from email |

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

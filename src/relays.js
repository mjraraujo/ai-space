/**
 * Relay Hub - Unified relay + artifact preset builder
 * Supports local-first control prompts for: shortcuts, browser, device
 */

const RELAYS = {
  shortcuts: {
    id: 'shortcuts',
    name: 'iOS Shortcuts Relay',
    description: 'Use iOS automations/shortcuts as execution layer.'
  },
  browser: {
    id: 'browser',
    name: 'Browser Relay',
    description: 'Use shared web content and browser actions.'
  },
  device: {
    id: 'device',
    name: 'Device Relay',
    description: 'Use device context and action intents.'
  }
};

const ACTIONS = {
  summarize: {
    id: 'summarize',
    label: 'Summarize input',
    relays: ['shortcuts', 'browser', 'device'],
    intent: 'Summarize incoming content and return key points.'
  },
  draft_reply: {
    id: 'draft_reply',
    label: 'Draft a reply',
    relays: ['shortcuts', 'browser', 'device'],
    intent: 'Draft a concise reply in requested tone.'
  },
  morning_briefing: {
    id: 'morning_briefing',
    label: 'Morning briefing',
    relays: ['shortcuts', 'device'],
    intent: 'Build day briefing from tasks, reminders, and calendar context.'
  },
  web_extract: {
    id: 'web_extract',
    label: 'Extract web content',
    relays: ['browser'],
    intent: 'Extract readable text and action items from shared URL/page.'
  },
  create_reminder: {
    id: 'create_reminder',
    label: 'Create reminder plan',
    relays: ['shortcuts', 'device'],
    intent: 'Generate reminder action plan with title, due date, and notes.'
  },
  workflow_plan: {
    id: 'workflow_plan',
    label: 'Workflow plan',
    relays: ['shortcuts', 'browser', 'device'],
    intent: 'Turn a complex task into a multi-step, approval-aware runbook with relay-safe actions.'
  }
};

const PROVIDER_PRESETS = {
  local: {
    id: 'local',
    name: 'Local Model',
    style: 'Return plain Markdown with clear sections.'
  },
  claude: {
    id: 'claude',
    name: 'Claude',
    style: 'Use artifact-friendly sections and explicit JSON blocks for actions.'
  },
  openai: {
    id: 'openai',
    name: 'OpenAI',
    style: 'Use concise plan + strict JSON command envelope.'
  },
  gemini: {
    id: 'gemini',
    name: 'Gemini',
    style: 'Use compact bullet plan + JSON command envelope.'
  }
};

export class RelayHub {
  getRelays() {
    return Object.values(RELAYS);
  }

  getProviders() {
    return Object.values(PROVIDER_PRESETS);
  }

  getActions(relayId) {
    return Object.values(ACTIONS).filter((a) => a.relays.includes(relayId));
  }

  buildControlEnvelope(relayId, actionId, content) {
    return {
      relay: relayId,
      action: actionId,
      content: (content || '').trim(),
      createdAt: new Date().toISOString(),
      constraints: {
        localFirst: true,
        cloudOptional: true,
        requireConfirmationForRisky: true
      }
    };
  }

  buildArtifactPrompt({ relayId, actionId, providerId, content }) {
    const relay = RELAYS[relayId] || RELAYS.shortcuts;
    const action = ACTIONS[actionId] || ACTIONS.summarize;
    const provider = PROVIDER_PRESETS[providerId] || PROVIDER_PRESETS.local;
    const envelope = this.buildControlEnvelope(relay.id, action.id, content);

    const providerHeader = provider.id === 'claude'
      ? 'Format output as an artifact-style response with sections: Summary, Plan, RelayCommandJSON.'
      : 'Format output with sections: Summary, Plan, RelayCommandJSON.';
    const workflowInstructions = action.id === 'workflow_plan'
      ? 'Also include sections named Goal, WorkflowSteps, ApprovalCheckpoints, and SuccessCriteria so the user can review the runbook before acting.'
      : '';
    const schema = action.id === 'workflow_plan'
      ? {
          relay: 'string',
          action: 'workflow_plan',
          content: 'string',
          createdAt: 'ISO8601',
          plan: {
            goal: 'string',
            steps: [{ title: 'string', successCriteria: 'string' }],
            approvals: ['string']
          },
          constraints: { localFirst: true, cloudOptional: true, requireConfirmationForRisky: true }
        }
      : { relay: 'string', action: 'string', content: 'string', createdAt: 'ISO8601', constraints: { localFirst: true, cloudOptional: true, requireConfirmationForRisky: true } };

    return [
      `System constraints: local-first, cloud optional.`,
      `Relay: ${relay.name}.`,
      `Action intent: ${action.intent}`,
      `Provider preset: ${provider.name}. ${provider.style}`,
      providerHeader,
      workflowInstructions,
      'Return a valid JSON block under RelayCommandJSON matching this schema:',
      JSON.stringify(schema, null, 2),
      '',
      'Input payload:',
      JSON.stringify(envelope, null, 2)
    ].filter(Boolean).join('\n');
  }
}

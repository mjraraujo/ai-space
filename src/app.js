/**
 * App - Main controller for AI Space
 */

import { AIEngine } from './ai-engine.js';
import { Memory } from './memory.js';
import { Audit } from './audit.js';
import { Shortcuts } from './shortcuts.js';
import { UI } from './ui.js';
import { Voice } from './voice.js';
import { PersonaPlexVoice, PERSONAPLEX_VOICES } from './personaplex-voice.js';
import { BrowserVoiceAI } from './browser-voice-ai.js';
import { Camera } from './camera.js';
import { deviceAuthFlow, getAuthIssuer, getClientIdOverride, setClientIdOverride, clearClientIdOverride } from './codex-auth.js';
import { RelayHub } from './relays.js';
import { ToolRunner } from './tool-runner.js';
import { createDefaultRegistry } from './skill-registry.js';
import { SkillStudio } from './skill-studio.js';
import { WEB_LLM_MODELS } from './model-adapter.js';
import {
  isWebLookupIntent,
  extractWebQuery,
  isFactualQuestion,
  detectTaskType,
  recommendLocalModelFallback,
  buildEnhancedQuery,
  sanitizeModelOutput,
  looksLikeLegacyRuntimeScript,
  parseModelSizeToBytes
} from './utils.js';
import {
  ContextHarness,
  createPersonalizationEnricher,
  createTaskTypeEnricher
} from './context-harness.js';
import { Avatar, AVATAR_PRESETS, PRESET_NAMES } from './avatar.js';
import { ThemeEngine, THEME_PALETTES, PALETTE_IDS } from './theme-engine.js';
import { AvatarVoiceEngine, VOICE_STYLES, VOICE_STYLE_IDS } from './avatar-voice.js';
import { SceneManager } from './scene-manager.js';
import { createOnboardingController } from './onboarding.js';

// State
const state = {
  phase: 'onboarding',
  mode: 'local',
  conversationId: null,
  messages: [],
  isGenerating: false,
  firstVisit: true,
  runtimeMode: 'strict',
  localInternetAssist: false,
  kvMode: 'standard'
};

// Modules
const engine = new AIEngine();
const memory = new Memory();
const audit = new Audit();
const shortcuts = new Shortcuts();
const relays = new RelayHub();
const toolRunner = new ToolRunner();
toolRunner.registerBuiltIns();
const skillRegistry = createDefaultRegistry();
const skillStudio = new SkillStudio();
const contextHarness = new ContextHarness();
contextHarness.use(createTaskTypeEnricher({ detectTaskType }));
contextHarness.use(createPersonalizationEnricher({
  getPromptContext: () => engine.promptContext || ''
}));
const avatar = new Avatar();
const themeEngine = new ThemeEngine();
const avatarVoice = new AvatarVoiceEngine();
const sceneManager = new SceneManager();
const voice = new Voice();
const personaplexVoice = new PersonaPlexVoice();
let personaplexEnabled = false;
const browserVoiceAI = new BrowserVoiceAI();
let browserVoiceAIEnabled = false;
const camera = new Camera();
let ui = null;
let memoryReady = false;
let pendingImage = null;
let conversationTurnBusy = false;
let pendingShortcutActions = [];
let activeRuntimeJobId = null;
let runtimeOutputLines = [];
let liveActivityLines = [];
let liveActivityAutoHideTimer = null;

const MAX_RUNTIME_OUTPUT_LINES = 220;
const MAX_RUNTIME_OUTPUT_LINE_LENGTH = 1200;
const MAX_LIVE_ACTIVITY_LINES = 80;

function setLiveActivityVisible(visible) {
  const panel = document.getElementById('live-activity');
  if (!panel) return;
  panel.classList.toggle('visible', !!visible);
}

function setLiveActivityMode(mode) {
  const panel = document.getElementById('live-activity');
  if (!panel) return;
  panel.classList.remove('mode-running', 'mode-error', 'mode-idle');
  panel.classList.add(`mode-${mode}`);
}

function openLiveActivity(title, status, mode = 'running') {
  if (liveActivityAutoHideTimer) {
    clearTimeout(liveActivityAutoHideTimer);
    liveActivityAutoHideTimer = null;
  }
  const titleEl = document.getElementById('live-activity-title');
  const statusEl = document.getElementById('live-activity-status');
  if (titleEl) titleEl.textContent = title;
  if (statusEl) statusEl.textContent = status;
  setLiveActivityMode(mode);
  setLiveActivityVisible(true);
}

function closeLiveActivity(delayMs = 0) {
  if (liveActivityAutoHideTimer) {
    clearTimeout(liveActivityAutoHideTimer);
    liveActivityAutoHideTimer = null;
  }

  if (delayMs > 0) {
    liveActivityAutoHideTimer = setTimeout(() => {
      setLiveActivityVisible(false);
      liveActivityAutoHideTimer = null;
    }, delayMs);
    return;
  }

  setLiveActivityVisible(false);
}

function updateLiveActivityStatus(status, mode = 'running') {
  const statusEl = document.getElementById('live-activity-status');
  if (statusEl) statusEl.textContent = status;
  setLiveActivityMode(mode);
}

function appendLiveActivityLog(line) {
  const logEl = document.getElementById('live-activity-log');
  if (!logEl) return;
  const stamp = new Date().toLocaleTimeString();
  const next = `[${stamp}] ${String(line ?? '').slice(0, MAX_RUNTIME_OUTPUT_LINE_LENGTH)}`;
  liveActivityLines.push(next);
  if (liveActivityLines.length > MAX_LIVE_ACTIVITY_LINES) {
    liveActivityLines = liveActivityLines.slice(-MAX_LIVE_ACTIVITY_LINES);
  }
  logEl.textContent = liveActivityLines.join('\n');
  logEl.scrollTop = logEl.scrollHeight;
}


function detectRuntimePresetFromText(text) {
  const t = String(text || '').toLowerCase();
  const presets = ToolRunner.getPresets();

  const exact = presets.find((p) => t.includes(p.id.toLowerCase()));
  if (exact) return exact;

  if (t.includes('health') || t.includes('check status') || t.includes('deploy')) {
    return presets.find((p) => p.id === 'health-check') || presets[0];
  }
  if (t.includes('artifact') || t.includes('relay')) {
    return presets.find((p) => p.id === 'relay-artifact') || presets[0];
  }
  if (t.includes('verify') || t.includes('audit')) {
    return presets.find((p) => p.id === 'workflow-audit') || presets[0];
  }
  if (t.includes('navigate') || t.includes('open site') || t.includes('open page')) {
    return presets.find((p) => p.id === 'navigate-flow') || presets[0];
  }

  return null;
}

function parseLocalSkillIntent(text) {
  const raw = String(text || '').trim();
  const lower = raw.toLowerCase();
  if (!raw) return null;

  if (/(stop|cancel)\s+runtime/.test(lower)) {
    return { kind: 'runtime-stop' };
  }

  if (/\b(list|show)\s+(?:my\s+|local\s+|saved\s+)?skills\b/.test(lower)) {
    return { kind: 'skill-list' };
  }

  if (/\b(workflow\s+studio|create\s+(?:a\s+)?(?:local\s+|workflow\s+|reusable\s+)?skill|save\s+(?:this|that)?\s*as\s+(?:a\s+)?skill|draft\s+(?:a\s+)?skill|build\s+(?:a\s+)?skill)\b/.test(lower)) {
    return {
      kind: 'skill-studio',
      draft: skillStudio.draftFromText(raw)
    };
  }

  if (/send\s+relay\s+now|run\s+relay\s+now/.test(lower)) {
    return { kind: 'relay-send-now' };
  }

  if (/(runtime|background\s+runtime|execute\s+runtime|run\s+runtime)/.test(lower)) {
    const codeFence = raw.match(/```([\s\S]*?)```/);
    const customScript = codeFence?.[1]?.trim() || '';
    return {
      kind: 'runtime-run',
      customScript,
      preset: customScript ? null : detectRuntimePresetFromText(raw)
    };
  }

  if (/\brelay\b/.test(lower)) {
    let relayId = 'shortcuts';
    if (/(browser|web)/.test(lower)) relayId = 'browser';
    if (/device/.test(lower)) relayId = 'device';

    let actionId = 'summarize';
    if (/(reply|draft)/.test(lower)) actionId = 'draft_reply';
    else if (/(morning|briefing)/.test(lower)) actionId = 'morning_briefing';
    else if (/(extract|scrape)/.test(lower)) actionId = 'web_extract';
    else if (/(reminder|todo)/.test(lower)) actionId = 'create_reminder';
    else if (/(workflow|runbook|multi-step|plan)/.test(lower)) actionId = 'workflow_plan';

    let providerId = 'local';
    if (/claude/.test(lower)) providerId = 'claude';
    else if (/openai|gpt/.test(lower)) providerId = 'openai';
    else if (/gemini/.test(lower)) providerId = 'gemini';

    const content = raw.replace(/.*relay\s*/i, '').trim() || raw;
    return {
      kind: 'relay-build',
      relayId,
      actionId,
      providerId,
      content
    };
  }

  return null;
}

function formatSkillDraftSummary(draft) {
  const lines = [
    `Local skill draft ready: ${draft.name}`,
    `Relay hint: ${draft.relayId}`,
    `Use when: ${draft.whenToUse}`
  ];

  const steps = (draft.steps || [])
    .slice(0, 4)
    .map((step, index) => `${index + 1}. ${step.title} — ${step.successCriteria}`);

  if (steps.length > 0) {
    lines.push(`Planned flow:\n${steps.join('\n')}`);
  }

  lines.push('I loaded the full Workflow Studio prompt into chat so you can review or send it.');
  return lines.join('\n\n');
}

async function getSavedSkillDrafts() {
  if (!memoryReady) return [];
  try {
    const items = await memory.getSharedContent();
    return items.filter((item) => item?.type === 'skill-manifest');
  } catch {
    return [];
  }
}

async function queueSkillStudioDraft(draft, { saveDraft = true, source = 'chat' } = {}) {
  if (!draft) return false;

  const inputEl = document.getElementById('chat-input');
  const hintEl = document.getElementById('skill-studio-hint');

  if (inputEl) {
    inputEl.value = draft.prompt;
    ui.autoResizeInput();
    ui.setSendEnabled(true);
  }

  if (hintEl) {
    hintEl.textContent = `Draft ready: ${draft.name} · relay ${draft.relayId}. Review it in chat and send when ready.`;
  }

  if (saveDraft && memoryReady) {
    try {
      await memory.saveSharedContent({
        ...draft,
        id: `skill_${draft.id}_${Date.now()}`,
        templateId: draft.id,
        type: 'skill-manifest',
        source: `skill-studio-${source}`,
        createdAt: Date.now()
      });
    } catch {}
  }

  await auditLog('action', {
    kind: 'skill_studio_draft',
    skillId: draft.id,
    relayId: draft.relayId,
    source
  });

  await populateSkillStudioControls();
  return true;
}

function runRuntimeSkill(script, runtimeModeForRun) {
  return new Promise((resolve) => {
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timeoutId = setTimeout(() => {
      finish({ ok: false, message: 'Runtime timed out.' });
    }, 30000);

    activeRuntimeJobId = toolRunner.run(script, {
      onLog: ({ text }) => appendRuntimeOutput(text),
      onStatus: ({ status, url }) => {
        if (status === 'navigate' && url) {
          appendRuntimeOutput('Navigate requested: ' + url);
        }
      },
      onDone: ({ result, durationMs }) => {
        clearTimeout(timeoutId);
        activeRuntimeJobId = null;
        setRuntimeButtons(false);
        finish({
          ok: true,
          message: `Runtime completed in ${durationMs}ms.`,
          result
        });
      },
      onError: ({ error }) => {
        clearTimeout(timeoutId);
        activeRuntimeJobId = null;
        setRuntimeButtons(false);
        finish({
          ok: false,
          message: 'Runtime failed: ' + error
        });
      }
    }, {
      runtimeMode: runtimeModeForRun
    });
  });
}

async function tryHandleLocalFeatureSkill(userText) {
  // First, try the SkillRegistry — any registered skill that claims this input
  // takes priority over the lower-level DSL intent parser.
  const skillCtx = {
    conversationId: state.conversationId,
    messages: state.messages,
    memory: memoryReady ? memory : null,
    audit
  };
  const matchedSkill = await skillRegistry.route(userText, skillCtx);
  if (matchedSkill) {
    const result = await matchedSkill.execute(userText, skillCtx);
    if (result?.handled) {
      return { handled: true, response: result.content || '' };
    }
    // Skill returned a non-handled result (e.g. artifact only); fall through
    // so the LLM still generates a response, but the artifact is already set.
  }

  const intent = parseLocalSkillIntent(userText);
  if (!intent) return { handled: false };

  if (intent.kind === 'runtime-stop') {
    if (!activeRuntimeJobId) {
      return { handled: true, response: 'Runtime is not running right now.' };
    }
    openLiveActivity('Runtime Skill', 'Stopping...', 'running');
    const cancelled = toolRunner.cancel(activeRuntimeJobId);
    activeRuntimeJobId = null;
    setRuntimeButtons(false);
    updateLiveActivityStatus(cancelled ? 'Stopped' : 'Stop failed', cancelled ? 'idle' : 'error');
    closeLiveActivity(1500);
    return {
      handled: true,
      response: cancelled ? 'Runtime stopped successfully.' : 'Could not stop runtime job.'
    };
  }

  if (intent.kind === 'skill-list') {
    const saved = await getSavedSkillDrafts();
    return {
      handled: true,
      response: skillStudio.summarizeSavedSkills(saved)
    };
  }

  if (intent.kind === 'skill-studio') {
    const draft = intent.draft || skillStudio.draftFromText(userText);
    openLiveActivity('Workflow Studio', 'Drafting reusable local skill', 'running');
    await queueSkillStudioDraft(draft, { saveDraft: true, source: 'chat' });
    appendLiveActivityLog(`skill=${draft.name}, relay=${draft.relayId}`);
    updateLiveActivityStatus('Draft ready', 'idle');
    closeLiveActivity(2000);
    return {
      handled: true,
      response: formatSkillDraftSummary(draft)
    };
  }

  if (intent.kind === 'runtime-run') {
    if (activeRuntimeJobId) {
      return { handled: true, response: 'A runtime task is already running. Stop it first or wait to complete.' };
    }

    const preset = intent.preset;
    const script = intent.customScript || preset?.script || ToolRunner.getPresets()[0]?.script || '';
    if (!script) {
      return { handled: true, response: 'No runtime script found to execute.' };
    }

    let runtimeModeForRun = state.runtimeMode;
    if (runtimeModeForRun === 'strict' && looksLikeLegacyRuntimeScript(script)) {
      runtimeModeForRun = 'trusted';
      appendRuntimeOutput('Detected legacy JS-style script. Auto-switched this run to Trusted mode.');
    }

    appendRuntimeOutput('Starting runtime skill from chat...');
    appendRuntimeOutput('Runtime mode: ' + runtimeModeForRun);
    openLiveActivity('Runtime Skill', 'Executing from chat', 'running');
    setRuntimeButtons(true);

    const runtimeResult = await runRuntimeSkill(script, runtimeModeForRun);
    if (!runtimeResult.ok) {
      appendRuntimeOutput(runtimeResult.message);
      updateLiveActivityStatus('Failed', 'error');
      return { handled: true, response: runtimeResult.message };
    }

    updateLiveActivityStatus('Completed', 'idle');
    closeLiveActivity(2500);

    const label = preset ? `Preset: ${preset.name}` : 'Custom runtime script';
    const resultText = runtimeResult.result !== undefined
      ? `\nResult:\n${JSON.stringify(runtimeResult.result, null, 2)}`
      : '';
    return {
      handled: true,
      response: `${label} executed. ${runtimeResult.message}${resultText}`
    };
  }

  if (intent.kind === 'relay-build') {
    openLiveActivity('Relay Skill', 'Generating from chat intent', 'running');
    const prompt = relays.buildArtifactPrompt({
      relayId: intent.relayId,
      actionId: intent.actionId,
      providerId: intent.providerId,
      content: intent.content
    });

    const inputEl = document.getElementById('chat-input');
    if (inputEl) {
      inputEl.value = prompt;
      ui.autoResizeInput();
      ui.setSendEnabled(true);
    }

    if (memoryReady) {
      try {
        await memory.savePreference('relay_type', intent.relayId);
        await memory.savePreference('relay_action', intent.actionId);
        await memory.savePreference('relay_provider', intent.providerId);
      } catch {}
    }

    appendLiveActivityLog(`relay=${intent.relayId}, action=${intent.actionId}, provider=${intent.providerId}`);
    updateLiveActivityStatus('Artifact ready', 'idle');
    closeLiveActivity(2000);

    return {
      handled: true,
      response: [
        'Relay artifact generated as a local skill and prefilled in chat input.',
        'You can edit it and send, or ask: "send relay now".',
        '',
        'Preview:',
        '```text',
        prompt.slice(0, 1200),
        '```'
      ].join('\n')
    };
  }

  if (intent.kind === 'relay-send-now') {
    openLiveActivity('Relay Skill', 'Sending prepared artifact', 'running');
    const inputEl = document.getElementById('chat-input');
    const prepared = inputEl?.value?.trim() || '';
    if (!prepared || !prepared.includes('System constraints: local-first, cloud optional.')) {
      updateLiveActivityStatus('No prepared artifact found', 'error');
      return {
        handled: true,
        response: 'No prepared relay artifact found in chat input. Ask me to build one first.'
      };
    }

    setTimeout(() => {
      sendMessage(prepared);
    }, 0);

    appendLiveActivityLog('Relay artifact sent from chat skill.');
    updateLiveActivityStatus('Sent', 'idle');
    closeLiveActivity(2000);

    return {
      handled: true,
      response: 'Relay artifact sent.'
    };
  }

  return { handled: false };
}

async function fetchLocalInternetContext(query) {
  const q = extractWebQuery(query);
  if (!q || !navigator.onLine) return '';

  const isFactual = isFactualQuestion(query);
  if (!isFactual && !state.localInternetAssist) return '';

  const search = encodeURIComponent(q.slice(0, 150));
  const searchUrl = `https://en.wikipedia.org/w/api.php?action=query&list=search&srsearch=${search}&srlimit=1&format=json&origin=*`;

  try {
    const res = await fetch(searchUrl, { method: 'GET' });
    if (!res.ok) return '';
    const data = await res.json();
    const results = data?.query?.search || [];
    if (!results.length) return '';

    const pageId = results[0]?.pageid;
    if (!pageId) return '';

    const extractUrl = `https://en.wikipedia.org/w/api.php?action=query&pageids=${pageId}&prop=extracts&exintro=1&explaintext=1&exsentences=3&format=json&origin=*`;
    const extractRes = await fetch(extractUrl, { method: 'GET' });
    if (!extractRes.ok) return '';

    const extractData = await extractRes.json();
    const page = Object.values(extractData?.query?.pages || {})[0];
    const extract = String(page?.extract || '').slice(0, 500).trim();

    if (extract) return `Factual context from Wikipedia:\n${extract}`;
  } catch {
    // fall through to DuckDuckGo
  }

  // Fallback: DuckDuckGo Instant Answer API (free, CORS-open)
  try {
    const ddgUrl = `https://api.duckduckgo.com/?q=${search}&format=json&no_html=1&skip_disambig=1`;
    const ddgRes = await fetch(ddgUrl, { method: 'GET' });
    if (ddgRes.ok) {
      const ddgData = await ddgRes.json();
      const abstract = String(ddgData?.AbstractText || '').slice(0, 400).trim();
      if (abstract) return `Factual context from DuckDuckGo:\n${abstract}`;
    }
  } catch {
    // ignore
  }

  return '';
}

/**
 * Initialize the application
 */
async function initApp() {
  console.log('[ai-space] initApp start');

  try {
    ui = new UI();
  } catch (err) {
    console.error('[ai-space] UI init failed:', err);
    return;
  }

  // Create the onboarding controller — must happen before wireEventListeners
  // so the delegate functions (goToOnboardingStep etc.) resolve correctly.
  onboarding = createOnboardingController({
    engine,
    memory,
    voice,
    avatar,
    ui,
    state,
    isMemoryReady: () => memoryReady,
    savePref,
    transition,
    tryInitEngine,
    markVisited,
    auditLog,
  });

  // Initialize theme engine — applies saved palette or default
  themeEngine.init();

  // Load saved avatar configuration
  avatar.load();

  // Wire event listeners FIRST so buttons work immediately
  wireEventListeners();

  // Initialize TurboKV / KV strategy controls
  initTurboKV();

  // Initialize command palette (⌘K)
  initCommandPalette();

  // Keep chat UX resilient when connectivity changes.
  setupConnectivityListeners();

  // Initialize memory in background — never block the UI
  initMemoryInBackground();

  // Check for incoming shortcut data
  handleIncomingShortcut();

  // Handle shared content from the Web Share Target API (redirected from SW).
  // The SW stores the shared payload in IndexedDB and redirects with ?shared=true.
  handleShareTarget(new URLSearchParams(window.location.search)).then((content) => {
    if (content) {
      // Pre-populate the chat input so the user can review before sending.
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = content;
        input.dispatchEvent(new Event('input'));
      }
      // Clean the ?shared=true param from the URL bar.
      if (window.history.replaceState) {
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  });

  // Check if this is a returning user (localStorage is synchronous)
  const hasVisited = localStorage.getItem('ai-space-visited');

  if (hasVisited) {
    // Returning user — skip onboarding, go straight to chat
    console.log('[ai-space] returning user, skipping onboarding');
    loadSavedOnboardingPrefs(); // Load prompt context in background
    transition('chat');
    tryInitEngine(); // Try to init engine in background
  } else {
    // First-time user — start onboarding wizard
    console.log('[ai-space] first visit, starting onboarding wizard');
    await startOnboarding();
  }
  console.log('[ai-space] initApp done');
}

/**
 * Init memory without blocking
 */
function initMemoryInBackground() {
  (async () => {
    try {
      await memory.init();
      await audit.init(memory);
      memoryReady = true;
      console.log('[ai-space] memory ready');

      // Load saved preferences
      const mode = await memory.getPreference('mode');
      if (mode) {
        state.mode = mode;
        engine.mode = mode;
      }
      const visited = await memory.getPreference('visited');
      if (visited) state.firstVisit = false;

      const runtimeMode = await memory.getPreference('runtime_mode');
      if (runtimeMode === 'strict' || runtimeMode === 'trusted') {
        state.runtimeMode = runtimeMode;
      }
      const localInternetAssist = await memory.getPreference('local_internet_assist');
      state.localInternetAssist = !!localInternetAssist;

      // Load cloud config
      const cloudEndpoint = await memory.getPreference('cloud_endpoint');
      const cloudKey = await memory.getPreference('cloud_api_key');
      const cloudModel = await memory.getPreference('cloud_model');
      if (cloudEndpoint || cloudKey) {
        engine.setCloudConfig(cloudEndpoint || '', cloudKey || '', cloudModel || '');
      }

      // Load saved voice preference
      const savedVoiceIdx = await memory.getPreference('voice_index');
      if (savedVoiceIdx !== null && savedVoiceIdx !== undefined && savedVoiceIdx >= 0) {
        voice.preferredVoiceIndex = savedVoiceIdx;
        voice._cachedVoice = null;
      }

      // Load saved TTS preference
      const savedTTS = await memory.getPreference('tts_enabled');
      if (savedTTS !== undefined && savedTTS !== null) {
        voice.ttsEnabled = !!savedTTS;
        const ttsEl = document.getElementById('tts-toggle');
        if (ttsEl) ttsEl.checked = voice.ttsEnabled;
      }

      // Restore last conversation
      await restoreLastConversation();
    } catch (err) {
      console.warn('[ai-space] memory init failed:', err);
      memoryReady = false;
    }
  })();
}

/**
 * Onboarding wizard — created lazily in initApp() once all deps are ready.
 * @type {ReturnType<import('./onboarding.js').createOnboardingController>|null}
 */
let onboarding = null;

/**
 * Build personalized system prompt suffix from user preferences
 */
// ─── Onboarding wizard delegates ─────────────────────────────────────────────
// All onboarding state and logic live in src/onboarding.js.
// These thin wrappers keep existing call-sites in wireEventListeners() working
// without needing to rename every reference.

function buildPersonalizedPrompt() {
  return onboarding.buildPersonalizedPrompt();
}

function goToOnboardingStep(step) {
  onboarding.goToStep(step);
}

async function completeOnboarding() {
  return onboarding.complete();
}

async function startOnboarding() {
  return onboarding.start();
}

async function loadSavedOnboardingPrefs() {
  return onboarding.loadSavedPrefs();
}

async function runOnboardingDownload(attempt = 1) {
  return onboarding.runDownload(attempt);
}

/**
 * Try to init engine in background (for returning users)
 */
async function tryInitEngine() {
  if (state.mode === 'cloud') return;

  try {
    const hasWebGPU = await engine.checkWebGPU();
    if (!hasWebGPU) {
      state.mode = 'cloud';
      engine.mode = 'cloud';
      savePref('mode', 'cloud');
      return;
    }
    // Prefer the model the user previously downloaded (stored synchronously in
    // localStorage so it is available before IndexedDB/memory is ready).
    const savedModel = localStorage.getItem('ai-space-selected-model');
    await engine.init(savedModel, () => {});
    await auditLog('model_load', { model: engine.getStatus().modelId, success: true });
  } catch (err) {
    console.warn('Engine init failed in background:', err);
  }
}

/**
 * Transition views
 */
function transition(phase) {
  state.phase = phase;
  if (phase === 'onboarding' || phase === 'downloading') {
    ui.showView('onboarding');
  } else {
    ui.showView('chat');
  }
}

/**
 * Mark first visit done
 */
async function markVisited() {
  state.firstVisit = false;
  localStorage.setItem('ai-space-visited', 'true');
  savePref('visited', true);
}

/**
 * Safe preference save
 */
async function savePref(key, value) {
  if (!memoryReady) return;
  try { await memory.savePreference(key, value); } catch {}
}

/**
 * Safe audit log
 */
async function auditLog(type, details) {
  if (!memoryReady) return;
  try { await audit.log(type, details); } catch {}
}

/**
 * Wire all DOM event listeners
 */
function wireEventListeners() {
  // Send message
  const sendBtn = document.getElementById('send-btn');
  if (sendBtn) sendBtn.addEventListener('click', handleSend);

  // Input handling
  const input = document.getElementById('chat-input');
  if (input) {
    input.addEventListener('input', () => {
      ui.autoResizeInput();
      ui.setSendEnabled(input.value.trim().length > 0 && !state.isGenerating);
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey) {
        e.preventDefault();
        if (input.value.trim() && !state.isGenerating) handleSend();
      }
    });
  }

  // Settings
  const openSettings = document.getElementById('open-settings');
  if (openSettings) openSettings.addEventListener('click', () => {
    updateSettingsView();
    ui.showView('settings');
  });

  const closeSettings = document.getElementById('close-settings');
  if (closeSettings) closeSettings.addEventListener('click', () => ui.showView('chat'));

  // Mode selector
  const modeSelector = document.getElementById('mode-selector');
  if (modeSelector) modeSelector.addEventListener('click', (e) => {
    const option = e.target.closest('.mode-option');
    if (option && option.dataset.mode) setMode(option.dataset.mode);
  });

  // === Onboarding wizard event listeners ===

  // Step 1: Interaction mode cards
  document.querySelectorAll('#onboarding-step-1 .onboarding-card').forEach(card => {
    card.addEventListener('click', () => {
      onboarding.getData().interactionMode = card.dataset.mode;
      document.querySelectorAll('#onboarding-step-1 .onboarding-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => goToOnboardingStep(2), 250);
    });
  });

  // Step 2: Name input
  const nameInput = document.getElementById('onboarding-name');
  if (nameInput) {
    nameInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onboarding.getData().name = nameInput.value.trim();
        goToOnboardingStep(3);
      }
    });
  }
  const skipNameBtn = document.getElementById('onboarding-skip-name');
  if (skipNameBtn) skipNameBtn.addEventListener('click', () => {
    onboarding.getData().name = nameInput?.value?.trim() || '';
    goToOnboardingStep(3);
  });

  // Step 3: Location confirm/skip
  const locConfirm = document.getElementById('onboarding-location-confirm');
  if (locConfirm) locConfirm.addEventListener('click', () => goToOnboardingStep(4));
  const locSkip = document.getElementById('onboarding-location-skip');
  if (locSkip) locSkip.addEventListener('click', () => goToOnboardingStep(4));

  // Step 4: Tone cards
  document.querySelectorAll('#onboarding-tone-cards .onboarding-card').forEach(card => {
    card.addEventListener('click', () => {
      onboarding.getData().tone = card.dataset.tone;
      document.querySelectorAll('#onboarding-tone-cards .onboarding-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => goToOnboardingStep(5), 250);
    });
  });

  // Step 5: Skip voice — go to avatar builder step
  const skipVoiceBtn = document.getElementById('onboarding-skip-voice');
  if (skipVoiceBtn) skipVoiceBtn.addEventListener('click', () => goToOnboardingStep('avatar'));

  // Step 6: Enter space
  const enterBtn = document.getElementById('onboarding-enter');
  if (enterBtn) enterBtn.addEventListener('click', () => completeOnboarding());

  // Step 6: Start download button
  const startDownloadWireBtn = document.getElementById('onboarding-start-download');
  if (startDownloadWireBtn) startDownloadWireBtn.addEventListener('click', () => runOnboardingDownload(1));

  const onboardingModelPicker = document.getElementById('onboarding-model-picker');
  if (onboardingModelPicker) onboardingModelPicker.addEventListener('change', () => {
    const errorEl = document.getElementById('onboarding-download-error');
    const startBtn = document.getElementById('onboarding-start-download');
    const retryBtn = document.getElementById('onboarding-retry-download');
    if (errorEl) errorEl.style.display = 'none';
    if (startBtn) {
      startBtn.style.display = 'block';
      startBtn.textContent = 'Download & Start';
    }
    if (retryBtn) retryBtn.textContent = 'Retry Download';
  });

  // Step 6: Retry download
  const retryDownloadBtn = document.getElementById('onboarding-retry-download');
  if (retryDownloadBtn) {
    let _retryAttempt = 1;
    retryDownloadBtn.addEventListener('click', () => {
      _retryAttempt++;
      runOnboardingDownload(_retryAttempt);
    });
  }

  // Step 6: Skip to cloud mode
  const skipToCloudBtn = document.getElementById('onboarding-skip-to-cloud');
  if (skipToCloudBtn) skipToCloudBtn.addEventListener('click', () => {
    state.mode = 'cloud';
    engine.mode = 'cloud';
    savePref('mode', 'cloud');
    const badge = document.getElementById('onboarding-mode-badge');
    if (badge) badge.textContent = '☁️ Cloud mode — configure API key in Settings';
    const errorEl = document.getElementById('onboarding-download-error');
    if (errorEl) errorEl.style.display = 'none';
    const modelSection = document.getElementById('onboarding-model-section');
    if (modelSection) modelSection.style.display = 'none';
    const enterBtn2 = document.getElementById('onboarding-enter');
    if (enterBtn2) enterBtn2.style.display = 'block';
  });

  // Step 0: Manual continue for first impression control
  const startNowBtn = document.getElementById('onboarding-start-now');
  if (startNowBtn) startNowBtn.addEventListener('click', () => goToOnboardingStep(1));

  // === Theme & Avatar Settings ===
  initThemeSettingsUI();
  initAvatarSettingsUI();
  initAvatarScene();

  // Mic button (push to talk - single message)
  const micBtn = document.getElementById('mic-btn');
  if (micBtn) micBtn.addEventListener('click', handleMic);

  // Conversation mode button
  const convBtn = document.getElementById('conv-btn');
  if (convBtn) convBtn.addEventListener('click', handleConversation);

  // Sidebar
  const menuBtn = document.getElementById('menu-btn');
  const sidebar = document.getElementById('chat-sidebar');
  const sidebarOverlay = document.getElementById('sidebar-overlay');
  if (menuBtn) menuBtn.addEventListener('click', () => toggleSidebar(true));
  if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleSidebar(false));

  // New chat button
  const newChatBtn = document.getElementById('new-chat-btn');
  if (newChatBtn) newChatBtn.addEventListener('click', () => {
    handleNewConversation();
    toggleSidebar(false);
  });

  // Camera button
  const cameraBtn = document.getElementById('camera-btn');
  if (cameraBtn) cameraBtn.addEventListener('click', handleCamera);

  // Quick-start suggestion chips (empty state)
  document.querySelectorAll('.chat-suggestion-chip').forEach((chip) => {
    chip.addEventListener('click', () => {
      const prompt = chip.dataset.prompt;
      if (!prompt) return;
      const input = document.getElementById('chat-input');
      if (input) {
        input.value = prompt;
        ui.autoResizeInput();
        ui.setSendEnabled(true);
        input.focus();
      }
    });
  });

  // Remove attached image
  const removeImageBtn = document.getElementById('remove-image');
  if (removeImageBtn) removeImageBtn.addEventListener('click', () => {
    pendingImage = null;
    const preview = document.getElementById('image-preview');
    if (preview) preview.style.display = 'none';
    const previewImg = document.getElementById('preview-img');
    if (previewImg) previewImg.src = '';
  });

  // Data management
  const exportBtn = document.getElementById('export-data');
  if (exportBtn) exportBtn.addEventListener('click', handleExport);

  const clearBtn = document.getElementById('clear-data');
  if (clearBtn) clearBtn.addEventListener('click', handleClearData);

  // Voice picker
  const voicePicker = document.getElementById('voice-picker');
  if (voicePicker) {
    voicePicker.addEventListener('change', () => {
      const idx = parseInt(voicePicker.value);
      voice.preferredVoiceIndex = idx;
      voice._cachedVoice = null; // reset cache
      savePref('voice_index', idx);
    });
  }
  const voicePreviewBtn = document.getElementById('voice-preview-btn');
  if (voicePreviewBtn) {
    voicePreviewBtn.addEventListener('click', () => {
      voice.speak('Hi, this is how I sound. I can help you with anything you need.');
    });
  }

  // TTS toggle
  const ttsToggle = document.getElementById('tts-toggle');
  if (ttsToggle) {
    ttsToggle.checked = voice.ttsEnabled;
    ttsToggle.addEventListener('change', () => {
      voice.ttsEnabled = ttsToggle.checked;
      savePref('tts_enabled', ttsToggle.checked);
    });
  }

  // PersonaPlex settings
  initPersonaPlexSettingsUI();

  // Browser Voice AI settings
  initBrowserVoiceSettingsUI();

  // Local model switch
  const switchModelBtn = document.getElementById('switch-model-btn');
  if (switchModelBtn) switchModelBtn.addEventListener('click', handleSwitchModel);

  // Cloud provider dropdown
  const cloudProvider = document.getElementById('cloud-provider');
  if (cloudProvider) cloudProvider.addEventListener('change', handleProviderChange);
  handleProviderChange(); // set initial state

  // ChatGPT OAuth connect
  const connectBtn = document.getElementById('chatgpt-connect-btn');
  if (connectBtn) connectBtn.addEventListener('click', handleChatGPTConnect);

  const saveClientIdBtn = document.getElementById('save-chatgpt-client-id');
  if (saveClientIdBtn) saveClientIdBtn.addEventListener('click', handleSaveChatGPTClientId);

  const clearClientIdBtn = document.getElementById('clear-chatgpt-client-id');
  if (clearClientIdBtn) clearClientIdBtn.addEventListener('click', handleClearChatGPTClientId);

  // Cloud config save
  const saveCloudBtn = document.getElementById('save-cloud-config');
  if (saveCloudBtn) saveCloudBtn.addEventListener('click', handleSaveCloudConfig);

  const relayType = document.getElementById('relay-type');
  if (relayType) relayType.addEventListener('change', handleRelayTypeChange);

  const relayBuild = document.getElementById('relay-build-btn');
  if (relayBuild) relayBuild.addEventListener('click', handleBuildRelayArtifact);

  const relayRun = document.getElementById('relay-run-btn');
  if (relayRun) relayRun.addEventListener('click', handleRunRelayArtifact);

  const skillStudioBuildBtn = document.getElementById('skill-studio-build-btn');
  if (skillStudioBuildBtn) skillStudioBuildBtn.addEventListener('click', () => handleBuildSkillStudio(true));

  const skillStudioOpenBtn = document.getElementById('skill-studio-open-btn');
  if (skillStudioOpenBtn) skillStudioOpenBtn.addEventListener('click', () => handleBuildSkillStudio(false));

  const runtimePreset = document.getElementById('runtime-preset');
  if (runtimePreset) runtimePreset.addEventListener('change', handleRuntimePresetChange);

  const runtimeRun = document.getElementById('runtime-run-btn');
  if (runtimeRun) runtimeRun.addEventListener('click', handleRunRuntimeScript);

  const runtimeStop = document.getElementById('runtime-stop-btn');
  if (runtimeStop) runtimeStop.addEventListener('click', handleStopRuntimeScript);

  const runtimeModeEl = document.getElementById('runtime-mode');
  if (runtimeModeEl) runtimeModeEl.addEventListener('change', handleRuntimeModeChange);

  const localInternetAssistEl = document.getElementById('local-internet-assist');
  if (localInternetAssistEl) localInternetAssistEl.addEventListener('change', handleLocalInternetAssistChange);

  const liveClose = document.getElementById('live-activity-close');
  if (liveClose) liveClose.addEventListener('click', () => closeLiveActivity());
}

async function handleRuntimeModeChange() {
  const el = document.getElementById('runtime-mode');
  const hintEl = document.getElementById('runtime-hint');
  if (!el) return;

  state.runtimeMode = el.value === 'trusted' ? 'trusted' : 'strict';
  if (hintEl) {
    hintEl.textContent = state.runtimeMode === 'trusted'
      ? 'Trusted mode enabled: executes script with higher local power. Use only your own scripts.'
      : 'Strict mode enabled: DSL commands LOG, RUN, WAIT, NAVIGATE, RETURN, RETURNJSON.';
  }

  if (memoryReady) {
    try {
      await memory.savePreference('runtime_mode', state.runtimeMode);
    } catch {}
  }
}

async function handleLocalInternetAssistChange() {
  const el = document.getElementById('local-internet-assist');
  if (!el) return;

  state.localInternetAssist = !!el.checked;
  if (memoryReady) {
    try {
      await memory.savePreference('local_internet_assist', state.localInternetAssist);
    } catch {}
  }
  ui.showNotification(state.localInternetAssist ? 'Local internet assist enabled' : 'Local internet assist disabled', 'success');
}

function appendRuntimeOutput(line) {
  const outputEl = document.getElementById('runtime-output');
  if (!outputEl) return;
  const stamp = new Date().toLocaleTimeString();
  const normalized = String(line ?? '').slice(0, MAX_RUNTIME_OUTPUT_LINE_LENGTH);
  const next = `[${stamp}] ${normalized}`;
  runtimeOutputLines.push(next);
  if (runtimeOutputLines.length > MAX_RUNTIME_OUTPUT_LINES) {
    runtimeOutputLines = runtimeOutputLines.slice(-MAX_RUNTIME_OUTPUT_LINES);
  }
  outputEl.textContent = runtimeOutputLines.join('\n');
  outputEl.scrollTop = outputEl.scrollHeight;
  appendLiveActivityLog(line);
}

function setRuntimeButtons(isRunning) {
  const runBtn = document.getElementById('runtime-run-btn');
  const stopBtn = document.getElementById('runtime-stop-btn');
  if (runBtn) runBtn.disabled = isRunning;
  if (stopBtn) stopBtn.disabled = !isRunning;
}

function populateRuntimeControls() {
  const presetEl = document.getElementById('runtime-preset');
  if (!presetEl) return;

  if (presetEl.options.length === 0) {
    const blank = document.createElement('option');
    blank.value = '';
    blank.textContent = 'Custom Script';
    presetEl.appendChild(blank);

    ToolRunner.getPresets().forEach((preset) => {
      const opt = document.createElement('option');
      opt.value = preset.id;
      opt.textContent = preset.name;
      presetEl.appendChild(opt);
    });
  }
}

function handleRuntimePresetChange() {
  const presetEl = document.getElementById('runtime-preset');
  const scriptEl = document.getElementById('runtime-script');
  const hintEl = document.getElementById('runtime-hint');
  if (!presetEl || !scriptEl) return;

  const presetId = presetEl.value;
  const preset = ToolRunner.getPresets().find((p) => p.id === presetId);

  if (!preset) {
    if (hintEl) hintEl.textContent = 'Write DSL commands: LOG, RUN, WAIT, NAVIGATE, RETURN or RETURNJSON.';
    return;
  }

  scriptEl.value = preset.script;
  if (hintEl) hintEl.textContent = `Preset loaded: ${preset.name}`;
}

async function handleRunRuntimeScript() {
  if (activeRuntimeJobId) {
    ui.showNotification('A runtime task is already running', 'error');
    return;
  }

  const scriptEl = document.getElementById('runtime-script');
  const hintEl = document.getElementById('runtime-hint');
  const presetEl = document.getElementById('runtime-preset');

  if (!scriptEl) return;
  const script = scriptEl.value?.trim() || '';
  if (!script) {
    ui.showNotification('Add a script first', 'error');
    return;
  }

  let runtimeModeForRun = state.runtimeMode;
  if (runtimeModeForRun === 'strict' && looksLikeLegacyRuntimeScript(script)) {
    runtimeModeForRun = 'trusted';
    appendRuntimeOutput('Detected legacy JS-style script. Auto-switched this run to Trusted mode.');
  }

  appendRuntimeOutput('Starting background runtime task...');
  appendRuntimeOutput('Runtime mode: ' + runtimeModeForRun);
  openLiveActivity('Runtime', 'Running in background', 'running');
  setRuntimeButtons(true);

  activeRuntimeJobId = toolRunner.run(script, {
    onLog: ({ text }) => appendRuntimeOutput(text),
    onStatus: ({ status, url }) => {
      if (status === 'navigate' && url) {
        appendRuntimeOutput('Navigate requested: ' + url);
        updateLiveActivityStatus('Waiting for browser navigation', 'running');
        try {
          const tab = window.open(url, '_blank', 'noopener');
          if (!tab) {
            appendRuntimeOutput('Popup blocked by browser. Open this URL manually: ' + url);
            if (hintEl) hintEl.textContent = 'Popup blocked. Copy URL from logs and open manually.';
            ui.showNotification('Popup blocked. Open URL manually from logs.', 'error');
          }
        } catch {}
      } else if (status === 'cancelled') {
        appendRuntimeOutput('Task cancelled');
        updateLiveActivityStatus('Cancelled', 'idle');
      }
    },
    onDone: async ({ result, durationMs }) => {
      appendRuntimeOutput('Task complete in ' + durationMs + 'ms');
      if (result !== undefined) {
        appendRuntimeOutput('Result: ' + JSON.stringify(result));
      }
      updateLiveActivityStatus('Completed', 'idle');
      setRuntimeButtons(false);
      activeRuntimeJobId = null;
      if (hintEl) hintEl.textContent = 'Background runtime idle.';
      ui.showNotification('Background task finished', 'success');
      closeLiveActivity(3000);

      if (memoryReady && presetEl) {
        try {
          await memory.savePreference('runtime_preset', presetEl.value || '');
          await memory.savePreference('runtime_script', script);
        } catch {}
      }
    },
    onError: ({ error }) => {
      appendRuntimeOutput('Error: ' + error);
      updateLiveActivityStatus('Failed', 'error');
      setRuntimeButtons(false);
      activeRuntimeJobId = null;
      if (hintEl) hintEl.textContent = 'Background runtime failed. Fix script and retry.';
      ui.showNotification('Background task failed', 'error');
    }
  }, {
    runtimeMode: runtimeModeForRun
  });

  if (hintEl) hintEl.textContent = runtimeModeForRun === 'trusted'
    ? 'Trusted runtime running...'
    : 'Strict runtime running...';
}

function handleStopRuntimeScript() {
  if (!activeRuntimeJobId) return;

  const hintEl = document.getElementById('runtime-hint');
  const cancelled = toolRunner.cancel(activeRuntimeJobId);
  activeRuntimeJobId = null;
  setRuntimeButtons(false);
  if (cancelled) {
    appendRuntimeOutput('Stop requested by user');
    updateLiveActivityStatus('Stopped by user', 'idle');
    closeLiveActivity(1500);
    if (hintEl) hintEl.textContent = 'Background runtime stopped.';
    ui.showNotification('Background task stopped', 'success');
  }
}

function handleRelayTypeChange() {
  const relayTypeEl = document.getElementById('relay-type');
  const relayActionEl = document.getElementById('relay-action');
  if (!relayTypeEl || !relayActionEl) return;

  const relayId = relayTypeEl.value || 'shortcuts';
  const actions = relays.getActions(relayId);

  relayActionEl.innerHTML = '';
  actions.forEach((a) => {
    const opt = document.createElement('option');
    opt.value = a.id;
    opt.textContent = a.label;
    relayActionEl.appendChild(opt);
  });
}

function populateRelayControls() {
  const relayTypeEl = document.getElementById('relay-type');
  const relayActionEl = document.getElementById('relay-action');
  const relayProviderEl = document.getElementById('relay-provider');

  if (!relayTypeEl || !relayActionEl || !relayProviderEl) return;

  if (relayTypeEl.options.length === 0) {
    relays.getRelays().forEach((r) => {
      const opt = document.createElement('option');
      opt.value = r.id;
      opt.textContent = r.name;
      relayTypeEl.appendChild(opt);
    });
  }

  if (relayProviderEl.options.length === 0) {
    relays.getProviders().forEach((p) => {
      const opt = document.createElement('option');
      opt.value = p.id;
      opt.textContent = p.name;
      relayProviderEl.appendChild(opt);
    });
  }

  handleRelayTypeChange();
}

async function populateSkillStudioControls() {
  const catalogEl = document.getElementById('skill-studio-catalog');
  if (!catalogEl) return;

  const entries = [skillStudio.getBuiltInDefinition()];
  const saved = await getSavedSkillDrafts();
  saved.slice(0, 5).forEach((item) => {
    const normalized = skillStudio.normalizeSavedSkill(item);
    if (normalized) entries.push(normalized);
  });

  catalogEl.innerHTML = '';

  entries.slice(0, 6).forEach((entry, index) => {
    const row = document.createElement('div');
    row.style.padding = '10px 12px';
    row.style.border = '1px solid var(--border)';
    row.style.borderRadius = '12px';
    row.style.background = index === 0 ? 'rgba(255,255,255,0.03)' : 'transparent';

    const title = document.createElement('div');
    title.style.fontSize = '13px';
    title.style.color = 'var(--fg)';
    title.style.marginBottom = '4px';
    title.textContent = `${entry.name} · ${entry.relayId || 'device'}`;

    const desc = document.createElement('div');
    desc.style.fontSize = '12px';
    desc.style.color = 'var(--fg-dim)';
    desc.style.lineHeight = '1.45';
    desc.textContent = entry.whenToUse || entry.description || 'Reusable local skill draft';

    row.appendChild(title);
    row.appendChild(desc);
    catalogEl.appendChild(row);
  });
}

async function handleBuildSkillStudio(saveDraft = true) {
  const nameEl = document.getElementById('skill-studio-name');
  const goalEl = document.getElementById('skill-studio-goal');
  const relayEl = document.getElementById('skill-studio-relay');
  const hintEl = document.getElementById('skill-studio-hint');

  const goal = goalEl?.value?.trim() || '';
  if (!goal) {
    ui.showNotification('Describe the workflow first', 'error');
    return;
  }

  const draft = skillStudio.draftFromText(goal, {
    name: nameEl?.value?.trim() || undefined,
    goal,
    relayId: relayEl?.value || 'auto'
  });

  openLiveActivity('Workflow Studio', saveDraft ? 'Saving local draft' : 'Preparing prompt', 'running');
  await queueSkillStudioDraft(draft, { saveDraft, source: 'settings' });
  appendLiveActivityLog(`skill=${draft.name}, relay=${draft.relayId}`);
  updateLiveActivityStatus(saveDraft ? 'Saved locally' : 'Prompt ready', 'idle');
  closeLiveActivity(1800);

  if (hintEl) {
    hintEl.textContent = saveDraft
      ? `Saved “${draft.name}” locally and opened the prompt in chat.`
      : `Prompt ready for “${draft.name}”. Review it in chat before sending.`;
  }

  if (nameEl && !nameEl.value.trim()) {
    nameEl.value = draft.name;
  }

  ui.showNotification(saveDraft ? 'Local skill draft saved' : 'Workflow prompt ready', 'success');
}

async function handleBuildRelayArtifact() {
  const relayTypeEl = document.getElementById('relay-type');
  const relayActionEl = document.getElementById('relay-action');
  const relayProviderEl = document.getElementById('relay-provider');
  const relayContentEl = document.getElementById('relay-content');
  const hintEl = document.getElementById('relay-hint');
  const inputEl = document.getElementById('chat-input');

  if (!relayTypeEl || !relayActionEl || !relayProviderEl || !relayContentEl || !inputEl) {
    ui.showNotification('Relay controls not available', 'error');
    return;
  }

  const relayId = relayTypeEl.value || 'shortcuts';
  const actionId = relayActionEl.value || 'summarize';
  const providerId = relayProviderEl.value || 'local';
  const content = relayContentEl.value || '';

  openLiveActivity('Relay', 'Building artifact', 'running');
  appendLiveActivityLog(`relay=${relayId}, action=${actionId}, provider=${providerId}`);

  const prompt = relays.buildArtifactPrompt({ relayId, actionId, providerId, content });
  inputEl.value = prompt;
  ui.autoResizeInput();
  ui.setSendEnabled(true);

  if (hintEl) {
    hintEl.textContent = 'Artifact generated. Review/edit in chat input, then send.';
  }

  if (memoryReady) {
    try {
      await memory.savePreference('relay_type', relayId);
      await memory.savePreference('relay_action', actionId);
      await memory.savePreference('relay_provider', providerId);
    } catch {}
  }

  transition('chat');
  updateLiveActivityStatus('Artifact ready in chat input', 'idle');
  closeLiveActivity(2000);
  ui.showNotification('Relay artifact ready in chat input', 'success');
}

async function handleRunRelayArtifact() {
  openLiveActivity('Relay', 'Build + Send in progress', 'running');
  await handleBuildRelayArtifact();
  const inputEl = document.getElementById('chat-input');
  const prompt = inputEl?.value?.trim() || '';
  if (!prompt) {
    updateLiveActivityStatus('Relay prompt not ready', 'error');
    ui.showNotification('Relay prompt not ready', 'error');
    return;
  }
  appendLiveActivityLog('Relay artifact sent to chat flow.');
  updateLiveActivityStatus('Sent', 'idle');
  closeLiveActivity(2000);
  sendMessage(prompt);
}

function setupConnectivityListeners() {
  const apply = () => renderChatStatusBar();

  window.addEventListener('online', () => {
    apply();
    ui?.showNotification('Back online', 'success');
  });
  window.addEventListener('offline', () => {
    apply();
    ui?.showNotification('You are offline — local mode still works', 'info');
  });

  apply();
}

function renderChatStatusBar() {
  const statusEl = document.getElementById('chat-status-bar');
  if (!statusEl) return;

  const online = navigator.onLine;
  statusEl.classList.toggle('offline', !online);
  statusEl.classList.toggle('online', online);

  if (!online) {
    statusEl.textContent = 'Offline now: local model still works, cloud calls paused.';
  } else if (state.mode === 'cloud' || state.mode === 'hybrid') {
    statusEl.textContent = 'Online: cloud connection available.';
  } else {
    statusEl.textContent = 'Online: running local-first on your device.';
  }
}

/**
 * Start a new conversation — clears current chat and resets conversation state.
 */
function handleNewConversation() {
  state.messages = [];
  state.conversationId = 'conv_' + Date.now();
  ui.clearMessages();
  savePref('last_conversation_id', state.conversationId);
}

/**
 * Handle send
 */
function handleSend() {
  if (state.isGenerating) return;
  const text = ui.getInputValue();
  if (!text) return;
  sendMessage(text);
}


async function checkModelDownloadCapacity(modelId) {
  const models = AIEngine.getModels();
  const model = models[modelId];
  if (!model) {
    return { ok: false, reason: 'Unknown model selected.' };
  }

  const requiredBytes = parseModelSizeToBytes(model.size);

  // Large models like Phi are very likely to fail on low-memory devices.
  if (modelId.includes('Phi') && typeof navigator.deviceMemory === 'number' && navigator.deviceMemory < 6) {
    return {
      ok: false,
      reason: `This model is very large (${model.size}) and your device reports ${navigator.deviceMemory} GB RAM. Try Llama 1B or Qwen 0.5B.`
    };
  }

  if (!navigator.storage?.estimate || requiredBytes <= 0) {
    return { ok: true, reason: '' };
  }

  try {
    const { quota = 0, usage = 0 } = await navigator.storage.estimate();
    const free = Math.max(0, quota - usage);
    const safetyMargin = Math.max(250 * 1024 * 1024, requiredBytes * 0.25);
    const requiredWithMargin = requiredBytes + safetyMargin;

    if (free < requiredWithMargin) {
      const freeGb = (free / (1024 ** 3)).toFixed(2);
      const needGb = (requiredWithMargin / (1024 ** 3)).toFixed(2);
      return {
        ok: false,
        reason: `Not enough browser storage for this model. Free: ${freeGb} GB, needed: ~${needGb} GB (includes temp/cache overhead).`
      };
    }
  } catch {
    // Ignore estimation errors and continue.
  }

  return { ok: true, reason: '' };
}

/**
 * Send a message and get AI response
 */
async function runInference(modelMessages, { modelId = '', isCloud = false } = {}) {
  ui.renderMessage('assistant', '', true);
  let fullResponse = '';
  await engine.chat(modelMessages, (token, accumulated) => {
    fullResponse = accumulated;
    ui.updateStreamingMessage(accumulated);
  }, { tools: skillRegistry.collectToolDefs() });

  fullResponse = sanitizeModelOutput(fullResponse);
  ui.updateStreamingMessage(fullResponse);
  ui.finalizeStreamingMessage();
  state.messages.push({ role: 'assistant', content: fullResponse });
  updateTokenHUD();
  updateKVMetricsDisplay();

  if (pendingShortcutActions.length > 0) {
    const actions = [...pendingShortcutActions];
    pendingShortcutActions = [];
    ui.addActionChips(actions, (actionText) => {
      const inputEl = document.getElementById('chat-input');
      if (!inputEl) return;
      inputEl.value = actionText;
      ui.autoResizeInput();
      ui.setSendEnabled(true);
    });
  }

  if (isCloud) {
    await auditLog('suggestion', { model: modelId, responseLength: fullResponse.length, cloud: true });
  } else {
    await auditLog('suggestion', { model: modelId, responseLength: fullResponse.length });
  }
}

async function sendMessage(text) {
  if (state.isGenerating) return;

  if (!state.conversationId) {
    state.conversationId = `conv_${Date.now()}`;
  }

  // Handle attached image
  const image = pendingImage;
  if (image) {
    pendingImage = null;
    const preview = document.getElementById('image-preview');
    if (preview) preview.style.display = 'none';
  }

  state.messages.push({ role: 'user', content: text, image: image || undefined });
  ui.renderMessage('user', text, false, image);
  ui.setSendEnabled(false);
  state.isGenerating = true;

  // Avatar: transition to listening while processing user input
  avatar.setState('listening');

  await auditLog('context_read', { messageLength: text.length });
  if (image) {
    await auditLog('image_input', { hasImage: true });
  }

  const engineStatus = engine.getStatus();
  const canLocal = engineStatus.status === 'ready' && state.mode !== 'cloud';
  const canCloud = (state.mode === 'cloud' || state.mode === 'hybrid') && engine.cloudConfigured;

  // ─── Context Harness: begin turn ──────────────────────────────────────
  const maxCtx = engine.getAdapter()?.getCapabilities?.()?.maxContextTokens || 4096;
  const frame = contextHarness.beginTurn({
    text,
    image: image || null,
    conversationId: state.conversationId,
    messages: [...state.messages],
    mode: state.mode,
    maxContextTokens: maxCtx,
    systemPrompt: '' // engine handles system prompt internally
  });

  // Run harness enrichment (task type + personalization)
  await contextHarness.enrich(frame, {
    memory: memoryReady ? memory : null,
    audit,
    engine,
    skillRegistry,
    toolRunner
  });

  // Record task type metadata in audit
  if (frame.metadata.taskType) {
    await auditLog('context_enrichment', {
      taskType: frame.metadata.taskType,
      personalized: !!frame.metadata.personalized,
      turnId: frame.id
    });
  }

  // ─── Web context (preserved existing behavior) ────────────────────────
  const factualQuery = isFactualQuestion(text);
  const webIntent = isWebLookupIntent(text) || factualQuery;

  let liveContext = '';
  let modelMessages = [...state.messages];

  if (navigator.onLine && (state.localInternetAssist || webIntent)) {
    liveContext = await fetchLocalInternetContext(text);
    if (liveContext) {
      modelMessages.unshift({
        role: 'system',
        content: `[WEB_CONTEXT]\n${liveContext}\nUse these snippets as available web context for this turn. Do not claim full browsing access.`
      });
      appendRuntimeOutput('Factual web context attached to current request.');
      await auditLog('internet_consult', {
        source: 'web-extract',
        queryLength: text.length,
        autoTriggered: factualQuery && !state.localInternetAssist
      });
      // Record web context in frame for observability
      frame.enrichments['web-context'] = { snippet: liveContext, source: 'wikipedia' };
      frame.metadata.hasWebContext = true;
    } else if (webIntent) {
      appendRuntimeOutput('Web/factual lookup requested but no live context returned.');
    }
  } else if (webIntent && !state.localInternetAssist && !factualQuery) {
    appendRuntimeOutput('Web lookup intent detected. Enable Local Internet Assist in Settings.');
  }

  const enhancedQuery = buildEnhancedQuery(text, liveContext);
  for (let i = modelMessages.length - 1; i >= 0; i--) {
    if (modelMessages[i]?.role === 'user') {
      modelMessages[i] = {
        ...modelMessages[i],
        content: enhancedQuery
      };
      break;
    }
  }

  if (!navigator.onLine && !canLocal && (state.mode === 'cloud' || state.mode === 'hybrid')) {
    const msg = 'You are offline and cloud mode is selected. Switch to local mode or wait until connection is restored.';
    ui.renderMessage('assistant', msg);
    state.messages.push({ role: 'assistant', content: msg });
    contextHarness.errorTurn(frame, 'offline');
    state.isGenerating = false;
    const inputEl = document.getElementById('chat-input');
    if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
    return;
  }

  // Skills intercept first — works regardless of local/cloud mode
  const localSkill = await tryHandleLocalFeatureSkill(text);
  if (localSkill?.handled) {
    const responseText = localSkill.response || 'Local skill executed.';
    ui.renderMessage('assistant', responseText);
    state.messages.push({ role: 'assistant', content: responseText });
    contextHarness.completeTurn(frame, responseText);
    if (memoryReady) {
      try {
        await memory.saveChatHistory(state.conversationId, state.messages);
        await memory.savePreference('last_conversation_id', state.conversationId);
      } catch {}
    }
    state.isGenerating = false;
    avatar.setState('idle');
    const inputEl = document.getElementById('chat-input');
    if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
    return;
  }

  if (canLocal) {
    // Local inference
    avatar.setState('thinking');
    ui.showTyping(true);
    try {
      ui.showTyping(false);
      avatar.setState('talking');
      await runInference(modelMessages, { modelId: engineStatus.modelId });
      // Record turn completion
      const lastMsg = state.messages[state.messages.length - 1];
      contextHarness.completeTurn(frame, lastMsg?.content || '');
      avatar.reactToText(lastMsg?.content || '');
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Sorry, something went wrong: ' + err.message;
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
      contextHarness.errorTurn(frame, err.message);
    }
  } else if (canCloud) {
    // Cloud inference
    avatar.setState('thinking');
    ui.showTyping(true);
    await auditLog('cloud_call', { endpoint: engine.cloudEndpoint, model: engine.cloudModel });
    try {
      ui.showTyping(false);
      avatar.setState('talking');
      await runInference(modelMessages, { modelId: engine.cloudModel, isCloud: true });
      const lastMsg = state.messages[state.messages.length - 1];
      contextHarness.completeTurn(frame, lastMsg?.content || '');
      avatar.reactToText(lastMsg?.content || '');
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Cloud error: ' + err.message;
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
      contextHarness.errorTurn(frame, err.message);
    }
  } else {
    // No engine available
    ui.showTyping(true);
    await new Promise((r) => setTimeout(r, 400));
    ui.showTyping(false);

    let msg;
    if (state.mode === 'cloud' || state.mode === 'hybrid') {
      msg = 'Cloud mode is not yet connected. Configure an API endpoint in Settings to enable cloud inference.';
    } else {
      msg = 'The local model is still loading. Please wait a moment and try again.';
    }

    ui.renderMessage('assistant', msg);
    state.messages.push({ role: 'assistant', content: msg });
    contextHarness.errorTurn(frame, 'no-engine');
  }

  // Save conversation persistently
  if (memoryReady) {
    try {
      await memory.saveChatHistory(state.conversationId, state.messages);
      // Remember which conversation is active so we restore on reload
      await memory.savePreference('last_conversation_id', state.conversationId);
    } catch {}
  }

  state.isGenerating = false;
  avatar.setState('idle');
  const inputEl = document.getElementById('chat-input');
  if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
}

/**
 * Set operating mode
 */
async function setMode(mode) {
  if (!navigator.onLine && (mode === 'cloud' || mode === 'hybrid')) {
    ui.showNotification('You are offline. Cloud responses will fail until connection returns.', 'error');
  }

  state.mode = mode;
  engine.mode = mode;
  try { audit.setMode(mode); } catch {}
  ui.updateModeSelector(mode);
  savePref('mode', mode);

  if ((mode === 'local' || mode === 'hybrid') && engine.getStatus().status !== 'ready') {
    tryInitEngine();
  }

  updateSettingsView();
  renderChatStatusBar();
  ui.showNotification(`Switched to ${mode} mode`);
}

/**
 * Update settings view
 */
async function updateSettingsView() {
  ui.updateModeSelector(state.mode);
  populateRelayControls();
  populateRuntimeControls();
  await populateSkillStudioControls();

  const engineStatus = engine.getStatus();
  const modelName = engineStatus.modelInfo
    ? engineStatus.modelInfo.name
    : (engineStatus.status === 'loading' ? 'Loading...' : 'Not loaded');

  let cloudCalls = 0;
  let convCount = 0;

  if (memoryReady) {
    try {
      cloudCalls = await audit.getCloudCallCount();
      const stats = await memory.getStats();
      convCount = (stats.chat_history || 0) + (stats.conversations || 0);
    } catch {}

    // Render chat history
    try {
      const convs = await memory.getConversations();
      ui.renderChatHistory(convs, handleLoadConversation, handleDeleteConversation);
    } catch {}
  }

  ui.updateTrustDashboard(state.mode, cloudCalls, modelName, convCount);

  // Populate voice picker with English voices
  const voicePickerEl = document.getElementById('voice-picker');
  if (voicePickerEl) {
    const populateVoices = async () => {
      const allVoices = await voice._waitForVoices();
      const enVoices = allVoices.filter(v => {
        const lang = (v.lang || '').toLowerCase().replace('_', '-');
        return lang.startsWith('en-') || lang === 'en';
      });

      // Keep the auto option, add English voices
      voicePickerEl.innerHTML = '<option value="-1">Auto (best English voice)</option>';
      enVoices.forEach(v => {
        const idx = allVoices.indexOf(v);
        const opt = document.createElement('option');
        opt.value = idx;
        opt.textContent = v.name + ' (' + v.lang + ')';
        voicePickerEl.appendChild(opt);
      });

      // Restore saved selection
      if (voice.preferredVoiceIndex >= 0) {
        voicePickerEl.value = voice.preferredVoiceIndex;
      }
    };
    populateVoices();
  }

  // Restore saved local model selection
  if (memoryReady) {
    try {
      const savedModel = await memory.getPreference('selected_model');
      const modelPicker = document.getElementById('local-model-picker');
      if (savedModel && modelPicker) modelPicker.value = savedModel;
    } catch {}
  }

  // Restore saved cloud provider
  if (memoryReady) {
    try {
      const savedProvider = await memory.getPreference('cloud_provider');
      const providerEl = document.getElementById('cloud-provider');
      if (savedProvider && providerEl) {
        providerEl.value = savedProvider;
        handleProviderChange();
      }
    } catch {}
  }

  const apiKeyEl = document.getElementById('cloud-api-key');
  if (apiKeyEl && !apiKeyEl.value && engine.cloudApiKey) {
    apiKeyEl.value = engine.cloudApiKey;
  }

  const clientIdInput = document.getElementById('chatgpt-client-id');
  if (clientIdInput) {
    clientIdInput.value = getClientIdOverride();
  }

  if (memoryReady) {
    try {
      const relayType = await memory.getPreference('relay_type');
      const relayAction = await memory.getPreference('relay_action');
      const relayProvider = await memory.getPreference('relay_provider');
      const runtimePreset = await memory.getPreference('runtime_preset');
      const runtimeScript = await memory.getPreference('runtime_script');
      const runtimeMode = await memory.getPreference('runtime_mode');
      const localInternetAssist = await memory.getPreference('local_internet_assist');

      const relayTypeEl = document.getElementById('relay-type');
      const relayActionEl = document.getElementById('relay-action');
      const relayProviderEl = document.getElementById('relay-provider');

      if (relayType && relayTypeEl) {
        relayTypeEl.value = relayType;
        handleRelayTypeChange();
      }
      if (relayAction && relayActionEl) {
        relayActionEl.value = relayAction;
      }
      if (relayProvider && relayProviderEl) {
        relayProviderEl.value = relayProvider;
      }

      const runtimePresetEl = document.getElementById('runtime-preset');
      const runtimeScriptEl = document.getElementById('runtime-script');
      const runtimeModeEl = document.getElementById('runtime-mode');
      const localInternetAssistEl = document.getElementById('local-internet-assist');
      if (runtimePresetEl && runtimePreset !== null && runtimePreset !== undefined) {
        runtimePresetEl.value = runtimePreset;
      }
      if (runtimeScriptEl && runtimeScript) {
        runtimeScriptEl.value = runtimeScript;
      } else if (runtimePresetEl && runtimePresetEl.value) {
        handleRuntimePresetChange();
      }
      if (runtimeModeEl && (runtimeMode === 'strict' || runtimeMode === 'trusted')) {
        runtimeModeEl.value = runtimeMode;
        state.runtimeMode = runtimeMode;
      }
      if (localInternetAssistEl) {
        state.localInternetAssist = !!localInternetAssist;
        localInternetAssistEl.checked = state.localInternetAssist;
      }
    } catch {}
  }
}

function handleSaveChatGPTClientId() {
  const input = document.getElementById('chatgpt-client-id');
  const statusEl = document.getElementById('oauth-status');
  const connectBtn = document.getElementById('chatgpt-connect-btn');
  const value = input?.value?.trim() || '';

  if (!value) {
    ui.showNotification('Enter a client ID (example: app_xxx)', 'error');
    return;
  }

  setClientIdOverride(value);
  if (statusEl) statusEl.textContent = 'Client ID override saved. You can retry Connect ChatGPT.';
  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect ChatGPT';
  }
  ui.showNotification('ChatGPT client ID saved', 'success');
}

function handleClearChatGPTClientId() {
  const input = document.getElementById('chatgpt-client-id');
  const statusEl = document.getElementById('oauth-status');
  const connectBtn = document.getElementById('chatgpt-connect-btn');

  clearClientIdOverride();
  if (input) input.value = '';
  if (statusEl) statusEl.textContent = 'Using default built-in client ID.';
  if (connectBtn) {
    connectBtn.disabled = false;
    connectBtn.textContent = 'Connect ChatGPT';
  }
  ui.showNotification('Reverted to default client ID', 'success');
}

/**
 * Handle loading a past conversation
 */
async function handleLoadConversation(id) {
  if (!memoryReady) return;

  try {
    const conv = await memory.loadConversation(id);
    if (conv && conv.messages) {
      state.conversationId = id;
      state.messages = conv.messages;
      ui.clearMessages();

      // Re-render all messages
      for (const msg of conv.messages) {
        ui.renderMessage(msg.role, msg.content, false, msg.image);
      }

      ui.showView('chat');
      ui.showNotification('Loaded conversation');
    }
  } catch (err) {
    ui.showNotification('Failed to load conversation', 'error');
  }
}

/**
 * Handle deleting a conversation
 */
async function handleDeleteConversation(id) {
  if (!memoryReady) return;

  if (!window.confirm('Delete this conversation? This cannot be undone.')) return;

  try {
    await memory.deleteChatHistory(id);
    await memory.deleteConversation(id);
    updateSettingsView();
    ui.showNotification('Conversation deleted');
  } catch (err) {
    ui.showNotification('Failed to delete', 'error');
  }
}

/** Track retry attempts per model to increase backoff guidance */
let _switchModelAttempt = 0;
let _switchModelId = '';

/**
 * Switch local model — downloads new model on demand with retry guidance
 */
async function handleSwitchModel() {
  const picker = document.getElementById('local-model-picker');
  const hint = document.getElementById('local-model-hint');
  const btn = document.getElementById('switch-model-btn');
  if (!picker) return;

  const modelId = picker.value;

  // Reset attempt counter when model changes
  if (modelId !== _switchModelId) {
    _switchModelAttempt = 0;
    _switchModelId = modelId;
  }
  _switchModelAttempt++;

  const currentModel = engine.getStatus().modelId;
  if (modelId === currentModel && engine.getStatus().status === 'ready') {
    ui.showNotification('Already using this model');
    return;
  }

  const hasWebGPU = await engine.checkWebGPU();
  if (!hasWebGPU) {
    if (hint) hint.textContent = 'WebGPU is not supported in this browser. Try Chrome 113+ on desktop or Android.';
    ui.showNotification('WebGPU not available', 'error');
    return;
  }

  const capacity = await checkModelDownloadCapacity(modelId);
  if (!capacity.ok) {
    if (hint) hint.textContent = capacity.reason;
    ui.showNotification(capacity.reason, 'error');
    if (btn) btn.textContent = 'Download & Switch';
    return;
  }

  const attemptLabel = _switchModelAttempt > 1 ? ` (attempt ${_switchModelAttempt})` : '';
  if (btn) btn.textContent = `Downloading${attemptLabel}…`;
  if (hint) hint.textContent = 'Connecting to HuggingFace CDN…';

  try {
    engine.engine = null;
    engine.status = 'idle';

    await engine.init(modelId, (progress) => {
      const pct = Math.round((progress.progress || 0) * 100);
      if (hint) hint.textContent = progress.text || `Downloading… ${pct}%`;
    }, { kvMode: state.kvMode });

    _switchModelAttempt = 0;
    if (hint) hint.textContent = '✓ Model ready — running entirely on your device';
    if (btn) btn.textContent = 'Download & Switch';
    savePref('selected_model', modelId);
    localStorage.setItem('ai-space-selected-model', modelId);
    ui.showNotification('Switched to ' + (engine.getStatus().modelInfo?.name || modelId));
    updateSettingsView();
  } catch (err) {
    const msg = err.message || '';
    const lower = msg.toLowerCase();
    const isRateLimit = lower.includes('quota') || lower.includes('rate') || lower.includes('429') || lower.includes('limit') || lower.includes('exceeded');
    const isStorage = lower.includes('storage') || lower.includes('space') || lower.includes('disk') || lower.includes('quotaexceeded');
    const fallbackModelId = recommendLocalModelFallback(modelId, {
      isRateLimit,
      isStorage,
      deviceMemory: navigator.deviceMemory
    });
    const fallbackName = fallbackModelId ? (AIEngine.getModels()[fallbackModelId]?.name || 'a smaller model') : '';

    if (isRateLimit) {
      const waitMin = _switchModelAttempt <= 1 ? 1 : _switchModelAttempt * 2;
      if (hint) hint.textContent = fallbackName
        ? `HuggingFace is rate-limiting right now. Wait ${waitMin} minute${waitMin > 1 ? 's' : ''}, or switch now to ${fallbackName} (already selected for you).`
        : `HuggingFace is rate-limiting right now. Wait ${waitMin} minute${waitMin > 1 ? 's' : ''} then tap "Retry Download".`;
      ui.showNotification(`Rate limit hit — wait ${waitMin}m then retry`, 'error');
    } else if (isStorage) {
      if (hint) hint.textContent = fallbackName
        ? `Not enough storage for this model. Try ${fallbackName} instead — it is already selected for you.`
        : 'Not enough browser storage. Free some space or pick a smaller model like SmolLM2 360M.';
      ui.showNotification('Not enough storage for this model', 'error');
    } else {
      if (hint) hint.textContent = fallbackName
        ? `Download failed: ${msg}. Retry later or try ${fallbackName} now — it is already selected for you.`
        : `Download failed: ${msg}. Check your connection and tap "Retry Download".`;
      ui.showNotification('Download failed — tap Retry', 'error');
    }

    if (fallbackModelId && picker) {
      picker.value = fallbackModelId;
      if (btn) btn.textContent = `Try ${fallbackName} instead`;
    } else if (btn) {
      btn.textContent = 'Retry Download';
    }
  }
}

/**
 * Cloud provider presets
 */
const CLOUD_PROVIDERS = {
  chatgpt: {
    endpoint: 'https://chatgpt.com/backend-api/codex',
    model: 'o4-mini',
    placeholder: '',
    hint: 'Optional cloud. Local mode stays primary. Connect ChatGPT Plus/Pro below if available.',
    oauth: true
  },
  openai: {
    endpoint: 'https://api.openai.com/v1',
    model: 'gpt-4o-mini',
    placeholder: 'sk-...',
    hint: 'Get your key at platform.openai.com/api-keys'
  },
  claude: {
    endpoint: 'https://api.anthropic.com/v1',
    model: 'claude-sonnet-4-20250514',
    placeholder: 'sk-ant-...',
    hint: 'Get your key at console.anthropic.com/settings/keys'
  },
  gemini: {
    endpoint: 'https://generativelanguage.googleapis.com/v1beta/openai',
    model: 'gemini-2.0-flash',
    placeholder: 'AIza...',
    hint: 'Get your key at aistudio.google.com/apikey'
  },
  custom: {
    endpoint: '',
    model: '',
    placeholder: 'Your API key',
    hint: 'Enter your OpenAI-compatible endpoint and model'
  }
};

/**
 * Initialise the PersonaPlex settings panel and restore saved preferences.
 */
function initPersonaPlexSettingsUI() {
  // Populate voice model dropdown
  const voicePicker = document.getElementById('personaplex-voice-picker');
  if (voicePicker) {
    voicePicker.innerHTML = '';
    PERSONAPLEX_VOICES.forEach(v => {
      const opt = document.createElement('option');
      opt.value = v.id;
      opt.textContent = v.label;
      voicePicker.appendChild(opt);
    });
  }

  const toggle = document.getElementById('personaplex-toggle');
  const settingsDiv = document.getElementById('personaplex-settings');
  const urlInput = document.getElementById('personaplex-url');
  const personaInput = document.getElementById('personaplex-persona');
  const testBtn = document.getElementById('personaplex-test-btn');
  const statusEl = document.getElementById('personaplex-status');

  // Restore saved preferences
  (async () => {
    const savedEnabled = await memory.getPreference('personaplex_enabled').catch(() => null);
    const savedUrl = await memory.getPreference('personaplex_url').catch(() => null);
    const savedVoice = await memory.getPreference('personaplex_voice').catch(() => null);
    const savedPersona = await memory.getPreference('personaplex_persona').catch(() => null);

    if (savedEnabled) {
      personaplexEnabled = true;
      if (toggle) toggle.checked = true;
      if (settingsDiv) settingsDiv.style.display = '';
    }
    if (savedUrl) {
      personaplexVoice.serverUrl = savedUrl;
      if (urlInput) urlInput.value = savedUrl;
    } else if (window.__PERSONAPLEX_URL__) {
      // Auto-configure from the PERSONAPLEX_URL env var injected by docker-entrypoint.sh.
      // Operators set this to '/ws/voice' (nginx proxy) or an absolute URL.
      personaplexVoice.serverUrl = window.__PERSONAPLEX_URL__;
      if (urlInput) urlInput.value = window.__PERSONAPLEX_URL__;
    }
    if (savedVoice) {
      personaplexVoice.voicePrompt = savedVoice;
      if (voicePicker) voicePicker.value = savedVoice;
    }
    if (savedPersona) {
      personaplexVoice.personaText = savedPersona;
      if (personaInput) personaInput.value = savedPersona;
    }
  })();

  if (toggle) {
    toggle.addEventListener('change', () => {
      personaplexEnabled = toggle.checked;
      if (settingsDiv) settingsDiv.style.display = personaplexEnabled ? '' : 'none';
      savePref('personaplex_enabled', personaplexEnabled);
      if (!personaplexEnabled && personaplexVoice.isRecording) {
        personaplexVoice.stopConversation();
        const btn = document.getElementById('conv-btn');
        if (btn) btn.classList.remove('active');
        const input = document.getElementById('chat-input');
        if (input) input.placeholder = 'Message...';
      }
    });
  }

  if (urlInput) {
    urlInput.addEventListener('change', () => {
      personaplexVoice.serverUrl = urlInput.value.trim() || 'https://localhost:8998';
      savePref('personaplex_url', personaplexVoice.serverUrl);
    });
  }

  if (voicePicker) {
    voicePicker.addEventListener('change', () => {
      personaplexVoice.voicePrompt = voicePicker.value;
      savePref('personaplex_voice', voicePicker.value);
    });
  }

  if (personaInput) {
    personaInput.addEventListener('change', () => {
      personaplexVoice.personaText = personaInput.value.trim();
      savePref('personaplex_persona', personaInput.value.trim());
    });
  }

  if (testBtn && statusEl) {
    testBtn.addEventListener('click', async () => {
      testBtn.disabled = true;
      statusEl.textContent = 'Connecting…';
      statusEl.style.color = 'var(--text-secondary,#888)';
      try {
        await personaplexVoice.testConnection();
        statusEl.textContent = '✓ Connected to PersonaPlex server';
        statusEl.style.color = '#4caf50';
      } catch (err) {
        statusEl.textContent = '✗ ' + (err.message || 'Connection failed');
        statusEl.style.color = '#f44336';
      } finally {
        testBtn.disabled = false;
      }
    });
  }

  // "Use nginx proxy" quick-fill — sets the URL to the built-in nginx
  // WebSocket proxy path that works automatically in Docker/VPS deployments.
  const proxyBtn = document.getElementById('personaplex-proxy-btn');
  if (proxyBtn && urlInput && statusEl) {
    proxyBtn.addEventListener('click', () => {
      const proxyPath = '/ws/voice';
      urlInput.value = proxyPath;
      personaplexVoice.serverUrl = proxyPath;
      savePref('personaplex_url', proxyPath);
      statusEl.textContent = 'URL set to nginx proxy path — click "Test Connection" to verify.';
      statusEl.style.color = 'var(--text-secondary,#888)';
    });
  }
}

/**
 * Initialise the Browser Voice AI settings panel and restore saved preferences.
 */
function initBrowserVoiceSettingsUI() {
  const toggle = document.getElementById('browser-voice-ai-toggle');
  const settingsDiv = document.getElementById('browser-voice-ai-settings');
  const modelSelect = document.getElementById('browser-voice-ai-model');
  const preloadBtn = document.getElementById('browser-voice-ai-preload-btn');
  const progressWrap = document.getElementById('browser-voice-ai-progress');
  const progressBar = document.getElementById('browser-voice-ai-progress-bar');
  const progressText = document.getElementById('browser-voice-ai-progress-text');
  const statusEl = document.getElementById('browser-voice-ai-status');

  // Restore saved preferences.
  (async () => {
    const savedEnabled = await memory.getPreference('browser_voice_ai_enabled').catch(() => null);
    const savedModel = await memory.getPreference('browser_voice_ai_model').catch(() => null);
    if (savedEnabled) {
      browserVoiceAIEnabled = true;
      if (toggle) toggle.checked = true;
      if (settingsDiv) settingsDiv.style.display = '';
    }
    if (savedModel && modelSelect) {
      modelSelect.value = savedModel;
      browserVoiceAI.model = savedModel;
    }

    // Show a badge if the model is already in the browser cache so the user
    // knows they won't have to re-download it.
    if (statusEl) {
      const cached = await browserVoiceAI.checkModelCached().catch(() => false);
      if (cached) {
        statusEl.textContent = '✓ Model already downloaded — ready to use offline';
        statusEl.style.color = '#4caf50';
      }
    }
  })();

  // Toggle visibility.
  if (toggle) {
    toggle.addEventListener('change', () => {
      browserVoiceAIEnabled = toggle.checked;
      if (settingsDiv) settingsDiv.style.display = browserVoiceAIEnabled ? '' : 'none';
      savePref('browser_voice_ai_enabled', browserVoiceAIEnabled);
      if (!browserVoiceAIEnabled && browserVoiceAI.conversationMode) {
        browserVoiceAI.stopConversation();
        const btn = document.getElementById('conv-btn');
        if (btn) btn.classList.remove('active');
        const input = document.getElementById('chat-input');
        if (input) input.placeholder = 'Message...';
      }
    });
  }

  // Model selection.
  if (modelSelect) {
    modelSelect.addEventListener('change', async () => {
      browserVoiceAI.model = modelSelect.value;
      browserVoiceAI.resetModel();
      savePref('browser_voice_ai_model', modelSelect.value);
      if (statusEl) {
        const cached = await browserVoiceAI.checkModelCached().catch(() => false);
        if (cached) {
          statusEl.textContent = '✓ Model already downloaded — ready to use offline';
          statusEl.style.color = '#4caf50';
        } else {
          statusEl.textContent = 'Model changed — will download on next use.';
          statusEl.style.color = '';
        }
      }
    });
  }

  // Pre-load button.
  if (preloadBtn) {
    preloadBtn.addEventListener('click', async () => {
      preloadBtn.disabled = true;
      if (progressWrap) progressWrap.style.display = '';
      if (progressBar) progressBar.style.width = '0%';
      if (progressText) progressText.textContent = 'Starting download…';
      if (statusEl) statusEl.textContent = '';

      browserVoiceAI.onProgress = (info) => {
        if (info.status === 'progress' && info.total) {
          const pct = Math.round((info.loaded / info.total) * 100);
          if (progressBar) progressBar.style.width = pct + '%';
          const mb = (info.loaded / 1048576).toFixed(1);
          const total = (info.total / 1048576).toFixed(1);
          if (progressText) progressText.textContent = `${info.file || ''} — ${mb} / ${total} MB (${pct}%)`;
        } else if (info.status === 'done') {
          if (progressText) progressText.textContent = `${info.file || ''} — done`;
        }
      };

      try {
        await browserVoiceAI.loadModel();
        if (progressBar) progressBar.style.width = '100%';
        if (statusEl) {
          statusEl.textContent = '✓ Model loaded and ready';
          statusEl.style.color = '#4caf50';
        }
      } catch (err) {
        if (statusEl) {
          statusEl.textContent = '✗ ' + (err.message || 'Failed to load model');
          statusEl.style.color = '#f44336';
        }
      } finally {
        preloadBtn.disabled = false;
      }
    });
  }
}

function handleProviderChange() {
  const select = document.getElementById('cloud-provider');
  const customFields = document.getElementById('cloud-custom-fields');
  const hint = document.getElementById('cloud-hint');
  const apiKeyInput = document.getElementById('cloud-api-key');
  const apiKeyLabel = document.getElementById('cloud-api-key-label');
  const oauthSection = document.getElementById('cloud-oauth-section');
  const saveBtn = document.getElementById('save-cloud-config');
  if (!select) return;

  const provider = select.value;
  const preset = CLOUD_PROVIDERS[provider];
  const isOAuth = preset?.oauth;

  if (customFields) customFields.style.display = provider === 'custom' ? 'block' : 'none';
  if (hint) hint.textContent = preset?.hint || '';
  if (apiKeyInput) apiKeyInput.placeholder = preset?.placeholder || 'API key';
  if (apiKeyInput) apiKeyInput.style.display = isOAuth ? 'none' : '';
  if (apiKeyLabel) apiKeyLabel.style.display = isOAuth ? 'none' : '';
  if (oauthSection) oauthSection.style.display = isOAuth ? 'block' : 'none';
  if (saveBtn) saveBtn.style.display = isOAuth ? 'none' : '';
}

/**
 * Save cloud configuration
 */
async function handleSaveCloudConfig() {
  const provider = document.getElementById('cloud-provider')?.value || 'openai';
  const apiKey = document.getElementById('cloud-api-key')?.value?.trim() || '';
  const preset = CLOUD_PROVIDERS[provider];

  let endpoint, model;
  if (provider === 'custom') {
    endpoint = document.getElementById('cloud-endpoint')?.value?.trim() || '';
    model = document.getElementById('cloud-model')?.value?.trim() || '';
  } else {
    endpoint = preset.endpoint;
    model = preset.model;
  }

  if (!apiKey) {
    ui.showNotification('Enter an API key', 'error');
    return;
  }

  if (provider === 'custom' && endpoint) {
    try {
      const parsed = new URL(endpoint);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        ui.showNotification('Endpoint must be an http:// or https:// URL', 'error');
        return;
      }
    } catch {
      ui.showNotification('Invalid endpoint URL', 'error');
      return;
    }
  }

  engine.setCloudConfig(endpoint, apiKey, model);

  savePref('cloud_provider', provider);
  savePref('cloud_endpoint', endpoint);
  savePref('cloud_api_key', apiKey);
  savePref('cloud_model', model);

  ui.showNotification('Saved — ' + provider + ' ready');
}

/**
 * ChatGPT Plus OAuth — uses imported device auth module
 */
async function handleChatGPTConnect() {
  const statusEl = document.getElementById('oauth-status');
  const codeDisplay = document.getElementById('oauth-code');
  const connectBtn = document.getElementById('chatgpt-connect-btn');

  if (connectBtn) connectBtn.disabled = true;
  if (statusEl) statusEl.textContent = 'Opening secure device login...';

  try {
    const tokens = await deviceAuthFlow(
      // onCode — show the code and open browser
      ({ userCode, verificationUrl }) => {
        if (codeDisplay) {
          codeDisplay.textContent = userCode;
          codeDisplay.style.display = 'block';
        }
        if (statusEl) statusEl.textContent = 'Open the link and enter this code:';
        window.open(verificationUrl, '_blank');
      },
      // onStatus — update status text
      (text) => {
        if (statusEl) statusEl.textContent = text;
      }
    );

    // Success — save tokens
    engine.setCloudConfig(
      CLOUD_PROVIDERS.chatgpt.endpoint,
      tokens.access_token,
      CLOUD_PROVIDERS.chatgpt.model
    );

    savePref('cloud_provider', 'chatgpt');
    savePref('cloud_endpoint', CLOUD_PROVIDERS.chatgpt.endpoint);
    savePref('cloud_api_key', tokens.access_token);
    savePref('cloud_model', CLOUD_PROVIDERS.chatgpt.model);

    if (statusEl) statusEl.textContent = 'Connected to ChatGPT';
    if (codeDisplay) codeDisplay.style.display = 'none';
    if (connectBtn) { connectBtn.disabled = false; connectBtn.textContent = 'Connected'; }
    ui.showNotification('ChatGPT Plus connected');
  } catch (err) {
    const message = err?.message || 'Unknown auth error';
    const lower = message.toLowerCase();
    const invalidClient = lower.includes('invalid client') || lower.includes('invalid_client');

    if (statusEl) {
      if (invalidClient) {
        statusEl.textContent = 'ChatGPT sign-in failed with invalid client. Set a valid Client ID in Advanced, then retry. Local mode still works and cloud remains optional.';
      } else {
        statusEl.textContent = message + ' (issuer: ' + getAuthIssuer() + ')';
      }
    }
    if (connectBtn) connectBtn.disabled = false;
    if (connectBtn) connectBtn.textContent = 'Connect ChatGPT';
    if (codeDisplay) codeDisplay.style.display = 'none';
    if (invalidClient) {
      if (connectBtn) connectBtn.textContent = 'Retry Connect';
      const hint = document.getElementById('cloud-hint');
      if (hint) {
        hint.textContent = 'ChatGPT failed with invalid client. Keep local-first mode, or set a valid Advanced Client ID and retry.';
      }
      ui.showNotification('ChatGPT sign-in unavailable now. Using local-first mode.', 'error');
      state.mode = 'local';
      engine.mode = 'local';
      savePref('mode', 'local');
      renderChatStatusBar();
    } else {
      ui.showNotification('ChatGPT connection failed', 'error');
    }
  }
}

/**
 * Handle share target
 */
async function handleShareTarget(urlParams) {
  if (!urlParams.has('shared')) return null;
  try {
    const db = await new Promise((resolve, reject) => {
      const req = indexedDB.open('ai-space-share', 1);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    const tx = db.transaction('shared', 'readwrite');
    const store = tx.objectStore('shared');
    const all = await new Promise((resolve, reject) => {
      const req = store.getAll();
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    if (all.length > 0) {
      const latest = all[all.length - 1];
      const clearTx = db.transaction('shared', 'readwrite');
      clearTx.objectStore('shared').clear();
      return [latest.title, latest.text, latest.url].filter(Boolean).join('\n\n');
    }
  } catch {}
  return null;
}

/**
 * Handle incoming shortcut data from URL params
 */
async function handleIncomingShortcut() {
  const urlParams = new URLSearchParams(window.location.search);
  const invocation = shortcuts.parseIncoming(urlParams);
  if (invocation) {
    let result = null;
    try {
      result = await shortcuts.processInvocation(invocation, {
        memory,
        memoryReady
      });
      if (result?.notification) {
        ui?.showNotification(result.notification, 'success');
      }
      if (result?.suggestedActions && result.suggestedActions.length > 0) {
        pendingShortcutActions = result.suggestedActions;
      }
    } catch (err) {
      ui?.showNotification('Shortcut processing error: ' + err.message, 'error');
    }

    const prompt = result?.prompt || shortcuts.buildPrompt(invocation);
    if (prompt) {
      setTimeout(() => {
        sendMessage(prompt);
      }, 700);
    }

    // Clean URL
    if (window.history.replaceState) {
      window.history.replaceState({}, document.title, window.location.pathname);
    }
  }
}

/**
 * Export data
 */
async function handleExport() {
  if (!memoryReady) {
    ui.showNotification('Memory not available', 'error');
    return;
  }
  try {
    const data = await memory.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-space-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.showNotification('Data exported');
  } catch (err) {
    ui.showNotification('Export failed: ' + err.message, 'error');
  }
}

/**
 * Clear all data
 */
async function handleClearData() {
  if (!confirm('Delete all conversations and settings?')) return;
  try {
    if (memoryReady) await memory.clearAll();
    // Clear all localStorage keys used by the app
    [
      'ai-space-visited',
      'ai-space-kv-strategy',
      'ai-space-kv-ctx',
      'ai-space-kv-script',
      'ai-space-selected-model'
    ].forEach(k => localStorage.removeItem(k));
    state.messages = [];
    state.conversationId = null;
    ui.clearMessages();
    ui.showNotification('All data cleared');
    updateSettingsView();
  } catch (err) {
    ui.showNotification('Clear failed: ' + err.message, 'error');
  }
}

/**
 * Mic button — push to talk, single message. Tap to record, tap to stop.
 * Puts text in input field, user can edit before sending.
 */
async function handleMic() {
  const btn = document.getElementById('mic-btn');
  const input = document.getElementById('chat-input');

  if (!voice.supported) {
    ui.showNotification('Voice not supported', 'error');
    return;
  }

  if (voice.isRecording) {
    btn.classList.remove('active');
    const result = await voice.stopRecording();
    input.placeholder = 'Message...';
    if (result.text) {
      input.value = result.text;
      ui.autoResizeInput();
      ui.setSendEnabled(true);
    } else if (result.audio) {
      ui.showNotification('This browser captured audio but could not transcribe it. For live voice text, use a browser with SpeechRecognition.', 'error');
    }
    return;
  }

  try {
    voice.onInterimResult = (text) => {
      input.value = text;
      ui.autoResizeInput();
    };
    await voice.startRecording();
    btn.classList.add('active');
    input.placeholder = 'Listening...';
    input.value = '';
  } catch (err) {
    btn.classList.remove('active');
    input.placeholder = 'Message...';
    const micErrMsg = err.message || '';
    let micFriendly = 'Could not start the microphone.';
    if (/denied|not allowed|permission/i.test(micErrMsg)) {
      micFriendly = 'Microphone access denied. Check your browser settings.';
    } else if (/not found|no device/i.test(micErrMsg)) {
      micFriendly = 'No microphone found. Please connect one and try again.';
    } else if (/busy|in use/i.test(micErrMsg)) {
      micFriendly = 'Microphone is in use by another app.';
    }
    ui.showNotification(micFriendly, 'error');
  }
}

/**
 * Conversation mode — continuous voice loop.
 * Toggle on/off. When on: listen → silence → send → TTS → listen again.
 */
async function handleConversation() {
  const btn = document.getElementById('conv-btn');
  const input = document.getElementById('chat-input');

  // ── PersonaPlex full-duplex mode ──────────────────────────────────────────
  if (personaplexEnabled) {
    if (personaplexVoice.isRecording) {
      personaplexVoice.stopConversation();
      btn.classList.remove('active');
      input.value = '';
      input.placeholder = 'Message...';
      return;
    }
    if (!personaplexVoice.supported) {
      ui.showNotification('PersonaPlex requires WebSocket and WebAudio support.', 'error');
      return;
    }
    try {
      btn.classList.add('active');
      await personaplexVoice.startConversation();
    } catch (err) {
      btn.classList.remove('active');
      input.placeholder = 'Message...';
      ui.showNotification(err.message || 'Could not start PersonaPlex session.', 'error');
    }
    return;
  }

  // ── Browser Voice AI (Whisper STT, fully offline) ─────────────────────────
  if (browserVoiceAIEnabled) {
    if (browserVoiceAI.conversationMode) {
      browserVoiceAI.stopConversation();
      btn.classList.remove('active');
      input.value = '';
      input.placeholder = 'Message...';
      return;
    }
    if (!browserVoiceAI.supported) {
      ui.showNotification('Browser Voice AI requires MediaRecorder + AudioContext support.', 'error');
      return;
    }

    browserVoiceAI.onStateChange = (s) => {
      const labels = {
        loading: 'Loading Whisper model…',
        listening: 'Listening (offline)…',
        transcribing: 'Transcribing…',
        thinking: 'Thinking…',
        speaking: 'Speaking…',
        idle: 'Message...',
      };
      if (input) input.placeholder = labels[s] || 'Message...';
    };

    browserVoiceAI.onTranscript = (text) => {
      if (input) { input.value = text; ui.autoResizeInput(); }
    };

    browserVoiceAI.onError = (err) => {
      ui.showNotification(err.message || 'Browser Voice AI error', 'error');
      btn.classList.remove('active');
      input.placeholder = 'Message...';
    };

    try {
      btn.classList.add('active');
      input.placeholder = 'Loading Whisper model…';

      await browserVoiceAI.startConversation(async (userText) => {
        if (input) { input.value = ''; ui.autoResizeInput(); }
        await sendMessage(userText);
        const last = state.messages[state.messages.length - 1];
        return (last && last.role === 'assistant') ? last.content : '';
      });
    } catch (err) {
      btn.classList.remove('active');
      input.placeholder = 'Message...';
      ui.showNotification(err.message || 'Could not start Browser Voice AI.', 'error');
    }
    return;
  }

  // ── Standard browser conversation mode ───────────────────────────────────
  if (!voice.supported) {
    ui.showNotification('Voice not supported', 'error');
    return;
  }

  if (!voice.hasSpeechRecognition) {
    ui.showNotification('Conversation mode requires SpeechRecognition support (Chrome/Edge recommended).', 'error');
    return;
  }

  if (voice.conversationMode) {
    voice.stopConversation();
    conversationTurnBusy = false;
    btn.classList.remove('active');
    input.value = '';
    input.placeholder = 'Message...';
    return;
  }

  try {
    voice.onInterimResult = (text) => {
      input.value = text;
      ui.autoResizeInput();
    };

    voice.onSilenceDetected = async (text) => {
      if (conversationTurnBusy || state.isGenerating) return;

      conversationTurnBusy = true;
      try {
        let finalText = (text || '').trim();

        // Stop capture before sending to avoid overlap/echo in conversation mode.
        if (voice.isRecording) {
          const stopped = await voice.stopRecording();
          finalText = (stopped?.text || finalText || '').trim();
        }

        if (!finalText) {
          // Resume so conversation mode keeps listening after noise/empty silence.
          if (voice.conversationMode) voice.resumeListening().catch(() => {});
          return;
        }

        input.value = '';
        await sendMessage(finalText);

        const lastMsg = state.messages[state.messages.length - 1];
        if (lastMsg && lastMsg.role === 'assistant' && voice.ttsEnabled) {
          await voice.speak(lastMsg.content);
        }
      } finally {
        conversationTurnBusy = false;
      }

      if (voice.conversationMode) {
        voice.resumeListening();
      }
    };

    await voice.startConversation();
    btn.classList.add('active');
    input.placeholder = 'Conversation mode...';
    input.value = '';
  } catch (err) {
    btn.classList.remove('active');
    input.placeholder = 'Message...';
    const micErrMsg = err.message || '';
    let micFriendly = 'Could not start the microphone.';
    if (/denied|not allowed|permission/i.test(micErrMsg)) {
      micFriendly = 'Microphone access denied. Check your browser settings.';
    } else if (/not found|no device/i.test(micErrMsg)) {
      micFriendly = 'No microphone found. Please connect one and try again.';
    } else if (/busy|in use/i.test(micErrMsg)) {
      micFriendly = 'Microphone is in use by another app.';
    }
    ui.showNotification(micFriendly, 'error');
  }
}

/**
 * Sidebar toggle
 */
function toggleSidebar(open) {
  const sidebar = document.getElementById('chat-sidebar');
  const overlay = document.getElementById('sidebar-overlay');
  if (open) {
    sidebar?.classList.add('open');
    overlay?.classList.add('open');
    loadSidebarHistory();
  } else {
    sidebar?.classList.remove('open');
    overlay?.classList.remove('open');
  }
}

async function loadSidebarHistory() {
  if (!memoryReady) return;
  try {
    const convs = await memory.getConversations();
    ui.renderHistorySidebar(convs, state.conversationId, loadConversationFromSidebar);
  } catch {}
}


async function loadConversationFromSidebar(id) {
  if (!memoryReady) return;
  try {
    const conv = await memory.loadConversation(id);
    if (conv && conv.messages) {
      state.conversationId = id;
      state.messages = conv.messages;
      ui.clearMessages();
      for (const msg of conv.messages) {
        ui.renderMessage(msg.role, msg.content, false, msg.image || null);
      }
      savePref('last_conversation_id', id);
    }
  } catch {}
  toggleSidebar(false);
}

/**
 * Voice state UI
 */
voice.onStateChange = (s) => {
  const micBtn = document.getElementById('mic-btn');
  const convBtn = document.getElementById('conv-btn');
  const input = document.getElementById('chat-input');
  if (!input) return;

  // Clear all voice state classes from both buttons
  const voiceStateClasses = ['listening', 'processing', 'speaking'];
  [micBtn, convBtn].forEach((btn) => {
    if (btn) voiceStateClasses.forEach((c) => btn.classList.remove(c));
  });

  switch (s) {
    case 'listening':
      input.placeholder = voice.conversationMode ? 'Conversation mode...' : 'Listening...';
      if (voice.conversationMode) {
        if (convBtn) convBtn.classList.add('listening');
      } else {
        if (micBtn) micBtn.classList.add('listening');
      }
      break;
    case 'processing':
      input.placeholder = 'Thinking...';
      if (convBtn) convBtn.classList.add('processing');
      if (micBtn) micBtn.classList.add('processing');
      break;
    case 'speaking':
      input.placeholder = 'Speaking...';
      if (convBtn) convBtn.classList.add('speaking');
      break;
    default:
      if (!voice.conversationMode) {
        if (micBtn) micBtn.classList.remove('active');
        if (convBtn) convBtn.classList.remove('active');
        input.placeholder = 'Message...';
      }
  }
};

personaplexVoice.onStateChange = (s) => {
  const convBtn = document.getElementById('conv-btn');
  const input = document.getElementById('chat-input');
  if (!input) return;

  const voiceStateClasses = ['listening', 'processing', 'speaking'];
  if (convBtn) voiceStateClasses.forEach((c) => convBtn.classList.remove(c));

  switch (s) {
    case 'connecting':
      input.placeholder = 'Connecting to PersonaPlex...';
      break;
    case 'listening':
      input.placeholder = 'PersonaPlex listening...';
      if (convBtn) convBtn.classList.add('listening');
      break;
    case 'speaking':
      input.placeholder = 'PersonaPlex speaking...';
      if (convBtn) convBtn.classList.add('speaking');
      break;
    default:
      if (convBtn) {
        convBtn.classList.remove('active');
        voiceStateClasses.forEach((c) => convBtn.classList.remove(c));
      }
      input.placeholder = 'Message...';
  }
};

personaplexVoice.onTranscript = (text) => {
  // Show the user transcript in the chat as a user message
  if (text && text.trim()) {
    const input = document.getElementById('chat-input');
    if (input) input.value = text.trim();
  }
};

personaplexVoice.onAssistantText = (text) => {
  // Show assistant text transcript in chat if available
  if (text && text.trim()) {
    appendMessage({ role: 'assistant', content: text.trim() });
  }
};

personaplexVoice.onError = (err) => {
  ui.showNotification(err.message, 'error');
  const btn = document.getElementById('conv-btn');
  if (btn) btn.classList.remove('active');
  const input = document.getElementById('chat-input');
  if (input) input.placeholder = 'Message...';
};

/**
 * Camera / image input
 */
async function handleCamera() {
  try {
    const img = await camera.capture();
    const resized = await camera.resize(img.dataUrl);
    pendingImage = resized;

    const preview = document.getElementById('image-preview');
    const previewImg = document.getElementById('preview-img');
    if (previewImg) previewImg.src = resized;
    if (preview) preview.style.display = 'block';

    ui.setSendEnabled(true);
    await auditLog('image_input', { size: img.size, type: img.type });
  } catch (err) {
    if (err.message !== 'No image') {
      ui.showNotification('Camera error: ' + err.message, 'error');
    }
  }
}

/**
 * Restore last conversation from memory on reload
 */
async function restoreLastConversation() {
  if (!memoryReady) return;
  try {
    // Get the last active conversation ID
    const lastConvId = await memory.getPreference('last_conversation_id');
    if (!lastConvId) return;

    const conv = await memory.loadConversation(lastConvId);
    if (conv && conv.messages && conv.messages.length > 0) {
      state.conversationId = lastConvId;
      state.messages = conv.messages;

      // Re-render all messages
      if (ui) {
        ui.clearMessages();
        for (const msg of conv.messages) {
          ui.renderMessage(msg.role, msg.content, false, msg.image || null);
        }
        ui._scrollToBottom();
      }
      console.log(`[ai-space] restored conversation: ${conv.messages.length} messages`);
    }
  } catch (err) {
    console.warn('[ai-space] failed to restore conversation:', err);
  }
}

// ─── Token HUD ────────────────────────────────────────────────────────────────

/**
 * Update the live token HUD bar in the chat header.
 */
function updateTokenHUD() {
  const hud = document.getElementById('token-hud');
  const fill = document.getElementById('token-hud-fill');
  const label = document.getElementById('token-hud-label');
  if (!hud || !fill || !label) return;

  try {
    const metrics = engine.getKVMetrics();
    const { tokensOut, contextBudget, fillPct, throughputTps } = metrics;
    const tpsStr = throughputTps > 0 ? `${throughputTps.toFixed(1)} tok/s` : '';
    const ctx = contextBudget > 0 ? `${tokensOut.toLocaleString()} / ${contextBudget.toLocaleString()}` : '';
    const parts = [ctx, tpsStr].filter(Boolean);

    fill.style.width = `${fillPct}%`;
    label.textContent = parts.length ? parts.join(' · ') : '';
    hud.style.display = 'block';

    // Colour code: amber >= 60%, red >= 85%, gradient otherwise
    if (fillPct >= 85) {
      fill.style.background = '#f87171';
    } else if (fillPct >= 60) {
      fill.style.background = '#fbbf24';
    } else {
      fill.style.removeProperty('background');
    }
  } catch {}
}

// ─── KV Strategy Panel ───────────────────────────────────────────────────────

const KV_STRATEGY_DETAILS = {
  'standard': 'Direct token trimming. Best for short conversations. Zero overhead.',
  'sliding-window': 'Keeps the first message (attention anchor) + the most recent turns. Middle turns are summarised in one line.',
  'semantic-compress': 'Scores each turn by relevance (questions, code, numbers). Keeps high-value turns + the recent window.',
  'turbo-compress': 'Maximum efficiency: condenses older turns into a compact bullet synopsis. Only the most recent 6 turns kept verbatim.'
};

/**
 * Update the KV badge text in the chat header.
 * @param {string} strategy  KV strategy id
 * @param {string} ctxMode   context window mode: standard|extended|ultra
 */
function updateTurboKVBadge(strategy, ctxMode) {
  const badge = document.getElementById('turbo-kv-badge');
  if (!badge) return;
  const stratLabels = { standard: 'STD', 'sliding-window': 'SW', 'semantic-compress': 'SC', 'turbo-compress': 'TC', custom: 'CS' };
  const ctxLabels = { standard: '', extended: '·4K', ultra: '·8K' };
  badge.textContent = (stratLabels[strategy] || 'STD') + (ctxLabels[ctxMode] || '');
}

/**
 * Update KV metrics display in the settings panel.
 */
function updateKVMetricsDisplay() {
  try {
    const m = engine.getKVMetrics();
    const el = (id) => document.getElementById(id);
    if (el('kvm-tokens-in')) el('kvm-tokens-in').textContent = m.tokensIn > 0 ? m.tokensIn.toLocaleString() : '—';
    if (el('kvm-tokens-out')) el('kvm-tokens-out').textContent = m.tokensOut > 0 ? m.tokensOut.toLocaleString() : '—';
    if (el('kvm-compressions')) el('kvm-compressions').textContent = m.compressions;
    if (el('kvm-tps')) el('kvm-tps').textContent = m.throughputTps > 0 ? m.throughputTps.toFixed(1) : '—';
    if (el('kvm-fill')) el('kvm-fill').textContent = m.fillPct + '%';
    if (el('kv-progress-fill')) el('kv-progress-fill').style.width = m.fillPct + '%';

    // Update log
    const log = engine.getKVLog();
    const logEl = el('kv-log');
    const countEl = el('kv-log-count');
    if (logEl) {
      if (log.length === 0) {
        logEl.innerHTML = '<div style="color:var(--fg-dim);font-size:12px;">No compressions yet. Start a long conversation.</div>';
      } else {
        logEl.innerHTML = [...log].reverse().map(l => `<div>${l}</div>`).join('');
      }
    }
    if (countEl) countEl.textContent = `(${log.length} event${log.length !== 1 ? 's' : ''})`;
  } catch {}
}

/**
 * Initialize the KV Strategy panel and context chip selectors.
 */
function initTurboKV() {
  // Restore saved KV strategy and context window mode
  const savedStrategy = localStorage.getItem('ai-space-kv-strategy') || 'standard';
  const savedCtx = localStorage.getItem('ai-space-kv-ctx') || 'standard';
  state.kvMode = savedCtx;
  engine.setKVStrategy(savedStrategy);
  updateTurboKVBadge(savedStrategy, savedCtx);

  // Wire strategy cards
  const stratCards = document.querySelectorAll('#kv-strategy-grid .kv-strategy-card');
  const detailEl = document.getElementById('kv-strategy-detail');
  stratCards.forEach(card => {
    const id = card.dataset.strategy;
    card.classList.toggle('selected', id === savedStrategy);
    card.addEventListener('click', () => {
      stratCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      localStorage.setItem('ai-space-kv-strategy', id);
      engine.setKVStrategy(id);
      if (detailEl) detailEl.textContent = KV_STRATEGY_DETAILS[id] || '';
      updateTurboKVBadge(id, localStorage.getItem('ai-space-kv-ctx') || 'standard');
      ui.showNotification(`KV strategy: ${card.querySelector('.kv-strategy-name')?.textContent || id}`);
    });
  });
  if (detailEl) detailEl.textContent = KV_STRATEGY_DETAILS[savedStrategy] || '';

  // Wire context window chips
  const ctxChips = document.querySelectorAll('.kv-ctx-chip');
  ctxChips.forEach(chip => {
    chip.classList.toggle('selected', chip.dataset.ctx === savedCtx);
    chip.addEventListener('click', () => {
      ctxChips.forEach(c => c.classList.remove('selected'));
      chip.classList.add('selected');
      const ctx = chip.dataset.ctx;
      localStorage.setItem('ai-space-kv-ctx', ctx);
      // Update state for model loading
      state.kvMode = ctx;
      updateTurboKVBadge(localStorage.getItem('ai-space-kv-strategy') || 'standard', ctx);
      ui.showNotification('Context window updated — reload model to apply');
    });
  });

  // Wire custom script editor
  const scriptEl = document.getElementById('kv-custom-script');
  const applyBtn = document.getElementById('kv-apply-script');
  const clearBtn = document.getElementById('kv-clear-script');
  const statusEl = document.getElementById('kv-script-status');

  const savedScript = localStorage.getItem('ai-space-kv-script') || '';
  if (scriptEl && savedScript) scriptEl.value = savedScript;

  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      const script = scriptEl?.value?.trim() || '';
      if (!script) {
        if (statusEl) { statusEl.textContent = 'Script is empty.'; statusEl.className = 'kv-script-status err'; }
        return;
      }
      try {
        engine.setKVCustomScript(script);
        engine.setKVStrategy('custom');
        // Select no strategy card
        stratCards.forEach(c => c.classList.remove('selected'));
        localStorage.setItem('ai-space-kv-script', script);
        localStorage.setItem('ai-space-kv-strategy', 'custom');
        updateTurboKVBadge('custom', localStorage.getItem('ai-space-kv-ctx') || 'standard');
        if (statusEl) { statusEl.textContent = '✓ Custom script active'; statusEl.className = 'kv-script-status ok'; }
        ui.showNotification('Custom KV script applied');
      } catch (err) {
        if (statusEl) { statusEl.textContent = '✗ ' + err.message; statusEl.className = 'kv-script-status err'; }
      }
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      if (scriptEl) scriptEl.value = '';
      engine.setKVCustomScript('');
      engine.setKVStrategy('standard');
      localStorage.removeItem('ai-space-kv-script');
      localStorage.setItem('ai-space-kv-strategy', 'standard');
      stratCards.forEach(c => c.classList.toggle('selected', c.dataset.strategy === 'standard'));
      if (statusEl) { statusEl.textContent = ''; statusEl.className = 'kv-script-status'; }
      updateTurboKVBadge('standard', localStorage.getItem('ai-space-kv-ctx') || 'standard');
      ui.showNotification('KV script cleared — using Standard strategy');
    });
  }

  // Wire model catalog cards
  const modelCards = document.querySelectorAll('#model-catalog .model-card');
  modelCards.forEach(card => {
    card.addEventListener('click', () => {
      modelCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      const modelId = card.dataset.modelId;
      const picker = document.getElementById('local-model-picker');
      if (picker) picker.value = modelId;
    });
  });

  // Badge click → open settings + scroll
  const badge = document.getElementById('turbo-kv-badge');
  if (badge) {
    badge.addEventListener('click', () => {
      ui.showView('settings');
      setTimeout(() => {
        const sec = document.getElementById('turbo-kv-section');
        if (sec) sec.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  }
}

// ─── Command Palette ──────────────────────────────────────────────────────────

let _cmdOpen = false;
let _cmdActiveIdx = -1;
let _cmdItems = [];

/**
 * Build the full command list from current state.
 * @returns {Array<{section, icon, name, desc, tag, action}>}
 */
function buildCommandList(query) {
  const q = (query || '').toLowerCase().trim();

  const all = [
    // ── Actions ──
    { section: 'Actions', icon: '✏️', name: 'New Conversation', desc: 'Clear current chat and start fresh', action: () => { handleNewConversation?.(); closeCommandPalette(); } },
    { section: 'Actions', icon: '⚙️', name: 'Open Settings', desc: 'Configure model, cloud, KV, and more', action: () => { ui.showView('settings'); closeCommandPalette(); } },
    { section: 'Actions', icon: '🗑️', name: 'Clear All Data', desc: 'Delete all conversations and preferences', action: () => { closeCommandPalette(); handleClearData?.(); } },
    // ── KV Strategies ──
    ...([
      { id: 'standard',         icon: '◈',   name: 'KV: Standard',          desc: 'Direct token trimming — no transformation' },
      { id: 'sliding-window',   icon: '⟨⟩',  name: 'KV: Sliding Window',    desc: 'Attention-sink + recency window' },
      { id: 'semantic-compress', icon: '◉',  name: 'KV: Semantic Compress',  desc: 'Importance-scored context selection' },
      { id: 'turbo-compress',   icon: '⚡',   name: 'KV: Turbo Compress',    desc: 'Maximum efficiency — bullet synopsis' }
    ].map(({ id, icon, name, desc }) => ({
      section: 'KV Strategy', icon, name, desc, tag: 'KV',
      action: () => {
        engine.setKVStrategy(id);
        localStorage.setItem('ai-space-kv-strategy', id);
        updateTurboKVBadge(id, localStorage.getItem('ai-space-kv-ctx') || 'standard');
        document.querySelectorAll('#kv-strategy-grid .kv-strategy-card')
          .forEach(c => c.classList.toggle('selected', c.dataset.strategy === id));
        ui.showNotification(name);
        closeCommandPalette();
      }
    })))
  ];

  // Add models from WEB_LLM_MODELS (single source of truth)
  for (const [modelId, info] of Object.entries(WEB_LLM_MODELS)) {
    all.push({
      section: 'Models',
      icon: '🤖',
      name: `Switch to ${info.name}`,
      desc: `${info.description} · ${info.size}`,
      tag: 'Model',
      action: () => {
        const picker = document.getElementById('local-model-picker');
        if (picker) picker.value = modelId;
        document.querySelectorAll('#model-catalog .model-card').forEach(c => c.classList.toggle('selected', c.dataset.modelId === modelId));
        closeCommandPalette();
        handleSwitchModel?.();
      }
    });
  }

  if (!q) return all;
  return all.filter(item =>
    item.name.toLowerCase().includes(q) ||
    item.desc.toLowerCase().includes(q) ||
    (item.section || '').toLowerCase().includes(q)
  );
}

function renderCommandPalette(query) {
  const results = document.getElementById('cmd-results');
  if (!results) return;

  _cmdItems = buildCommandList(query);
  _cmdActiveIdx = _cmdItems.length > 0 ? 0 : -1;

  // Group by section
  const sections = {};
  for (const item of _cmdItems) {
    if (!sections[item.section]) sections[item.section] = [];
    sections[item.section].push(item);
  }

  results.innerHTML = '';
  let globalIdx = 0;

  for (const [section, items] of Object.entries(sections)) {
    const label = document.createElement('div');
    label.className = 'cmd-section-label';
    label.textContent = section;
    results.appendChild(label);

    for (const item of items) {
      const idx = globalIdx++;
      const el = document.createElement('div');
      el.className = 'cmd-item' + (idx === 0 ? ' active' : '');
      el.dataset.idx = idx;
      el.innerHTML = `
        <div class="cmd-item-icon">${item.icon}</div>
        <div class="cmd-item-text">
          <div class="cmd-item-name">${item.name}</div>
          <div class="cmd-item-desc">${item.desc}</div>
        </div>
        ${item.tag ? `<span class="cmd-item-tag">${item.tag}</span>` : ''}
      `;
      el.addEventListener('click', () => { item.action?.(); });
      el.addEventListener('mouseenter', () => {
        document.querySelectorAll('.cmd-item').forEach(e => e.classList.remove('active'));
        el.classList.add('active');
        _cmdActiveIdx = idx;
      });
      results.appendChild(el);
    }
  }

  if (_cmdItems.length === 0) {
    results.innerHTML = '<div style="padding:24px;text-align:center;color:var(--fg-dim);font-size:14px;">No commands found</div>';
  }
}

function openCommandPalette() {
  _cmdOpen = true;
  const palette = document.getElementById('cmd-palette');
  const backdrop = document.getElementById('cmd-backdrop');
  const input = document.getElementById('cmd-search');
  if (palette) palette.classList.add('open');
  if (backdrop) backdrop.classList.add('open');
  if (input) { input.value = ''; input.focus(); }
  renderCommandPalette('');
}

function closeCommandPalette() {
  _cmdOpen = false;
  document.getElementById('cmd-palette')?.classList.remove('open');
  document.getElementById('cmd-backdrop')?.classList.remove('open');
}

function initCommandPalette() {
  const backdrop = document.getElementById('cmd-backdrop');
  const search = document.getElementById('cmd-search');

  if (backdrop) backdrop.addEventListener('click', closeCommandPalette);

  if (search) {
    search.addEventListener('input', (e) => renderCommandPalette(e.target.value));
    search.addEventListener('keydown', (e) => {
      const items = document.querySelectorAll('.cmd-item');
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        _cmdActiveIdx = Math.min(_cmdActiveIdx + 1, _cmdItems.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        _cmdActiveIdx = Math.max(_cmdActiveIdx - 1, 0);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        _cmdItems[_cmdActiveIdx]?.action?.();
        return;
      } else if (e.key === 'Escape') {
        closeCommandPalette();
        return;
      }
      items.forEach((el, i) => el.classList.toggle('active', i === _cmdActiveIdx));
      items[_cmdActiveIdx]?.scrollIntoView({ block: 'nearest' });
    });
  }

  // Global shortcut: Cmd+K / Ctrl+K
  document.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      _cmdOpen ? closeCommandPalette() : openCommandPalette();
    }
    if (e.key === 'Escape' && _cmdOpen) closeCommandPalette();
  });
}

// ─── Theme Settings UI ───────────────────────────────────────────────────────

function initThemeSettingsUI() {
  const grid = document.getElementById('theme-palette-grid');
  const onboardingGrid = document.getElementById('onboarding-theme-grid');
  if (!grid && !onboardingGrid) return;

  const palettes = themeEngine.listPalettes();
  const currentId = themeEngine.currentPalette;

  function renderGrid(container) {
    if (!container) return;
    container.innerHTML = '';
    for (const p of palettes) {
      const btn = document.createElement('button');
      btn.className = 'theme-palette-btn' + (p.id === currentId ? ' selected' : '');
      btn.dataset.palette = p.id;
      btn.innerHTML = `<div class="theme-palette-swatch" style="background:${p.accent}"></div><span>${p.name}</span>`;
      btn.addEventListener('click', () => {
        themeEngine.setPalette(p.id);
        container.querySelectorAll('.theme-palette-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        // Sync avatar glow color with theme
        const palette = THEME_PALETTES[p.id];
        if (palette) {
          avatar.updateAppearance({ glowColor: palette.avatarGlow });
          avatar.save();
        }
        // Sync the other grid if it exists
        const otherId = container.id === 'theme-palette-grid' ? 'onboarding-theme-grid' : 'theme-palette-grid';
        const other = document.getElementById(otherId);
        if (other) {
          other.querySelectorAll('.theme-palette-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.palette === p.id);
          });
        }
      });
      container.appendChild(btn);
    }
  }

  renderGrid(grid);
  renderGrid(onboardingGrid);
}

// ─── Avatar Settings UI ──────────────────────────────────────────────────────

function initAvatarSettingsUI() {
  const grid = document.getElementById('avatar-preset-grid');
  const onboardingGrid = document.getElementById('onboarding-avatar-grid');
  const nameInput = document.getElementById('avatar-name-input');
  const faceSelect = document.getElementById('avatar-face-shape');
  const voiceSelect = document.getElementById('avatar-voice-style');

  // Preset grids
  function renderPresetGrid(container) {
    if (!container) return;
    container.innerHTML = '';
    for (const name of PRESET_NAMES) {
      const preset = AVATAR_PRESETS[name];
      const btn = document.createElement('button');
      btn.className = 'avatar-preset-btn' + (avatar.appearance.name === preset.name ? ' selected' : '');
      btn.dataset.preset = name;
      btn.innerHTML = `<div class="avatar-preset-swatch" style="background:${preset.primaryColor};border-radius:${preset.faceShape === 'square' ? '4px' : '50%'}"></div><span>${preset.name}</span>`;
      btn.addEventListener('click', () => {
        avatar.applyPreset(name);
        avatar.save();
        container.querySelectorAll('.avatar-preset-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        // Sync inputs
        if (nameInput) nameInput.value = preset.name;
        if (faceSelect) faceSelect.value = preset.faceShape;
        // Update avatar name display
        updateAvatarDisplay();
        // Sync the other grid
        const otherId = container.id === 'avatar-preset-grid' ? 'onboarding-avatar-grid' : 'avatar-preset-grid';
        const other = document.getElementById(otherId);
        if (other) {
          other.querySelectorAll('.avatar-preset-btn').forEach(b => {
            b.classList.toggle('selected', b.dataset.preset === name);
          });
        }
      });
      container.appendChild(btn);
    }
  }

  renderPresetGrid(grid);
  renderPresetGrid(onboardingGrid);

  // Name input
  if (nameInput) {
    nameInput.value = avatar.appearance.name;
    nameInput.addEventListener('change', () => {
      const val = nameInput.value.trim();
      if (val) {
        avatar.updateAppearance({ name: val });
        avatar.save();
        updateAvatarDisplay();
      }
    });
  }

  // Onboarding avatar name
  const onboardingAvatarName = document.getElementById('onboarding-avatar-name');
  if (onboardingAvatarName) {
    onboardingAvatarName.value = avatar.appearance.name;
    onboardingAvatarName.addEventListener('change', () => {
      const val = onboardingAvatarName.value.trim();
      if (val) {
        avatar.updateAppearance({ name: val });
        avatar.save();
        if (nameInput) nameInput.value = val;
        updateAvatarDisplay();
      }
    });
  }

  // Face shape
  if (faceSelect) {
    faceSelect.value = avatar.appearance.faceShape;
    faceSelect.addEventListener('change', () => {
      avatar.updateAppearance({ faceShape: faceSelect.value });
      avatar.save();
    });
  }

  // Voice style
  if (voiceSelect) {
    voiceSelect.addEventListener('change', () => {
      avatarVoice.setStyle(voiceSelect.value);
    });
  }

  // Skip avatar onboarding step
  const skipAvatarBtn = document.getElementById('onboarding-skip-avatar');
  if (skipAvatarBtn) {
    skipAvatarBtn.addEventListener('click', () => goToOnboardingStep(6));
  }
}

function updateAvatarDisplay() {
  const nameEl = document.getElementById('avatar-name');
  const statusEl = document.getElementById('avatar-status');
  if (nameEl) nameEl.textContent = avatar.appearance.name;
  if (statusEl) statusEl.textContent = avatar.state;
}

// ─── Avatar Scene ────────────────────────────────────────────────────────────

function initAvatarScene() {
  const canvas = document.getElementById('avatar-canvas');
  if (!canvas) return;

  sceneManager.attach(canvas);
  sceneManager.avatar = avatar;
  sceneManager.start();
  updateAvatarDisplay();

  // Update avatar display when state changes
  const origSetState = avatar.setState.bind(avatar);
  avatar.setState = function(newState) {
    origSetState(newState);
    updateAvatarDisplay();
  };

  // Show/hide avatar based on whether there are messages
  const container = document.getElementById('avatar-scene-container');
  if (container) {
    // Show by default, hide when messages exist
    const observer = new MutationObserver(() => {
      const msgs = document.getElementById('messages');
      if (msgs && msgs.children.length > 0) {
        container.classList.add('hidden');
      } else {
        container.classList.remove('hidden');
      }
    });
    const msgs = document.getElementById('messages');
    if (msgs) {
      observer.observe(msgs, { childList: true });
    }
  }
}

export { initApp };

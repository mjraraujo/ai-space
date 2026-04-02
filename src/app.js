/**
 * App - Main controller for AI Space
 */

import { AIEngine } from './ai-engine.js';
import { Memory } from './memory.js';
import { Audit } from './audit.js';
import { Shortcuts } from './shortcuts.js';
import { UI } from './ui.js';
import { Voice } from './voice.js';
import { Camera } from './camera.js';
import { deviceAuthFlow, getAuthIssuer, getClientIdOverride, setClientIdOverride, clearClientIdOverride } from './codex-auth.js';
import { RelayHub } from './relays.js';
import { RuntimeAgent } from './runtime-agent.js';
import { isWebLookupIntent, extractWebQuery, looksLikeLegacyRuntimeScript, parseModelSizeToBytes } from './utils.js';

// State
const state = {
  phase: 'onboarding',
  mode: 'local',
  conversationId: null,
  messages: [],
  isGenerating: false,
  firstVisit: true,
  runtimeMode: 'strict',
  localInternetAssist: false
};

// Modules
const engine = new AIEngine();
const memory = new Memory();
const audit = new Audit();
const shortcuts = new Shortcuts();
const relays = new RelayHub();
const runtimeAgent = new RuntimeAgent();
const voice = new Voice();
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
  const presets = RuntimeAgent.getPresets();

  const exact = presets.find((p) => t.includes(p.id.toLowerCase()));
  if (exact) return exact;

  if (t.includes('health') || t.includes('check status') || t.includes('deploy')) {
    return presets.find((p) => p.id === 'health-check') || presets[0];
  }
  if (t.includes('artifact') || t.includes('relay')) {
    return presets.find((p) => p.id === 'relay-artifact') || presets[0];
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

    activeRuntimeJobId = runtimeAgent.run(script, {
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
  const intent = parseLocalSkillIntent(userText);
  if (!intent) return { handled: false };

  if (intent.kind === 'runtime-stop') {
    if (!activeRuntimeJobId) {
      return { handled: true, response: 'Runtime is not running right now.' };
    }
    openLiveActivity('Runtime Skill', 'Stopping...', 'running');
    const cancelled = runtimeAgent.cancel(activeRuntimeJobId);
    activeRuntimeJobId = null;
    setRuntimeButtons(false);
    updateLiveActivityStatus(cancelled ? 'Stopped' : 'Stop failed', cancelled ? 'idle' : 'error');
    closeLiveActivity(1500);
    return {
      handled: true,
      response: cancelled ? 'Runtime stopped successfully.' : 'Could not stop runtime job.'
    };
  }

  if (intent.kind === 'runtime-run') {
    if (activeRuntimeJobId) {
      return { handled: true, response: 'A runtime task is already running. Stop it first or wait to complete.' };
    }

    const preset = intent.preset;
    const script = intent.customScript || preset?.script || RuntimeAgent.getPresets()[0]?.script || '';
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
  if (!q || !navigator.onLine || !state.localInternetAssist) return '';

  const search = encodeURIComponent(q.slice(0, 180));
  const url = `https://en.wikipedia.org/w/api.php?action=opensearch&search=${search}&limit=3&namespace=0&format=json&origin=*`;

  try {
    const res = await fetch(url, { method: 'GET' });
    if (!res.ok) return '';
    const data = await res.json();
    const titles = Array.isArray(data?.[1]) ? data[1] : [];
    const descs = Array.isArray(data?.[2]) ? data[2] : [];
    const links = Array.isArray(data?.[3]) ? data[3] : [];

    const items = [];
    for (let i = 0; i < Math.min(3, titles.length); i++) {
      const title = titles[i] || 'Untitled';
      const desc = descs[i] || '';
      const link = links[i] || '';
      items.push(`${i + 1}. ${title}${desc ? ' — ' + desc : ''}${link ? ' (' + link + ')' : ''}`);
    }

    if (items.length === 0) return '';
    return [
      'Live web context (use cautiously, may be incomplete):',
      ...items
    ].join('\n');
  } catch {
    return '';
  }
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

  // Wire event listeners FIRST so buttons work immediately
  wireEventListeners();

  // Keep chat UX resilient when connectivity changes.
  setupConnectivityListeners();

  // Initialize memory in background — never block the UI
  initMemoryInBackground();

  // Check for incoming shortcut data
  handleIncomingShortcut();

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

      // Restore last conversation
      await restoreLastConversation();
    } catch (err) {
      console.warn('[ai-space] memory init failed:', err);
      memoryReady = false;
    }
  })();
}

/**
 * Onboarding wizard state
 */
let onboardingStep = 0;
let onboardingData = {
  interactionMode: 'chat',
  name: '',
  timezone: '',
  dateStr: '',
  tone: 'balanced',
  voiceIndex: -1
};
let onboardingAutoAdvanceTimer = null;

/**
 * Build personalized system prompt suffix from user preferences
 */
function buildPersonalizedPrompt() {
  const parts = [];
  if (onboardingData.name) {
    parts.push(`The user's name is ${onboardingData.name}.`);
  }
  if (onboardingData.tone && onboardingData.tone !== 'balanced') {
    const toneDesc = {
      casual: 'casual and relaxed',
      professional: 'professional and precise',
      playful: 'playful and creative'
    };
    parts.push(`They prefer a ${toneDesc[onboardingData.tone] || onboardingData.tone} communication style.`);
  }
  if (onboardingData.timezone) {
    parts.push(`Their timezone is ${onboardingData.timezone}.`);
  }
  if (onboardingData.dateStr) {
    parts.push(`Today is ${onboardingData.dateStr}.`);
  }
  if (onboardingData.interactionMode === 'talk') {
    parts.push('The user prefers voice interaction.');
  }
  return parts.length > 0 ? '\n\n' + parts.join(' ') : '';
}

/**
 * Transition to a specific onboarding step
 */
function goToOnboardingStep(step) {
  // Clear any pending auto-advance
  if (onboardingAutoAdvanceTimer) {
    clearTimeout(onboardingAutoAdvanceTimer);
    onboardingAutoAdvanceTimer = null;
  }

  // Hide all steps, show target
  document.querySelectorAll('.onboarding-step').forEach(el => {
    el.classList.remove('active');
  });

  onboardingStep = step;

  const next = document.getElementById(`onboarding-step-${step}`);
  if (next) {
    next.classList.add('active');
  }

  // Voice guidance for talk mode
  if (onboardingData.interactionMode === 'talk' && step > 1) {
    const title = next?.querySelector('.onboarding-step-title');
    if (title && voice.ttsEnabled) {
      try { voice.speak(title.textContent); } catch {}
    }
  }

  // Step-specific logic
  onStepEnter(step);
}

/**
 * Step-specific initialization when entering a step
 */
function onStepEnter(step) {
  switch (step) {
    case 0:
      // Softer intro timing with manual continue option.
      onboardingAutoAdvanceTimer = setTimeout(() => goToOnboardingStep(1), 6000);
      break;

    case 2: {
      // Focus name input
      const nameInput = document.getElementById('onboarding-name');
      if (nameInput) {
        setTimeout(() => nameInput.focus(), 400);
      }
      // If talk mode, try to listen for name
      if (onboardingData.interactionMode === 'talk' && voice.hasSpeechRecognition) {
        try {
          voice.onSilenceDetected = (text) => {
            if (text && text.trim()) {
              onboardingData.name = text.trim();
              if (nameInput) nameInput.value = onboardingData.name;
              voice.onSilenceDetected = null;
              goToOnboardingStep(3);
            }
          };
          voice.onInterimResult = (text) => {
            if (nameInput) nameInput.value = text;
          };
          voice.startRecording();
        } catch {}
      }
      break;
    }

    case 3: {
      // Auto-detect timezone and date
      try {
        onboardingData.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
      } catch {
        onboardingData.timezone = 'Unknown';
      }
      const now = new Date();
      onboardingData.dateStr = now.toLocaleDateString(undefined, {
        weekday: 'long', year: 'numeric', month: 'long', day: 'numeric'
      });
      const infoEl = document.getElementById('onboarding-location-info');
      if (infoEl) {
        infoEl.textContent = `It looks like you're in ${onboardingData.timezone} and today is ${onboardingData.dateStr}.`;
      }
      // Wait for explicit confirmation to avoid a rushed onboarding flow.
      break;
    }

    case 5: {
      // Voice picker — populate voices
      if (onboardingData.interactionMode !== 'talk') {
        // Skip voice picker if chat mode
        goToOnboardingStep(6);
        return;
      }
      populateVoicePicker();
      break;
    }

    case 6: {
      // Ready step
      const readyTitle = document.getElementById('onboarding-ready-title');
      const displayName = onboardingData.name || 'friend';
      if (readyTitle) {
        readyTitle.textContent = `You're all set, ${displayName}.`;
      }

      // Check WebGPU and show status
      setupReadyStep();
      break;
    }
  }
}

/**
 * Populate voice picker with available SpeechSynthesis voices
 */
function populateVoicePicker() {
  const list = document.getElementById('onboarding-voice-list');
  if (!list) return;

  const getVoices = () => {
    const allVoices = speechSynthesis.getVoices();
    // Filter to user's language
    const userLang = navigator.language?.split('-')[0] || 'en';
    let filtered = allVoices.filter(v => v.lang.startsWith(userLang));
    if (filtered.length === 0) filtered = allVoices.filter(v => v.lang.startsWith('en'));
    if (filtered.length === 0) filtered = allVoices;

    // Show up to 5
    const shown = filtered.slice(0, 5);
    list.innerHTML = '';

    shown.forEach((v, i) => {
      const card = document.createElement('div');
      card.className = 'onboarding-voice-card';
      card.dataset.voiceIndex = String(allVoices.indexOf(v));

      const name = document.createElement('span');
      name.className = 'onboarding-voice-name';
      name.textContent = v.name.replace(/Microsoft |Google |Apple /, '');

      const preview = document.createElement('button');
      preview.className = 'onboarding-voice-preview';
      preview.textContent = '▶ Preview';
      preview.addEventListener('click', (e) => {
        e.stopPropagation();
        const utt = new SpeechSynthesisUtterance('Hello! I can be your voice.');
        utt.voice = v;
        speechSynthesis.cancel();
        speechSynthesis.speak(utt);
      });

      card.appendChild(name);
      card.appendChild(preview);

      card.addEventListener('click', () => {
        onboardingData.voiceIndex = allVoices.indexOf(v);
        list.querySelectorAll('.onboarding-voice-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        setTimeout(() => goToOnboardingStep(6), 300);
      });

      list.appendChild(card);
    });

    if (shown.length === 0) {
      list.innerHTML = '<p class="onboarding-info">No voices available</p>';
    }
  };

  // Voices may load async
  if (speechSynthesis.getVoices().length > 0) {
    getVoices();
  } else {
    speechSynthesis.addEventListener('voiceschanged', getVoices, { once: true });
    // Fallback if voices never fire
    setTimeout(getVoices, 500);
  }
}

/**
 * Setup the ready step — check WebGPU, show mode, optional download
 */
async function setupReadyStep() {
  const badge = document.getElementById('onboarding-mode-badge');
  const info = document.getElementById('onboarding-ready-info');
  const downloadEl = document.getElementById('onboarding-download-progress');

  let hasWebGPU = false;
  try {
    hasWebGPU = await engine.checkWebGPU();
  } catch {
    hasWebGPU = false;
  }

  if (hasWebGPU) {
    if (badge) badge.textContent = '⚡ Running locally on your device';
    if (info) info.textContent = 'Your AI model will download now. After that, everything runs offline on your device.';
    if (downloadEl) downloadEl.style.display = 'flex';

    // Start model download
    try {
      const selectedModel = document.getElementById('onboarding-model-picker')?.value || null;
      await engine.init(selectedModel, (progress) => {
        const pct = Math.round((progress.progress || 0) * 100);
        ui.updateProgress(pct, progress.text || 'Downloading...');
      });
      const loadedModelId = engine.getStatus().modelId;
      await auditLog('model_load', { model: loadedModelId, success: true });
      savePref('selected_model', loadedModelId);
      ui.updateProgress(100, 'Ready!');
    } catch (err) {
      console.error('Model download failed:', err);
      state.mode = 'cloud';
      engine.mode = 'cloud';
      savePref('mode', 'cloud');
      if (badge) badge.textContent = '☁️ Running in cloud mode';
      if (info) info.textContent = 'Local model failed to load. Using cloud mode instead.';
      if (downloadEl) downloadEl.style.display = 'none';
    }
  } else {
    state.mode = 'cloud';
    engine.mode = 'cloud';
    savePref('mode', 'cloud');
    if (badge) badge.textContent = '☁️ Running in cloud mode';
    if (info) info.textContent = 'WebGPU is not available on this device. Using cloud mode for AI inference.';
    if (downloadEl) downloadEl.style.display = 'none';
  }
}

/**
 * Complete onboarding — save preferences and go to chat
 */
async function completeOnboarding() {
  // Save all preferences
  savePref('interaction_mode', onboardingData.interactionMode);
  savePref('user_name', onboardingData.name);
  savePref('timezone', onboardingData.timezone);
  savePref('tone', onboardingData.tone);
  savePref('voice_index', onboardingData.voiceIndex);

  // Build and save personalized prompt context
  const promptContext = buildPersonalizedPrompt();
  savePref('prompt_context', promptContext);

  // Set it on the engine
  engine.promptContext = promptContext;

  await markVisited();
  transition('chat');
}

/**
 * Start onboarding — multi-step wizard for first-time users
 */
async function startOnboarding() {
  // Check if returning user
  // (state.firstVisit is set by memory in background, but may not be ready yet)
  // We start the wizard regardless — initMemoryInBackground will set firstVisit

  // Load any saved preferences for returning users (async, non-blocking)
  loadSavedOnboardingPrefs();

  // Start at step 0
  goToOnboardingStep(0);
}

/**
 * Load saved onboarding preferences for returning users or prompt context
 */
async function loadSavedOnboardingPrefs() {
  // Wait a bit for memory to be ready
  const waitForMemory = () => new Promise(resolve => {
    if (memoryReady) return resolve(true);
    let attempts = 0;
    const check = setInterval(() => {
      attempts++;
      if (memoryReady || attempts > 20) {
        clearInterval(check);
        resolve(memoryReady);
      }
    }, 100);
  });

  await waitForMemory();
  if (!memoryReady) return;

  try {
    const promptContext = await memory.getPreference('prompt_context');
    if (promptContext) {
      engine.promptContext = promptContext;
    }

    // Also load individual prefs for the data object
    const name = await memory.getPreference('user_name');
    if (name) onboardingData.name = name;
    const tone = await memory.getPreference('tone');
    if (tone) onboardingData.tone = tone;
    const tz = await memory.getPreference('timezone');
    if (tz) onboardingData.timezone = tz;
    const mode = await memory.getPreference('interaction_mode');
    if (mode) onboardingData.interactionMode = mode;
    const vi = await memory.getPreference('voice_index');
    if (vi !== null && vi !== undefined) onboardingData.voiceIndex = vi;
  } catch {}
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
    await engine.init(null, () => {});
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
      onboardingData.interactionMode = card.dataset.mode;
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
        onboardingData.name = nameInput.value.trim();
        goToOnboardingStep(3);
      }
    });
  }
  const skipNameBtn = document.getElementById('onboarding-skip-name');
  if (skipNameBtn) skipNameBtn.addEventListener('click', () => {
    onboardingData.name = nameInput?.value?.trim() || '';
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
      onboardingData.tone = card.dataset.tone;
      document.querySelectorAll('#onboarding-tone-cards .onboarding-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      setTimeout(() => goToOnboardingStep(5), 250);
    });
  });

  // Step 5: Skip voice
  const skipVoiceBtn = document.getElementById('onboarding-skip-voice');
  if (skipVoiceBtn) skipVoiceBtn.addEventListener('click', () => goToOnboardingStep(6));

  // Step 6: Enter space
  const enterBtn = document.getElementById('onboarding-enter');
  if (enterBtn) enterBtn.addEventListener('click', () => completeOnboarding());

  // Step 0: Manual continue for first impression control
  const startNowBtn = document.getElementById('onboarding-start-now');
  if (startNowBtn) startNowBtn.addEventListener('click', () => goToOnboardingStep(1));

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
    state.messages = [];
    state.conversationId = 'conv_' + Date.now();
    ui.clearMessages();
    toggleSidebar(false);
    savePref('last_conversation_id', state.conversationId);
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

    RuntimeAgent.getPresets().forEach((preset) => {
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
  const preset = RuntimeAgent.getPresets().find((p) => p.id === presetId);

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

  activeRuntimeJobId = runtimeAgent.run(script, {
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
  const cancelled = runtimeAgent.cancel(activeRuntimeJobId);
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
 * Handle send
 */
function handleSend() {
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

  await auditLog('context_read', { messageLength: text.length });
  if (image) {
    await auditLog('image_input', { hasImage: true });
  }

  const engineStatus = engine.getStatus();
  const canLocal = engineStatus.status === 'ready' && state.mode !== 'cloud';
  const canCloud = (state.mode === 'cloud' || state.mode === 'hybrid') && engine.cloudConfigured;

  if (!navigator.onLine && !canLocal && (state.mode === 'cloud' || state.mode === 'hybrid')) {
    const msg = 'You are offline and cloud mode is selected. Switch to local mode or wait until connection is restored.';
    ui.renderMessage('assistant', msg);
    state.messages.push({ role: 'assistant', content: msg });
    state.isGenerating = false;
    const inputEl = document.getElementById('chat-input');
    if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
    return;
  }

  if (canLocal) {
    // Local inference
    ui.showTyping(true);
    try {
      const localSkill = await tryHandleLocalFeatureSkill(text);
      if (localSkill?.handled) {
        ui.showTyping(false);
        const responseText = localSkill.response || 'Local skill executed.';
        ui.renderMessage('assistant', responseText);
        state.messages.push({ role: 'assistant', content: responseText });
        state.isGenerating = false;
        const inputEl = document.getElementById('chat-input');
        if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
        return;
      }

      ui.showTyping(false);
      ui.renderMessage('assistant', '', true);

      const modelMessages = [...state.messages];
      const webIntent = isWebLookupIntent(text);
      if (state.localInternetAssist && navigator.onLine) {
        const liveContext = await fetchLocalInternetContext(text);
        if (liveContext) {
          modelMessages.unshift({
            role: 'system',
            content: `[WEB_CONTEXT]\n${liveContext}\nUse these snippets as available web context for this turn. Do not claim full browsing access.`
          });
          appendRuntimeOutput('Local internet context attached to current request.');
          await auditLog('internet_consult', { source: 'wikipedia-opensearch', queryLength: text.length });
        } else if (webIntent) {
          appendRuntimeOutput('Web lookup requested but no live context returned.');
          ui.showNotification('No web results retrieved right now. Try a more specific query.', 'error');
        }
      } else if (webIntent && !state.localInternetAssist) {
        appendRuntimeOutput('Web lookup intent detected. Enable Local Internet Assist in Settings.');
      }

      let fullResponse = '';
      await engine.chat(modelMessages, (token, accumulated) => {
        fullResponse = accumulated;
        ui.updateStreamingMessage(accumulated);
      });

      ui.finalizeStreamingMessage();
      state.messages.push({ role: 'assistant', content: fullResponse });
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
      await auditLog('suggestion', { model: engineStatus.modelId, responseLength: fullResponse.length });
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Sorry, something went wrong: ' + err.message;
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
    }
  } else if (canCloud) {
    // Cloud inference
    ui.showTyping(true);
    await auditLog('cloud_call', { endpoint: engine.cloudEndpoint, model: engine.cloudModel });
    try {
      ui.showTyping(false);
      ui.renderMessage('assistant', '', true);

      let fullResponse = '';
      await engine.chat(state.messages, (token, accumulated) => {
        fullResponse = accumulated;
        ui.updateStreamingMessage(accumulated);
      });

      ui.finalizeStreamingMessage();
      state.messages.push({ role: 'assistant', content: fullResponse });
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
      await auditLog('suggestion', { model: engine.cloudModel, responseLength: fullResponse.length, cloud: true });
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Cloud error: ' + err.message;
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
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

  try {
    await memory.deleteChatHistory(id);
    await memory.deleteConversation(id);
    updateSettingsView();
    ui.showNotification('Conversation deleted');
  } catch (err) {
    ui.showNotification('Failed to delete', 'error');
  }
}

/**
 * Switch local model — downloads new model on demand
 */
async function handleSwitchModel() {
  const picker = document.getElementById('local-model-picker');
  const hint = document.getElementById('local-model-hint');
  const btn = document.getElementById('switch-model-btn');
  if (!picker) return;

  const modelId = picker.value;
  const currentModel = engine.getStatus().modelId;
  if (modelId === currentModel && engine.getStatus().status === 'ready') {
    ui.showNotification('Already using this model');
    return;
  }

  const hasWebGPU = await engine.checkWebGPU();
  if (!hasWebGPU) {
    ui.showNotification('WebGPU not available on this device', 'error');
    return;
  }

  const capacity = await checkModelDownloadCapacity(modelId);
  if (!capacity.ok) {
    if (hint) hint.textContent = capacity.reason;
    ui.showNotification(capacity.reason, 'error');
    if (btn) btn.textContent = 'Download & Switch';
    return;
  }

  if (btn) btn.textContent = 'Downloading...';
  if (hint) hint.textContent = 'Starting download...';

  try {
    // Reset engine for new model
    engine.engine = null;
    engine.status = 'idle';

    await engine.init(modelId, (progress) => {
      const pct = Math.round((progress.progress || 0) * 100);
      if (hint) hint.textContent = progress.text || `Downloading... ${pct}%`;
    });

    if (hint) hint.textContent = 'Model ready — running on your device';
    if (btn) btn.textContent = 'Download & Switch';
    savePref('selected_model', modelId);
    ui.showNotification('Switched to ' + (engine.getStatus().modelInfo?.name || modelId));
    updateSettingsView();
  } catch (err) {
    const msg = err.message || '';
    const lower = msg.toLowerCase();
    const isQuota = lower.includes('quota') || lower.includes('rate') || lower.includes('429') || lower.includes('limit') || lower.includes('exceeded');
    const isStorage = lower.includes('storage') || lower.includes('space') || lower.includes('disk') || lower.includes('quotaexceedederror');
    if (isQuota) {
      if (hint) hint.textContent = 'Download quota exceeded. Try a smaller model or wait a few minutes and retry.';
      ui.showNotification('HuggingFace rate limit — try again in a few minutes', 'error');
    } else if (isStorage) {
      if (hint) hint.textContent = 'Download failed due to storage limits. Free browser storage or pick a smaller model.';
      ui.showNotification('Not enough storage for this model', 'error');
    } else {
      if (hint) hint.textContent = 'Download failed: ' + msg;
      ui.showNotification('Failed: ' + msg, 'error');
    }
    if (btn) btn.textContent = 'Retry Download';
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
    ui.showNotification('Mic: ' + err.message, 'error');
  }
}

/**
 * Conversation mode — continuous voice loop.
 * Toggle on/off. When on: listen → silence → send → TTS → listen again.
 */
async function handleConversation() {
  const btn = document.getElementById('conv-btn');
  const input = document.getElementById('chat-input');

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
    ui.showNotification('Mic: ' + err.message, 'error');
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

  switch (s) {
    case 'listening':
      input.placeholder = voice.conversationMode ? 'Conversation mode...' : 'Listening...';
      break;
    case 'processing':
      input.placeholder = 'Thinking...';
      break;
    case 'speaking':
      input.placeholder = 'Speaking...';
      break;
    default:
      if (!voice.conversationMode) {
        if (micBtn) micBtn.classList.remove('active');
        if (convBtn) convBtn.classList.remove('active');
        input.placeholder = 'Message...';
      }
  }
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
      }
      console.log(`[ai-space] restored conversation: ${conv.messages.length} messages`);
    }
  } catch (err) {
    console.warn('[ai-space] failed to restore conversation:', err);
  }
}

export { initApp };

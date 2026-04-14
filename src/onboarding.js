/**
 * Onboarding wizard controller — extracted from app.js.
 *
 * Usage:
 *   import { createOnboardingController } from './onboarding.js';
 *   const onboarding = createOnboardingController({ engine, memory, voice, ... });
 *   await onboarding.start();
 *
 * The factory closes over all provided dependencies, keeps internal wizard state
 * private, and exposes only what callers (app.js event listeners) need.
 */

import { AIEngine } from './ai-engine.js';
import { recommendLocalModelFallback } from './utils.js';

/**
 * @typedef {Object} OnboardingDeps
 * @property {import('./ai-engine.js').AIEngine} engine
 * @property {import('./memory.js').Memory} memory
 * @property {import('./voice.js').Voice} voice
 * @property {import('./avatar.js').Avatar} avatar
 * @property {import('./ui.js').UI} ui
 * @property {{ mode: string }} state
 * @property {() => boolean} isMemoryReady
 * @property {(key: string, value: *) => Promise<void>} savePref
 * @property {(phase: string) => void} transition
 * @property {() => void} tryInitEngine
 * @property {() => Promise<void>} markVisited
 * @property {(type: string, details: *) => Promise<void>} auditLog
 */

/**
 * Factory — creates an onboarding wizard controller.
 * @param {OnboardingDeps} deps
 */
export function createOnboardingController(deps) {
  const {
    engine,
    memory,
    voice,
    avatar,
    ui,
    state,
    isMemoryReady,
    savePref,
    transition,
    tryInitEngine,
    markVisited,
    auditLog,
  } = deps;

  // ─── Private wizard state ─────────────────────────────────────────────────

  let currentStep = 0;

  /** Data collected during the wizard steps. */
  const data = {
    interactionMode: 'chat',
    name: '',
    timezone: '',
    dateStr: '',
    tone: 'balanced',
    voiceIndex: -1,
  };

  let autoAdvanceTimer = null;

  // ─── Build personalized prompt suffix ─────────────────────────────────────

  function buildPersonalizedPrompt() {
    const parts = [];
    const toneDesc = {
      formal: 'formal',
      casual: 'casual',
      balanced: 'balanced',
      concise: 'concise',
      detailed: 'detailed',
    };
    if (data.name) {
      parts.push(`The user's name is ${data.name}.`);
    }
    if (data.tone && data.tone !== 'balanced') {
      parts.push(`They prefer a ${toneDesc[data.tone] || data.tone} communication style.`);
    }
    if (data.timezone) {
      parts.push(`Their timezone is ${data.timezone}.`);
    }
    if (data.dateStr) {
      parts.push(`Today is ${data.dateStr}.`);
    }
    if (data.interactionMode === 'talk') {
      parts.push('The user prefers voice interaction.');
    }
    return parts.length > 0 ? '\n\n' + parts.join(' ') : '';
  }

  // ─── Step navigation ──────────────────────────────────────────────────────

  function goToStep(step) {
    if (autoAdvanceTimer) {
      clearTimeout(autoAdvanceTimer);
      autoAdvanceTimer = null;
    }

    document.querySelectorAll('.onboarding-step').forEach(el => {
      el.classList.remove('active');
    });

    currentStep = step;

    const next = document.getElementById(`onboarding-step-${step}`);
    if (next) {
      next.classList.add('active');
    }

    if (data.interactionMode === 'talk' && step > 1) {
      const title = next?.querySelector('.onboarding-step-title');
      if (title && voice.ttsEnabled) {
        try { voice.speak(title.textContent); } catch {}
      }
    }

    onStepEnter(step);
  }

  function onStepEnter(step) {
    switch (step) {
      case 0:
        autoAdvanceTimer = setTimeout(() => goToStep(1), 6000);
        break;

      case 2: {
        const nameInput = document.getElementById('onboarding-name');
        if (nameInput) {
          setTimeout(() => nameInput.focus(), 400);
        }
        if (data.interactionMode === 'talk' && voice.hasSpeechRecognition) {
          try {
            voice.onSilenceDetected = (text) => {
              if (text && text.trim()) {
                data.name = text.trim();
                if (nameInput) nameInput.value = data.name;
                voice.onSilenceDetected = null;
                goToStep(3);
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
        try {
          data.timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
        } catch {
          data.timezone = 'Unknown';
        }
        const now = new Date();
        data.dateStr = now.toLocaleDateString(undefined, {
          weekday: 'long', year: 'numeric', month: 'long', day: 'numeric',
        });
        const infoEl = document.getElementById('onboarding-location-info');
        if (infoEl) {
          infoEl.textContent = `It looks like you're in ${data.timezone} and today is ${data.dateStr}.`;
        }
        break;
      }

      case 5: {
        if (data.interactionMode !== 'talk') {
          goToStep('avatar');
          return;
        }
        populateVoicePicker();
        break;
      }

      case 6: {
        const readyTitle = document.getElementById('onboarding-ready-title');
        const displayName = avatar.appearance.name || data.name || 'friend';
        if (readyTitle) {
          readyTitle.textContent = `You're all set, ${displayName}.`;
        }
        setupReadyStep();
        break;
      }
    }

    if (step === 'avatar') {
      const avatarStep = document.getElementById('onboarding-step-avatar');
      if (avatarStep) {
        avatarStep.style.display = '';
        avatarStep.classList.add('active');
      }
    }
  }

  // ─── Voice picker ─────────────────────────────────────────────────────────

  function populateVoicePicker() {
    const list = document.getElementById('onboarding-voice-list');
    if (!list) return;

    const getVoices = () => {
      const allVoices = speechSynthesis.getVoices();
      const userLang = navigator.language?.split('-')[0] || 'en';
      let filtered = allVoices.filter(v => v.lang.startsWith(userLang));
      if (filtered.length === 0) filtered = allVoices.filter(v => v.lang.startsWith('en'));
      if (filtered.length === 0) filtered = allVoices;

      const shown = filtered.slice(0, 5);
      list.innerHTML = '';

      shown.forEach((v) => {
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
          data.voiceIndex = allVoices.indexOf(v);
          list.querySelectorAll('.onboarding-voice-card').forEach(c => c.classList.remove('selected'));
          card.classList.add('selected');
          setTimeout(() => goToStep('avatar'), 300);
        });

        list.appendChild(card);
      });

      if (shown.length === 0) {
        list.innerHTML = '<p class="onboarding-info">No voices available</p>';
      }
    };

    if (speechSynthesis.getVoices().length > 0) {
      getVoices();
    } else {
      speechSynthesis.addEventListener('voiceschanged', getVoices, { once: true });
      setTimeout(getVoices, 500);
    }
  }

  // ─── Ready step (WebGPU check + model picker) ─────────────────────────────

  async function setupReadyStep() {
    const badge = document.getElementById('onboarding-mode-badge');
    const info = document.getElementById('onboarding-ready-info');
    const modelSection = document.getElementById('onboarding-model-section');
    const startDownloadBtn = document.getElementById('onboarding-start-download');
    const enterBtn = document.getElementById('onboarding-enter');
    const errorEl = document.getElementById('onboarding-download-error');

    let hasWebGPU = false;
    try {
      hasWebGPU = await engine.checkWebGPU();
    } catch {
      hasWebGPU = false;
    }

    if (hasWebGPU) {
      if (badge) badge.textContent = '⚡ WebGPU available — runs on your device';
      if (info) info.textContent = 'Pick a model to download. Smaller = faster. If a larger model is rate-limited, switch to Qwen or SmolLM for a faster first start.';
      if (modelSection) modelSection.style.display = 'block';
      if (startDownloadBtn) {
        startDownloadBtn.style.display = 'block';
        startDownloadBtn.textContent = 'Download & Start';
      }
      if (errorEl) errorEl.style.display = 'none';
      if (enterBtn) enterBtn.style.display = 'none';
    } else {
      state.mode = 'cloud';
      engine.mode = 'cloud';
      savePref('mode', 'cloud');
      if (badge) badge.textContent = '☁️ Cloud mode — WebGPU not available';
      if (info) info.textContent = 'This browser/device does not support WebGPU. You can still use cloud AI — configure an API key in Settings.';
      if (modelSection) modelSection.style.display = 'none';
      if (startDownloadBtn) startDownloadBtn.style.display = 'none';
      if (enterBtn) enterBtn.style.display = 'block';
    }
  }

  // ─── Model download ───────────────────────────────────────────────────────

  async function runDownload(attempt = 1) {
    const badge = document.getElementById('onboarding-mode-badge');
    const downloadEl = document.getElementById('onboarding-download-progress');
    const errorEl = document.getElementById('onboarding-download-error');
    const errorMsg = document.getElementById('onboarding-download-error-msg');
    const startDownloadBtn = document.getElementById('onboarding-start-download');
    const retryBtn = document.getElementById('onboarding-retry-download');
    const enterBtn = document.getElementById('onboarding-enter');
    const modelSection = document.getElementById('onboarding-model-section');
    const modelPicker = document.getElementById('onboarding-model-picker');
    const models = AIEngine.getModels();

    const selectedModel = modelPicker?.value || null;

    if (startDownloadBtn) {
      startDownloadBtn.style.display = 'none';
      startDownloadBtn.textContent = 'Download & Start';
    }
    if (retryBtn) retryBtn.textContent = 'Retry Download';
    if (errorEl) errorEl.style.display = 'none';
    if (modelSection) modelSection.style.display = 'none';
    if (downloadEl) downloadEl.style.display = 'flex';
    if (badge) badge.textContent = attempt > 1 ? `⚡ Downloading (attempt ${attempt})…` : '⚡ Downloading…';

    try {
      await engine.init(selectedModel, (progress) => {
        const pct = Math.round((progress.progress || 0) * 100);
        ui.updateProgress(pct, progress.text || `Downloading… ${pct}%`);
      }, { kvMode: state.kvMode });

      const loadedModelId = engine.getStatus().modelId;
      await auditLog('model_load', { model: loadedModelId, success: true });
      savePref('selected_model', loadedModelId);
      localStorage.setItem('ai-space-selected-model', loadedModelId);
      ui.updateProgress(100, 'Model ready!');

      if (downloadEl) downloadEl.style.display = 'none';
      if (badge) badge.textContent = '⚡ Running locally on your device';
      if (enterBtn) enterBtn.style.display = 'block';
    } catch (err) {
      console.error('Model download failed:', err);
      if (downloadEl) downloadEl.style.display = 'none';
      if (badge) badge.textContent = '⚠️ Download failed';

      const msg = err.message || '';
      const lower = msg.toLowerCase();
      const isRateLimit = lower.includes('quota') || lower.includes('rate') || lower.includes('429') || lower.includes('limit') || lower.includes('exceeded');
      const isStorage = lower.includes('storage') || lower.includes('space') || lower.includes('disk') || lower.includes('quotaexceeded');
      const failedModelName = models[selectedModel]?.name || 'this model';
      const fallbackModelId = recommendLocalModelFallback(selectedModel, {
        isRateLimit,
        isStorage,
        deviceMemory: navigator.deviceMemory,
      });
      const fallbackModelName = fallbackModelId ? (models[fallbackModelId]?.name || 'a smaller model') : '';

      let userMsg;
      if (isRateLimit) {
        const waitSec = attempt <= 1 ? 60 : attempt * 90;
        userMsg = fallbackModelName
          ? `HuggingFace is rate-limiting ${failedModelName} right now. Wait ${waitSec} seconds and tap "Retry Download", or start now with ${fallbackModelName}.`
          : `HuggingFace is rate-limiting downloads right now. Wait ${waitSec} seconds and tap "Retry Download". This is temporary.`;
      } else if (isStorage) {
        userMsg = fallbackModelName
          ? `Not enough browser storage for ${failedModelName}. Free up space or switch now to ${fallbackModelName}.`
          : 'Not enough browser storage. Free up space or choose a smaller model, then retry.';
      } else {
        userMsg = fallbackModelName
          ? `Download failed: ${msg}. Check your connection, retry ${failedModelName}, or try ${fallbackModelName} now.`
          : `Download failed: ${msg}. Check your connection and retry.`;
      }

      if (errorMsg) errorMsg.textContent = userMsg;
      if (errorEl) errorEl.style.display = 'block';
      if (modelSection) modelSection.style.display = 'block';

      if (retryBtn) {
        retryBtn.textContent = `Retry ${failedModelName}`;
      }

      if (fallbackModelId && modelPicker && startDownloadBtn) {
        modelPicker.value = fallbackModelId;
        startDownloadBtn.style.display = 'block';
        startDownloadBtn.textContent = `Try ${fallbackModelName} instead`;
      } else if (startDownloadBtn) {
        startDownloadBtn.style.display = 'none';
      }
    }
  }

  // ─── Complete onboarding ──────────────────────────────────────────────────

  async function complete() {
    savePref('interaction_mode', data.interactionMode);
    savePref('user_name', data.name);
    savePref('timezone', data.timezone);
    savePref('tone', data.tone);
    savePref('voice_index', data.voiceIndex);

    const promptContext = buildPersonalizedPrompt();
    savePref('prompt_context', promptContext);
    engine.promptContext = promptContext;

    await markVisited();
    transition('chat');
  }

  // ─── Start wizard ─────────────────────────────────────────────────────────

  async function start() {
    loadSavedPrefs();
    goToStep(0);
  }

  // ─── Load saved preferences ───────────────────────────────────────────────

  async function loadSavedPrefs() {
    const waitForMemory = () => new Promise(resolve => {
      if (isMemoryReady()) return resolve(true);
      let attempts = 0;
      const check = setInterval(() => {
        attempts++;
        if (isMemoryReady() || attempts > 20) {
          clearInterval(check);
          resolve(isMemoryReady());
        }
      }, 100);
    });

    await waitForMemory();
    if (!isMemoryReady()) return;

    try {
      const promptContext = await memory.getPreference('prompt_context');
      if (promptContext) {
        engine.promptContext = promptContext;
      }

      const name = await memory.getPreference('user_name');
      if (name) data.name = name;
      const tone = await memory.getPreference('tone');
      if (tone) data.tone = tone;
      const tz = await memory.getPreference('timezone');
      if (tz) data.timezone = tz;
      const mode = await memory.getPreference('interaction_mode');
      if (mode) data.interactionMode = mode;
      const vi = await memory.getPreference('voice_index');
      if (vi !== null && vi !== undefined) data.voiceIndex = vi;
    } catch {}
  }

  // ─── Public interface ─────────────────────────────────────────────────────

  return {
    /** Start the onboarding wizard from step 0. */
    start,
    /** Load saved preferences into engine and data (non-blocking). */
    loadSavedPrefs,
    /** Navigate to a specific wizard step (0-6 or 'avatar'). */
    goToStep,
    /** Complete onboarding, save all prefs, and transition to chat. */
    complete,
    /** Download the selected local model with retry support. */
    runDownload,
    /** Read-only access to collected onboarding data. */
    getData: () => data,
    /** Build the personalized system prompt suffix from collected data. */
    buildPersonalizedPrompt,
  };
}

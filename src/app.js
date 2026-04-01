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

// State
const state = {
  phase: 'onboarding',
  mode: 'local',
  conversationId: null,
  messages: [],
  isGenerating: false,
  firstVisit: true
};

// Modules
const engine = new AIEngine();
const memory = new Memory();
const audit = new Audit();
const shortcuts = new Shortcuts();
const voice = new Voice();
const camera = new Camera();
let ui = null;
let memoryReady = false;
let pendingImage = null;

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

  // Wire event listeners FIRST so skip button works immediately
  wireEventListeners();

  // Initialize memory in background — never block the UI
  initMemoryInBackground();

  // Go straight to deciding the view — don't wait for memory
  console.log('[ai-space] checking WebGPU...');
  await startOnboarding();
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
      if (mode) state.mode = mode;
      const visited = await memory.getPreference('visited');
      if (visited) state.firstVisit = false;
    } catch (err) {
      console.warn('[ai-space] memory init failed:', err);
      memoryReady = false;
    }
  })();
}

/**
 * Start onboarding
 */
async function startOnboarding() {
  ui.updateProgress(0, 'Checking device...');

  let hasWebGPU = false;
  try {
    hasWebGPU = await engine.checkWebGPU();
  } catch {
    hasWebGPU = false;
  }

  if (hasWebGPU) {
    ui.updateProgress(5, 'WebGPU ready. Downloading model...');
    await markVisited();
    transition('downloading');
    try {
      await engine.init(null, (progress) => {
        const pct = Math.round((progress.progress || 0) * 100);
        ui.updateProgress(pct, progress.text || 'Downloading...');
      });
      await auditLog('model_load', { model: engine.getStatus().modelId, success: true });
      ui.updateProgress(100, 'Ready.');
      setTimeout(() => transition('chat'), 400);
    } catch (err) {
      console.error('Model download failed:', err);
      state.mode = 'cloud';
      savePref('mode', 'cloud');
      transition('chat');
    }
  } else {
    // No WebGPU — go straight to chat, cloud mode
    state.mode = 'cloud';
    savePref('mode', 'cloud');
    await markVisited();
    transition('chat');
  }
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

  // Skip onboarding
  const skipBtn = document.getElementById('skip-onboarding');
  if (skipBtn) skipBtn.addEventListener('click', () => {
    state.mode = 'cloud';
    savePref('mode', 'cloud');
    markVisited();
    transition('chat');
  });

  // Voice button
  const voiceBtn = document.getElementById('voice-btn');
  if (voiceBtn) voiceBtn.addEventListener('click', handleVoice);

  // Camera button
  const cameraBtn = document.getElementById('camera-btn');
  if (cameraBtn) cameraBtn.addEventListener('click', handleCamera);

  // Remove image preview
  const removeImg = document.getElementById('remove-image');
  if (removeImg) removeImg.addEventListener('click', () => {
    pendingImage = null;
    document.getElementById('image-preview').style.display = 'none';
  });

  // Data management
  const exportBtn = document.getElementById('export-data');
  if (exportBtn) exportBtn.addEventListener('click', handleExport);

  const clearBtn = document.getElementById('clear-data');
  if (clearBtn) clearBtn.addEventListener('click', handleClearData);
}

/**
 * Handle send
 */
function handleSend() {
  const text = ui.getInputValue();
  if (!text) return;
  sendMessage(text);
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
    document.getElementById('image-preview').style.display = 'none';
  }

  state.messages.push({ role: 'user', content: text, image: image || undefined });
  ui.renderMessage('user', text, false, image);
  ui.setSendEnabled(false);
  state.isGenerating = true;

  await auditLog('context_read', { messageLength: text.length });

  const engineStatus = engine.getStatus();

  if (engineStatus.status === 'ready' && state.mode !== 'cloud') {
    // Local inference
    ui.showTyping(true);
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
      await auditLog('suggestion', { model: engineStatus.modelId, responseLength: fullResponse.length });
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Sorry, something went wrong. Please try again.';
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
    }
  } else {
    // Cloud mode or engine not ready
    ui.showTyping(true);
    await new Promise((r) => setTimeout(r, 400));
    ui.showTyping(false);

    const msg = state.mode === 'cloud'
      ? 'Cloud mode is not yet connected. Configure an API endpoint in settings to enable cloud inference.'
      : 'The local model is still loading. Please wait a moment and try again.';

    ui.renderMessage('assistant', msg);
    state.messages.push({ role: 'assistant', content: msg });
  }

  // Save conversation
  if (memoryReady) {
    try { await memory.saveConversation(state.conversationId, state.messages); } catch {}
  }

  state.isGenerating = false;
  const inputEl = document.getElementById('chat-input');
  if (inputEl) ui.setSendEnabled(inputEl.value.trim().length > 0);
}

/**
 * Set operating mode
 */
async function setMode(mode) {
  state.mode = mode;
  try { audit.setMode(mode); } catch {}
  ui.updateModeSelector(mode);
  savePref('mode', mode);

  if (mode === 'local' && engine.getStatus().status !== 'ready') {
    tryInitEngine();
  }

  updateSettingsView();
  ui.showNotification(`Switched to ${mode} mode`);
}

/**
 * Update settings view
 */
async function updateSettingsView() {
  ui.updateModeSelector(state.mode);

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
      convCount = stats.conversations || 0;
    } catch {}
  }

  ui.updateTrustDashboard(state.mode, cloudCalls, modelName, convCount);
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
 * Voice input — tap to record, tap to stop, auto-send
 */
async function handleVoice() {
  const btn = document.getElementById('voice-btn');
  const input = document.getElementById('chat-input');

  if (!voice.supported) {
    ui.showNotification('Voice not supported in this browser', 'error');
    return;
  }

  // If recording, stop and process
  if (voice.isRecording) {
    btn.classList.remove('active');
    const result = await voice.stopRecording();

    if (result.text) {
      // Got text from SpeechRecognition — send it
      await sendMessage(result.text);

      // If AI responded and TTS is on, speak the response
      const lastMsg = state.messages[state.messages.length - 1];
      if (lastMsg && lastMsg.role === 'assistant') {
        await voice.speak(lastMsg.content);
      }
    } else if (result.audio) {
      // Got audio blob — would need Whisper API for transcription
      // For now show a note
      input.value = '[Voice message recorded — cloud transcription needed]';
      ui.autoResizeInput();
      ui.setSendEnabled(true);
    }
    return;
  }

  // Start recording
  try {
    // Show interim results in the input field
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
    ui.showNotification('Mic error: ' + err.message, 'error');
  }
}

/**
 * Voice state change handler
 */
voice.onStateChange = (s) => {
  const btn = document.getElementById('voice-btn');
  const input = document.getElementById('chat-input');
  if (!btn || !input) return;

  switch (s) {
    case 'listening':
      btn.classList.add('active');
      input.placeholder = 'Listening...';
      break;
    case 'processing':
      btn.classList.remove('active');
      input.placeholder = 'Processing...';
      break;
    case 'speaking':
      input.placeholder = 'Speaking...';
      break;
    default:
      btn.classList.remove('active');
      input.placeholder = 'Message...';
      input.value = '';
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
    previewImg.src = resized;
    preview.style.display = 'block';

    ui.setSendEnabled(true);
  } catch (err) {
    if (err.message !== 'No image') {
      ui.showNotification('Camera error: ' + err.message, 'error');
    }
  }
}

export { initApp };

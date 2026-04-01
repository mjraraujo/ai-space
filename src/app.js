/**
 * App - Main controller for AI Space
 */

import { AIEngine } from './ai-engine.js';
import { Memory } from './memory.js';
import { Audit } from './audit.js';
import { Shortcuts } from './shortcuts.js';
import { UI } from './ui.js';

// State
const state = {
  phase: 'onboarding', // onboarding | downloading | ready | chat
  mode: 'local',       // local | hybrid | cloud
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
let ui = null;

/**
 * Initialize the application
 */
async function initApp() {
  ui = new UI();

  // Initialize memory and audit
  try {
    await memory.init();
    await audit.init(memory);
  } catch (err) {
    console.error('Failed to init storage:', err);
  }

  // Load preferences
  await loadPreferences();

  // Check for share target or shortcut invocation
  const urlParams = new URLSearchParams(window.location.search);
  const sharedContent = await handleShareTarget(urlParams);
  const skillInvocation = shortcuts.parseIncoming(urlParams);

  // Clean URL
  if (urlParams.toString()) {
    window.history.replaceState({}, '', '/');
  }

  // Wire event listeners
  wireEventListeners();

  // Decide initial view
  if (!state.firstVisit) {
    transition('chat');
    await initEngine();

    // Handle incoming data
    if (sharedContent) {
      sendMessage(sharedContent);
    } else if (skillInvocation) {
      const prompt = shortcuts.buildPrompt(skillInvocation);
      if (prompt) sendMessage(prompt);
    }
  } else {
    transition('onboarding');
    startOnboarding();
  }
}

/**
 * Load saved preferences
 */
async function loadPreferences() {
  try {
    const mode = await memory.getPreference('mode');
    if (mode) state.mode = mode;

    const visited = await memory.getPreference('visited');
    state.firstVisit = !visited;
  } catch {
    // Use defaults
  }
}

/**
 * Transition to a new phase
 */
function transition(phase) {
  state.phase = phase;

  switch (phase) {
    case 'onboarding':
      ui.showView('onboarding');
      break;
    case 'downloading':
      ui.showView('onboarding');
      break;
    case 'ready':
    case 'chat':
      ui.showView('chat');
      state.phase = 'chat';
      break;
  }
}

/**
 * Start onboarding flow
 */
async function startOnboarding() {
  ui.updateProgress(0, 'Checking device capabilities...');

  const hasWebGPU = await engine.checkWebGPU();

  if (hasWebGPU) {
    ui.updateProgress(5, 'WebGPU available. Ready to download model.');
    setTimeout(() => initEngine(), 1500);
  } else {
    ui.updateProgress(0, 'WebGPU not available. Using cloud mode.');
    state.mode = 'cloud';
    await memory.savePreference('mode', 'cloud');
    setTimeout(() => {
      markVisited();
      transition('chat');
    }, 2000);
  }
}

/**
 * Initialize the AI engine
 */
async function initEngine() {
  if (state.mode === 'cloud') {
    markVisited();
    transition('chat');
    return;
  }

  transition('downloading');
  ui.updateProgress(5, 'Downloading model...');

  try {
    await engine.init(null, (progress) => {
      const pct = Math.round((progress.progress || 0) * 100);
      ui.updateProgress(pct, progress.text);
    });

    await audit.log('model_load', {
      model: engine.getStatus().modelId,
      success: true
    });

    ui.updateProgress(100, 'Ready.');
    markVisited();

    setTimeout(() => transition('chat'), 500);
  } catch (err) {
    console.error('Engine init failed:', err);
    ui.updateProgress(0, 'Model download failed. You can still use cloud mode.');
    ui.showNotification('Model failed to load: ' + err.message, 'error');

    // Allow proceeding anyway
    setTimeout(() => {
      markVisited();
      transition('chat');
    }, 3000);
  }
}

/**
 * Mark first visit as complete
 */
async function markVisited() {
  state.firstVisit = false;
  try {
    await memory.savePreference('visited', true);
  } catch {
    // Non-critical
  }
}

/**
 * Wire all DOM event listeners
 */
function wireEventListeners() {
  // Send message
  document.getElementById('send-btn').addEventListener('click', handleSend);

  // Input handling
  const input = document.getElementById('chat-input');
  input.addEventListener('input', () => {
    ui.autoResizeInput();
    ui.setSendEnabled(input.value.trim().length > 0 && !state.isGenerating);
  });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim() && !state.isGenerating) {
        handleSend();
      }
    }
  });

  // Settings
  document.getElementById('open-settings').addEventListener('click', () => {
    updateSettingsView();
    ui.showView('settings');
  });

  document.getElementById('close-settings').addEventListener('click', () => {
    ui.showView('chat');
  });

  // Mode selector
  document.getElementById('mode-selector').addEventListener('click', (e) => {
    const option = e.target.closest('.mode-option');
    if (option && option.dataset.mode) {
      setMode(option.dataset.mode);
    }
  });

  // Skip onboarding
  document.getElementById('skip-onboarding').addEventListener('click', () => {
    markVisited();
    state.mode = 'cloud';
    memory.savePreference('mode', 'cloud');
    transition('chat');
  });

  // Data management
  document.getElementById('export-data').addEventListener('click', handleExport);
  document.getElementById('clear-data').addEventListener('click', handleClearData);
}

/**
 * Handle send button click
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

  // Create conversation ID if needed
  if (!state.conversationId) {
    state.conversationId = `conv_${Date.now()}`;
  }

  // Add user message
  state.messages.push({ role: 'user', content: text });
  ui.renderMessage('user', text);
  ui.setSendEnabled(false);
  state.isGenerating = true;

  await audit.log('context_read', { messageLength: text.length });

  // Generate response
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

      await audit.log('suggestion', {
        model: engineStatus.modelId,
        responseLength: fullResponse.length
      });
    } catch (err) {
      ui.showTyping(false);
      ui.finalizeStreamingMessage();
      const errorMsg = 'Sorry, I encountered an error. Please try again.';
      ui.renderMessage('assistant', errorMsg);
      state.messages.push({ role: 'assistant', content: errorMsg });
      ui.showNotification('Generation error: ' + err.message, 'error');
    }
  } else {
    // Cloud mode or engine not ready - show placeholder
    ui.showTyping(true);

    await new Promise((r) => setTimeout(r, 500));
    ui.showTyping(false);

    const cloudMsg = state.mode === 'cloud'
      ? 'Cloud mode is not yet connected. Configure an API endpoint in settings to enable cloud inference.'
      : 'The local model is still loading. Please wait a moment and try again.';

    ui.renderMessage('assistant', cloudMsg);
    state.messages.push({ role: 'assistant', content: cloudMsg });
  }

  // Save conversation
  try {
    await memory.saveConversation(state.conversationId, state.messages);
  } catch {
    // Non-critical
  }

  state.isGenerating = false;
  const inputEl = document.getElementById('chat-input');
  ui.setSendEnabled(inputEl.value.trim().length > 0);
}

/**
 * Set operating mode
 */
async function setMode(mode) {
  state.mode = mode;
  audit.setMode(mode);
  ui.updateModeSelector(mode);

  try {
    await memory.savePreference('mode', mode);
  } catch {
    // Non-critical
  }

  // If switching to local and engine not ready, try to init
  if (mode === 'local' && engine.getStatus().status !== 'ready') {
    initEngine();
  }

  updateSettingsView();
  ui.showNotification(`Switched to ${mode} mode`);
}

/**
 * Update settings view data
 */
async function updateSettingsView() {
  ui.updateModeSelector(state.mode);

  const engineStatus = engine.getStatus();
  const modelName = engineStatus.modelInfo
    ? engineStatus.modelInfo.name
    : (engineStatus.status === 'loading' ? 'Loading...' : 'Not loaded');

  let cloudCalls = 0;
  let convCount = 0;

  try {
    cloudCalls = await audit.getCloudCallCount();
    const stats = await memory.getStats();
    convCount = stats.conversations || 0;
  } catch {
    // Use defaults
  }

  ui.updateTrustDashboard(state.mode, cloudCalls, modelName, convCount);
}

/**
 * Handle share target data
 */
async function handleShareTarget(urlParams) {
  if (!urlParams.has('shared')) return null;

  try {
    // Read from IndexedDB (stored by service worker)
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
      // Clear shared content
      const clearTx = db.transaction('shared', 'readwrite');
      clearTx.objectStore('shared').clear();

      const parts = [latest.title, latest.text, latest.url].filter(Boolean);
      return parts.join('\n\n');
    }
  } catch {
    // Ignore share target errors
  }
  return null;
}

/**
 * Export all data
 */
async function handleExport() {
  try {
    const data = await memory.exportAll();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `ai-space-export-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
    ui.showNotification('Data exported successfully');
  } catch (err) {
    ui.showNotification('Export failed: ' + err.message, 'error');
  }
}

/**
 * Clear all data
 */
async function handleClearData() {
  if (!confirm('This will delete all conversations and settings. Continue?')) return;

  try {
    await memory.clearAll();
    state.messages = [];
    state.conversationId = null;
    ui.clearMessages();
    ui.showNotification('All data cleared');
    updateSettingsView();
  } catch (err) {
    ui.showNotification('Clear failed: ' + err.message, 'error');
  }
}

// Initialize when DOM is ready
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initApp);
} else {
  initApp();
}

export { initApp };

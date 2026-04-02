/**
 * UI Controller - Pure DOM manipulation, no framework
 * Manages all views, messages, notifications, sidebar, and input state
 */

export class UI {
  constructor() {
    this.views = {
      onboarding: document.getElementById('onboarding'),
      chat: document.getElementById('chat'),
      settings: document.getElementById('settings')
    };

    this.elements = {
      messages: document.getElementById('messages'),
      chatInput: document.getElementById('chat-input'),
      sendBtn: document.getElementById('send-btn'),
      typing: document.getElementById('typing'),
      chatEmpty: document.getElementById('chat-empty'),
      progressCircle: document.getElementById('progress-circle'),
      progressStatus: document.getElementById('progress-status'),
      toast: document.getElementById('toast'),
      trustDataLocation: document.getElementById('trust-data-location'),
      trustModel: document.getElementById('trust-model'),
      trustCloudCalls: document.getElementById('trust-cloud-calls'),
      trustConversations: document.getElementById('trust-conversations'),
      voiceBtn: document.getElementById('voice-btn'),
      cameraBtn: document.getElementById('camera-btn'),
      imagePreview: document.getElementById('image-preview'),
      previewImg: document.getElementById('preview-img'),
      removeImage: document.getElementById('remove-image'),
      sidebar: document.getElementById('chat-sidebar'),
      sidebarOverlay: document.getElementById('sidebar-overlay'),
      sidebarList: document.getElementById('sidebar-list'),
      historyBtn: document.getElementById('history-btn'),
      newChatBtn: document.getElementById('new-chat-btn'),
      cloudConfig: document.getElementById('cloud-config'),
      cloudEndpoint: document.getElementById('cloud-endpoint'),
      cloudApiKey: document.getElementById('cloud-api-key'),
      cloudModel: document.getElementById('cloud-model'),
      ttsToggle: document.getElementById('tts-toggle'),
      modelPicker: document.getElementById('model-picker')
    };

    this.currentStreamEl = null;
    this._toastTimeout = null;
  }

  /**
   * Switch active view
   * @param {string} viewName - 'onboarding' | 'chat' | 'settings'
   */
  showView(viewName) {
    for (const [name, el] of Object.entries(this.views)) {
      if (!el) continue;
      if (name === viewName) {
        el.classList.add('active');
        requestAnimationFrame(() => {
          el.classList.add('visible');
        });
      } else {
        el.classList.remove('visible');
        el.classList.remove('active');
      }
    }
    // Close sidebar when switching views
    this.closeSidebar();
  }

  /**
   * Render a chat message
   * @param {string} role - 'user' | 'assistant'
   * @param {string} content - Message text
   * @param {boolean} streaming - If true, mark as streaming target
   * @param {string} imageDataUrl - Optional attached image
   * @returns {HTMLElement} The message element
   */
  renderMessage(role, content, streaming = false, imageDataUrl = null) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;

    if (imageDataUrl) {
      const img = document.createElement('img');
      img.src = imageDataUrl;
      img.className = 'message-image';
      messageDiv.appendChild(img);
    }

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    messageDiv.appendChild(bubble);
    this.elements.messages.appendChild(messageDiv);

    if (this.elements.chatEmpty) {
      this.elements.chatEmpty.classList.add('hidden');
    }

    if (streaming) {
      this.currentStreamEl = bubble;
    }

    this._scrollToBottom();
    return messageDiv;
  }

  /**
   * Update the current streaming message
   * @param {string} content - Full accumulated content
   */
  updateStreamingMessage(content) {
    if (this.currentStreamEl) {
      this.currentStreamEl.textContent = content;
      this._scrollToBottom();
    }
  }

  /**
   * Finalize streaming message
   */
  finalizeStreamingMessage() {
    this.currentStreamEl = null;
  }

  /**
   * Add action suggestion chips below the last assistant message
   * @param {string[]} actions - Array of action labels
   * @param {function} onChipClick - callback(actionText)
   */
  addActionChips(actions, onChipClick) {
    if (!actions || actions.length === 0) return;
    const msgs = this.elements.messages;
    if (!msgs) return;

    const lastMsg = msgs.querySelector('.message-assistant:last-child');
    // Create chips container and append after the last message
    const chipsDiv = document.createElement('div');
    chipsDiv.className = 'action-chips';

    for (const action of actions) {
      const chip = document.createElement('button');
      chip.className = 'action-chip';
      chip.textContent = action;
      chip.addEventListener('click', () => {
        // Remove chips after click
        chipsDiv.remove();
        if (onChipClick) onChipClick(action);
      });
      chipsDiv.appendChild(chip);
    }

    if (lastMsg) {
      lastMsg.after(chipsDiv);
    } else {
      msgs.appendChild(chipsDiv);
    }

    this._scrollToBottom();
  }

  /**
   * Show/hide typing indicator
   * @param {boolean} show
   */
  showTyping(show) {
    if (!this.elements.typing) return;
    this.elements.typing.classList.toggle('active', show);
    if (show) {
      this._scrollToBottom();
    }
  }

  /**
   * Update download progress ring
   * @param {number} percent - 0 to 100
   * @param {string} status - Status text
   */
  updateProgress(percent, status) {
    const circle = this.elements.progressCircle;
    if (circle) {
      const circumference = 2 * Math.PI * 28; // r=28
      const offset = circumference - (percent / 100) * circumference;
      circle.style.strokeDashoffset = offset;
    }

    if (status && this.elements.progressStatus) {
      this.elements.progressStatus.textContent = status;
    }
  }

  /**
   * Show a toast notification
   * @param {string} text
   * @param {string} type - 'info' | 'error' | 'success'
   */
  showNotification(text, type = 'info') {
    const toast = this.elements.toast;
    if (!toast) return;

    toast.textContent = text;
    toast.className = 'toast';
    if (type === 'error') {
      toast.classList.add('error');
    } else if (type === 'success') {
      toast.classList.add('success');
    }

    // Show
    requestAnimationFrame(() => {
      toast.classList.add('visible');
    });

    // Auto-hide
    if (this._toastTimeout) {
      clearTimeout(this._toastTimeout);
    }
    this._toastTimeout = setTimeout(() => {
      toast.classList.remove('visible');
    }, 3000);
  }

  /**
   * Auto-resize textarea
   */
  autoResizeInput() {
    const el = this.elements.chatInput;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
  }

  /**
   * Enable/disable send button
   */
  setSendEnabled(enabled) {
    if (this.elements.sendBtn) {
      this.elements.sendBtn.disabled = !enabled;
    }
  }

  /**
   * Get and clear input value
   */
  getInputValue() {
    const el = this.elements.chatInput;
    if (!el) return '';
    const val = el.value.trim();
    el.value = '';
    el.style.height = 'auto';
    return val;
  }

  /**
   * Clear all messages
   */
  clearMessages() {
    if (this.elements.messages) {
      this.elements.messages.innerHTML = '';
    }
    if (this.elements.chatEmpty) {
      this.elements.chatEmpty.classList.remove('hidden');
    }
  }

  /**
   * Update mode selector UI
   * @param {string} mode
   */
  updateModeSelector(mode) {
    const options = document.querySelectorAll('.mode-option');
    options.forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.mode === mode);
    });

    // Show/hide cloud config section
    if (this.elements.cloudConfig) {
      if (mode === 'hybrid' || mode === 'cloud') {
        this.elements.cloudConfig.style.display = 'block';
      } else {
        this.elements.cloudConfig.style.display = 'none';
      }
    }
  }

  /**
   * Update trust dashboard
   */
  updateTrustDashboard(mode, cloudCalls, model, conversationCount) {
    const locations = {
      local: 'On device only',
      hybrid: 'Device + approved cloud calls',
      cloud: 'Device + cloud'
    };

    if (this.elements.trustDataLocation) {
      this.elements.trustDataLocation.textContent = locations[mode] || 'On device only';
    }
    if (this.elements.trustModel) {
      this.elements.trustModel.textContent = model || 'Not loaded';
    }
    if (this.elements.trustCloudCalls) {
      this.elements.trustCloudCalls.textContent = String(cloudCalls || 0);
    }
    if (this.elements.trustConversations) {
      this.elements.trustConversations.textContent = String(conversationCount || 0);
    }
  }

  /**
   * Render chat history sidebar
   * @param {Array} conversations - [{id, title, updatedAt}]
   * @param {string} activeId - Currently active conversation id
   */
  renderHistorySidebar(conversations, activeId, onItemClick) {
    const list = this.elements.sidebarList;
    if (!list) return;

    list.innerHTML = '';

    if (!conversations || conversations.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'sidebar-empty';
      empty.textContent = 'No conversations yet';
      list.appendChild(empty);
      return;
    }

    for (const conv of conversations) {
      const item = document.createElement('div');
      item.className = 'sidebar-item';
      if (conv.id === activeId) {
        item.classList.add('active');
      }
      item.dataset.id = conv.id;

      const title = document.createElement('div');
      title.className = 'sidebar-item-title';
      title.textContent = conv.title || 'Untitled';

      const date = document.createElement('div');
      date.className = 'sidebar-item-date';
      date.textContent = this._formatDate(conv.updatedAt || conv.createdAt);

      item.appendChild(title);
      item.appendChild(date);

      if (onItemClick) {
        item.addEventListener('click', () => onItemClick(conv.id));
      }

      list.appendChild(item);
    }
  }

  /**
   * Render chat history list in Settings view
   * @param {Array} conversations - [{id, title, updatedAt, createdAt}]
   * @param {function} onLoad - callback(id)
   * @param {function} onDelete - callback(id)
   */
  renderChatHistory(conversations, onLoad, onDelete) {
    const container = document.getElementById('chat-history-list');
    if (!container) return;

    container.innerHTML = '';

    if (!conversations || conversations.length === 0) {
      container.innerHTML = '<div style="padding:14px 16px;color:var(--fg-dim);font-size:14px;">No conversations yet</div>';
      return;
    }

    for (const conv of conversations) {
      const row = document.createElement('div');
      row.className = 'settings-row';

      const left = document.createElement('div');
      left.style.display = 'flex';
      left.style.flexDirection = 'column';
      left.style.gap = '2px';

      const title = document.createElement('span');
      title.className = 'settings-row-label';
      title.textContent = conv.title || 'Untitled';

      const date = document.createElement('span');
      date.className = 'settings-row-value';
      date.style.fontSize = '11px';
      date.textContent = this._formatDate(conv.updatedAt || conv.createdAt);

      left.appendChild(title);
      left.appendChild(date);

      const actions = document.createElement('div');
      actions.style.display = 'flex';
      actions.style.gap = '8px';

      const openBtn = document.createElement('button');
      openBtn.className = 'settings-btn';
      openBtn.style.padding = '6px 10px';
      openBtn.textContent = 'Open';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onLoad) onLoad(conv.id);
      });

      const delBtn = document.createElement('button');
      delBtn.className = 'settings-btn';
      delBtn.style.padding = '6px 10px';
      delBtn.style.color = '#ff6b6b';
      delBtn.textContent = 'Delete';
      delBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (onDelete) onDelete(conv.id);
      });

      actions.appendChild(openBtn);
      actions.appendChild(delBtn);

      row.appendChild(left);
      row.appendChild(actions);
      container.appendChild(row);
    }
  }

  /**
   * Open sidebar
   */
  openSidebar() {
    if (this.elements.sidebar) this.elements.sidebar.classList.add('open');
    if (this.elements.sidebarOverlay) this.elements.sidebarOverlay.classList.add('open');
  }

  /**
   * Close sidebar
   */
  closeSidebar() {
    if (this.elements.sidebar) this.elements.sidebar.classList.remove('open');
    if (this.elements.sidebarOverlay) this.elements.sidebarOverlay.classList.remove('open');
  }

  /**
   * Voice button state management
   * @param {boolean} active
   */
  setVoiceActive(active) {
    if (this.elements.voiceBtn) {
      if (active) {
        this.elements.voiceBtn.classList.add('active');
      } else {
        this.elements.voiceBtn.classList.remove('active');
      }
    }
  }

  /**
   * Show image preview
   * @param {string} dataUrl
   */
  showImagePreview(dataUrl) {
    if (this.elements.previewImg) {
      this.elements.previewImg.src = dataUrl;
    }
    if (this.elements.imagePreview) {
      this.elements.imagePreview.style.display = 'block';
    }
  }

  /**
   * Hide image preview
   */
  hideImagePreview() {
    if (this.elements.imagePreview) {
      this.elements.imagePreview.style.display = 'none';
    }
    if (this.elements.previewImg) {
      this.elements.previewImg.src = '';
    }
  }

  /**
   * Set model picker value
   * @param {string} modelId
   */
  setModelPicker(modelId) {
    if (this.elements.modelPicker) {
      this.elements.modelPicker.value = modelId;
    }
  }

  /**
   * Set TTS toggle state
   * @param {boolean} enabled
   */
  setTTSToggle(enabled) {
    if (this.elements.ttsToggle) {
      this.elements.ttsToggle.checked = enabled;
    }
  }

  /**
   * Set cloud config field values
   */
  setCloudConfig(endpoint, apiKey, model) {
    if (this.elements.cloudEndpoint) this.elements.cloudEndpoint.value = endpoint || '';
    if (this.elements.cloudApiKey) this.elements.cloudApiKey.value = apiKey || '';
    if (this.elements.cloudModel) this.elements.cloudModel.value = model || '';
  }

  /**
   * Get cloud config values
   */
  getCloudConfig() {
    return {
      endpoint: this.elements.cloudEndpoint ? this.elements.cloudEndpoint.value.trim() : '',
      apiKey: this.elements.cloudApiKey ? this.elements.cloudApiKey.value.trim() : '',
      model: this.elements.cloudModel ? this.elements.cloudModel.value.trim() : ''
    };
  }

  /**
   * Scroll messages to bottom
   */
  _scrollToBottom() {
    const el = this.elements.messages;
    if (el) {
      requestAnimationFrame(() => {
        el.scrollTop = el.scrollHeight;
      });
    }
  }

  /**
   * Format timestamp for sidebar
   */
  _formatDate(ts) {
    if (!ts) return '';
    const d = new Date(ts);
    const now = new Date();
    const diffMs = now - d;
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffDays === 0) {
      return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } else if (diffDays === 1) {
      return 'Yesterday';
    } else if (diffDays < 7) {
      return d.toLocaleDateString([], { weekday: 'short' });
    } else {
      return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
    }
  }
}

/**
 * UI Controller - Pure DOM manipulation, no framework
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
      progressCircle: document.getElementById('progress-circle'),
      progressStatus: document.getElementById('progress-status'),
      toast: document.getElementById('toast'),
      trustDataLocation: document.getElementById('trust-data-location'),
      trustModel: document.getElementById('trust-model'),
      trustCloudCalls: document.getElementById('trust-cloud-calls'),
      trustConversations: document.getElementById('trust-conversations')
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
      if (name === viewName) {
        el.classList.add('active');
        // Trigger reflow for transition
        requestAnimationFrame(() => {
          el.classList.add('visible');
        });
      } else {
        el.classList.remove('visible');
        // Wait for fade out before hiding
        setTimeout(() => {
          if (!el.classList.contains('visible')) {
            el.classList.remove('active');
          }
        }, 400);
      }
    }
  }

  /**
   * Render a chat message
   * @param {string} role - 'user' | 'assistant'
   * @param {string} content - Message text
   * @param {boolean} streaming - If true, mark as streaming target
   * @returns {HTMLElement} The message element
   */
  renderMessage(role, content, streaming = false) {
    const messageDiv = document.createElement('div');
    messageDiv.className = `message message-${role}`;

    const bubble = document.createElement('div');
    bubble.className = 'message-bubble';
    bubble.textContent = content;

    messageDiv.appendChild(bubble);
    this.elements.messages.appendChild(messageDiv);

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
   * Show/hide typing indicator
   * @param {boolean} show
   */
  showTyping(show) {
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
   * Update mode selector UI
   * @param {string} mode
   */
  updateModeSelector(mode) {
    const options = document.querySelectorAll('.mode-option');
    options.forEach((opt) => {
      opt.classList.toggle('selected', opt.dataset.mode === mode);
    });
  }

  /**
   * Enable/disable send button
   */
  setSendEnabled(enabled) {
    this.elements.sendBtn.disabled = !enabled;
  }

  /**
   * Get and clear input value
   */
  getInputValue() {
    const val = this.elements.chatInput.value.trim();
    this.elements.chatInput.value = '';
    this.elements.chatInput.style.height = 'auto';
    return val;
  }

  /**
   * Auto-resize textarea
   */
  autoResizeInput() {
    const el = this.elements.chatInput;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 120) + 'px';
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
   * Clear all messages
   */
  clearMessages() {
    if (this.elements.messages) {
      this.elements.messages.innerHTML = '';
    }
  }
}

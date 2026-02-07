/**
 * LLM Response Viewer - Transparent AI Response Display
 *
 * Shows the raw LLM response before any conversion/processing.
 * Makes the AI system transparent for all users.
 */

import { eventBus, Events } from '../event-bus.js';

class LLMResponseViewer {
  constructor() {
    this.modalEl = null;
    this.lastResponse = null;
    this.lastPrompts = null;
    this.isOpen = false;
  }

  /**
   * Store a response for viewing
   * @param {Object} data - The response data
   * @param {string} data.systemPrompt - System prompt sent to AI
   * @param {string} data.userPrompt - User prompt sent to AI
   * @param {string} data.rawResponse - Raw response from AI (before parsing)
   * @param {string} data.model - Model used
   * @param {Object} data.usage - Token usage
   */
  storeResponse(data) {
    this.lastResponse = data.rawResponse;
    this.lastPrompts = {
      system: data.systemPrompt,
      user: data.userPrompt
    };
    this.model = data.model;
    this.usage = data.usage;
    this.timestamp = new Date().toLocaleString();

    // Emit event so UI can show the "View AI Response" button
    eventBus.emit('llm:response-stored', {
      hasResponse: true,
      model: this.model,
      timestamp: this.timestamp
    });
  }

  /**
   * Check if there's a response to view
   */
  hasResponse() {
    return this.lastResponse !== null;
  }

  /**
   * Clear stored response
   */
  clear() {
    this.lastResponse = null;
    this.lastPrompts = null;
    this.model = null;
    this.usage = null;
    eventBus.emit('llm:response-stored', { hasResponse: false });
  }

  /**
   * Show the response viewer modal
   */
  show() {
    if (!this.lastResponse) {
      eventBus.emit(Events.TOAST_SHOW, {
        message: 'No AI response to display',
        type: 'warning'
      });
      return;
    }

    this._createModal();
    this.modalEl.classList.add('visible');
    this.isOpen = true;
    document.body.style.overflow = 'hidden';
  }

  /**
   * Hide the modal
   */
  hide() {
    if (this.modalEl) {
      this.modalEl.classList.remove('visible');
      this.isOpen = false;
      document.body.style.overflow = '';
    }
  }

  /**
   * Toggle modal visibility
   */
  toggle() {
    if (this.isOpen) {
      this.hide();
    } else {
      this.show();
    }
  }

  /**
   * Create the modal element
   */
  _createModal() {
    // Remove existing modal if any
    if (this.modalEl) {
      this.modalEl.remove();
    }

    // Format the JSON nicely
    let formattedResponse = this.lastResponse;
    try {
      const parsed = JSON.parse(this.lastResponse);
      formattedResponse = JSON.stringify(parsed, null, 2);
    } catch (e) {
      // Keep as-is if not valid JSON
    }

    // Token info
    const tokenInfo = this.usage
      ? `Prompt: ${this.usage.prompt_tokens || '?'} | Completion: ${this.usage.completion_tokens || '?'} | Total: ${this.usage.total_tokens || '?'}`
      : 'Token usage not available';

    this.modalEl = document.createElement('div');
    this.modalEl.className = 'llm-viewer-modal';
    this.modalEl.innerHTML = `
      <div class="llm-viewer-backdrop"></div>
      <div class="llm-viewer-content">
        <header class="llm-viewer-header">
          <h2>AI Response Viewer</h2>
          <p class="llm-viewer-subtitle">Transparent view of AI-generated content</p>
          <button class="llm-viewer-close" aria-label="Close">&times;</button>
        </header>

        <div class="llm-viewer-meta">
          <div class="llm-viewer-meta-item">
            <span class="llm-viewer-meta-label">Model</span>
            <span class="llm-viewer-meta-value">${this.model || 'Unknown'}</span>
          </div>
          <div class="llm-viewer-meta-item">
            <span class="llm-viewer-meta-label">Time</span>
            <span class="llm-viewer-meta-value">${this.timestamp}</span>
          </div>
          <div class="llm-viewer-meta-item">
            <span class="llm-viewer-meta-label">Tokens</span>
            <span class="llm-viewer-meta-value">${tokenInfo}</span>
          </div>
        </div>

        <div class="llm-viewer-tabs">
          <button class="llm-viewer-tab active" data-tab="response">AI Response</button>
          <button class="llm-viewer-tab" data-tab="system">System Prompt</button>
          <button class="llm-viewer-tab" data-tab="user">User Prompt</button>
        </div>

        <div class="llm-viewer-body">
          <div class="llm-viewer-panel active" data-panel="response">
            <div class="llm-viewer-actions">
              <button class="llm-viewer-copy" data-copy="response">Copy Response</button>
              <button class="llm-viewer-download" data-download="response">Download JSON</button>
            </div>
            <pre class="llm-viewer-code"><code>${this._escapeHtml(formattedResponse)}</code></pre>
          </div>

          <div class="llm-viewer-panel" data-panel="system">
            <div class="llm-viewer-actions">
              <button class="llm-viewer-copy" data-copy="system">Copy Prompt</button>
            </div>
            <pre class="llm-viewer-code"><code>${this._escapeHtml(this.lastPrompts?.system || 'No system prompt available')}</code></pre>
          </div>

          <div class="llm-viewer-panel" data-panel="user">
            <div class="llm-viewer-actions">
              <button class="llm-viewer-copy" data-copy="user">Copy Prompt</button>
            </div>
            <pre class="llm-viewer-code"><code>${this._escapeHtml(this.lastPrompts?.user || 'No user prompt available')}</code></pre>
          </div>
        </div>

        <footer class="llm-viewer-footer">
          <p>This data shows exactly what the AI generated. SoundSculpt then validates and converts this to playable music patterns.</p>
        </footer>
      </div>
    `;

    document.body.appendChild(this.modalEl);
    this._attachEvents();
  }

  /**
   * Attach event handlers
   */
  _attachEvents() {
    // Close button
    this.modalEl.querySelector('.llm-viewer-close').addEventListener('click', () => this.hide());

    // Backdrop click
    this.modalEl.querySelector('.llm-viewer-backdrop').addEventListener('click', () => this.hide());

    // Tab switching
    this.modalEl.querySelectorAll('.llm-viewer-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        const tabName = tab.dataset.tab;

        // Update tabs
        this.modalEl.querySelectorAll('.llm-viewer-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');

        // Update panels
        this.modalEl.querySelectorAll('.llm-viewer-panel').forEach(p => p.classList.remove('active'));
        this.modalEl.querySelector(`[data-panel="${tabName}"]`).classList.add('active');
      });
    });

    // Copy buttons
    this.modalEl.querySelectorAll('.llm-viewer-copy').forEach(btn => {
      btn.addEventListener('click', () => {
        const target = btn.dataset.copy;
        let text = '';

        if (target === 'response') {
          text = this.lastResponse;
        } else if (target === 'system') {
          text = this.lastPrompts?.system || '';
        } else if (target === 'user') {
          text = this.lastPrompts?.user || '';
        }

        navigator.clipboard.writeText(text).then(() => {
          btn.textContent = 'Copied!';
          setTimeout(() => btn.textContent = btn.dataset.copy === 'response' ? 'Copy Response' : 'Copy Prompt', 2000);
        });
      });
    });

    // Download button
    this.modalEl.querySelector('.llm-viewer-download').addEventListener('click', () => {
      const blob = new Blob([this.lastResponse], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `soundsculpt-ai-response-${Date.now()}.json`;
      a.click();
      URL.revokeObjectURL(url);
    });

    // Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape' && this.isOpen) {
        this.hide();
      }
    };
    document.addEventListener('keydown', handleEscape);
  }

  /**
   * Escape HTML for safe display
   */
  _escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }
}

// Singleton instance
export const llmResponseViewer = new LLMResponseViewer();

/**
 * Revision History UI - View and restore project revisions
 */

import { eventBus, Events } from '../event-bus.js';
import { revisionManager } from '../storage/revision-manager.js';

/**
 * Create the revision history modal
 * @returns {HTMLElement}
 */
export function createRevisionHistory() {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay revision-modal';

  modal.innerHTML = `
    <div class="modal-content revision-history-content" role="dialog" aria-labelledby="revision-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="revision-title">Revision History</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      <div class="revision-toolbar">
        <button class="btn btn-primary create-revision-btn">Create Snapshot</button>
        <span class="revision-count"></span>
      </div>

      <div class="modal-body revision-list-container">
        <div class="revision-list">
          <!-- Populated dynamically -->
        </div>
      </div>

      <footer class="modal-footer">
        <div class="footer-left">
          <span class="revision-size"></span>
        </div>
        <div class="footer-actions">
          <button class="btn btn-secondary close-btn">Close</button>
        </div>
      </footer>
    </div>
  `;

  // State
  let selectedRevisionId = null;

  const revisionList = modal.querySelector('.revision-list');
  const revisionCount = modal.querySelector('.revision-count');
  const revisionSize = modal.querySelector('.revision-size');
  const createBtn = modal.querySelector('.create-revision-btn');

  // Render revisions
  function renderRevisions() {
    const revisions = revisionManager.getRevisions();

    revisionCount.textContent = `${revisions.length} revision${revisions.length !== 1 ? 's' : ''}`;
    revisionSize.textContent = `Total: ${revisionManager.constructor.formatBytes(revisionManager.getTotalSize())}`;

    if (revisions.length === 0) {
      revisionList.innerHTML = `
        <div class="empty-state">
          <p>No revisions yet</p>
          <p class="empty-hint">Create a snapshot to save the current state of your project</p>
        </div>
      `;
      return;
    }

    revisionList.innerHTML = revisions.map((rev, index) => `
      <div class="revision-item ${selectedRevisionId === rev.id ? 'selected' : ''}" data-id="${rev.id}">
        <div class="revision-marker">
          <div class="marker-dot"></div>
          ${index < revisions.length - 1 ? '<div class="marker-line"></div>' : ''}
        </div>
        <div class="revision-content">
          <div class="revision-header">
            <span class="revision-desc">${rev.description}</span>
            <span class="revision-date">${formatDate(rev.timestamp)}</span>
          </div>
          <div class="revision-meta">
            ${revisionManager.constructor.formatBytes(rev.size || 0)}
          </div>
          <div class="revision-actions">
            <button class="btn btn-sm btn-primary restore-btn">Restore</button>
            <button class="btn btn-sm preview-btn">Preview</button>
            <button class="btn btn-sm edit-btn">Edit</button>
            <button class="btn btn-sm btn-danger delete-btn">Delete</button>
          </div>
        </div>
      </div>
    `).join('');

    // Event handlers
    revisionList.querySelectorAll('.revision-item').forEach(item => {
      const id = item.dataset.id;

      item.addEventListener('click', (e) => {
        if (e.target.closest('button')) return;
        selectedRevisionId = id;
        renderRevisions();
      });

      item.querySelector('.restore-btn').addEventListener('click', () => {
        if (confirm('Restore this revision? Your current work will be replaced.')) {
          revisionManager.restoreRevision(id);
          closeModal();
        }
      });

      item.querySelector('.preview-btn').addEventListener('click', () => {
        const preview = revisionManager.previewRevision(id);
        if (preview) {
          alert(`Revision Preview:\n\nProject: ${preview.projectName}\nVoices: ${preview.voiceCount}\nTempo: ${preview.tempo} BPM\nCreated: ${formatDate(preview.timestamp)}`);
        }
      });

      item.querySelector('.edit-btn').addEventListener('click', () => {
        const rev = revisionManager.getRevisions().find(r => r.id === id);
        const newDesc = prompt('Edit description:', rev?.description);
        if (newDesc !== null) {
          revisionManager.updateDescription(id, newDesc);
          renderRevisions();
        }
      });

      item.querySelector('.delete-btn').addEventListener('click', () => {
        if (confirm('Delete this revision?')) {
          revisionManager.deleteRevision(id);
          renderRevisions();
        }
      });
    });
  }

  // Create revision
  createBtn.addEventListener('click', () => {
    const description = prompt('Description for this snapshot:', `Snapshot ${new Date().toLocaleTimeString()}`);
    if (description !== null) {
      const revision = revisionManager.createRevision(description);
      if (revision) {
        renderRevisions();
      } else {
        alert('Failed to create revision. Project may be too large.');
      }
    }
  });

  // Close handlers
  function closeModal() {
    modal.remove();
    eventBus.emit(Events.MODAL_CLOSE);
  }

  modal.querySelector('.close-btn').addEventListener('click', closeModal);
  modal.querySelector('.modal-close').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // Initial render
  renderRevisions();

  return modal;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * Open revision history modal
 */
export function openRevisionHistory() {
  const modal = createRevisionHistory();
  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);
}

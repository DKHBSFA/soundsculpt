/**
 * Template Browser UI - Browse, save, and load templates
 */

import { eventBus, Events } from '../event-bus.js';
import { templateManager, TEMPLATE_CATEGORIES } from '../storage/template-manager.js';

/**
 * Create the template browser modal
 * @param {Object} options
 * @param {string} [options.mode] - 'browse' or 'save'
 * @returns {HTMLElement}
 */
export function createTemplateBrowser(options = {}) {
  const mode = options.mode || 'browse';
  const modal = document.createElement('div');
  modal.className = 'modal-overlay template-modal';

  modal.innerHTML = `
    <div class="modal-content template-browser-content" role="dialog" aria-labelledby="template-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="template-title">${mode === 'save' ? 'Save as Template' : 'Templates'}</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      ${mode === 'save' ? createSaveForm() : createBrowserUI()}

      <footer class="modal-footer">
        <div class="footer-left">
          <span class="storage-info"></span>
        </div>
        <div class="footer-actions">
          <button class="btn btn-secondary close-btn">Close</button>
          ${mode === 'save' ? '<button class="btn btn-primary save-template-btn">Save Template</button>' : ''}
        </div>
      </footer>
    </div>
  `;

  // State
  let selectedCategory = '';

  // Update storage info
  function updateStorageInfo() {
    const info = templateManager.getStorageInfo();
    modal.querySelector('.storage-info').textContent =
      `${info.templateCount}/${info.maxTemplates} templates • ${info.bytesUsedFormatted}`;
  }

  if (mode === 'save') {
    setupSaveMode();
  } else {
    setupBrowseMode();
  }

  function setupSaveMode() {
    const nameInput = modal.querySelector('.template-name-input');
    const descInput = modal.querySelector('.template-desc-input');
    const categorySelect = modal.querySelector('.template-category-select');
    const saveBtn = modal.querySelector('.save-template-btn');

    saveBtn.addEventListener('click', () => {
      const name = nameInput.value.trim();
      if (!name) {
        alert('Please enter a template name');
        return;
      }

      templateManager.saveFromCurrent(name, {
        description: descInput.value.trim(),
        category: categorySelect.value,
      });

      closeModal();
    });

    updateStorageInfo();
  }

  function setupBrowseMode() {
    const categoryTabs = modal.querySelector('.category-tabs');
    const templateList = modal.querySelector('.template-list');

    // Render templates
    function renderTemplates() {
      const templates = selectedCategory
        ? templateManager.getByCategory(selectedCategory)
        : templateManager.getAll();

      if (templates.length === 0) {
        templateList.innerHTML = `
          <div class="empty-state">
            <p>No templates yet</p>
            <p class="empty-hint">Save your current project as a template to see it here</p>
          </div>
        `;
        return;
      }

      templateList.innerHTML = templates.map(t => `
        <div class="template-item" data-id="${t.id}">
          <div class="template-icon">${TEMPLATE_CATEGORIES[t.category]?.icon || '📦'}</div>
          <div class="template-info">
            <span class="template-name">${t.name}</span>
            <span class="template-meta">
              ${TEMPLATE_CATEGORIES[t.category]?.name || 'Other'} •
              ${formatDate(t.createdAt)}
            </span>
            ${t.description ? `<span class="template-desc">${t.description}</span>` : ''}
          </div>
          <div class="template-actions">
            <button class="btn-icon load-btn" title="Load">▶</button>
            <button class="btn-icon duplicate-btn" title="Duplicate">⧉</button>
            <button class="btn-icon export-btn" title="Export">↓</button>
            <button class="btn-icon delete-btn" title="Delete">🗑</button>
          </div>
        </div>
      `).join('');

      // Event handlers
      templateList.querySelectorAll('.template-item').forEach(item => {
        const id = item.dataset.id;

        item.querySelector('.load-btn').addEventListener('click', () => {
          if (confirm('Load this template? Current project will be replaced.')) {
            templateManager.load(id);
            closeModal();
          }
        });

        item.querySelector('.duplicate-btn').addEventListener('click', () => {
          templateManager.duplicate(id);
          renderTemplates();
          updateStorageInfo();
        });

        item.querySelector('.export-btn').addEventListener('click', () => {
          const json = templateManager.export(id);
          if (json) {
            downloadJson(json, templateManager.get(id).name);
          }
        });

        item.querySelector('.delete-btn').addEventListener('click', () => {
          if (confirm('Delete this template?')) {
            templateManager.delete(id);
            renderTemplates();
            updateStorageInfo();
          }
        });
      });
    }

    // Category tabs
    categoryTabs.querySelectorAll('.category-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        categoryTabs.querySelectorAll('.category-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        selectedCategory = tab.dataset.category;
        renderTemplates();
      });
    });

    // Import button
    const importBtn = modal.querySelector('.import-btn');
    const importInput = modal.querySelector('.import-input');

    importBtn.addEventListener('click', () => importInput.click());
    importInput.addEventListener('change', () => {
      if (importInput.files.length > 0) {
        const reader = new FileReader();
        reader.onload = () => {
          const template = templateManager.import(reader.result);
          if (template) {
            renderTemplates();
            updateStorageInfo();
          } else {
            alert('Failed to import template. Invalid format.');
          }
        };
        reader.readAsText(importInput.files[0]);
        importInput.value = '';
      }
    });

    renderTemplates();
    updateStorageInfo();
  }

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

  return modal;
}

function createSaveForm() {
  return `
    <div class="modal-body template-save-form">
      <div class="form-group">
        <label>Template Name</label>
        <input type="text" class="template-name-input" placeholder="My Template">
      </div>
      <div class="form-group">
        <label>Description (optional)</label>
        <textarea class="template-desc-input" placeholder="A brief description..." rows="3"></textarea>
      </div>
      <div class="form-group">
        <label>Category</label>
        <select class="template-category-select">
          <option value="beat">🥁 Beat</option>
          <option value="melody">🎹 Melody</option>
          <option value="full">🎵 Full Track</option>
          <option value="other">📦 Other</option>
        </select>
      </div>
    </div>
  `;
}

function createBrowserUI() {
  return `
    <div class="template-toolbar">
      <div class="category-tabs">
        <button class="category-tab active" data-category="">All</button>
        ${Object.entries(TEMPLATE_CATEGORIES).map(([key, cat]) => `
          <button class="category-tab" data-category="${key}">${cat.icon} ${cat.name}</button>
        `).join('')}
      </div>
      <div class="template-actions-bar">
        <button class="btn btn-sm import-btn">Import</button>
        <input type="file" class="import-input" accept=".json" hidden>
      </div>
    </div>
    <div class="modal-body template-list-container">
      <div class="template-list">
        <!-- Populated dynamically -->
      </div>
    </div>
  `;
}

function formatDate(isoString) {
  const date = new Date(isoString);
  return date.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function downloadJson(json, name) {
  const blob = new Blob([json], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${name.replace(/[^a-z0-9]/gi, '_')}.template.json`;
  a.click();
  URL.revokeObjectURL(url);
}

/**
 * Open template browser
 * @param {Object} options
 */
export function openTemplateBrowser(options = {}) {
  const modal = createTemplateBrowser(options);
  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);

  setTimeout(() => {
    modal.querySelector('.template-name-input, .category-tab.active')?.focus();
  }, 100);
}

/**
 * Open save as template modal
 */
export function openSaveTemplate() {
  openTemplateBrowser({ mode: 'save' });
}

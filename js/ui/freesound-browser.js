/**
 * Freesound Browser UI - Search and preview samples from Freesound.org
 */

import { eventBus, Events } from '../event-bus.js';
import { freesound, formatSound, formatDuration, formatFileSize, formatLicense } from '../storage/freesound.js';
import { sampleLibrary } from '../storage/sample-library.js';

// Preview audio state
let previewAudio = null;

/**
 * Create the Freesound browser modal
 * @param {Object} options
 * @param {Function} [options.onSelect] - Callback when sample is downloaded
 * @returns {HTMLElement}
 */
export function createFreesoundBrowser(options = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay freesound-modal';
  modal.innerHTML = `
    <div class="modal-content freesound-content" role="dialog" aria-labelledby="freesound-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="freesound-title">Freesound Browser</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      ${!freesound.hasApiKey() ? `
      <div class="api-key-setup">
        <p>To use Freesound, you need an API key.</p>
        <ol>
          <li>Visit <a href="https://freesound.org/apiv2/apply/" target="_blank" rel="noopener">freesound.org/apiv2/apply</a></li>
          <li>Create a free account and register an app</li>
          <li>Copy your API key and paste it below</li>
        </ol>
        <div class="api-key-input-group">
          <input type="text" class="api-key-input" placeholder="Enter your Freesound API key">
          <button class="btn btn-primary save-api-key-btn">Save Key</button>
        </div>
        <p class="api-key-note">Your API key is stored locally and never sent to our servers.</p>
      </div>
      ` : `
      <div class="freesound-browser">
        <div class="freesound-toolbar">
          <div class="search-box">
            <input type="text" class="search-input" placeholder="Search Freesound...">
            <button class="btn btn-primary search-btn">Search</button>
          </div>
          <div class="filter-controls">
            <select class="duration-filter">
              <option value="">Any Duration</option>
              <option value="0-5">0-5 sec</option>
              <option value="5-15">5-15 sec</option>
              <option value="15-30">15-30 sec</option>
              <option value="30-60">30-60 sec</option>
            </select>
            <select class="sort-select">
              <option value="score">Relevance</option>
              <option value="rating_desc">Top Rated</option>
              <option value="downloads_desc">Most Downloads</option>
              <option value="created_desc">Newest</option>
              <option value="duration_asc">Shortest</option>
            </select>
          </div>
        </div>

        <div class="freesound-layout">
          <div class="results-panel">
            <div class="results-header">
              <span class="results-count"></span>
            </div>
            <div class="results-list">
              <div class="empty-state">
                <p>Search for sounds on Freesound.org</p>
                <p class="empty-hint">Try "kick drum", "ambient", or "bird"</p>
              </div>
            </div>
            <div class="pagination">
              <button class="btn btn-sm prev-btn" disabled>Previous</button>
              <span class="page-info"></span>
              <button class="btn btn-sm next-btn" disabled>Next</button>
            </div>
          </div>

          <div class="preview-panel">
            <div class="preview-header">Preview</div>
            <div class="preview-content">
              <div class="preview-placeholder">Select a sound to preview</div>
            </div>
          </div>
        </div>
      </div>
      `}

      <footer class="modal-footer">
        <div class="footer-left">
          ${freesound.hasApiKey() ? `
          <button class="btn btn-sm btn-text change-api-key-btn">Change API Key</button>
          ` : ''}
        </div>
        <div class="footer-actions">
          <button class="btn btn-secondary close-btn">Close</button>
        </div>
      </footer>
    </div>
  `;

  // State
  let searchResults = null;
  let currentPage = 1;
  let totalPages = 0;
  let selectedSound = null;

  // Get elements (depending on API key state)
  const closeBtn = modal.querySelector('.close-btn');
  const closeBtnX = modal.querySelector('.modal-close');

  if (freesound.hasApiKey()) {
    setupBrowserUI(modal);
  } else {
    setupApiKeyUI(modal);
  }

  function setupApiKeyUI(modal) {
    const apiKeyInput = modal.querySelector('.api-key-input');
    const saveBtn = modal.querySelector('.save-api-key-btn');

    saveBtn.addEventListener('click', async () => {
      const key = apiKeyInput.value.trim();
      if (!key) {
        alert('Please enter an API key');
        return;
      }

      freesound.setApiKey(key);

      // Test the key
      const valid = await freesound.testApiKey();
      if (!valid) {
        freesound.setApiKey(null);
        alert('Invalid API key. Please check and try again.');
        return;
      }

      // Reload modal with browser UI
      closeModal();
      openFreesoundBrowser(options);
    });
  }

  function setupBrowserUI(modal) {
    const searchInput = modal.querySelector('.search-input');
    const searchBtn = modal.querySelector('.search-btn');
    const durationFilter = modal.querySelector('.duration-filter');
    const sortSelect = modal.querySelector('.sort-select');
    const resultsList = modal.querySelector('.results-list');
    const resultsCount = modal.querySelector('.results-count');
    const prevBtn = modal.querySelector('.prev-btn');
    const nextBtn = modal.querySelector('.next-btn');
    const pageInfo = modal.querySelector('.page-info');
    const previewContent = modal.querySelector('.preview-content');
    const changeApiKeyBtn = modal.querySelector('.change-api-key-btn');

    async function doSearch(page = 1) {
      const query = searchInput.value.trim();
      if (!query) return;

      try {
        resultsList.innerHTML = '<div class="loading">Searching...</div>';

        const searchOptions = {
          page,
          sort: sortSelect.value,
        };

        // Duration filter
        const duration = durationFilter.value;
        if (duration) {
          const [min, max] = duration.split('-').map(Number);
          searchOptions.minDuration = min;
          searchOptions.maxDuration = max;
        }

        searchResults = await freesound.search(query, searchOptions);
        currentPage = page;
        totalPages = Math.ceil(searchResults.count / 15);

        renderResults();
      } catch (e) {
        resultsList.innerHTML = `<div class="error-state">Error: ${e.message}</div>`;
      }
    }

    function renderResults() {
      if (!searchResults || searchResults.results.length === 0) {
        resultsList.innerHTML = '<div class="empty-state"><p>No results found</p></div>';
        resultsCount.textContent = '0 results';
        prevBtn.disabled = true;
        nextBtn.disabled = true;
        pageInfo.textContent = '';
        return;
      }

      resultsCount.textContent = `${searchResults.count.toLocaleString()} results`;
      prevBtn.disabled = currentPage <= 1;
      nextBtn.disabled = currentPage >= totalPages;
      pageInfo.textContent = `Page ${currentPage} of ${totalPages}`;

      resultsList.innerHTML = searchResults.results.map(sound => {
        const s = formatSound(sound);
        return `
          <div class="sound-item ${selectedSound?.id === s.id ? 'selected' : ''}" data-id="${s.id}">
            <div class="sound-info">
              <span class="sound-name">${s.name}</span>
              <span class="sound-meta">
                ${formatDuration(s.duration)} • ${s.username} • ${formatLicense(s.license)}
              </span>
            </div>
            <div class="sound-tags">
              ${s.tags.slice(0, 3).map(t => `<span class="tag">${t}</span>`).join('')}
            </div>
            <button class="btn-icon preview-btn" data-preview="${s.previewUrl}" title="Preview">▶</button>
          </div>
        `;
      }).join('');

      // Click handlers
      resultsList.querySelectorAll('.sound-item').forEach(item => {
        item.addEventListener('click', (e) => {
          if (e.target.closest('.preview-btn')) return;
          selectSound(parseInt(item.dataset.id));
        });
      });

      // Preview buttons
      resultsList.querySelectorAll('.preview-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          playPreview(btn.dataset.preview);
        });
      });
    }

    async function selectSound(soundId) {
      const sound = searchResults.results.find(s => s.id === soundId);
      if (!sound) return;

      selectedSound = formatSound(sound);

      // Update selection UI
      resultsList.querySelectorAll('.sound-item').forEach(item => {
        item.classList.toggle('selected', parseInt(item.dataset.id) === soundId);
      });

      // Show preview panel
      previewContent.innerHTML = `
        <div class="preview-info">
          <h3 class="preview-name">${selectedSound.name}</h3>
          <p class="preview-user">by <a href="https://freesound.org/people/${selectedSound.username}/" target="_blank">${selectedSound.username}</a></p>
          <p class="preview-description">${selectedSound.description?.slice(0, 200) || 'No description'}${selectedSound.description?.length > 200 ? '...' : ''}</p>
        </div>
        <div class="preview-details">
          <div class="detail-item">
            <span class="detail-label">Duration</span>
            <span class="detail-value">${formatDuration(selectedSound.duration)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Sample Rate</span>
            <span class="detail-value">${selectedSound.sampleRate} Hz</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Channels</span>
            <span class="detail-value">${selectedSound.channels}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">License</span>
            <span class="detail-value">${formatLicense(selectedSound.license)}</span>
          </div>
          <div class="detail-item">
            <span class="detail-label">Rating</span>
            <span class="detail-value">${selectedSound.rating?.toFixed(1) || '—'} (${selectedSound.ratingCount || 0})</span>
          </div>
        </div>
        <div class="preview-tags">
          ${selectedSound.tags.map(t => `<span class="tag">${t}</span>`).join('')}
        </div>
        <div class="preview-actions">
          <button class="btn btn-primary download-btn">Download Preview</button>
          <a href="${selectedSound.freesoundUrl}" target="_blank" class="btn btn-secondary">View on Freesound</a>
        </div>
      `;

      // Download handler
      previewContent.querySelector('.download-btn').addEventListener('click', async () => {
        await downloadSound(selectedSound);
      });
    }

    function playPreview(url) {
      stopPreview();
      previewAudio = new Audio(url);
      previewAudio.play();
    }

    function stopPreview() {
      if (previewAudio) {
        previewAudio.pause();
        previewAudio.currentTime = 0;
        previewAudio = null;
      }
    }

    async function downloadSound(sound) {
      try {
        const downloadBtn = previewContent.querySelector('.download-btn');
        downloadBtn.disabled = true;
        downloadBtn.textContent = 'Downloading...';

        // Get full sound info
        const fullSound = await freesound.getSoundInfo(sound.id);

        // Download preview
        const audioData = await freesound.downloadPreview(fullSound);

        // Add to library
        const file = new File([audioData], `${sound.name}.mp3`, { type: 'audio/mpeg' });
        await sampleLibrary.addSample(file, {
          folder: 'Freesound',
          tags: sound.tags.slice(0, 5),
        });

        downloadBtn.textContent = 'Downloaded!';
        setTimeout(() => {
          downloadBtn.disabled = false;
          downloadBtn.textContent = 'Download Preview';
        }, 2000);

        // Call onSelect if provided
        if (options.onSelect) {
          options.onSelect({
            ...sound,
            audioData,
          });
        }
      } catch (e) {
        alert(`Failed to download: ${e.message}`);
        const downloadBtn = previewContent.querySelector('.download-btn');
        downloadBtn.disabled = false;
        downloadBtn.textContent = 'Download Preview';
      }
    }

    // Event listeners
    searchBtn.addEventListener('click', () => doSearch(1));
    searchInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') doSearch(1);
    });
    durationFilter.addEventListener('change', () => doSearch(1));
    sortSelect.addEventListener('change', () => doSearch(1));
    prevBtn.addEventListener('click', () => doSearch(currentPage - 1));
    nextBtn.addEventListener('click', () => doSearch(currentPage + 1));

    if (changeApiKeyBtn) {
      changeApiKeyBtn.addEventListener('click', () => {
        const newKey = prompt('Enter new Freesound API key:', freesound.getApiKey() || '');
        if (newKey !== null) {
          if (newKey.trim()) {
            freesound.setApiKey(newKey.trim());
          } else {
            freesound.setApiKey(null);
          }
          closeModal();
          openFreesoundBrowser(options);
        }
      });
    }
  }

  // Close handlers
  function closeModal() {
    if (previewAudio) {
      previewAudio.pause();
      previewAudio = null;
    }
    modal.remove();
    eventBus.emit(Events.MODAL_CLOSE);
  }

  closeBtn.addEventListener('click', closeModal);
  closeBtnX.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  return modal;
}

/**
 * Open the Freesound browser modal
 * @param {Object} options
 */
export function openFreesoundBrowser(options = {}) {
  const modal = createFreesoundBrowser(options);
  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);

  setTimeout(() => {
    modal.querySelector('.search-input, .api-key-input')?.focus();
  }, 100);
}

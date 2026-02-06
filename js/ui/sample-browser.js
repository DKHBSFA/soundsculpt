/**
 * Sample Browser UI - Browse and manage sample library
 *
 * Modal interface for browsing samples stored in IndexedDB,
 * with folder navigation, search, filtering, and preview.
 */

import { eventBus, Events } from '../event-bus.js';
import { sampleLibrary, LibraryEvents } from '../storage/sample-library.js';
import { audioContext } from '../audio/context-manager.js';

// Preview playback state
let previewSource = null;
let previewGain = null;

/**
 * Create the sample browser modal
 * @param {Object} options
 * @param {Function} [options.onSelect] - Callback when sample is selected
 * @returns {HTMLElement}
 */
export function createSampleBrowser(options = {}) {
  const modal = document.createElement('div');
  modal.className = 'modal-overlay sample-browser-modal';
  modal.innerHTML = `
    <div class="modal-content sample-browser-content" role="dialog" aria-labelledby="browser-title" aria-modal="true">
      <header class="modal-header">
        <h2 id="browser-title">Sample Library</h2>
        <button class="modal-close" aria-label="Close">&times;</button>
      </header>

      <div class="browser-toolbar">
        <div class="search-box">
          <input type="text" class="search-input" placeholder="Search samples...">
        </div>
        <div class="filter-controls">
          <select class="folder-filter">
            <option value="">All Folders</option>
          </select>
          <select class="bpm-filter">
            <option value="">Any BPM</option>
            <option value="60-90">60-90 BPM</option>
            <option value="90-120">90-120 BPM</option>
            <option value="120-140">120-140 BPM</option>
            <option value="140-180">140-180 BPM</option>
          </select>
          <label class="favorites-toggle">
            <input type="checkbox" class="favorites-checkbox">
            <span>Favorites</span>
          </label>
        </div>
      </div>

      <div class="browser-layout">
        <aside class="folder-panel">
          <div class="folder-header">
            <span>Folders</span>
            <button class="btn-icon add-folder-btn" title="New Folder">+</button>
          </div>
          <ul class="folder-list">
            <!-- Populated dynamically -->
          </ul>
          <div class="folder-actions">
            <button class="btn btn-sm import-btn">Import Samples</button>
            <input type="file" class="import-input" multiple accept="audio/*" hidden>
          </div>
        </aside>

        <main class="samples-panel">
          <div class="samples-header">
            <span class="sample-count">0 samples</span>
            <div class="view-toggle">
              <button class="view-btn active" data-view="list" title="List view">≡</button>
              <button class="view-btn" data-view="grid" title="Grid view">⊞</button>
            </div>
          </div>
          <div class="samples-list">
            <!-- Populated dynamically -->
          </div>
        </main>

        <aside class="preview-panel">
          <div class="preview-header">Preview</div>
          <div class="preview-waveform">
            <canvas class="waveform-canvas" width="200" height="80"></canvas>
          </div>
          <div class="preview-info">
            <div class="preview-filename">No sample selected</div>
            <div class="preview-details"></div>
          </div>
          <div class="preview-controls">
            <button class="btn-icon preview-play-btn" disabled title="Play">▶</button>
            <button class="btn-icon preview-stop-btn" disabled title="Stop">■</button>
          </div>
          <div class="preview-metadata">
            <div class="meta-group">
              <label>BPM:</label>
              <input type="number" class="meta-bpm" min="20" max="300" placeholder="—">
            </div>
            <div class="meta-group">
              <label>Key:</label>
              <select class="meta-key">
                <option value="">—</option>
                <option value="C">C</option>
                <option value="C#">C#</option>
                <option value="D">D</option>
                <option value="D#">D#</option>
                <option value="E">E</option>
                <option value="F">F</option>
                <option value="F#">F#</option>
                <option value="G">G</option>
                <option value="G#">G#</option>
                <option value="A">A</option>
                <option value="A#">A#</option>
                <option value="B">B</option>
              </select>
            </div>
            <div class="meta-tags">
              <label>Tags:</label>
              <input type="text" class="meta-tags-input" placeholder="comma, separated">
            </div>
          </div>
        </aside>
      </div>

      <footer class="modal-footer">
        <div class="library-stats">
          <span class="stats-text"></span>
        </div>
        <div class="footer-actions">
          <button class="btn btn-secondary cancel-btn">Cancel</button>
          <button class="btn btn-primary select-btn" disabled>Use Sample</button>
        </div>
      </footer>
    </div>
  `;

  // State
  let currentFolder = '';
  let selectedSampleId = null;
  let selectedSampleData = null;
  let samples = [];
  let folders = [];

  // Get elements
  const searchInput = modal.querySelector('.search-input');
  const folderFilter = modal.querySelector('.folder-filter');
  const bpmFilter = modal.querySelector('.bpm-filter');
  const favoritesCheckbox = modal.querySelector('.favorites-checkbox');
  const folderList = modal.querySelector('.folder-list');
  const samplesList = modal.querySelector('.samples-list');
  const sampleCount = modal.querySelector('.sample-count');
  const previewFilename = modal.querySelector('.preview-filename');
  const previewDetails = modal.querySelector('.preview-details');
  const previewPlayBtn = modal.querySelector('.preview-play-btn');
  const previewStopBtn = modal.querySelector('.preview-stop-btn');
  const waveformCanvas = modal.querySelector('.waveform-canvas');
  const metaBpm = modal.querySelector('.meta-bpm');
  const metaKey = modal.querySelector('.meta-key');
  const metaTagsInput = modal.querySelector('.meta-tags-input');
  const selectBtn = modal.querySelector('.select-btn');
  const cancelBtn = modal.querySelector('.cancel-btn');
  const closeBtn = modal.querySelector('.modal-close');
  const importBtn = modal.querySelector('.import-btn');
  const importInput = modal.querySelector('.import-input');
  const addFolderBtn = modal.querySelector('.add-folder-btn');
  const statsText = modal.querySelector('.stats-text');
  const viewBtns = modal.querySelectorAll('.view-btn');

  // Load initial data
  async function loadData() {
    try {
      await sampleLibrary.init();
      folders = await sampleLibrary.getFolders();
      renderFolders();
      await loadSamples();
      await updateStats();
    } catch (e) {
      console.error('Failed to load sample library:', e);
    }
  }

  // Render folder list
  function renderFolders() {
    // Update folder filter dropdown
    folderFilter.innerHTML = '<option value="">All Folders</option>';
    folders.forEach(f => {
      folderFilter.innerHTML += `<option value="${f.path}">${f.name}</option>`;
    });

    // Render sidebar folders
    folderList.innerHTML = `
      <li class="folder-item ${!currentFolder ? 'active' : ''}" data-folder="">
        <span class="folder-icon">📁</span>
        <span class="folder-name">All Samples</span>
      </li>
    `;

    folders.forEach(f => {
      folderList.innerHTML += `
        <li class="folder-item ${currentFolder === f.path ? 'active' : ''}" data-folder="${f.path}">
          <span class="folder-icon">📁</span>
          <span class="folder-name">${f.name}</span>
        </li>
      `;
    });

    // Add click handlers
    folderList.querySelectorAll('.folder-item').forEach(item => {
      item.addEventListener('click', () => {
        currentFolder = item.dataset.folder;
        folderList.querySelectorAll('.folder-item').forEach(i => i.classList.remove('active'));
        item.classList.add('active');
        loadSamples();
      });
    });
  }

  // Load and filter samples
  async function loadSamples() {
    const query = {
      text: searchInput.value || undefined,
      folder: currentFolder || undefined,
      favoritesOnly: favoritesCheckbox.checked,
    };

    // Parse BPM filter
    if (bpmFilter.value) {
      const [min, max] = bpmFilter.value.split('-').map(Number);
      query.bpmMin = min;
      query.bpmMax = max;
    }

    samples = await sampleLibrary.search(query);
    renderSamples();
  }

  // Render samples list
  function renderSamples() {
    sampleCount.textContent = `${samples.length} sample${samples.length !== 1 ? 's' : ''}`;

    if (samples.length === 0) {
      samplesList.innerHTML = `
        <div class="empty-state">
          <p>No samples found</p>
          <p class="empty-hint">Import audio files to get started</p>
        </div>
      `;
      return;
    }

    samplesList.innerHTML = samples.map(s => `
      <div class="sample-item ${selectedSampleId === s.id ? 'selected' : ''}" data-id="${s.id}">
        <span class="sample-icon">🔊</span>
        <div class="sample-info">
          <span class="sample-name">${s.filename}</span>
          <span class="sample-meta">
            ${formatDuration(s.duration)}
            ${s.bpm ? ` • ${s.bpm} BPM` : ''}
            ${s.key ? ` • ${s.key}` : ''}
          </span>
        </div>
        <button class="btn-icon favorite-btn ${s.favorite ? 'active' : ''}" data-id="${s.id}">
          ${s.favorite ? '★' : '☆'}
        </button>
        <button class="btn-icon quick-play-btn" data-id="${s.id}" title="Preview">▶</button>
      </div>
    `).join('');

    // Add click handlers
    samplesList.querySelectorAll('.sample-item').forEach(item => {
      item.addEventListener('click', (e) => {
        if (e.target.closest('.favorite-btn') || e.target.closest('.quick-play-btn')) return;
        selectSample(item.dataset.id);
      });

      item.addEventListener('dblclick', () => {
        if (selectedSampleId) {
          useSample();
        }
      });
    });

    // Favorite buttons
    samplesList.querySelectorAll('.favorite-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const newStatus = await sampleLibrary.toggleFavorite(btn.dataset.id);
        btn.classList.toggle('active', newStatus);
        btn.textContent = newStatus ? '★' : '☆';
      });
    });

    // Quick play buttons
    samplesList.querySelectorAll('.quick-play-btn').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await selectSample(btn.dataset.id);
        playPreview();
      });
    });
  }

  // Select a sample
  async function selectSample(id) {
    selectedSampleId = id;
    selectedSampleData = await sampleLibrary.getSample(id);

    // Update UI
    samplesList.querySelectorAll('.sample-item').forEach(item => {
      item.classList.toggle('selected', item.dataset.id === id);
    });

    if (selectedSampleData) {
      previewFilename.textContent = selectedSampleData.filename;
      previewDetails.textContent = `${formatDuration(selectedSampleData.duration)} • ${selectedSampleData.sampleRate}Hz • ${selectedSampleData.channels}ch`;
      previewPlayBtn.disabled = false;
      previewStopBtn.disabled = false;
      selectBtn.disabled = false;

      // Update metadata inputs
      metaBpm.value = selectedSampleData.bpm || '';
      metaKey.value = selectedSampleData.key || '';
      metaTagsInput.value = (selectedSampleData.tags || []).join(', ');

      // Draw waveform
      drawWaveform(selectedSampleData.audioData);
    }
  }

  // Draw waveform on canvas
  async function drawWaveform(audioData) {
    try {
      const ctx = audioContext.getContext() || new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(audioData.slice(0));
      const data = audioBuffer.getChannelData(0);

      const canvasCtx = waveformCanvas.getContext('2d');
      const width = waveformCanvas.width;
      const height = waveformCanvas.height;

      canvasCtx.clearRect(0, 0, width, height);
      canvasCtx.fillStyle = 'var(--color-glass)';
      canvasCtx.fillRect(0, 0, width, height);

      canvasCtx.strokeStyle = 'var(--color-primary)';
      canvasCtx.lineWidth = 1;

      const step = Math.ceil(data.length / width);
      const amp = height / 2;

      canvasCtx.beginPath();
      for (let i = 0; i < width; i++) {
        let min = 1;
        let max = -1;
        for (let j = 0; j < step; j++) {
          const datum = data[(i * step) + j] || 0;
          if (datum < min) min = datum;
          if (datum > max) max = datum;
        }
        canvasCtx.moveTo(i, (1 + min) * amp);
        canvasCtx.lineTo(i, (1 + max) * amp);
      }
      canvasCtx.stroke();
    } catch (e) {
      console.error('Failed to draw waveform:', e);
    }
  }

  // Play preview
  async function playPreview() {
    stopPreview();

    if (!selectedSampleData) return;

    try {
      const ctx = audioContext.getContext() || new (window.AudioContext || window.webkitAudioContext)();
      const audioBuffer = await ctx.decodeAudioData(selectedSampleData.audioData.slice(0));

      previewSource = ctx.createBufferSource();
      previewSource.buffer = audioBuffer;

      previewGain = ctx.createGain();
      previewGain.gain.value = 0.8;

      previewSource.connect(previewGain);
      previewGain.connect(ctx.destination);

      previewSource.start();
      previewPlayBtn.textContent = '⏸';

      previewSource.onended = () => {
        previewPlayBtn.textContent = '▶';
        previewSource = null;
      };
    } catch (e) {
      console.error('Failed to play preview:', e);
    }
  }

  // Stop preview
  function stopPreview() {
    if (previewSource) {
      previewSource.stop();
      previewSource = null;
    }
    previewPlayBtn.textContent = '▶';
  }

  // Use selected sample
  function useSample() {
    if (selectedSampleData && options.onSelect) {
      // Mark as used
      sampleLibrary.markAsUsed(selectedSampleId);
      options.onSelect(selectedSampleData);
      closeModal();
    }
  }

  // Import samples
  async function importSamples(files) {
    for (const file of files) {
      try {
        await sampleLibrary.addSample(file, { folder: currentFolder || 'Uncategorized' });
      } catch (e) {
        console.error(`Failed to import ${file.name}:`, e);
      }
    }
    await loadSamples();
    await updateStats();
    folders = await sampleLibrary.getFolders();
    renderFolders();
  }

  // Update stats
  async function updateStats() {
    const stats = await sampleLibrary.getStats();
    statsText.textContent = `${stats.totalSamples} samples • ${formatDuration(stats.totalDuration)} total`;
  }

  // Add folder
  async function addFolder() {
    const name = prompt('Folder name:');
    if (!name) return;

    await sampleLibrary.createFolder(currentFolder, name);
    folders = await sampleLibrary.getFolders();
    renderFolders();
  }

  // Save metadata changes
  async function saveMetadata() {
    if (!selectedSampleId) return;

    const updates = {
      bpm: metaBpm.value ? parseInt(metaBpm.value) : null,
      key: metaKey.value || null,
      tags: metaTagsInput.value.split(',').map(t => t.trim()).filter(Boolean),
    };

    await sampleLibrary.updateSample(selectedSampleId, updates);
    await loadSamples();
  }

  // Format duration
  function formatDuration(seconds) {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  }

  // Close modal
  function closeModal() {
    stopPreview();
    modal.remove();
    eventBus.emit(Events.MODAL_CLOSE);
  }

  // Event listeners
  searchInput.addEventListener('input', () => loadSamples());
  folderFilter.addEventListener('change', () => {
    currentFolder = folderFilter.value;
    loadSamples();
    renderFolders();
  });
  bpmFilter.addEventListener('change', () => loadSamples());
  favoritesCheckbox.addEventListener('change', () => loadSamples());

  previewPlayBtn.addEventListener('click', () => {
    if (previewSource) {
      stopPreview();
    } else {
      playPreview();
    }
  });
  previewStopBtn.addEventListener('click', stopPreview);

  metaBpm.addEventListener('change', saveMetadata);
  metaKey.addEventListener('change', saveMetadata);
  metaTagsInput.addEventListener('change', saveMetadata);

  importBtn.addEventListener('click', () => importInput.click());
  importInput.addEventListener('change', () => {
    if (importInput.files.length > 0) {
      importSamples(Array.from(importInput.files));
      importInput.value = '';
    }
  });

  addFolderBtn.addEventListener('click', addFolder);
  selectBtn.addEventListener('click', useSample);
  cancelBtn.addEventListener('click', closeModal);
  closeBtn.addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => {
    if (e.target === modal) closeModal();
  });
  modal.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
  });

  // View toggle
  viewBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      viewBtns.forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      samplesList.classList.toggle('grid-view', btn.dataset.view === 'grid');
    });
  });

  // Initialize
  loadData();

  return modal;
}

/**
 * Open the sample browser modal
 * @param {Object} options
 */
export function openSampleBrowser(options = {}) {
  if (!sampleLibrary.constructor.isSupported()) {
    alert('Sample library requires IndexedDB, which is not available in this browser.');
    return;
  }

  const modal = createSampleBrowser(options);
  document.body.appendChild(modal);
  eventBus.emit(Events.MODAL_OPEN);

  setTimeout(() => {
    modal.querySelector('.search-input')?.focus();
  }, 100);
}

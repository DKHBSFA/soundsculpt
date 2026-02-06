/**
 * Keyboard Accessibility Module
 * Phase 12: Accessibility & Polish
 *
 * Provides enhanced keyboard navigation for:
 * - Tab panel navigation (arrow keys)
 * - Grid navigation (sequencer, piano roll)
 * - Voice list navigation
 * - Modal focus trapping
 * - Menu navigation
 */

import { eventBus, Events } from './event-bus.js';

// ============================================
// TAB PANEL NAVIGATION
// ============================================

/**
 * Initialize tab panel keyboard navigation
 * Follows WAI-ARIA tab pattern
 */
export function initTabNavigation() {
  const tablist = document.querySelector('[role="tablist"]');
  if (!tablist) return;

  const tabs = tablist.querySelectorAll('[role="tab"]');

  tablist.addEventListener('keydown', (e) => {
    const currentTab = document.activeElement;
    if (!currentTab.matches('[role="tab"]')) return;

    const currentIndex = Array.from(tabs).indexOf(currentTab);
    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowLeft':
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex === 0 ? tabs.length - 1 : currentIndex - 1;
        break;
      case 'ArrowRight':
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex === tabs.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = tabs.length - 1;
        break;
      default:
        return;
    }

    // Focus and activate the new tab
    tabs[newIndex].focus();
    tabs[newIndex].click();
  });
}

// ============================================
// GRID NAVIGATION (SEQUENCER)
// ============================================

/**
 * Grid navigation state
 */
const gridNav = {
  enabled: false,
  currentRow: 0,
  currentCol: 0,
  rows: 0,
  cols: 0,
  cells: [],
  container: null,
};

/**
 * Initialize grid keyboard navigation for sequencer
 */
export function initGridNavigation(containerId = 'view-sequencer') {
  const container = document.getElementById(containerId);
  if (!container) return;

  gridNav.container = container;

  // Activate grid navigation when container receives focus
  container.addEventListener('focus', () => {
    enterGridNavigation();
  });

  container.addEventListener('keydown', handleGridKeyDown);

  // Update grid dimensions when content changes
  eventBus.on(Events.VOICES_CHANGED, () => {
    updateGridDimensions();
  });
}

/**
 * Enter grid navigation mode
 */
function enterGridNavigation() {
  if (gridNav.enabled) return;

  updateGridDimensions();
  if (gridNav.cells.length === 0) return;

  gridNav.enabled = true;
  document.body.classList.add('keyboard-nav-active');

  // Focus first cell or restore position
  highlightCell(gridNav.currentRow, gridNav.currentCol);
}

/**
 * Exit grid navigation mode
 */
function exitGridNavigation() {
  if (!gridNav.enabled) return;

  gridNav.enabled = false;
  document.body.classList.remove('keyboard-nav-active');

  // Remove highlight from current cell
  clearCellHighlight();
}

/**
 * Update grid dimensions from DOM
 */
function updateGridDimensions() {
  if (!gridNav.container) return;

  const rows = gridNav.container.querySelectorAll('.sequencer-row');
  gridNav.rows = rows.length;
  gridNav.cells = [];

  rows.forEach((row, rowIndex) => {
    const cells = row.querySelectorAll('.step-cell');
    gridNav.cells[rowIndex] = Array.from(cells);
    if (rowIndex === 0) {
      gridNav.cols = cells.length;
    }
  });
}

/**
 * Handle grid keyboard events
 */
function handleGridKeyDown(e) {
  if (!gridNav.enabled) return;

  switch (e.key) {
    case 'ArrowUp':
      e.preventDefault();
      moveGridFocus(gridNav.currentRow - 1, gridNav.currentCol);
      break;
    case 'ArrowDown':
      e.preventDefault();
      moveGridFocus(gridNav.currentRow + 1, gridNav.currentCol);
      break;
    case 'ArrowLeft':
      e.preventDefault();
      moveGridFocus(gridNav.currentRow, gridNav.currentCol - 1);
      break;
    case 'ArrowRight':
      e.preventDefault();
      moveGridFocus(gridNav.currentRow, gridNav.currentCol + 1);
      break;
    case 'Home':
      e.preventDefault();
      if (e.ctrlKey) {
        moveGridFocus(0, 0);
      } else {
        moveGridFocus(gridNav.currentRow, 0);
      }
      break;
    case 'End':
      e.preventDefault();
      if (e.ctrlKey) {
        moveGridFocus(gridNav.rows - 1, gridNav.cols - 1);
      } else {
        moveGridFocus(gridNav.currentRow, gridNav.cols - 1);
      }
      break;
    case ' ':
    case 'Enter':
      e.preventDefault();
      activateCurrentCell();
      break;
    case 'Escape':
      e.preventDefault();
      exitGridNavigation();
      gridNav.container.blur();
      break;
  }
}

/**
 * Move grid focus to new position
 */
function moveGridFocus(newRow, newCol) {
  // Clamp to valid range
  newRow = Math.max(0, Math.min(gridNav.rows - 1, newRow));
  newCol = Math.max(0, Math.min(gridNav.cols - 1, newCol));

  if (newRow === gridNav.currentRow && newCol === gridNav.currentCol) {
    return;
  }

  clearCellHighlight();
  gridNav.currentRow = newRow;
  gridNav.currentCol = newCol;
  highlightCell(newRow, newCol);

  // Announce position to screen readers
  announcePosition();
}

/**
 * Highlight the current cell
 */
function highlightCell(row, col) {
  if (!gridNav.cells[row] || !gridNav.cells[row][col]) return;

  const cell = gridNav.cells[row][col];
  cell.classList.add('keyboard-focus');
  cell.setAttribute('aria-current', 'true');

  // Ensure cell is visible
  cell.scrollIntoView({ block: 'nearest', inline: 'nearest' });
}

/**
 * Clear cell highlight
 */
function clearCellHighlight() {
  if (!gridNav.cells[gridNav.currentRow]) return;

  const cell = gridNav.cells[gridNav.currentRow][gridNav.currentCol];
  if (cell) {
    cell.classList.remove('keyboard-focus');
    cell.removeAttribute('aria-current');
  }
}

/**
 * Activate (toggle) the current cell
 */
function activateCurrentCell() {
  if (!gridNav.cells[gridNav.currentRow]) return;

  const cell = gridNav.cells[gridNav.currentRow][gridNav.currentCol];
  if (cell) {
    cell.click();
    announceState();
  }
}

/**
 * Announce current position to screen readers
 */
function announcePosition() {
  const liveRegion = document.getElementById('live-status');
  if (!liveRegion) return;

  const voiceItems = document.querySelectorAll('.voice-item');
  const voiceName = voiceItems[gridNav.currentRow]?.querySelector('.voice-name')?.textContent || `Voice ${gridNav.currentRow + 1}`;

  liveRegion.textContent = `${voiceName}, step ${gridNav.currentCol + 1}`;
}

/**
 * Announce cell state to screen readers
 */
function announceState() {
  const liveRegion = document.getElementById('live-status');
  if (!liveRegion) return;

  const cell = gridNav.cells[gridNav.currentRow]?.[gridNav.currentCol];
  if (!cell) return;

  const isActive = cell.classList.contains('active');
  liveRegion.textContent = isActive ? 'Step on' : 'Step off';
}

// ============================================
// VOICE LIST NAVIGATION
// ============================================

/**
 * Initialize voice list keyboard navigation
 */
export function initVoiceListNavigation() {
  const voiceList = document.getElementById('voice-list');
  if (!voiceList) return;

  voiceList.addEventListener('keydown', (e) => {
    const currentItem = document.activeElement.closest('.voice-item');
    if (!currentItem) return;

    const items = Array.from(voiceList.querySelectorAll('.voice-item'));
    const currentIndex = items.indexOf(currentItem);

    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        newIndex = currentIndex === 0 ? items.length - 1 : currentIndex - 1;
        break;
      case 'ArrowDown':
        e.preventDefault();
        newIndex = currentIndex === items.length - 1 ? 0 : currentIndex + 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = items.length - 1;
        break;
      case 's':
        // Solo shortcut
        e.preventDefault();
        currentItem.querySelector('.voice-solo-btn')?.click();
        break;
      case 'm':
        // Mute shortcut
        e.preventDefault();
        currentItem.querySelector('.voice-mute-btn')?.click();
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (confirm('Delete this voice?')) {
          currentItem.querySelector('.voice-delete-btn')?.click();
        }
        break;
      default:
        return;
    }

    if (newIndex !== currentIndex && items[newIndex]) {
      items[newIndex].focus();
      items[newIndex].click();
    }
  });
}

// ============================================
// MODAL FOCUS TRAP
// ============================================

let focusTrapStack = [];

/**
 * Trap focus within a modal
 */
export function trapFocus(modalElement) {
  const focusableElements = modalElement.querySelectorAll(
    'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
  );

  if (focusableElements.length === 0) return;

  const firstFocusable = focusableElements[0];
  const lastFocusable = focusableElements[focusableElements.length - 1];

  // Store the previously focused element
  const previousFocus = document.activeElement;

  focusTrapStack.push({
    modal: modalElement,
    previousFocus,
    handler: (e) => {
      if (e.key !== 'Tab') return;

      if (e.shiftKey) {
        // Shift + Tab
        if (document.activeElement === firstFocusable) {
          e.preventDefault();
          lastFocusable.focus();
        }
      } else {
        // Tab
        if (document.activeElement === lastFocusable) {
          e.preventDefault();
          firstFocusable.focus();
        }
      }
    },
  });

  const trap = focusTrapStack[focusTrapStack.length - 1];
  document.addEventListener('keydown', trap.handler);

  // Focus the first focusable element or the modal itself
  const autofocus = modalElement.querySelector('[autofocus]');
  (autofocus || firstFocusable).focus();
}

/**
 * Release focus trap
 */
export function releaseFocus(modalElement) {
  const trapIndex = focusTrapStack.findIndex((t) => t.modal === modalElement);
  if (trapIndex === -1) return;

  const trap = focusTrapStack[trapIndex];
  document.removeEventListener('keydown', trap.handler);

  // Restore focus to previously focused element
  if (trap.previousFocus && trap.previousFocus.focus) {
    trap.previousFocus.focus();
  }

  focusTrapStack.splice(trapIndex, 1);
}

// ============================================
// MENU NAVIGATION
// ============================================

/**
 * Initialize dropdown menu keyboard navigation
 */
export function initMenuNavigation() {
  const menuBtns = document.querySelectorAll('.menu-btn');

  menuBtns.forEach((btn) => {
    btn.addEventListener('keydown', (e) => {
      const menuId = btn.dataset.menu;
      const menu = document.getElementById(`menu-${menuId}`);
      if (!menu) return;

      switch (e.key) {
        case 'ArrowDown':
        case 'Enter':
        case ' ':
          e.preventDefault();
          openMenu(btn, menu);
          break;
      }
    });
  });

  // Handle menu item navigation
  document.querySelectorAll('.dropdown-menu').forEach((menu) => {
    menu.addEventListener('keydown', (e) => {
      const items = Array.from(menu.querySelectorAll('button[role="menuitem"]'));
      const currentIndex = items.indexOf(document.activeElement);

      switch (e.key) {
        case 'ArrowDown':
          e.preventDefault();
          focusMenuItem(items, currentIndex + 1);
          break;
        case 'ArrowUp':
          e.preventDefault();
          focusMenuItem(items, currentIndex - 1);
          break;
        case 'Home':
          e.preventDefault();
          focusMenuItem(items, 0);
          break;
        case 'End':
          e.preventDefault();
          focusMenuItem(items, items.length - 1);
          break;
        case 'Escape':
          e.preventDefault();
          closeMenu(menu);
          break;
        case 'Enter':
        case ' ':
          // Let the click handler run
          break;
      }
    });
  });
}

/**
 * Open a menu and focus first item
 */
function openMenu(btn, menu) {
  // Show the menu
  menu.classList.remove('hidden');
  btn.setAttribute('aria-expanded', 'true');

  // Focus first menu item
  const firstItem = menu.querySelector('button[role="menuitem"]');
  if (firstItem) {
    firstItem.focus();
    firstItem.classList.add('keyboard-focus');
  }
}

/**
 * Close a menu and return focus to trigger
 */
function closeMenu(menu) {
  const menuId = menu.id.replace('menu-', '');
  const btn = document.querySelector(`[data-menu="${menuId}"]`);

  menu.classList.add('hidden');
  if (btn) {
    btn.setAttribute('aria-expanded', 'false');
    btn.focus();
  }

  // Clear keyboard focus class
  menu.querySelectorAll('.keyboard-focus').forEach((el) => {
    el.classList.remove('keyboard-focus');
  });
}

/**
 * Focus a menu item at index
 */
function focusMenuItem(items, index) {
  // Wrap around
  if (index < 0) index = items.length - 1;
  if (index >= items.length) index = 0;

  // Clear previous focus indicator
  items.forEach((item) => item.classList.remove('keyboard-focus'));

  // Focus new item
  items[index]?.focus();
  items[index]?.classList.add('keyboard-focus');
}

// ============================================
// ROVING TABINDEX FOR CHORD PALETTE
// ============================================

/**
 * Initialize roving tabindex for chord button grid
 */
export function initRovingTabindex(containerId) {
  const container = document.getElementById(containerId);
  if (!container) return;

  container.addEventListener('keydown', (e) => {
    const buttons = Array.from(container.querySelectorAll('button'));
    const currentIndex = buttons.indexOf(document.activeElement);
    if (currentIndex === -1) return;

    let newIndex = currentIndex;

    switch (e.key) {
      case 'ArrowRight':
        e.preventDefault();
        newIndex = (currentIndex + 1) % buttons.length;
        break;
      case 'ArrowLeft':
        e.preventDefault();
        newIndex = currentIndex === 0 ? buttons.length - 1 : currentIndex - 1;
        break;
      case 'Home':
        e.preventDefault();
        newIndex = 0;
        break;
      case 'End':
        e.preventDefault();
        newIndex = buttons.length - 1;
        break;
      default:
        return;
    }

    // Update tabindex
    buttons.forEach((btn, i) => {
      btn.setAttribute('tabindex', i === newIndex ? '0' : '-1');
    });

    buttons[newIndex]?.focus();
  });

  // Initialize: only first button is tabbable
  const buttons = container.querySelectorAll('button');
  buttons.forEach((btn, i) => {
    btn.setAttribute('tabindex', i === 0 ? '0' : '-1');
  });
}

// ============================================
// INITIALIZATION
// ============================================

/**
 * Initialize all accessibility keyboard features
 */
export function initA11yKeyboard() {
  initTabNavigation();
  initMenuNavigation();
  initVoiceListNavigation();

  // Initialize grid navigation when sequencer view is shown
  eventBus.on(Events.VIEW_CHANGED, ({ view }) => {
    if (view === 'sequencer') {
      initGridNavigation('view-sequencer');
    }
  });

  // Initialize chord palette roving tabindex when modal opens
  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.type === 'attributes' && mutation.attributeName === 'class') {
        const modal = mutation.target;
        if (modal.id === 'chord-palette-modal' && !modal.classList.contains('hidden')) {
          initRovingTabindex('diatonic-triads');
          initRovingTabindex('diatonic-sevenths');
          initRovingTabindex('common-chords');
          trapFocus(modal.querySelector('.modal-content'));
        } else if (modal.id === 'chord-palette-modal' && modal.classList.contains('hidden')) {
          releaseFocus(modal.querySelector('.modal-content'));
        }
      }
    });
  });

  // Observe modal visibility changes
  document.querySelectorAll('.modal').forEach((modal) => {
    observer.observe(modal, { attributes: true });
  });

  // Close menus on Escape anywhere
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      document.querySelectorAll('.dropdown-menu:not(.hidden)').forEach(closeMenu);
    }
  });
}

export default {
  initA11yKeyboard,
  initTabNavigation,
  initGridNavigation,
  initVoiceListNavigation,
  initMenuNavigation,
  trapFocus,
  releaseFocus,
};

/**
 * Revision Manager - Version history within project files
 *
 * Allows saving snapshots of project state and restoring them later.
 * Revisions are stored in the project file itself.
 */

import { eventBus, Events } from '../event-bus.js';
import { state } from '../state.js';

// Configuration
const MAX_REVISIONS = 10;
const MAX_REVISION_SIZE = 5 * 1024 * 1024; // 5MB per revision

/**
 * Revision interface
 * @typedef {Object} Revision
 * @property {string} id - Unique identifier
 * @property {string} timestamp - ISO timestamp
 * @property {string} description - User description
 * @property {string} snapshot - Compressed project state (Base64)
 * @property {number} size - Size in bytes
 */

/**
 * Revision Manager class
 */
class RevisionManager {
  constructor() {
    // Nothing to initialize - state is stored in project
  }

  /**
   * Get revisions from current project
   * @returns {Revision[]}
   */
  getRevisions() {
    const projectData = state.getProjectData();
    return projectData.metadata?.revisions || [];
  }

  /**
   * Create a new revision
   * @param {string} description - Description of this revision
   * @returns {Revision | null}
   */
  createRevision(description = '') {
    // Get current state (without revisions to avoid nested snapshots)
    const projectData = state.getProjectData();
    const { metadata, ...projectWithoutMeta } = projectData;
    const { revisions, ...metadataWithoutRevisions } = metadata || {};

    const projectToSnapshot = {
      ...projectWithoutMeta,
      metadata: metadataWithoutRevisions,
    };

    // Compress the snapshot
    const snapshot = this._compress(projectToSnapshot);

    // Check size
    const size = new Blob([snapshot]).size;
    if (size > MAX_REVISION_SIZE) {
      console.warn('Revision too large, cannot save');
      return null;
    }

    const revision = {
      id: this._generateId(),
      timestamp: new Date().toISOString(),
      description: description || 'Snapshot',
      snapshot,
      size,
    };

    // Add to revisions list
    const currentRevisions = this.getRevisions();
    const newRevisions = [revision, ...currentRevisions];

    // Enforce max limit
    if (newRevisions.length > MAX_REVISIONS) {
      newRevisions.length = MAX_REVISIONS;
    }

    // Update state
    this._updateRevisions(newRevisions);

    eventBus.emit('revision:created', revision);

    return { ...revision, snapshot: undefined }; // Don't return the full snapshot
  }

  /**
   * Restore a revision
   * @param {string} revisionId
   * @returns {boolean}
   */
  restoreRevision(revisionId) {
    const revisions = this.getRevisions();
    const revision = revisions.find(r => r.id === revisionId);

    if (!revision) {
      console.error('Revision not found:', revisionId);
      return false;
    }

    try {
      // Decompress the snapshot
      const projectData = this._decompress(revision.snapshot);

      // Preserve current revisions
      const currentRevisions = this.getRevisions();

      // Load the restored state
      state.loadProject({
        ...projectData,
        metadata: {
          ...projectData.metadata,
          revisions: currentRevisions,
        },
      });

      eventBus.emit('revision:restored', { id: revisionId });

      return true;
    } catch (e) {
      console.error('Failed to restore revision:', e);
      return false;
    }
  }

  /**
   * Delete a revision
   * @param {string} revisionId
   * @returns {boolean}
   */
  deleteRevision(revisionId) {
    const revisions = this.getRevisions();
    const index = revisions.findIndex(r => r.id === revisionId);

    if (index === -1) return false;

    const newRevisions = [...revisions];
    newRevisions.splice(index, 1);

    this._updateRevisions(newRevisions);

    eventBus.emit('revision:deleted', { id: revisionId });

    return true;
  }

  /**
   * Update revision description
   * @param {string} revisionId
   * @param {string} description
   * @returns {boolean}
   */
  updateDescription(revisionId, description) {
    const revisions = this.getRevisions();
    const revision = revisions.find(r => r.id === revisionId);

    if (!revision) return false;

    revision.description = description;
    this._updateRevisions(revisions);

    return true;
  }

  /**
   * Get total size of all revisions
   * @returns {number}
   */
  getTotalSize() {
    return this.getRevisions().reduce((sum, r) => sum + (r.size || 0), 0);
  }

  /**
   * Clear all revisions
   */
  clearRevisions() {
    this._updateRevisions([]);
    eventBus.emit('revision:cleared');
  }

  /**
   * Compare two revisions
   * @param {string} revisionId1
   * @param {string} revisionId2
   * @returns {Object | null}
   */
  compareRevisions(revisionId1, revisionId2) {
    const revisions = this.getRevisions();
    const rev1 = revisions.find(r => r.id === revisionId1);
    const rev2 = revisions.find(r => r.id === revisionId2);

    if (!rev1 || !rev2) return null;

    try {
      const state1 = this._decompress(rev1.snapshot);
      const state2 = this._decompress(rev2.snapshot);

      return this._diff(state1, state2);
    } catch (e) {
      console.error('Failed to compare revisions:', e);
      return null;
    }
  }

  /**
   * Get preview of a revision (without full restore)
   * @param {string} revisionId
   * @returns {Object | null}
   */
  previewRevision(revisionId) {
    const revisions = this.getRevisions();
    const revision = revisions.find(r => r.id === revisionId);

    if (!revision) return null;

    try {
      const state = this._decompress(revision.snapshot);
      return {
        id: revision.id,
        timestamp: revision.timestamp,
        description: revision.description,
        projectName: state.project?.name,
        voiceCount: state.voices?.length || 0,
        tempo: state.transport?.tempo,
      };
    } catch {
      return null;
    }
  }

  // === Private methods ===

  /**
   * Update revisions in state
   * @param {Revision[]} revisions
   */
  _updateRevisions(revisions) {
    const projectData = state.getProjectData();
    state.loadProject({
      ...projectData,
      metadata: {
        ...projectData.metadata,
        revisions,
      },
    });
    state.markDirty();
  }

  /**
   * Compress project state to Base64
   * @param {Object} data
   * @returns {string}
   */
  _compress(data) {
    const json = JSON.stringify(data);

    // Use simple Base64 encoding (can be replaced with pako for better compression)
    return btoa(unescape(encodeURIComponent(json)));
  }

  /**
   * Decompress Base64 to project state
   * @param {string} compressed
   * @returns {Object}
   */
  _decompress(compressed) {
    const json = decodeURIComponent(escape(atob(compressed)));
    return JSON.parse(json);
  }

  /**
   * Generate a diff between two states
   * @param {Object} state1
   * @param {Object} state2
   * @returns {Object}
   */
  _diff(state1, state2) {
    const changes = [];

    // Compare voices
    const voices1 = new Set((state1.voices || []).map(v => v.id));
    const voices2 = new Set((state2.voices || []).map(v => v.id));

    voices1.forEach(id => {
      if (!voices2.has(id)) {
        const voice = state1.voices.find(v => v.id === id);
        changes.push({ type: 'voice_removed', voiceName: voice?.name });
      }
    });

    voices2.forEach(id => {
      if (!voices1.has(id)) {
        const voice = state2.voices.find(v => v.id === id);
        changes.push({ type: 'voice_added', voiceName: voice?.name });
      }
    });

    // Compare transport
    if (state1.transport?.tempo !== state2.transport?.tempo) {
      changes.push({
        type: 'tempo_changed',
        from: state1.transport?.tempo,
        to: state2.transport?.tempo,
      });
    }

    // Compare project name
    if (state1.project?.name !== state2.project?.name) {
      changes.push({
        type: 'name_changed',
        from: state1.project?.name,
        to: state2.project?.name,
      });
    }

    return {
      totalChanges: changes.length,
      changes,
    };
  }

  /**
   * Generate unique ID
   * @returns {string}
   */
  _generateId() {
    return `rev-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  }

  /**
   * Format bytes for display
   * @param {number} bytes
   * @returns {string}
   */
  static formatBytes(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  }
}

// Singleton instance
export const revisionManager = new RevisionManager();

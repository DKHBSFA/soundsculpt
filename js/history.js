/**
 * History Manager - Undo/Redo system using Command Pattern
 */

import { eventBus, Events } from './event-bus.js';

/**
 * Base Command class
 * All commands must implement execute() and undo()
 */
export class Command {
  constructor(type) {
    this.id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    this.type = type;
    this.timestamp = Date.now();
  }

  execute() {
    throw new Error('Command.execute() must be implemented');
  }

  undo() {
    throw new Error('Command.undo() must be implemented');
  }

  redo() {
    // Default: redo is same as execute
    this.execute();
  }

  /**
   * Check if this command can merge with another
   * Used for combining similar commands (e.g., typing)
   */
  canMerge(other) {
    return false;
  }

  /**
   * Merge another command into this one
   */
  merge(other) {
    return this;
  }
}

/**
 * History Manager
 */
class HistoryManager {
  constructor(maxSize = 100) {
    this.undoStack = [];
    this.redoStack = [];
    this.maxSize = maxSize;
    this.isExecuting = false; // Prevent re-entry during undo/redo
  }

  /**
   * Execute a command and add to history
   */
  execute(command) {
    if (this.isExecuting) return;

    // Execute the command
    command.execute();

    // Try to merge with last command
    const lastCommand = this.undoStack[this.undoStack.length - 1];
    if (lastCommand && lastCommand.canMerge(command)) {
      lastCommand.merge(command);
    } else {
      // Add to undo stack
      this.undoStack.push(command);

      // Trim if over max size
      if (this.undoStack.length > this.maxSize) {
        this.undoStack.shift();
      }
    }

    // Clear redo stack (new action invalidates redo history)
    this.redoStack = [];

    eventBus.emit(Events.HISTORY_PUSH, { command, canUndo: true, canRedo: false });
  }

  /**
   * Undo the last command
   */
  undo() {
    if (this.undoStack.length === 0) return false;
    if (this.isExecuting) return false;

    this.isExecuting = true;
    try {
      const command = this.undoStack.pop();
      command.undo();
      this.redoStack.push(command);

      eventBus.emit(Events.HISTORY_UNDO, {
        command,
        canUndo: this.undoStack.length > 0,
        canRedo: true,
      });

      return true;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Redo the last undone command
   */
  redo() {
    if (this.redoStack.length === 0) return false;
    if (this.isExecuting) return false;

    this.isExecuting = true;
    try {
      const command = this.redoStack.pop();
      command.redo();
      this.undoStack.push(command);

      eventBus.emit(Events.HISTORY_REDO, {
        command,
        canUndo: true,
        canRedo: this.redoStack.length > 0,
      });

      return true;
    } finally {
      this.isExecuting = false;
    }
  }

  /**
   * Check if undo is available
   */
  canUndo() {
    return this.undoStack.length > 0;
  }

  /**
   * Check if redo is available
   */
  canRedo() {
    return this.redoStack.length > 0;
  }

  /**
   * Clear all history
   */
  clear() {
    this.undoStack = [];
    this.redoStack = [];
  }

  /**
   * Get history info
   */
  getInfo() {
    return {
      undoCount: this.undoStack.length,
      redoCount: this.redoStack.length,
      lastCommand: this.undoStack[this.undoStack.length - 1] || null,
    };
  }
}

// Singleton instance
export const history = new HistoryManager();

// === Common Commands ===

/**
 * Toggle Step Command (for sequencer)
 */
export class ToggleStepCommand extends Command {
  constructor(state, voiceId, stepIndex) {
    super('toggleStep');
    this.state = state;
    this.voiceId = voiceId;
    this.stepIndex = stepIndex;
  }

  execute() {
    this.state.toggleStep(this.voiceId, this.stepIndex);
  }

  undo() {
    // Toggle again to reverse
    this.state.toggleStep(this.voiceId, this.stepIndex);
  }
}

/**
 * Add Voice Command
 */
export class AddVoiceCommand extends Command {
  constructor(state, voiceData = {}) {
    super('addVoice');
    this.state = state;
    this.voiceData = voiceData;
    this.createdVoice = null;
  }

  execute() {
    this.createdVoice = this.state.addVoice(this.voiceData);
  }

  undo() {
    if (this.createdVoice) {
      this.state.removeVoice(this.createdVoice.id);
    }
  }

  redo() {
    // Re-add with same data
    if (this.createdVoice) {
      this.state.addVoice({ ...this.createdVoice });
    }
  }
}

/**
 * Remove Voice Command
 */
export class RemoveVoiceCommand extends Command {
  constructor(state, voiceId) {
    super('removeVoice');
    this.state = state;
    this.voiceId = voiceId;
    this.removedVoice = null;
  }

  execute() {
    this.removedVoice = this.state.removeVoice(this.voiceId);
  }

  undo() {
    if (this.removedVoice) {
      this.state.addVoice({ ...this.removedVoice });
    }
  }
}

/**
 * Set Voice Parameter Command
 */
export class SetVoiceParamCommand extends Command {
  constructor(state, voiceId, param, newValue) {
    super('setVoiceParam');
    this.state = state;
    this.voiceId = voiceId;
    this.param = param;
    this.newValue = newValue;
    this.oldValue = null;
  }

  execute() {
    const voice = this.state.getVoice(this.voiceId);
    if (voice) {
      this.oldValue = voice[this.param];
      this.state.updateVoice(this.voiceId, { [this.param]: this.newValue });
    }
  }

  undo() {
    if (this.oldValue !== null) {
      this.state.updateVoice(this.voiceId, { [this.param]: this.oldValue });
    }
  }

  canMerge(other) {
    // Merge if same command type, same voice, same param, within 500ms
    return (
      other instanceof SetVoiceParamCommand &&
      other.voiceId === this.voiceId &&
      other.param === this.param &&
      other.timestamp - this.timestamp < 500
    );
  }

  merge(other) {
    // Keep old value from this, take new value from other
    this.newValue = other.newValue;
    this.timestamp = other.timestamp;
    return this;
  }
}

/**
 * Set Tempo Command
 */
export class SetTempoCommand extends Command {
  constructor(state, newTempo) {
    super('setTempo');
    this.state = state;
    this.newTempo = newTempo;
    this.oldTempo = state.get('transport.tempo');
  }

  execute() {
    this.state.setTempo(this.newTempo);
  }

  undo() {
    this.state.setTempo(this.oldTempo);
  }

  canMerge(other) {
    return (
      other instanceof SetTempoCommand &&
      other.timestamp - this.timestamp < 500
    );
  }

  merge(other) {
    this.newTempo = other.newTempo;
    this.timestamp = other.timestamp;
    return this;
  }
}

// === Note Commands (for Piano Roll) ===

/**
 * Add Note Command
 */
export class AddNoteCommand extends Command {
  constructor(state, voiceId, noteData) {
    super('addNote');
    this.state = state;
    this.voiceId = voiceId;
    this.noteData = noteData;
    this.createdNote = null;
  }

  execute() {
    this.createdNote = this.state.addNote(this.voiceId, this.noteData);
  }

  undo() {
    if (this.createdNote) {
      this.state.removeNote(this.voiceId, this.createdNote.id);
    }
  }

  redo() {
    if (this.createdNote) {
      this.createdNote = this.state.addNote(this.voiceId, { ...this.createdNote });
    } else {
      this.execute();
    }
  }
}

/**
 * Delete Note Command
 */
export class DeleteNoteCommand extends Command {
  constructor(state, voiceId, noteId) {
    super('deleteNote');
    this.state = state;
    this.voiceId = voiceId;
    this.noteId = noteId;
    this.deletedNote = null;
  }

  execute() {
    this.deletedNote = this.state.removeNote(this.voiceId, this.noteId);
  }

  undo() {
    if (this.deletedNote) {
      this.state.addNote(this.voiceId, { ...this.deletedNote });
    }
  }
}

/**
 * Move Note Command
 */
export class MoveNoteCommand extends Command {
  constructor(state, voiceId, noteId, newStartBeat, newPitch) {
    super('moveNote');
    this.state = state;
    this.voiceId = voiceId;
    this.noteId = noteId;
    this.newStartBeat = newStartBeat;
    this.newPitch = newPitch;
    this.oldStartBeat = null;
    this.oldPitch = null;
  }

  execute() {
    const note = this.state.getNote(this.voiceId, this.noteId);
    if (note) {
      this.oldStartBeat = note.startBeat;
      this.oldPitch = note.pitch;
      this.state.updateNote(this.voiceId, this.noteId, {
        startBeat: this.newStartBeat,
        pitch: this.newPitch,
      });
    }
  }

  undo() {
    if (this.oldStartBeat !== null && this.oldPitch !== null) {
      this.state.updateNote(this.voiceId, this.noteId, {
        startBeat: this.oldStartBeat,
        pitch: this.oldPitch,
      });
    }
  }

  canMerge(other) {
    return (
      other instanceof MoveNoteCommand &&
      other.voiceId === this.voiceId &&
      other.noteId === this.noteId &&
      other.timestamp - this.timestamp < 300
    );
  }

  merge(other) {
    this.newStartBeat = other.newStartBeat;
    this.newPitch = other.newPitch;
    this.timestamp = other.timestamp;
    return this;
  }
}

/**
 * Resize Note Command
 */
export class ResizeNoteCommand extends Command {
  constructor(state, voiceId, noteId, newDuration) {
    super('resizeNote');
    this.state = state;
    this.voiceId = voiceId;
    this.noteId = noteId;
    this.newDuration = newDuration;
    this.oldDuration = null;
  }

  execute() {
    const note = this.state.getNote(this.voiceId, this.noteId);
    if (note) {
      this.oldDuration = note.durationBeats;
      this.state.updateNote(this.voiceId, this.noteId, {
        durationBeats: this.newDuration,
      });
    }
  }

  undo() {
    if (this.oldDuration !== null) {
      this.state.updateNote(this.voiceId, this.noteId, {
        durationBeats: this.oldDuration,
      });
    }
  }

  canMerge(other) {
    return (
      other instanceof ResizeNoteCommand &&
      other.voiceId === this.voiceId &&
      other.noteId === this.noteId &&
      other.timestamp - this.timestamp < 300
    );
  }

  merge(other) {
    this.newDuration = other.newDuration;
    this.timestamp = other.timestamp;
    return this;
  }
}

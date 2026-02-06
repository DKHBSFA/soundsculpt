/**
 * Internationalization (i18n) - Multi-language support
 *
 * Supports: English (en), Italian (it), German (de),
 * Spanish (es), French (fr), Japanese (ja)
 */

import { eventBus, Events } from './event-bus.js';

// localStorage key
const LOCALE_STORAGE_KEY = 'soundsculpt-locale';

// Supported locales
export const SUPPORTED_LOCALES = {
  en: { name: 'English', native: 'English', flag: '🇬🇧' },
  it: { name: 'Italian', native: 'Italiano', flag: '🇮🇹' },
  de: { name: 'German', native: 'Deutsch', flag: '🇩🇪' },
  es: { name: 'Spanish', native: 'Español', flag: '🇪🇸' },
  fr: { name: 'French', native: 'Français', flag: '🇫🇷' },
  ja: { name: 'Japanese', native: '日本語', flag: '🇯🇵' },
};

/**
 * i18n Manager class
 */
class I18n {
  constructor() {
    this.locale = 'en';
    this.messages = {};
    this.fallbackMessages = {};
    this.listeners = new Set();
  }

  /**
   * Initialize i18n with detected or stored locale
   */
  async init() {
    // Try to load saved locale
    const savedLocale = localStorage.getItem(LOCALE_STORAGE_KEY);

    if (savedLocale && SUPPORTED_LOCALES[savedLocale]) {
      await this.setLocale(savedLocale);
    } else {
      // Detect from browser
      const detected = this.detectLocale();
      await this.setLocale(detected);
    }
  }

  /**
   * Detect browser locale
   * @returns {string}
   */
  detectLocale() {
    const browserLang = navigator.language?.split('-')[0] || 'en';
    return SUPPORTED_LOCALES[browserLang] ? browserLang : 'en';
  }

  /**
   * Set current locale
   * @param {string} locale
   */
  async setLocale(locale) {
    if (!SUPPORTED_LOCALES[locale]) {
      console.warn(`Unsupported locale: ${locale}`);
      locale = 'en';
    }

    // Load locale messages
    await this.loadMessages(locale);

    // Load fallback (English) if not already loaded
    if (locale !== 'en' && Object.keys(this.fallbackMessages).length === 0) {
      this.fallbackMessages = await this._fetchMessages('en');
    }

    this.locale = locale;
    localStorage.setItem(LOCALE_STORAGE_KEY, locale);

    // Update HTML lang attribute
    document.documentElement.lang = locale;

    // Notify listeners
    this._notifyListeners();
    eventBus.emit('locale:change', { locale });
  }

  /**
   * Load messages for a locale
   * @param {string} locale
   */
  async loadMessages(locale) {
    try {
      this.messages = await this._fetchMessages(locale);
    } catch (e) {
      console.error(`Failed to load locale ${locale}:`, e);
      // Fall back to English
      if (locale !== 'en') {
        this.messages = await this._fetchMessages('en');
      }
    }
  }

  /**
   * Fetch messages from file
   * @param {string} locale
   * @returns {Promise<Object>}
   */
  async _fetchMessages(locale) {
    try {
      const response = await fetch(`locales/${locale}.json`);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return response.json();
    } catch (e) {
      console.warn(`Could not load locale file for ${locale}, using embedded fallback`);
      // Return embedded English as fallback
      return EMBEDDED_MESSAGES[locale] || EMBEDDED_MESSAGES.en;
    }
  }

  /**
   * Translate a key
   * @param {string} key - Dot-separated key (e.g., 'transport.play')
   * @param {Object} params - Parameters for interpolation
   * @returns {string}
   */
  t(key, params = {}) {
    let value = this._getNestedValue(this.messages, key);

    // Fall back to English if not found
    if (value === undefined || value === key) {
      value = this._getNestedValue(this.fallbackMessages, key);
    }

    // If still not found, return key
    if (value === undefined) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Interpolate parameters
    return this._interpolate(value, params);
  }

  /**
   * Get nested value from object by dot-separated key
   * @param {Object} obj
   * @param {string} key
   * @returns {*}
   */
  _getNestedValue(obj, key) {
    const keys = key.split('.');
    let value = obj;

    for (const k of keys) {
      if (value === undefined || value === null) return undefined;
      value = value[k];
    }

    return value;
  }

  /**
   * Interpolate parameters into string
   * @param {string} str
   * @param {Object} params
   * @returns {string}
   */
  _interpolate(str, params) {
    return str.replace(/\{(\w+)\}/g, (match, param) => {
      return params[param] !== undefined ? params[param] : match;
    });
  }

  /**
   * Get current locale
   * @returns {string}
   */
  getLocale() {
    return this.locale;
  }

  /**
   * Get locale info
   * @param {string} [locale]
   * @returns {Object}
   */
  getLocaleInfo(locale = this.locale) {
    return SUPPORTED_LOCALES[locale] || SUPPORTED_LOCALES.en;
  }

  /**
   * Subscribe to locale changes
   * @param {Function} callback
   * @returns {Function} Unsubscribe function
   */
  onLocaleChange(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify all listeners
   */
  _notifyListeners() {
    this.listeners.forEach(cb => {
      try {
        cb(this.locale);
      } catch (e) {
        console.error('Error in locale change listener:', e);
      }
    });
  }

  /**
   * Check if RTL (right-to-left) language
   * @returns {boolean}
   */
  isRTL() {
    // None of our supported languages are RTL
    return false;
  }
}

// Embedded English messages as ultimate fallback
const EMBEDDED_MESSAGES = {
  en: {
    app: {
      title: 'SoundSculpt',
      tagline: 'Browser-based audio composition',
    },
    transport: {
      play: 'Play',
      stop: 'Stop',
      pause: 'Pause',
      record: 'Record',
      loop: 'Loop',
    },
    views: {
      sequencer: 'Sequencer',
      pianoRoll: 'Piano Roll',
      score: 'Score',
      patch: 'Patch',
      code: 'Code',
    },
    voice: {
      mute: 'Mute',
      solo: 'Solo',
      volume: 'Volume',
      pan: 'Pan',
      add: 'Add Voice',
      remove: 'Remove',
      rename: 'Rename',
      duplicate: 'Duplicate',
    },
    file: {
      new: 'New Project',
      open: 'Open',
      save: 'Save',
      saveAs: 'Save As',
      export: {
        wav: 'Export WAV',
        midi: 'Export MIDI',
      },
      import: 'Import',
      unsavedWarning: 'You have unsaved changes. Leave anyway?',
    },
    welcome: {
      generate: 'Generate Music',
      generateDesc: 'Let AI create a starting point',
      blank: 'Start from Scratch',
      blankDesc: 'Empty project',
      load: 'Load Project',
      loadDesc: 'Open .soundsculpt file',
      recent: 'Recent Projects',
    },
    generation: {
      title: 'Generate Music',
      style: 'Style',
      duration: 'Duration',
      energy: 'Energy',
      template: 'Template',
      generate: 'Generate',
      preview: 'Preview',
    },
    settings: {
      title: 'Settings',
      language: 'Language',
      autoSave: 'Auto-save',
      autoSaveInterval: 'Auto-save interval',
      minutes: 'minutes',
    },
    errors: {
      audioContextSuspended: 'Click anywhere to enable audio',
      corruptedFile: 'Could not load project: file is corrupted',
      sampleTooLarge: 'Sample exceeds maximum size of {maxSize}MB',
      midiAccessDenied: 'MIDI access denied',
      microphoneAccessDenied: 'Microphone access denied',
    },
    common: {
      ok: 'OK',
      cancel: 'Cancel',
      close: 'Close',
      save: 'Save',
      delete: 'Delete',
      edit: 'Edit',
      search: 'Search',
      loading: 'Loading...',
      noResults: 'No results',
    },
  },
  it: {
    app: {
      title: 'SoundSculpt',
      tagline: 'Composizione audio nel browser',
    },
    transport: {
      play: 'Riproduci',
      stop: 'Stop',
      pause: 'Pausa',
      record: 'Registra',
      loop: 'Loop',
    },
    views: {
      sequencer: 'Sequencer',
      pianoRoll: 'Piano Roll',
      score: 'Partitura',
      patch: 'Patch',
      code: 'Codice',
    },
    voice: {
      mute: 'Muto',
      solo: 'Solo',
      volume: 'Volume',
      pan: 'Pan',
      add: 'Aggiungi Voce',
      remove: 'Rimuovi',
      rename: 'Rinomina',
      duplicate: 'Duplica',
    },
    file: {
      new: 'Nuovo Progetto',
      open: 'Apri',
      save: 'Salva',
      saveAs: 'Salva Come',
      export: {
        wav: 'Esporta WAV',
        midi: 'Esporta MIDI',
      },
      import: 'Importa',
      unsavedWarning: 'Hai modifiche non salvate. Uscire comunque?',
    },
    welcome: {
      generate: 'Genera Musica',
      generateDesc: "Lascia che l'AI crei un punto di partenza",
      blank: 'Parti da Zero',
      blankDesc: 'Progetto vuoto',
      load: 'Carica Progetto',
      loadDesc: 'Apri file .soundsculpt',
      recent: 'Progetti Recenti',
    },
    settings: {
      title: 'Impostazioni',
      language: 'Lingua',
      autoSave: 'Salvataggio automatico',
      autoSaveInterval: 'Intervallo salvataggio',
      minutes: 'minuti',
    },
    errors: {
      audioContextSuspended: 'Clicca ovunque per abilitare audio',
      corruptedFile: 'Impossibile caricare: file corrotto',
      sampleTooLarge: 'Il sample supera la dimensione massima di {maxSize}MB',
      midiAccessDenied: 'Accesso MIDI negato',
      microphoneAccessDenied: 'Accesso microfono negato',
    },
    common: {
      ok: 'OK',
      cancel: 'Annulla',
      close: 'Chiudi',
      save: 'Salva',
      delete: 'Elimina',
      edit: 'Modifica',
      search: 'Cerca',
      loading: 'Caricamento...',
      noResults: 'Nessun risultato',
    },
  },
};

// Add other embedded locales as needed
EMBEDDED_MESSAGES.de = {
  app: { title: 'SoundSculpt', tagline: 'Browser-basierte Audiokomposition' },
  transport: { play: 'Abspielen', stop: 'Stopp', pause: 'Pause', record: 'Aufnahme', loop: 'Schleife' },
  common: { ok: 'OK', cancel: 'Abbrechen', close: 'Schließen', save: 'Speichern', delete: 'Löschen' },
};

EMBEDDED_MESSAGES.es = {
  app: { title: 'SoundSculpt', tagline: 'Composición de audio en el navegador' },
  transport: { play: 'Reproducir', stop: 'Detener', pause: 'Pausar', record: 'Grabar', loop: 'Bucle' },
  common: { ok: 'OK', cancel: 'Cancelar', close: 'Cerrar', save: 'Guardar', delete: 'Eliminar' },
};

EMBEDDED_MESSAGES.fr = {
  app: { title: 'SoundSculpt', tagline: 'Composition audio dans le navigateur' },
  transport: { play: 'Lecture', stop: 'Arrêt', pause: 'Pause', record: 'Enregistrer', loop: 'Boucle' },
  common: { ok: 'OK', cancel: 'Annuler', close: 'Fermer', save: 'Enregistrer', delete: 'Supprimer' },
};

EMBEDDED_MESSAGES.ja = {
  app: { title: 'SoundSculpt', tagline: 'ブラウザベースのオーディオ作成' },
  transport: { play: '再生', stop: '停止', pause: '一時停止', record: '録音', loop: 'ループ' },
  common: { ok: 'OK', cancel: 'キャンセル', close: '閉じる', save: '保存', delete: '削除' },
};

// Singleton instance
export const i18n = new I18n();

// Convenience function
export function t(key, params) {
  return i18n.t(key, params);
}

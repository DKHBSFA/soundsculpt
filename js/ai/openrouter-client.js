/**
 * SoundSculpt - OpenRouter API Client
 * Handles AI-powered music generation via OpenRouter
 */

import { llmResponseViewer } from '../ui/llm-response-viewer.js';

// API key offuscata (base64) - solo per scoraggiare copia-incolla
const DEFAULT_API_KEY = atob('c2stb3ItdjEtNWM5NGU4NTkwMmVhMmM2OWY1NWJiODVlYWNlNzI0YTJkMDFlNTk2YmIwOTgyZTZiYWE2YmU3OWNhMWI1NzJjMw==');

/**
 * Available AI models for music generation
 * Gemma 3 is default because it knows Strudel syntax
 */
export const AI_MODELS = [
  {
    id: 'google/gemma-3-27b-it:free',
    name: 'Gemma 3 27B',
    description: 'Best for Strudel patterns (recommended)',
    free: true
  },
  {
    id: 'meta-llama/llama-3.3-70b-instruct:free',
    name: 'Llama 3.3 70B',
    description: 'Large model, good reasoning',
    free: true
  },
  {
    id: 'arcee-ai/trinity-large-preview:free',
    name: 'Trinity Large',
    description: 'Creative writing focus',
    free: true
  },
  {
    id: 'deepseek/deepseek-r1:free',
    name: 'DeepSeek R1',
    description: 'Strong reasoning model',
    free: true
  }
];

const OPENROUTER_CONFIG = {
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  defaultModel: 'google/gemma-3-27b-it:free', // Gemma 3 knows Strudel!
  fallbackModels: [
    'meta-llama/llama-3.3-70b-instruct:free',
    'arcee-ai/trinity-large-preview:free'
  ],
  // Generation parameters for creativity
  temperature: 0.85,
  top_p: 0.9,
  frequency_penalty: 0.3,
  presence_penalty: 0.2,
  max_tokens: 4096,
};

/**
 * OpenRouter API Client for AI music generation
 */
class OpenRouterClient {
  constructor() {
    this.apiKey = this.getApiKey();
    this.lastError = null;
    this.currentModel = OPENROUTER_CONFIG.defaultModel;
  }

  /**
   * Get API key with priority: user key > default key
   */
  getApiKey() {
    return localStorage.getItem('soundsculpt-openrouter-key') || DEFAULT_API_KEY;
  }

  /**
   * Save user's own API key
   */
  setUserApiKey(key) {
    if (key && key.startsWith('sk-or-')) {
      localStorage.setItem('soundsculpt-openrouter-key', key);
      this.apiKey = key;
      return true;
    }
    return false;
  }

  /**
   * Remove user key, revert to default
   */
  clearUserApiKey() {
    localStorage.removeItem('soundsculpt-openrouter-key');
    this.apiKey = DEFAULT_API_KEY;
  }

  /**
   * Check if using default (demo) key
   */
  isUsingDefaultKey() {
    return !localStorage.getItem('soundsculpt-openrouter-key');
  }

  /**
   * Main generation method
   * @param {string} systemPrompt - System prompt with music theory rules
   * @param {string} userPrompt - User's generation request
   * @param {Object} options - Override default options
   * @returns {Promise<Object>} Parsed JSON response
   */
  async generate(systemPrompt, userPrompt, options = {}) {
    const model = options.model || this.getSavedModel();
    this.currentModel = model;

    // Store prompts for transparency viewer
    this._lastPrompts = { systemPrompt, userPrompt };

    try {
      const response = await this._makeRequest(systemPrompt, userPrompt, model, options);

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));

        // Rate limit or model error - try fallback
        if (response.status === 429 || response.status === 503 || response.status === 500) {
          console.warn(`Model ${model} failed (${response.status}), trying fallback...`);
          return this._generateWithFallback(systemPrompt, userPrompt, options);
        }

        // Auth error
        if (response.status === 401 || response.status === 403) {
          this.lastError = 'Invalid API key. Please check your key or use demo mode.';
          throw new Error(this.lastError);
        }

        this.lastError = errorData.error?.message || `API error: ${response.status}`;
        throw new Error(this.lastError);
      }

      const data = await response.json();
      return this._parseResponse(data);

    } catch (error) {
      if (error.message.includes('fetch')) {
        this.lastError = 'Network error. Please check your connection.';
      }
      throw error;
    }
  }

  /**
   * Make the actual API request
   */
  async _makeRequest(systemPrompt, userPrompt, model, options) {
    const fetchOptions = {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
        'HTTP-Referer': 'https://soundsculpt.app',
        'X-Title': 'SoundSculpt'
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        temperature: options.temperature ?? OPENROUTER_CONFIG.temperature,
        top_p: options.top_p ?? OPENROUTER_CONFIG.top_p,
        frequency_penalty: options.frequency_penalty ?? OPENROUTER_CONFIG.frequency_penalty,
        presence_penalty: options.presence_penalty ?? OPENROUTER_CONFIG.presence_penalty,
        max_tokens: options.max_tokens ?? OPENROUTER_CONFIG.max_tokens,
        response_format: { type: 'json_object' }
      })
    };

    // Add abort signal if provided
    if (options.signal) {
      fetchOptions.signal = options.signal;
    }

    return fetch(OPENROUTER_CONFIG.endpoint, fetchOptions);
  }

  /**
   * Try fallback models if primary fails
   */
  async _generateWithFallback(systemPrompt, userPrompt, options) {
    for (const model of OPENROUTER_CONFIG.fallbackModels) {
      // Check if aborted before trying next model
      if (options.signal?.aborted) {
        const abortError = new Error('Generation cancelled');
        abortError.name = 'AbortError';
        throw abortError;
      }

      try {
        console.log(`Trying fallback model: ${model}`);
        this.currentModel = model;

        const response = await this._makeRequest(systemPrompt, userPrompt, model, options);

        if (response.ok) {
          const data = await response.json();
          return this._parseResponse(data);
        }
      } catch (e) {
        // Re-throw abort errors
        if (e.name === 'AbortError') throw e;
        console.warn(`Fallback ${model} failed:`, e.message);
        continue;
      }
    }

    this.lastError = 'All AI models are currently unavailable. Try again later.';
    throw new Error(this.lastError);
  }

  /**
   * Parse and validate response
   */
  _parseResponse(data) {
    if (!data.choices || !data.choices[0]?.message?.content) {
      throw new Error('Invalid response from AI');
    }

    const content = data.choices[0].message.content;

    // Store response for transparency viewer (BEFORE any parsing)
    llmResponseViewer.storeResponse({
      systemPrompt: this._lastPrompts?.systemPrompt || '',
      userPrompt: this._lastPrompts?.userPrompt || '',
      rawResponse: content,
      model: this.currentModel,
      usage: data.usage || {}
    });

    // Also log to console for debugging
    console.group('🤖 RAW LLM RESPONSE (before conversion)');
    console.log('Model:', this.currentModel);
    console.log('Usage:', data.usage);
    console.log('─'.repeat(60));
    console.log(content);
    console.log('─'.repeat(60));
    console.groupEnd();

    try {
      const parsed = JSON.parse(content);
      return {
        data: parsed,
        model: this.currentModel,
        usage: data.usage || {}
      };
    } catch (e) {
      // Try to extract JSON from response if wrapped in text
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        return {
          data: JSON.parse(jsonMatch[0]),
          model: this.currentModel,
          usage: data.usage || {}
        };
      }
      throw new Error('AI returned invalid JSON. Please try again.');
    }
  }

  /**
   * Get last error message
   */
  getLastError() {
    return this.lastError;
  }

  /**
   * Get current model being used
   */
  getCurrentModel() {
    return this.currentModel;
  }

  /**
   * Set the model to use for next generation
   * @param {string} modelId - Model ID from AI_MODELS
   */
  setModel(modelId) {
    const model = AI_MODELS.find(m => m.id === modelId);
    if (model) {
      this.currentModel = modelId;
      // Save preference
      localStorage.setItem('soundsculpt-ai-model', modelId);
      return true;
    }
    return false;
  }

  /**
   * Get saved model preference or default
   */
  getSavedModel() {
    return localStorage.getItem('soundsculpt-ai-model') || OPENROUTER_CONFIG.defaultModel;
  }

  /**
   * Get available models list
   */
  getAvailableModels() {
    return AI_MODELS;
  }
}

// Export singleton instance
export const openRouterClient = new OpenRouterClient();
export { OPENROUTER_CONFIG };

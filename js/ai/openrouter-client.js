/**
 * SoundSculpt - OpenRouter API Client
 * Handles AI-powered music generation via OpenRouter
 */

// API key offuscata (base64) - solo per scoraggiare copia-incolla
const DEFAULT_API_KEY = atob('c2stb3ItdjEtNWM5NGU4NTkwMmVhMmM2OWY1NWJiODVlYWNlNzI0YTJkMDFlNTk2YmIwOTgyZTZiYWE2YmU3OWNhMWI1NzJjMw==');

const OPENROUTER_CONFIG = {
  endpoint: 'https://openrouter.ai/api/v1/chat/completions',
  defaultModel: 'arcee-ai/trinity-large-preview:free',
  fallbackModels: [
    'google/gemma-3-27b-it:free',
    'meta-llama/llama-3.3-70b-instruct:free'
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
    const model = options.model || OPENROUTER_CONFIG.defaultModel;
    this.currentModel = model;

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
    return fetch(OPENROUTER_CONFIG.endpoint, {
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
    });
  }

  /**
   * Try fallback models if primary fails
   */
  async _generateWithFallback(systemPrompt, userPrompt, options) {
    for (const model of OPENROUTER_CONFIG.fallbackModels) {
      try {
        console.log(`Trying fallback model: ${model}`);
        this.currentModel = model;

        const response = await this._makeRequest(systemPrompt, userPrompt, model, options);

        if (response.ok) {
          const data = await response.json();
          return this._parseResponse(data);
        }
      } catch (e) {
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
}

// Export singleton instance
export const openRouterClient = new OpenRouterClient();
export { OPENROUTER_CONFIG };

/**
 * i18n.js — Vanilla JavaScript Internationalization Engine
 * Zero dependencies, ES6 module for runtime language switching
 */

class I18n {
  constructor() {
    this.currentLang = "en";
    this.translations = {};
    this.fallbackLang = "en";
  }

  /**
   * Initialize i18n with language detection
   */
  async init() {
    // Check localStorage for saved preference
    const saved = localStorage.getItem("lang");
    if (saved && ["en", "zh"].includes(saved)) {
      this.currentLang = saved;
    } else {
      // Detect browser language
      const browserLang = navigator.language.toLowerCase();
      if (browserLang.startsWith("zh")) {
        this.currentLang = "zh";
      } else {
        this.currentLang = "en";
      }
    }

    // Load initial language
    await this.loadLanguage(this.currentLang);
  }

  /**
   * Load a language JSON file
   */
  async loadLanguage(lang) {
    if (this.translations[lang]) return;

    try {
      const response = await fetch(`/lang/${lang}.json`);
      if (!response.ok) {
        throw new Error(`Failed to load language: ${lang}`);
      }
      this.translations[lang] = await response.json();
    } catch (error) {
      console.error(`Error loading language ${lang}:`, error);
      if (lang !== this.fallbackLang) {
        await this.loadLanguage(this.fallbackLang);
      }
    }
  }

  /**
   * Switch to a different language
   */
  async switchLanguage(lang) {
    if (!["en", "zh"].includes(lang)) {
      console.warn(`Unsupported language: ${lang}`);
      return;
    }

    await this.loadLanguage(lang);
    this.currentLang = lang;
    localStorage.setItem("lang", lang);
    this.updateDOM();
  }

  /**
   * Get translation by key with optional variable interpolation
   * @param {string} key - Dot-notation key (e.g., "header.title")
   * @param {object} vars - Variables for interpolation (e.g., {name: "Red"})
   */
  t(key, vars = {}) {
    const keys = key.split(".");
    let value = this.translations[this.currentLang];

    // Navigate nested object
    for (const k of keys) {
      if (value && typeof value === "object") {
        value = value[k];
      } else {
        value = undefined;
        break;
      }
    }

    // Fallback to English if translation missing
    if (value === undefined && this.currentLang !== this.fallbackLang) {
      let fallback = this.translations[this.fallbackLang];
      for (const k of keys) {
        if (fallback && typeof fallback === "object") {
          fallback = fallback[k];
        } else {
          fallback = undefined;
          break;
        }
      }
      value = fallback;
    }

    // If still not found, return the key itself
    if (value === undefined) {
      console.warn(`Missing translation: ${key}`);
      return key;
    }

    // Interpolate variables
    if (typeof value === "string" && Object.keys(vars).length > 0) {
      return value.replace(/\{(\w+)\}/g, (match, varName) => {
        return vars[varName] !== undefined ? vars[varName] : match;
      });
    }

    return value;
  }

  /**
   * Update all DOM elements with data-i18n attributes
   */
  updateDOM() {
    // Update text content
    const elements = document.querySelectorAll("[data-i18n]");
    elements.forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (key) {
        const translated = this.t(key);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA") {
          el.placeholder = translated;
        } else {
          el.textContent = translated;
        }
      }
    });

    // Update HTML content
    const htmlElements = document.querySelectorAll("[data-i18n-html]");
    htmlElements.forEach((el) => {
      const key = el.getAttribute("data-i18n-html");
      if (key) {
        el.innerHTML = this.t(key);
      }
    });
  }

  /**
   * Get current language
   */
  getCurrentLanguage() {
    return this.currentLang;
  }
}

// Create global instance
const i18n = new I18n();

// Export for ES6 modules
export default i18n;
export const t = (key, vars) => i18n.t(key, vars);

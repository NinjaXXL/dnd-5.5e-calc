/**
 * ============================================================
 * UTILITIES MODULE — js/utils.js
 * ============================================================
 * Pure helper functions with no side effects or dependencies.
 * All functions are stateless and predictable.
 * ============================================================
 */

const Utils = (() => {

  // ── Numeric helpers ────────────────────────────────────────

  /** Clamp a value between min and max (inclusive) */
  const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

  /** D&D 5e ability modifier: floor((score - 10) / 2) */
  const abilityModifier = (score) => Math.floor((score - 10) / 2);

  /** D&D 5e proficiency bonus from character level */
  const proficiencyFromLevel = (level) => Math.ceil(level / 4) + 1;

  /** Round to N decimal places */
  const round = (value, decimals = 2) => {
    const factor = Math.pow(10, decimals);
    return Math.round(value * factor) / factor;
  };

  // ── Formatting ─────────────────────────────────────────────

  /** Format a number with explicit sign: +3, −1, +0 */
  const formatBonus = (num) => {
    const rounded = Math.round(num);
    return rounded >= 0 ? `+${rounded}` : `${rounded}`;
  };

  /** Format a decimal to 2 places: 12.35 */
  const formatDecimal = (num) => round(num, 2).toFixed(2);

  /** Format as percentage: 0.65 → "65%" */
  const formatPercent = (decimal) => `${Math.round(decimal * 100)}%`;

  /** Format a range: {min, max} → "2–12" */
  const formatRange = (min, max) => `${min}–${max}`;

  // ── ID generation ──────────────────────────────────────────

  let _idCounter = 0;

  /** Generate a guaranteed-unique DOM-safe ID */
  const generateId = (prefix = 'el') => `${prefix}_${Date.now()}_${++_idCounter}`;

  // ── Object utilities ───────────────────────────────────────

  /** Deep clone via JSON round-trip (sufficient for plain state objects) */
  const deepClone = (obj) => JSON.parse(JSON.stringify(obj));

  /**
   * Resolve a dot-notation path on an object.
   * E.g. get({a:{b:3}}, 'a.b') → 3
   */
  const getByPath = (obj, path) => {
    if (!path) return obj;
    return path.split('.').reduce((current, key) => {
      return current !== undefined && current !== null ? current[key] : undefined;
    }, obj);
  };

  /**
   * Set a value at a dot-notation path, mutating the object.
   * Creates intermediate objects as needed.
   */
  const setByPath = (obj, path, value) => {
    const keys = path.split('.');
    let current = obj;
    for (let i = 0; i < keys.length - 1; i++) {
      if (current[keys[i]] === undefined || typeof current[keys[i]] !== 'object') {
        current[keys[i]] = isNaN(keys[i + 1]) ? {} : [];
      }
      current = current[keys[i]];
    }
    current[keys[keys.length - 1]] = value;
  };

  // ── Serialization ──────────────────────────────────────────

  /** Encode a plain object to a URL-safe base64 string */
  const encodeToBase64 = (obj) => {
    try {
      const json = JSON.stringify(obj);
      const utf8 = encodeURIComponent(json);
      return btoa(utf8);
    } catch (err) {
      console.error('[Utils] encodeToBase64 failed:', err);
      return null;
    }
  };

  /** Decode a base64 string back to a plain object */
  const decodeFromBase64 = (str) => {
    try {
      const utf8 = atob(str.trim());
      const json = decodeURIComponent(utf8);
      return JSON.parse(json);
    } catch (err) {
      console.error('[Utils] decodeFromBase64 failed:', err);
      return null;
    }
  };

  // ── DOM utilities ──────────────────────────────────────────

  /** Create an element with optional class and text content */
  const createElement = (tag, className = '', text = '') => {
    const el = document.createElement(tag);
    if (className) el.className = className;
    if (text) el.textContent = text;
    return el;
  };

  /** Copy text to clipboard, with legacy fallback */
  const copyToClipboard = async (text) => {
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
        return true;
      }
    } catch (_) { /* fall through to legacy */ }

    // Legacy fallback
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch (err) {
      console.error('[Utils] copyToClipboard failed:', err);
      return false;
    }
  };

  // ── Toast notifications ────────────────────────────────────

  /**
   * Display a transient toast notification.
   * @param {string} message
   * @param {'success'|'error'|'info'} type
   * @param {number} duration  ms before fade-out
   */
  const showToast = (message, type = 'success', duration = 2800) => {
    // Remove any existing toast of same type to prevent stacking
    document.querySelectorAll(`.toast.toast--${type}`).forEach(t => t.remove());

    const toast = createElement('div', `toast toast--${type}`, message);
    document.body.appendChild(toast);

    // Force reflow before adding visible class to trigger CSS transition
    void toast.offsetHeight;
    toast.classList.add('toast--visible');

    setTimeout(() => {
      toast.classList.remove('toast--visible');
      setTimeout(() => toast.remove(), 350);
    }, duration);
  };

  // ── Debounce ───────────────────────────────────────────────

  /** Return a debounced version of fn that fires after `delay` ms */
  const debounce = (fn, delay = 150) => {
    let timer;
    return (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), delay);
    };
  };

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({
    clamp,
    abilityModifier,
    proficiencyFromLevel,
    round,
    formatBonus,
    formatDecimal,
    formatPercent,
    formatRange,
    generateId,
    deepClone,
    getByPath,
    setByPath,
    encodeToBase64,
    decodeFromBase64,
    createElement,
    copyToClipboard,
    showToast,
    debounce,
  });

})();
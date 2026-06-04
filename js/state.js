/**
 * ============================================================
 * STATE MANAGEMENT MODULE — js/state.js
 * ============================================================
 * Single source of truth for all application data.
 *
 * Features:
 *  - Path-based get/set with dot-notation
 *  - Subscription system (path-specific + global)
 *  - Dynamic list management (add / remove / update by ID)
 *  - Serialization / deserialization (base64 JSON)
 *  - Batch updates (suppress mid-batch notifications)
 *
 * State shape is defined by CONFIG.defaultState.
 * No module other than State should mutate _data directly.
 * ============================================================
 */

const State = (() => {

  // ── Internal state ─────────────────────────────────────────

  let _data = {};

  /**
   * Path-specific subscribers: Map<path, Set<callback>>
   * Called when a value at that exact path (or a child) changes.
   */
  const _pathSubs = new Map();

  /**
   * Global subscribers: Set<callback>
   * Called on every state change with (fullState, changedPath).
   */
  const _globalSubs = new Set();

  /** Whether we are inside a batch — suppresses mid-batch notifications */
  let _batching = false;

  /** Paths changed during a batch, flushed on endBatch() */
  const _batchedChanges = new Set();

  // ── Initialization ─────────────────────────────────────────

  /**
   * Initialize state from a plain object (typically CONFIG.defaultState).
   * Triggers no notifications — call before rendering.
   *
   * @param {object} initialData
   */
  const init = (initialData) => {
    _data = Utils.deepClone(initialData);
  };

  // ── Reading ────────────────────────────────────────────────

  /**
   * Get a value from state by dot-notation path.
   * If path is omitted, returns the entire state (deep-cloned).
   *
   * @param {string} [path]
   * @returns {*}
   */
  const get = (path) => {
    if (!path) return Utils.deepClone(_data);
    return Utils.getByPath(_data, path);
  };

  /**
   * Return the entire state as a deep clone.
   * Preferred for passing state to calculation functions.
   *
   * @returns {object}
   */
  const getAll = () => Utils.deepClone(_data);

  // ── Writing ────────────────────────────────────────────────

  /**
   * Set a value at a dot-notation path and notify subscribers.
   *
   * @param {string} path
   * @param {*}      value
   */
  const set = (path, value) => {
    Utils.setByPath(_data, path, value);
    _notifyChange(path);
  };

  // ── Dynamic list management ────────────────────────────────

  /**
   * Add a new item to an array stored at `listPath`.
   * Item must have an `id` property.
   *
   * @param {string} listPath  e.g. 'attacks'
   * @param {object} item      Must include a unique `id` field
   */
  const addListItem = (listPath, item) => {
    if (!item.id) {
      item.id = Utils.generateId(listPath);
    }
    const list = get(listPath);
    const newList = Array.isArray(list) ? [...list, item] : [item];
    set(listPath, newList);
  };

  /**
   * Remove an item from a list by its `id` property.
   *
   * @param {string} listPath
   * @param {string} itemId
   */
  const removeListItem = (listPath, itemId) => {
    const list = get(listPath);
    if (!Array.isArray(list)) return;
    set(listPath, list.filter(item => item.id !== itemId));
  };

  /**
   * Update a single field on a list item located by ID.
   * This is the primary way dynamic block inputs write to state.
   *
   * @param {string} listPath
   * @param {string} itemId
   * @param {string} fieldKey
   * @param {*}      value
   */
  const updateListItem = (listPath, itemId, fieldKey, value) => {
    const list = get(listPath);
    if (!Array.isArray(list)) return;

    const index = list.findIndex(item => item.id === itemId);
    if (index === -1) {
      console.warn(`[State] updateListItem: item "${itemId}" not found in "${listPath}"`);
      return;
    }

    // Build the concrete indexed path so path-subscribers get notified
    set(`${listPath}.${index}.${fieldKey}`, value);
  };

  /**
   * Read a single field from a list item by ID.
   * Returns undefined if list or item doesn't exist.
   *
   * @param {string} listPath
   * @param {string} itemId
   * @param {string} fieldKey
   * @returns {*}
   */
  const getListItemField = (listPath, itemId, fieldKey) => {
    const list = get(listPath);
    if (!Array.isArray(list)) return undefined;
    const item = list.find(i => i.id === itemId);
    return item ? item[fieldKey] : undefined;
  };

  /**
   * Return a full item object from a list by ID (deep cloned).
   *
   * @param {string} listPath
   * @param {string} itemId
   * @returns {object|undefined}
   */
  const getListItem = (listPath, itemId) => {
    const list = get(listPath);
    if (!Array.isArray(list)) return undefined;
    const item = list.find(i => i.id === itemId);
    return item ? Utils.deepClone(item) : undefined;
  };

  // ── Subscriptions ──────────────────────────────────────────

  /**
   * Subscribe to changes at a specific path (or any child path).
   * Callback is called with (newValue, changedPath).
   *
   * @param {string}   path
   * @param {Function} callback  (value, path) => void
   * @returns {Function}  Unsubscribe function
   */
  const subscribe = (path, callback) => {
    if (!_pathSubs.has(path)) {
      _pathSubs.set(path, new Set());
    }
    _pathSubs.get(path).add(callback);

    // Return unsubscribe
    return () => {
      const subs = _pathSubs.get(path);
      if (subs) subs.delete(callback);
    };
  };

  /**
   * Subscribe to ALL state changes.
   * Callback receives (fullState, changedPath).
   * Useful for the calculation engine trigger.
   *
   * @param {Function} callback  (state, path) => void
   * @returns {Function}  Unsubscribe function
   */
  const subscribeGlobal = (callback) => {
    _globalSubs.add(callback);
    return () => _globalSubs.delete(callback);
  };

  // ── Batch updates ──────────────────────────────────────────

  /**
   * Begin a batch — all set() calls will not trigger notifications
   * until endBatch() is called.
   */
  const beginBatch = () => {
    _batching = true;
    _batchedChanges.clear();
  };

  /**
   * End a batch and flush all accumulated notifications.
   */
  const endBatch = () => {
    _batching = false;
    const paths = [..._batchedChanges];
    _batchedChanges.clear();

    // Notify path subscribers (deduplicated)
    const notifiedParents = new Set();
    paths.forEach(path => {
      _notifyPathSubs(path);
      // Also notify parent paths
      const parts = path.split('.');
      for (let i = 1; i < parts.length; i++) {
        const parent = parts.slice(0, i).join('.');
        if (!notifiedParents.has(parent)) {
          notifiedParents.add(parent);
          _notifyPathSubs(parent);
        }
      }
    });

    // Global notification once with the full state
    const snapshot = getAll();
    _globalSubs.forEach(cb => cb(snapshot, 'batch'));
  };

  // ── Serialization ──────────────────────────────────────────

  /**
   * Encode current state to a compact base64 string for sharing.
   *
   * @returns {string|null}
   */
  const serialize = () => Utils.encodeToBase64(_data);

  /**
   * Restore state from a base64 string produced by serialize().
   * Fires all global subscribers after restoring.
   *
   * @param {string} encoded
   * @returns {boolean}  true on success
   */
  const deserialize = (encoded) => {
    const decoded = Utils.decodeFromBase64(encoded);
    if (!decoded || typeof decoded !== 'object') return false;

    _data = decoded;

    // Notify all global subscribers of the full reset
    const snapshot = getAll();
    _globalSubs.forEach(cb => cb(snapshot, '*'));
    return true;
  };

  /**
   * Reset state to provided defaults, then notify all subscribers.
   *
   * @param {object} defaults
   */
  const reset = (defaults) => {
    _data = Utils.deepClone(defaults);
    const snapshot = getAll();
    _globalSubs.forEach(cb => cb(snapshot, '*'));
  };

  // ── Internal notification helpers ──────────────────────────

  const _notifyChange = (changedPath) => {
    if (_batching) {
      _batchedChanges.add(changedPath);
      return;
    }

    _notifyPathSubs(changedPath);

    // Also notify parent-path subscribers
    const parts = changedPath.split('.');
    for (let i = parts.length - 1; i > 0; i--) {
      const parentPath = parts.slice(0, i).join('.');
      _notifyPathSubs(parentPath);
    }

    // Global notification
    const snapshot = getAll();
    _globalSubs.forEach(cb => cb(snapshot, changedPath));
  };

  const _notifyPathSubs = (path) => {
    const subs = _pathSubs.get(path);
    if (subs) {
      const value = get(path);
      subs.forEach(cb => cb(value, path));
    }
  };

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({
    // Core
    init,
    get,
    getAll,
    set,

    // List management
    addListItem,
    removeListItem,
    updateListItem,
    getListItemField,
    getListItem,

    // Subscriptions
    subscribe,
    subscribeGlobal,

    // Batch
    beginBatch,
    endBatch,

    // Serialization
    serialize,
    deserialize,
    reset,
  });

})();
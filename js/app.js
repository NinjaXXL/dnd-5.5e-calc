/**
 * ============================================================
 * APP MODULE — js/app.js
 * ============================================================
 * Entry point. Boots the application and wires every module.
 *
 * STARTUP SEQUENCE
 * ────────────────
 *  1. Calculations.configure — inject feature definitions
 *  2. State.init             — load default state (no notifications)
 *  3. _loadFromHash          — optionally restore state from URL hash
 *  4. Renderer.init + bindContainers
 *  5. Renderer.renderAll     — build full UI from config + state
 *  6. _bindIOButtons         — wire header buttons (now in DOM)
 *  7. State.subscribeGlobal  — subscribe to all state changes
 *  8. Initial results render
 *
 * STATE CHANGE FLOW
 * ─────────────────
 *  Field edit / feature toggle / add / remove:
 *    → global subscriber fires immediately
 *    → _debouncedRecalc() scheduled (50 ms)   — avoids thrashing on typing
 *    → _debouncedHashWrite() scheduled (900 ms) — updates shareable URL quietly
 *
 *  Import / reset (changedPath === '*'):
 *    → _recalculate(state) called immediately (no debounce)
 *    → Renderer.renderAll() rebuilds all sections
 *    → _bindIOButtons() re-wires because renderAll replaces the header
 *    → URL hash updated immediately to reflect new state
 *
 * URL HASH SHARING
 * ────────────────
 *  State is encoded to base64 JSON and stored in window.location.hash.
 *  On page load, if a hash is present, that state is restored instead
 *  of defaults. This makes every URL a shareable build link.
 *
 *  Hash format:  #<encodeURIComponent(base64State)>
 *
 * IO BUTTONS
 * ──────────
 *  🔗 Share     — copy current page URL (with hash) to clipboard
 *  📋 Copy Build — copy raw build code (base64) to clipboard
 *  📥 Load Build — prompt for build code, restore state
 *  ↺  Reset      — confirm, then restore default state
 * ============================================================
 */

const App = (() => {

  // ── Init ───────────────────────────────────────────────────

  const init = (config) => {
    // 1. Inject feature definitions into the calculation engine
    Calculations.configure({ featureDefinitions: config.featureDefinitions });

    // 2. Prime state with defaults — fires no notifications
    State.init(config.defaultState);

    // 3. Try to restore from URL hash before rendering
    _loadFromHash();

    // 4. Initialise renderer
    Renderer.init(config);
    Renderer.bindContainers(
      document.getElementById('app-header'),
      document.getElementById('sections-container'),
      document.getElementById('results-panel')
    );

    // 5. Build the full UI from current state
    Renderer.renderAll();

    // 6. Wire IO buttons (header is now in DOM)
    _bindIOButtons(config);

    // 7. Subscribe to all state changes
    State.subscribeGlobal((state, changedPath) => {
      if (changedPath === '*') {
        // Import or reset — immediate recalc + full re-render
        _recalculate(state);
        Renderer.renderAll();
        _bindIOButtons(config);
        _writeHash(); // immediately reflect in URL
      } else {
        // Normal field edit — debounced recalc + lazy hash update
        _debouncedRecalc();
        _debouncedHashWrite();
      }
    });

    // 8. Initial results render (state fully initialised)
    _recalculate(State.getAll());

    console.info(`[App] ${config.meta.title} v${config.meta.version} ready.`);
  };

  // ── Calculation (debounced for field edits) ────────────────

  const _recalculate = (state) => {
    try {
      const results = Calculations.calculate(state ?? State.getAll());
      Renderer.renderResults(document.getElementById('results-panel'), results);
    } catch (err) {
      console.error('[App] Calculation error:', err);
    }
  };

  // 50 ms debounce: prevents recalculating on every keystroke while typing.
  // Reads fresh state at execution time, not at schedule time.
  const _debouncedRecalc = Utils.debounce(() => _recalculate(State.getAll()), 50);

  // ── URL hash state sharing ─────────────────────────────────

  /**
   * On page load: check if the URL has a build code in the fragment.
   * Supports both:
   *   - URL-encoded form: written by _writeHash() with encodeURIComponent
   *   - Raw base64: pasted directly after # by a user
   * Silent on success (toasts not available yet); warns to console on failure.
   */
  const _loadFromHash = () => {
    const raw = window.location.hash.slice(1); // strip leading '#'
    if (!raw) return;

    // Attempt 1: treat as URL-encoded (standard path written by _writeHash)
    let code = raw;
    try { code = decodeURIComponent(raw); } catch (_) { code = raw; }

    let ok = State.deserialize(code);

    // Attempt 2: raw string was itself a build code (no URL-encoding applied)
    if (!ok && code !== raw) {
      ok = State.deserialize(raw);
    }

    if (!ok) {
      console.warn('[App] URL hash did not contain a valid build code — using defaults.');
      // Clear the bad hash so the user isn't confused
      window.history.replaceState(null, '', window.location.pathname);
    }
  };

  /** Write current state to the URL fragment (replaces history entry). */
  const _writeHash = () => {
    const code = State.serialize();
    if (!code) return;
    try {
      window.history.replaceState(null, '', '#' + encodeURIComponent(code));
    } catch (e) {
      console.warn('[App] Could not write URL hash:', e);
    }
  };

  // 900 ms debounce: updates the shareable URL quietly while the user edits,
  // without hammering history on every keypress.
  const _debouncedHashWrite = Utils.debounce(_writeHash, 900);

  // ── IO buttons ─────────────────────────────────────────────

  const _bindIOButtons = (config) => {
    _bindBtn('btn-share', () => _handleShare());
    _bindBtn('btn-copy',  () => _handleCopy());
    _bindBtn('btn-load',  () => _handleLoad());
    _bindBtn('btn-reset', () => _handleReset(config));
  };

  /**
   * Attach a click handler to a button by ID.
   * Clone-and-replace removes any previously bound listener so repeated
   * calls (after renderAll) don't stack handlers.
   */
  const _bindBtn = (id, handler) => {
    const el = document.getElementById(id);
    if (!el) return;
    const fresh = el.cloneNode(true);
    el.replaceWith(fresh);
    fresh.addEventListener('click', handler);
  };

  // ── Share Link — copy full URL with hash ───────────────────

  const _handleShare = async () => {
    _writeHash(); // ensure hash is current before reading the URL
    const url = window.location.href;
    const ok  = await Utils.copyToClipboard(url);
    Utils.showToast(
      ok
        ? '🔗 Share link copied! Paste it anywhere to share this build.'
        : '✗ Could not copy — try copying the address bar directly.',
      ok ? 'success' : 'error',
      3500
    );
  };

  // ── Copy Build — copy raw base64 code ─────────────────────

  const _handleCopy = async () => {
    const code = State.serialize();
    if (!code) { Utils.showToast('Failed to encode build.', 'error'); return; }
    const ok = await Utils.copyToClipboard(code);
    Utils.showToast(
      ok
        ? '📋 Build code copied! Paste into "Load Build" to restore.'
        : '✗ Copy failed — try selecting and copying manually.',
      ok ? 'success' : 'error'
    );
  };

  // ── Load Build — restore from base64 code ─────────────────

  const _handleLoad = () => {
    const raw = window.prompt(
      'Paste your build code to restore a saved configuration.\n' +
      '(Use "Copy Build" or copy the URL with "Share" to save one.)'
    );
    if (!raw?.trim()) return;

    const ok = State.deserialize(raw.trim());
    if (ok) {
      // Global subscriber fires with '*' → renderAll + _bindIOButtons happen automatically
      Utils.showToast('✓ Build loaded successfully!', 'success');
    } else {
      Utils.showToast(
        '✗ Invalid build code — make sure you copied the entire string.',
        'error',
        4000
      );
    }
  };

  // ── Reset — restore defaults ───────────────────────────────

  const _handleReset = (config) => {
    const confirmed = window.confirm(
      'Reset everything to default values?\n\n' +
      'Tip: use "Share" or "Copy Build" to save your current build first.'
    );
    if (!confirmed) return;
    State.reset(config.defaultState);
    // Global subscriber fires with '*' → renderAll + _bindIOButtons + _writeHash
    Utils.showToast('↺ Reset to defaults.', 'info');
  };

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({ init });

})();

// ── Bootstrap ──────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => App.init(CONFIG));
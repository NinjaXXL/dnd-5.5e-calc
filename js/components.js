/**
 * ============================================================
 * COMPONENTS MODULE — js/components.js
 * ============================================================
 * Reusable, config-driven UI component factories.
 *
 * Each component is a pure function that:
 *  1. Creates a DOM element from a field config object
 *  2. Binds to a stateInterface for reading and writing
 *  3. Optionally subscribes to external state changes
 *
 * STATE INTERFACE CONTRACT:
 *  {
 *    get:       () => currentValue
 *    set:       (value) => void       — writes to state
 *    subscribe: (cb) => unsubscribe   — nullable for dynamic blocks
 *  }
 *
 * FIELD CONFIG SHAPE:
 *  {
 *    id:          string
 *    type:        'number' | 'text' | 'checkbox' | 'select' | 'display'
 *    label:       string
 *    default:     any
 *    help?:       string    — tooltip text
 *    span?:       1 | 2     — column span in the grid
 *    className?:  string    — extra CSS classes on wrapper
 *    // number-specific
 *    min?:        number
 *    max?:        number
 *    step?:       number
 *    // text-specific
 *    placeholder?: string
 *    maxLength?:   number
 *    // select-specific
 *    options?:    Array<{ value: any, label: string }>
 *    // display-specific
 *    format?:     'bonus' | 'percent' | 'decimal' | 'plain'
 *  }
 * ============================================================
 */

const Components = (() => {

  // ── Shared helpers ─────────────────────────────────────────

  /**
   * Build the outer wrapper div for any field.
   * Applies type and optional span classes.
   */
  const _buildWrapper = (fieldConfig) => {
    const wrapper = document.createElement('div');
    wrapper.className = `field field--${fieldConfig.type}`;
    if (fieldConfig.span === 2) wrapper.classList.add('field--full');
    if (fieldConfig.className) wrapper.classList.add(fieldConfig.className);
    return wrapper;
  };

  /**
   * Build a <label> element with optional help icon tooltip.
   */
  const _buildLabel = (text, forId, helpText) => {
    const label = document.createElement('label');
    label.className = 'field-label';
    label.htmlFor = forId;
    label.textContent = text;

    if (helpText) {
      const tip = document.createElement('span');
      tip.className = 'help-tip';
      tip.setAttribute('aria-label', helpText);
      tip.setAttribute('title', helpText);
      tip.textContent = '?';
      label.appendChild(tip);
    }

    return label;
  };

  /**
   * Coerce a value from a select option to the correct type.
   * Options with numeric values (e.g. diceType: 8) must be preserved as numbers.
   */
  const _coerceSelectValue = (rawString, options) => {
    if (!options) return rawString;
    const match = options.find(o => String(o.value) === rawString);
    return match ? match.value : rawString;
  };

  // ── NUMBER INPUT ───────────────────────────────────────────

  /**
   * A number input with − / + stepper buttons.
   * Clamps to [min, max] on commit.
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @param {Function}       [onChange]  Extra callback after state write
   * @returns {HTMLElement}
   */
  const createNumberInput = (fieldConfig, stateInterface, onChange) => {
    const wrapper = _buildWrapper(fieldConfig);
    const id = Utils.generateId('num');

    const label = _buildLabel(fieldConfig.label, id, fieldConfig.help);

    // Wrapper for the stepper group
    const inputRow = document.createElement('div');
    inputRow.className = 'number-input-row';

    const btnDec = document.createElement('button');
    btnDec.type = 'button';
    btnDec.className = 'stepper-btn stepper-btn--dec';
    btnDec.textContent = '−';
    btnDec.setAttribute('aria-label', `Decrease ${fieldConfig.label}`);
    btnDec.setAttribute('tabindex', '-1');

    const input = document.createElement('input');
    input.type = 'number';
    input.id = id;
    input.className = 'input input--number';
    if (fieldConfig.min !== undefined) input.min = fieldConfig.min;
    if (fieldConfig.max !== undefined) input.max = fieldConfig.max;
    input.step = fieldConfig.step ?? 1;
    input.value = stateInterface.get() ?? fieldConfig.default ?? 0;
    input.setAttribute('aria-label', fieldConfig.label);

    const btnInc = document.createElement('button');
    btnInc.type = 'button';
    btnInc.className = 'stepper-btn stepper-btn--inc';
    btnInc.textContent = '+';
    btnInc.setAttribute('aria-label', `Increase ${fieldConfig.label}`);
    btnInc.setAttribute('tabindex', '-1');

    // ── Commit handler ──────────────────────────────────────
    const commit = (rawValue) => {
      let num = parseFloat(rawValue);
      if (isNaN(num)) num = fieldConfig.default ?? 0;
      if (fieldConfig.min !== undefined) num = Math.max(fieldConfig.min, num);
      if (fieldConfig.max !== undefined) num = Math.min(fieldConfig.max, num);
      // Only write integer if step is 1 (or unset)
      const final = (fieldConfig.step && fieldConfig.step % 1 !== 0) ? num : Math.round(num);
      input.value = final;
      stateInterface.set(final);
      onChange?.(final);
    };

    input.addEventListener('change', () => commit(input.value));
    input.addEventListener('blur',   () => commit(input.value));

    // Arrow keys: intercept before the browser's native step so our
    // clamping and state-write always fire through commit().
    input.addEventListener('keydown', e => {
      const s = parseFloat(fieldConfig.step ?? 1);
      if (e.key === 'ArrowUp')   { e.preventDefault(); commit(parseFloat(input.value) + s); }
      if (e.key === 'ArrowDown') { e.preventDefault(); commit(parseFloat(input.value) - s); }
    });

    btnDec.addEventListener('click', () => {
      const step = parseFloat(fieldConfig.step ?? 1);
      commit(parseFloat(input.value) - step);
    });

    btnInc.addEventListener('click', () => {
      const step = parseFloat(fieldConfig.step ?? 1);
      commit(parseFloat(input.value) + step);
    });

    // Hold-to-repeat for stepper buttons (mouse + touch)
    const _addHoldRepeat = (btn, delta) => {
      let holdTimer, repeatTimer;
      const step = () => {
        const s = parseFloat(fieldConfig.step ?? 1);
        commit(parseFloat(input.value) + delta * s);
      };
      const start = (e) => {
        if (e.type === 'touchstart') e.preventDefault(); // prevent ghost mouse events
        holdTimer = setTimeout(() => { repeatTimer = setInterval(step, 80); }, 500);
      };
      const cancel = () => { clearTimeout(holdTimer); clearInterval(repeatTimer); };
      btn.addEventListener('mousedown',  start);
      btn.addEventListener('touchstart', start,  { passive: false });
      btn.addEventListener('mouseup',    cancel);
      btn.addEventListener('mouseleave', cancel);
      btn.addEventListener('touchend',   cancel);
      btn.addEventListener('touchcancel', cancel);
    };

    _addHoldRepeat(btnDec, -1);
    _addHoldRepeat(btnInc, +1);

    // ── Reactive update from external state change ──────────
    if (stateInterface.subscribe) {
      stateInterface.subscribe((val) => {
        if (document.activeElement !== input) {
          input.value = val ?? fieldConfig.default ?? 0;
        }
      });
    }

    inputRow.append(btnDec, input, btnInc);
    wrapper.append(label, inputRow);
    return wrapper;
  };

  // ── TEXT INPUT ─────────────────────────────────────────────

  /**
   * A plain text input.
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @param {Function}       [onChange]
   * @returns {HTMLElement}
   */
  const createTextInput = (fieldConfig, stateInterface, onChange) => {
    const wrapper = _buildWrapper(fieldConfig);
    const id = Utils.generateId('txt');

    const label = _buildLabel(fieldConfig.label, id, fieldConfig.help);

    const input = document.createElement('input');
    input.type = 'text';
    input.id = id;
    input.className = 'input input--text';
    input.value = stateInterface.get() ?? fieldConfig.default ?? '';
    if (fieldConfig.placeholder) input.placeholder = fieldConfig.placeholder;
    if (fieldConfig.maxLength)   input.maxLength    = fieldConfig.maxLength;

    input.addEventListener('input', () => {
      stateInterface.set(input.value);
      onChange?.(input.value);
    });

    if (stateInterface.subscribe) {
      stateInterface.subscribe((val) => {
        if (document.activeElement !== input) {
          input.value = val ?? fieldConfig.default ?? '';
        }
      });
    }

    wrapper.append(label, input);
    return wrapper;
  };

  // ── CHECKBOX ───────────────────────────────────────────────

  /**
   * A styled checkbox with inline label.
   * Wrapper div wraps the checkbox + label together (no top label).
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @param {Function}       [onChange]
   * @returns {HTMLElement}
   */
  const createCheckbox = (fieldConfig, stateInterface, onChange) => {
    const wrapper = _buildWrapper(fieldConfig);
    const id = Utils.generateId('chk');

    const row = document.createElement('div');
    row.className = 'checkbox-row';

    const input = document.createElement('input');
    input.type = 'checkbox';
    input.id = id;
    input.className = 'input input--checkbox';
    input.checked = !!(stateInterface.get() ?? fieldConfig.default ?? false);

    const label = document.createElement('label');
    label.htmlFor = id;
    label.className = 'checkbox-label';
    label.textContent = fieldConfig.label;

    if (fieldConfig.help) {
      const tip = document.createElement('span');
      tip.className = 'help-tip';
      tip.title = fieldConfig.help;
      tip.textContent = '?';
      label.appendChild(tip);
    }

    input.addEventListener('change', () => {
      stateInterface.set(input.checked);
      onChange?.(input.checked);
    });

    if (stateInterface.subscribe) {
      stateInterface.subscribe((val) => {
        input.checked = !!val;
      });
    }

    row.append(input, label);
    wrapper.appendChild(row);
    return wrapper;
  };

  // ── SELECT / DROPDOWN ──────────────────────────────────────

  /**
   * A styled <select> dropdown.
   * Preserves option value types (numbers stay numbers).
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @param {Function}       [onChange]
   * @returns {HTMLElement}
   */
  const createSelect = (fieldConfig, stateInterface, onChange) => {
    const wrapper = _buildWrapper(fieldConfig);
    const id = Utils.generateId('sel');

    const label = _buildLabel(fieldConfig.label, id, fieldConfig.help);

    const selectWrapper = document.createElement('div');
    selectWrapper.className = 'select-wrapper';

    const select = document.createElement('select');
    select.id = id;
    select.className = 'input input--select';

    const currentValue = stateInterface.get() ?? fieldConfig.default;

    (fieldConfig.options ?? []).forEach(opt => {
      const option = document.createElement('option');
      option.value = String(opt.value);
      option.textContent = opt.label;
      if (String(opt.value) === String(currentValue)) option.selected = true;
      select.appendChild(option);
    });

    // Chevron icon
    const chevron = document.createElement('span');
    chevron.className = 'select-chevron';
    chevron.innerHTML = `<svg viewBox="0 0 10 6" width="10" height="6"><path d="M1 1l4 4 4-4" stroke="currentColor" stroke-width="1.5" fill="none" stroke-linecap="round"/></svg>`;

    select.addEventListener('change', () => {
      const coerced = _coerceSelectValue(select.value, fieldConfig.options);
      stateInterface.set(coerced);
      onChange?.(coerced);
    });

    if (stateInterface.subscribe) {
      stateInterface.subscribe((val) => {
        select.value = String(val);
      });
    }

    selectWrapper.append(select, chevron);
    wrapper.append(label, selectWrapper);
    return wrapper;
  };

  // ── DISPLAY FIELD (read-only computed) ─────────────────────

  /**
   * A read-only display field that shows a computed value.
   * Subscribes to state and updates automatically.
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @returns {HTMLElement}
   */
  const createDisplayField = (fieldConfig, stateInterface) => {
    const wrapper = _buildWrapper(fieldConfig);
    wrapper.classList.add('field--display');

    const labelEl = document.createElement('span');
    labelEl.className = 'field-label';
    labelEl.textContent = fieldConfig.label;

    const valueEl = document.createElement('span');
    valueEl.className = 'display-value';

    const _update = (val) => {
      if (val === undefined || val === null) { valueEl.textContent = '—'; return; }
      switch (fieldConfig.format) {
        case 'bonus':   valueEl.textContent = Utils.formatBonus(val);   break;
        case 'percent': valueEl.textContent = Utils.formatPercent(val); break;
        case 'decimal': valueEl.textContent = Utils.formatDecimal(val); break;
        default:        valueEl.textContent = String(val); break;
      }
    };

    _update(stateInterface.get());
    if (stateInterface.subscribe) stateInterface.subscribe(_update);

    wrapper.append(labelEl, valueEl);
    return wrapper;
  };

  // ── FACTORY ────────────────────────────────────────────────

  /**
   * Create any field component by dispatching on fieldConfig.type.
   *
   * @param {object}         fieldConfig
   * @param {StateInterface} stateInterface
   * @param {Function}       [onChange]
   * @returns {HTMLElement}
   */
  const createField = (fieldConfig, stateInterface, onChange) => {
    switch (fieldConfig.type) {
      case 'number':   return createNumberInput(fieldConfig, stateInterface, onChange);
      case 'text':     return createTextInput(fieldConfig, stateInterface, onChange);
      case 'checkbox': return createCheckbox(fieldConfig, stateInterface, onChange);
      case 'select':   return createSelect(fieldConfig, stateInterface, onChange);
      case 'display':  return createDisplayField(fieldConfig, stateInterface);
      default:
        console.warn(`[Components] Unknown field type: "${fieldConfig.type}"`);
        return document.createElement('div');
    }
  };

  // ── Button ─────────────────────────────────────────────────

  /**
   * Create a styled button element.
   *
   * @param {object}   opts
   * @param {string}   opts.label
   * @param {string}   [opts.className]
   * @param {string}   [opts.icon]       Raw text or HTML for icon
   * @param {Function} opts.onClick
   * @returns {HTMLButtonElement}
   */
  const createButton = ({ label, className = '', icon = '', onClick }) => {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `btn ${className}`.trim();

    if (icon) {
      const iconEl = document.createElement('span');
      iconEl.className = 'btn-icon';
      iconEl.textContent = icon;
      btn.appendChild(iconEl);
    }

    const textEl = document.createElement('span');
    textEl.textContent = label;
    btn.appendChild(textEl);

    btn.addEventListener('click', onClick);
    return btn;
  };

  // ── Section card ───────────────────────────────────────────

  /**
   * Create the outer card shell for a config section.
   * Returns { card, headerEl, bodyEl }.
   *
   * @param {object} sectionConfig
   * @returns {{ card: HTMLElement, headerEl: HTMLElement, bodyEl: HTMLElement }}
   */
  const createSectionCard = (sectionConfig) => {
    const card = document.createElement('div');
    card.className = 'section-card';
    card.id = `section-${sectionConfig.id}`;

    const headerEl = document.createElement('div');
    headerEl.className = 'section-header';

    const titleEl = document.createElement('h2');
    titleEl.className = 'section-title';

    if (sectionConfig.icon) {
      const iconSpan = document.createElement('span');
      iconSpan.className = 'section-icon';
      iconSpan.textContent = sectionConfig.icon;
      titleEl.appendChild(iconSpan);
    }

    titleEl.appendChild(document.createTextNode(sectionConfig.label));
    headerEl.appendChild(titleEl);

    const bodyEl = document.createElement('div');
    bodyEl.className = 'section-body';

    card.append(headerEl, bodyEl);
    return { card, headerEl, bodyEl };
  };

  // ── Fields grid ────────────────────────────────────────────

  /**
   * Create a CSS-grid fields container with a configurable column count.
   *
   * @param {number} columns  Default 2
   * @returns {HTMLElement}
   */
  const createFieldsGrid = (columns = 2) => {
    const grid = document.createElement('div');
    grid.className = 'fields-grid';
    grid.style.setProperty('--cols', columns);
    return grid;
  };

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({
    createField,
    createNumberInput,
    createTextInput,
    createCheckbox,
    createSelect,
    createDisplayField,
    createButton,
    createSectionCard,
    createFieldsGrid,
  });

})();
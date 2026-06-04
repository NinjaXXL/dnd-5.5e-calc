/**
 * ============================================================
 * RENDERER MODULE — js/renderer.js
 * ============================================================
 * Generates the entire UI from CONFIG. No calculation logic;
 * no direct state mutation except through state interfaces.
 *
 * SECTION DISPATCH
 * ────────────────
 *  'static'   → _renderStaticSection   (fixed config fields)
 *  'features' → _renderFeaturesSection (from featureDefinitions)
 *  'dynamic'  → _renderDynamicSection  (repeatable blocks)
 *
 * SUBSCRIPTION MANAGEMENT
 * ───────────────────────
 *  All reactive subscriptions created during rendering are
 *  tracked in either:
 *    _featureSectionSubs  — feature section extraInput visibility
 *    _sectionCleanups     — per-attack feature override visibility
 *  Both are cleared and resubscribed on every full re-render
 *  (import / reset) to prevent memory leaks and stale callbacks.
 *
 * DYNAMIC BLOCK ANIMATION
 * ───────────────────────
 *  refreshAllBlocks() — no animation (initial load, post-remove rebuild)
 *  appendNewBlock()   — animate-in only the newly inserted block
 * ============================================================
 */

const Renderer = (() => {

  // ── Module state ───────────────────────────────────────────

  let _config     = null;
  let _headerEl   = null;
  let _sectionsEl = null;
  let _resultsEl  = null;

  /**
   * Subscriptions created in _renderFeaturesSection for
   * extraInput show/hide reactivity.
   * Cleared before every full section re-render.
   */
  let _featureSectionSubs = [];

  /**
   * Per-dynamic-section cleanup registry.
   * Map<sectionId, Array<unsubscribeFn>>
   * Tracks feature-override-row visibility subscriptions.
   */
  const _sectionCleanups = new Map();

  /**
   * Append-only reference to blocksContainer per dynamic section.
   * Map<sectionId, { blocksEl, refreshFn, appendFn }>
   * Allows add-button to append a single block without full refresh.
   */
  const _dynSectionRefs = new Map();

  // ── Initialisation ─────────────────────────────────────────

  const init = (config) => { _config = config; };

  const bindContainers = (headerEl, sectionsEl, resultsEl) => {
    _headerEl   = headerEl;
    _sectionsEl = sectionsEl;
    _resultsEl  = resultsEl;
  };

  /** Full re-render of header + all sections. Called on init and import/reset. */
  const renderAll = () => {
    _renderHeader(_headerEl);
    _renderSections(_sectionsEl);
  };

  // ── Header ─────────────────────────────────────────────────

  const _renderHeader = (container) => {
    container.innerHTML = '';
    const inner = _el('div', 'header-inner');

    const brand = _el('div', 'header-brand');
    const icon  = _el('span', 'header-icon', _config.meta.icon);
    const texts = _el('div', 'header-text');
    texts.append(
      _el('h1', 'header-title', _config.meta.title),
      _el('p',  'header-sub',   _config.meta.subtitle)
    );
    brand.append(icon, texts);

    const actions = _el('div', 'header-actions');
    actions.append(
      _makeHeaderBtn('btn-share', '🔗', 'Share',      'btn--ghost'),
      _makeHeaderBtn('btn-copy',  '📋', 'Copy Build', 'btn--ghost'),
      _makeHeaderBtn('btn-load',  '📥', 'Load Build', 'btn--ghost'),
      _makeHeaderBtn('btn-reset', '↺',  'Reset',      'btn--danger')
    );

    inner.append(brand, actions);
    container.appendChild(inner);
  };

  const _makeHeaderBtn = (id, icon, label, cls) => {
    const btn = _el('button', `btn btn--sm ${cls}`);
    btn.type = 'button';
    btn.id   = id;
    btn.innerHTML = `<span class="btn-icon">${icon}</span><span>${label}</span>`;
    return btn;
  };

  // ── Sections dispatcher ────────────────────────────────────

  const _renderSections = (container) => {
    // ── Cleanup ALL reactive subscriptions from previous render ──
    _featureSectionSubs.forEach(fn => fn());
    _featureSectionSubs = [];
    _sectionCleanups.forEach(cleanups => cleanups.forEach(fn => fn()));
    _sectionCleanups.clear();
    _dynSectionRefs.clear();

    container.innerHTML = '';

    _config.sections.forEach(sec => {
      switch (sec.type) {
        case 'features': _renderFeaturesSection(container, sec); break;
        case 'dynamic':  _renderDynamicSection(container, sec);  break;
        default:         _renderStaticSection(container, sec);   break;
      }
    });
  };

  // ── Static section ─────────────────────────────────────────

  const _renderStaticSection = (container, sec) => {
    const { card, bodyEl } = Components.createSectionCard(sec);
    const grid = Components.createFieldsGrid(sec.columns ?? 2);

    (sec.fields ?? []).forEach(fieldConfig => {
      const iface = _makeStaticIface(`${sec.id}.${fieldConfig.id}`);
      grid.appendChild(Components.createField(fieldConfig, iface));
    });

    bodyEl.appendChild(grid);
    container.appendChild(card);
  };

  // ── Features section ───────────────────────────────────────

  const _renderFeaturesSection = (container, sec) => {
    const { card, bodyEl } = Components.createSectionCard(sec);

    // Group feature definitions by category, preserving insertion order
    const groups = new Map();
    _config.featureDefinitions.forEach(def => {
      if (!groups.has(def.category)) {
        groups.set(def.category, { label: _categoryLabel(def.category), defs: [] });
      }
      groups.get(def.category).defs.push(def);
    });

    groups.forEach(({ label, defs }) => {
      bodyEl.appendChild(_el('div', 'feature-group-header', label));
      const groupBody = _el('div', 'feature-group-body');
      defs.forEach(def => groupBody.appendChild(_renderFeatureRow(def)));
      bodyEl.appendChild(groupBody);
    });

    container.appendChild(card);
  };

  const _renderFeatureRow = (def) => {
    const row = _el('div', 'feature-row');
    row.dataset.featureId = def.id;
    row.dataset.category  = def.category;

    // ── Checkbox + label + badges ─────────────────────────────
    const topLine = _el('div', 'feature-top');

    const checkboxIface = _makeStaticIface(`character.features.${def.id}`);
    const checkEl = Components.createCheckbox(
      { id: def.id, type: 'checkbox', label: `${def.icon}\u2002${def.label}`, default: false },
      checkboxIface
    );
    checkEl.classList.add('feature-checkbox-field');
    topLine.appendChild(checkEl);

    if (def.perAttack) topLine.appendChild(_el('span', 'feature-badge feature-badge--perk', 'Per Attack'));
    if (def.exclusive) topLine.appendChild(_el('span', 'feature-badge feature-badge--once', 'Once/Turn'));

    row.appendChild(topLine);
    row.appendChild(_el('p', 'feature-desc', def.description));

    // ── Extra numeric input (e.g. Brutal Critical dice count) ──
    if (def.extraInput) {
      const extraWrapper = _el('div', 'feature-extra-input');
      extraWrapper.hidden = !checkboxIface.get();

      const extraIface = _makeStaticIface(def.extraInput.stateKey);
      extraWrapper.appendChild(Components.createField(
        {
          id:      def.extraInput.stateKey.split('.').pop(),
          type:    def.extraInput.type,
          label:   def.extraInput.label,
          default: def.extraInput.default,
          min:     def.extraInput.min,
          max:     def.extraInput.max,
        },
        extraIface
      ));

      row.appendChild(extraWrapper);

      // Track this subscription so we can unsubscribe on full re-render
      const unsub = checkboxIface.subscribe(enabled => {
        extraWrapper.hidden = !enabled;
      });
      _featureSectionSubs.push(unsub);
    }

    return row;
  };

  // ── Dynamic section ────────────────────────────────────────

  const _renderDynamicSection = (container, sec) => {
    const { card, bodyEl } = Components.createSectionCard(sec);

    const blocksEl = _el('div', 'dynamic-blocks');
    blocksEl.id = `blocks-${sec.id}`;

    _sectionCleanups.set(sec.id, []);

    // ── refreshAllBlocks: full rebuild, NO entry animation ────
    const refreshAllBlocks = () => {
      // Unsubscribe previous block-level bindings
      const prev = _sectionCleanups.get(sec.id) || [];
      prev.forEach(fn => fn());
      _sectionCleanups.set(sec.id, []);

      blocksEl.innerHTML = '';

      const items = State.get(sec.id) || [];

      if (items.length === 0) {
        // Empty state — shown when all items are deleted
        const empty = _el('div', 'blocks-empty-state');
        const icon  = _el('span', 'blocks-empty-icon', '⚔️');
        const msg1  = _el('p', '', 'No attacks added yet.');
        const msg2  = _el('p', '', `Click "${sec.addLabel || 'Add Item'}" below to get started.`);
        empty.append(icon, msg1, msg2);
        blocksEl.appendChild(empty);
        return;
      }

      items.forEach((item, idx) => {
        const { element, cleanups } = _renderDynamicBlock(sec, idx, item.id, refreshAllBlocks);
        // No rAF — blocks appear immediately during rebuilds (remove, import, reset)
        element.classList.add('block--visible');
        blocksEl.appendChild(element);
        _sectionCleanups.get(sec.id).push(...cleanups);
      });
    };

    // ── appendNewBlock: single new block WITH entry animation ─
    const appendNewBlock = (item, idx) => {
      const { element, cleanups } = _renderDynamicBlock(sec, idx, item.id, refreshAllBlocks);
      blocksEl.appendChild(element);
      _sectionCleanups.get(sec.id).push(...cleanups);
      // Animate on next frame — only for user-initiated additions
      requestAnimationFrame(() => element.classList.add('block--visible'));
      element.querySelector('.input--text')?.focus();
    };

    _dynSectionRefs.set(sec.id, { blocksEl, refreshFn: refreshAllBlocks, appendFn: appendNewBlock });

    // Initial population — no animation
    refreshAllBlocks();

    // ── Add-item button ───────────────────────────────────────
    const addBtn = _el('button', 'btn btn--add');
    addBtn.type = 'button';
    addBtn.innerHTML = `<span class="btn-icon">＋</span><span>${sec.addLabel || 'Add Item'}</span>`;
    addBtn.addEventListener('click', () => {
      const current = State.get(sec.id) || [];
      if (sec.maxItems && current.length >= sec.maxItems) {
        Utils.showToast(`Maximum of ${sec.maxItems} reached.`, 'error');
        return;
      }
      const newItem = _buildDefaultItem(sec);
      State.addListItem(sec.id, newItem);
      // Append only the new block — don't rebuild existing ones
      const newIdx = (State.get(sec.id) || []).length - 1;
      appendNewBlock(newItem, newIdx);
    });

    bodyEl.append(blocksEl, addBtn);
    container.appendChild(card);
  };

  /**
   * Render one dynamic block. Uses ID-based state access only —
   * immune to index shifts caused by insertions/removals elsewhere.
   *
   * @returns {{ element: HTMLElement, cleanups: Function[] }}
   */
  const _renderDynamicBlock = (sec, displayIdx, itemId, onRemoved) => {
    const blockCleanups = [];

    const block = _el('div', 'dynamic-block');
    block.id = `block-${itemId}`;
    block.dataset.itemId = itemId;

    // ── Header ────────────────────────────────────────────────
    const blockHeader = _el('div', 'block-header');

    const collapseBtn = _el('button', 'block-btn block-collapse-btn', '▲');
    collapseBtn.type = 'button';
    collapseBtn.setAttribute('aria-label', 'Collapse block');

    const defaultLabel = `${sec.template.defaultLabel || 'Item'} ${displayIdx + 1}`;
    const storedName   = State.getListItemField(sec.id, itemId, 'name') || '';
    const blockTitle   = _el('span', 'block-title', storedName || defaultLabel);

    const removeBtn = _el('button', 'block-btn block-remove-btn', '✕');
    removeBtn.type = 'button';
    removeBtn.setAttribute('aria-label', 'Remove block');

    blockHeader.append(collapseBtn, blockTitle, removeBtn);

    // ── Body: standard fields ─────────────────────────────────
    const blockBody = _el('div', 'block-body');
    const grid = Components.createFieldsGrid(sec.template.columns ?? 2);

    (sec.template.fields || []).forEach(fieldConfig => {
      const onChange = fieldConfig.id === 'name'
        ? val => { blockTitle.textContent = val || defaultLabel; }
        : undefined;

      grid.appendChild(
        Components.createField(
          fieldConfig,
          _makeListIface(sec.id, itemId, fieldConfig.id),
          onChange
        )
      );
    });

    blockBody.appendChild(grid);

    // ── Body: per-attack feature overrides ────────────────────
    if (sec.template.featureOverrides) {
      const perAttackDefs = _config.featureDefinitions.filter(d => d.perAttack);

      if (perAttackDefs.length > 0) {
        const overrideSection = _el('div', 'block-overrides');
        overrideSection.appendChild(_el('div', 'block-overrides-header', 'Apply to This Attack'));

        const overrideGrid = _el('div', 'block-overrides-grid');

        perAttackDefs.forEach(def => {
          const row = _el('div', 'override-row');
          row.dataset.featureId = def.id;

          row.appendChild(
            Components.createCheckbox(
              { id: `ov_${def.id}_${itemId}`, type: 'checkbox',
                label: `${def.icon} ${def.label}`, default: false, help: def.description },
              _makeFeatOverrideIface(sec.id, itemId, def.id)
            )
          );

          // Reactively show/hide this row based on the global feature toggle
          const featPath = `character.features.${def.id}`;
          const updateVis = () => {
            const on = !!State.get(featPath);
            row.hidden = !on;
            row.setAttribute('aria-hidden', String(!on));
          };
          updateVis();
          blockCleanups.push(State.subscribe(featPath, updateVis));

          overrideGrid.appendChild(row);
        });

        overrideSection.appendChild(overrideGrid);
        blockBody.appendChild(overrideSection);
      }
    }

    block.append(blockHeader, blockBody);

    // ── Collapse ──────────────────────────────────────────────
    let collapsed = false;
    const toggleCollapse = () => {
      collapsed = !collapsed;
      blockBody.classList.toggle('block-body--collapsed', collapsed);
      collapseBtn.textContent = collapsed ? '▼' : '▲';
      block.classList.toggle('block--collapsed', collapsed);
    };
    collapseBtn.addEventListener('click', e => { e.stopPropagation(); toggleCollapse(); });
    blockHeader.addEventListener('click', e => {
      if (e.target === blockHeader || e.target === blockTitle) toggleCollapse();
    });

    // ── Remove ────────────────────────────────────────────────
    removeBtn.addEventListener('click', e => {
      e.stopPropagation();
      block.classList.add('block--removing');
      block.style.pointerEvents = 'none';
      setTimeout(() => {
        // De-register this block's cleanups from the section registry FIRST.
        // Without this, refreshAllBlocks() would call them again (double-unsubscribe).
        // The unsubscribers are idempotent but the double-call wastes work and
        // can mask future bugs if unsubscribers ever become stateful.
        if (_sectionCleanups.has(sec.id)) {
          const blockSet = new Set(blockCleanups);
          _sectionCleanups.set(
            sec.id,
            (_sectionCleanups.get(sec.id) || []).filter(fn => !blockSet.has(fn))
          );
        }
        blockCleanups.forEach(fn => fn());
        blockCleanups.length = 0;
        State.removeListItem(sec.id, itemId);
        onRemoved(); // full refresh — corrects display numbers, no animation
      }, 220);
    });

    return { element: block, cleanups: blockCleanups };
  };

  // ── Results panel ──────────────────────────────────────────

  /**
   * Render the results panel from a CalculationResult.
   * Called on every state change — replaces entire panel content.
   */
  const renderResults = (container, results) => {
    container.innerHTML = '';

    if (!results) {
      container.appendChild(_el('div', 'results-empty', 'Configure attacks to see results.'));
      return;
    }

    const { totalDPR, roundsToKill, character, attackResults } = results;
    const enabledResults = attackResults.filter(r => r.enabled);

    // ── Hero DPR card ─────────────────────────────────────────
    const heroCard = _el('div', 'result-card result-card--hero');

    heroCard.appendChild(_el('div', 'result-hero-label', 'Damage Per Round'));
    heroCard.appendChild(_el('div', 'result-hero-value', Utils.formatDecimal(totalDPR)));

    // Rounds to kill (shown only when target HP > 0)
    if (roundsToKill !== null) {
      const rtkEl = _el('div', 'result-hero-rtk');
      rtkEl.innerHTML =
        `Kills in <strong>${Utils.formatDecimal(roundsToKill)}</strong> rounds`;
      heroCard.appendChild(rtkEl);
    }

    // Character stats row
    const statsRow = _el('div', 'result-stats-row');
    [
      ['Level',  character.level],
      ['Prof',   Utils.formatBonus(character.profBonus)],
      ['Mod',    Utils.formatBonus(character.attrMod)],
      ['vs AC',  character.targetAC],
    ].forEach(([lbl, val]) => statsRow.appendChild(_makeStatChip(lbl, val)));
    heroCard.appendChild(statsRow);

    container.appendChild(heroCard);

    // ── Per-attack breakdown ──────────────────────────────────
    if (enabledResults.length === 0) {
      container.appendChild(
        _el('div', 'results-no-attacks', 'Enable at least one attack to see breakdown.')
      );
      return;
    }

    container.appendChild(_el('div', 'results-section-label', 'Attack Breakdown'));

    enabledResults.forEach(r => container.appendChild(_makeAttackCard(r, totalDPR)));

    // Show count of disabled attacks (if any) so users know they exist
    const disabledCount = attackResults.length - enabledResults.length;
    if (disabledCount > 0) {
      container.appendChild(_el(
        'div', 'results-disabled-note',
        `+ ${disabledCount} disabled attack${disabledCount > 1 ? 's' : ''} (not included in DPR)`
      ));
    }
  };

  const _makeStatChip = (label, value) => {
    const chip = _el('div', 'result-stat-chip');
    chip.appendChild(_el('span', 'result-stat-label', label));
    chip.appendChild(_el('span', 'result-stat-value', String(value)));
    return chip;
  };

  /**
   * Build one attack result card.
   *
   *  ┌─────────────────────────────────────────────┐
   *  │ Longsword                   10.2 DPR (65%)  │
   *  ├─────────────────────────────────────────────┤
   *  │ To Hit +8   [▓▓crit▓▓▓▓▓hit▓▓▓░░miss░░]    │
   *  │             65% hit · 5% crit · 30% miss    │
   *  ├─────────────────────────────────────────────┤
   *  │ 1d8+5   Avg 9.5 hit · 17.0 crit             │
   *  │ ×2 attacks · Advantage · Crit 19+           │
   *  ├─────────────────────────────────────────────┤
   *  │ [GWF] [Savage Attacker]                     │
   *  └─────────────────────────────────────────────┘
   */
  const _makeAttackCard = (r, totalDPR) => {
    const card = _el('div', 'result-card result-card--attack');

    // ── Header: name + DPR chip ───────────────────────────────
    const head = _el('div', 'attack-card-head');
    head.appendChild(_el('span', 'attack-card-name', r.name));

    const dprLabel = totalDPR > 0 && r.dprPercent > 0
      ? `${Utils.formatDecimal(r.dpr)} DPR · ${Math.round(r.dprPercent * 100)}%`
      : `${Utils.formatDecimal(r.dpr)} DPR`;
    head.appendChild(_el('span', 'attack-card-dpr', dprLabel));
    card.appendChild(head);

    // ── Combined hit bar ──────────────────────────────────────
    const barsDiv = _el('div', 'attack-bars');

    const barRow = _el('div', 'bar-row');

    const barLabelEl = _el('span', 'bar-label');
    barLabelEl.innerHTML = `To Hit <strong>${Utils.formatBonus(r.totalAttackBonus)}</strong>`;

    const barTrack = _el('div', 'bar-track');
    const critPct  = Math.round(r.critChance  * 100);
    const hitPct   = Math.round((r.hitChance - r.critChance) * 100);
    const missPct  = 100 - critPct - hitPct;

    if (critPct > 0) {
      const s = _el('div', 'bar-seg bar-seg--crit');
      s.style.width = `${critPct}%`;
      s.title = `Critical: ${critPct}%`;
      barTrack.appendChild(s);
    }
    if (hitPct > 0) {
      const s = _el('div', 'bar-seg bar-seg--hit');
      s.style.width = `${hitPct}%`;
      s.title = `Normal hit: ${hitPct}%`;
      barTrack.appendChild(s);
    }
    if (missPct > 0) {
      const s = _el('div', 'bar-seg bar-seg--miss');
      s.style.width = `${missPct}%`;
      s.title = `Miss: ${missPct}%`;
      barTrack.appendChild(s);
    }

    barRow.append(barLabelEl, barTrack);
    barsDiv.appendChild(barRow);

    // Chance summary line (inline, below bar)
    const chanceLine = _el('div', 'bar-chance-line');
    chanceLine.innerHTML =
      `<span class="chance--hit">${Utils.formatPercent(r.hitChance)} hit</span>` +
      `<span class="chance-sep">·</span>` +
      `<span class="chance--crit">${Utils.formatPercent(r.critChance)} crit</span>` +
      `<span class="chance-sep">·</span>` +
      `<span class="chance--miss">${Utils.formatPercent(r.missChance)} miss</span>`;
    barsDiv.appendChild(chanceLine);

    card.appendChild(barsDiv);

    // ── Damage row ────────────────────────────────────────────
    const dmgRow = _el('div', 'attack-dmg-row');
    dmgRow.appendChild(_el('span', 'dmg-dice', r.diceExpression));
    dmgRow.appendChild(_el('span', 'dmg-stat', `Avg ${Utils.formatDecimal(r.avgOnHit)} hit`));
    dmgRow.appendChild(_el('span', 'dmg-stat dmg-stat--crit',
      `${Utils.formatDecimal(r.avgOnCrit)} crit`));
    card.appendChild(dmgRow);

    // ── Notes line ────────────────────────────────────────────
    const noteParts = [
      `×${r.attacksPerAction} attack${r.attacksPerAction !== 1 ? 's' : ''}`,
    ];
    if (r.effectiveMode !== 'normal') {
      noteParts.push(r.effectiveMode === 'advantage' ? '▲ Adv' : '▼ Disadv');
    }
    if (r.effectiveCritRange < 20) noteParts.push(`Crit ${r.effectiveCritRange}+`);
    if (r.activeSneakDice > 0) noteParts.push(`+${r.activeSneakDice}d6 sneak`);

    const noteEl = _el('div', 'attack-note', noteParts.join('  ·  '));
    card.appendChild(noteEl);

    // ── Feature badges ────────────────────────────────────────
    if (r.activeFeatureLabels?.length > 0) {
      const badgeRow = _el('div', 'attack-badges');
      r.activeFeatureLabels.forEach(f => {
        badgeRow.appendChild(
          _el('span', `feature-badge feature-badge--${f.category}`, `${f.icon} ${f.label}`)
        );
      });
      card.appendChild(badgeRow);
    }

    return card;
  };

  // ── State interface factories ──────────────────────────────

  /** Reactive interface for static dot-path fields (character, target, features). */
  const _makeStaticIface = path => ({
    get:       ()   => State.get(path),
    set:       val  => State.set(path, val),
    subscribe: cb   => State.subscribe(path, cb),
  });

  /** Non-reactive interface for dynamic block fields (ID-based, index-immune). */
  const _makeListIface = (listPath, itemId, fieldId) => ({
    get:       ()   => State.getListItemField(listPath, itemId, fieldId),
    set:       val  => State.updateListItem(listPath, itemId, fieldId, val),
    subscribe: null,
  });

  /** Non-reactive interface for per-attack feature override checkboxes. */
  const _makeFeatOverrideIface = (listPath, itemId, featId) => ({
    get: () => {
      const item = State.getListItem(listPath, itemId);
      return item?.featureOverrides?.[featId] ?? false;
    },
    set: val => {
      const item = State.getListItem(listPath, itemId);
      if (!item) return;
      State.updateListItem(listPath, itemId, 'featureOverrides',
        { ...(item.featureOverrides ?? {}), [featId]: val });
    },
    subscribe: null,
  });

  // ── Default item factory ───────────────────────────────────

  const _buildDefaultItem = sec => {
    const item = { id: Utils.generateId(sec.id) };
    (sec.template.fields || []).forEach(f => { item[f.id] = f.default ?? null; });

    if (sec.template.featureOverrides) {
      item.featureOverrides = {};
      _config.featureDefinitions
        .filter(d => d.perAttack)
        .forEach(d => { item.featureOverrides[d.id] = false; });
    }

    return item;
  };

  // ── DOM helpers ────────────────────────────────────────────

  const _el = (tag, cls = '', text = '') => {
    const el = document.createElement(tag);
    if (cls)  el.className   = cls;
    if (text) el.textContent = text;
    return el;
  };

  const _categoryLabel = cat => ({
    racial: 'Racial',
    style:  'Fighting Style',
    feat:   'Feat',
    class:  'Class Feature',
  }[cat] ?? cat);

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({
    init,
    bindContainers,
    renderAll,
    renderResults,
  });

})();
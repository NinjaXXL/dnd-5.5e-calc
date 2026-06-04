/**
 * ============================================================
 * CALCULATION ENGINE — js/calculations.js
 * ============================================================
 * Pure DPR calculation with full feature-system support.
 *
 * ARCHITECTURE
 * ────────────
 * configure({ featureDefinitions })   — inject feature metadata once
 * calculate(state)                    — returns CalculationResult
 *
 * Feature resolution (two tiers):
 *   Global features  → enabled via character.features[id] = true
 *                       → always applies to every attack
 *   Per-attack features → global must be true AND
 *                         attack.featureOverrides[id] = true
 *
 * FEATURE EFFECT PIPELINE (per attack)
 * ─────────────────────────────────────
 *  1. ATTACK ROLL MODS
 *     flatAttackBonus  (+archery, –gwm, –sharpshooter)
 *     rerollAttackOn   (halflingLucky: [1])
 *     forceAdvantage   (recklessAttack)
 *     tripleAdvantage  (elvenAccuracy, only when in advantage mode)
 *     critRange        (improvedCritical –1, superiorCritical –2)
 *
 *  2. DAMAGE DICE MODS
 *     diceRerollBelow  (gwf: 2 — reroll dice ≤ 2 once, keep result)
 *     flatDamageBonus  (+dueling, +gwm+10, +sharpshooter+10)
 *     rollTwiceKeepHigher (savageAttacker — exact via PMF convolution)
 *
 *  3. EXTRA DAMAGE SOURCES
 *     sneakAttack      (per-attack; Nd6 added; doubled on crit RAW)
 *
 *  4. CRIT EXTRA DICE
 *     Standard 5e: weapon dice doubled  (+diceCount extra weapon dice)
 *     piercer:     +1 extra weapon die (once per turn)
 *     brutalCrit:  +N extra weapon dice (from character.brutalCriticalDice)
 *
 *  5. DPR
 *     E[dmg] = P(normalHit) × avgOnHit + P(crit) × avgOnCrit
 *     DPR    = E[dmg] × attacksPerAction
 *
 * SAVAGE ATTACKER + GWF INTERACTION
 * ───────────────────────────────────
 * When both SA and GWF are active, GWF modifies the per-die distribution
 * BEFORE the SA "take higher of two rolls" comparison.
 * We use expectedMaxOfTwoWithOptions(count, sides, { rerollBelow: 2 })
 * which builds the exact PMF via convolution and computes E[max(X,Y)]
 * where X and Y already have the GWF-adjusted die distribution.
 *
 * SNEAK ATTACK + CRIT
 * ─────────────────────
 * 5e RAW: on a critical hit, ALL damage dice are rolled twice, including
 * sneak attack dice. The flat modifier is NOT doubled.
 * ============================================================
 */

const Calculations = (() => {

  // ── Configuration ──────────────────────────────────────────

  /** Feature definitions injected from CONFIG.featureDefinitions */
  let _featureDefs = [];

  /**
   * Inject feature definitions from config.
   * Must be called once before calculate().
   *
   * @param {{ featureDefinitions: FeatureDef[] }} config
   */
  const configure = ({ featureDefinitions = [] }) => {
    _featureDefs = featureDefinitions;
  };

  // ── Main entry ─────────────────────────────────────────────

  /**
   * Run all calculations against a full state snapshot.
   *
   * @param {object} state  Result of State.getAll()
   * @returns {CalculationResult}
   */
  const calculate = (state) => {
    const char    = state.character ?? {};
    const target  = state.target    ?? {};
    const attacks = Array.isArray(state.attacks) ? state.attacks : [];

    // Derived character stats
    const level    = _clamp(char.level ?? 1, 1, 20);
    const profBonus = Utils.proficiencyFromLevel(level);
    const attrScore = _clamp(char.attributeScore ?? 10, 1, 30);
    const attrMod   = Utils.abilityModifier(attrScore);
    const targetAC  = _clamp(target.ac ?? 15, 1, 30);

    /** Context passed into per-attack calculations */
    const ctx = {
      profBonus,
      attrMod,
      targetAC,
      charFeatures:       char.features            ?? {},
      brutalCriticalDice: char.brutalCriticalDice  ?? 1,
      sneakAttackDice:    char.sneakAttackDice      ?? 0,
    };

    const attackResults = attacks.map(atk => _calculateAttack(atk, ctx));

    const totalDPR = attackResults.reduce(
      (sum, r) => sum + (r.enabled ? r.dpr : 0), 0
    );

    // Percentage of total DPR contributed by each attack — computed post-map
    // so that the total is known before augmenting individual results.
    attackResults.forEach(r => {
      r.dprPercent = (r.enabled && totalDPR > 0) ? r.dpr / totalDPR : 0;
    });

    // How many rounds to reduce the target to 0 HP (null if HP not set)
    const targetHP = _clamp(target.hp ?? 0, 0, 99999);
    const roundsToKill = (targetHP > 0 && totalDPR > 0)
      ? targetHP / totalDPR
      : null;

    return {
      totalDPR,
      roundsToKill,
      attackResults,
      character: { level, profBonus, attrScore, attrMod, targetAC },
    };
  };

  // ── Feature resolution ─────────────────────────────────────

  /**
   * Determine which features are active for a specific attack.
   *
   * Returns a flat map: { featureId: boolean }
   *
   * Rules:
   *   - Feature globally disabled → false
   *   - Feature global (perAttack=false), globally enabled → true
   *   - Feature per-attack (perAttack=true), globally enabled →
   *       reads attack.featureOverrides[id]
   *
   * @param {object} attack
   * @param {object} charFeatures  state.character.features
   * @returns {Record<string, boolean>}
   */
  const _resolveFeatures = (attack, charFeatures) => {
    const active = {};

    _featureDefs.forEach(def => {
      const globallyEnabled = !!(charFeatures[def.id]);

      if (!globallyEnabled) {
        active[def.id] = false;
        return;
      }

      if (def.perAttack) {
        // Player designates which specific attack uses this feature
        active[def.id] = !!(attack.featureOverrides?.[def.id]);
      } else {
        // Global feature — always applies when enabled
        active[def.id] = true;
      }
    });

    return active;
  };

  // ── Per-attack calculation ─────────────────────────────────

  /**
   * Full DPR calculation for one attack entry from state.attacks[].
   *
   * @param {object} attack  Attack state object (id, name, diceCount…)
   * @param {object} ctx     Character context from calculate()
   * @returns {AttackResult}
   */
  const _calculateAttack = (attack, ctx) => {
    const {
      id,
      name                = 'Attack',
      enabled             = true,
      attackBonus         = 0,      // magic or other flat attack bonus
      diceCount           = 1,
      diceType            = 8,
      damageBonus         = 0,
      addAttributeToDamage = true,
      addProficiency      = true,
      critRange           = 20,
      attacksPerAction    = 1,
      advantage           = 'normal',
      explodingDice       = false,
      rerollOnes          = false,
    } = attack;

    if (!enabled) return _disabledResult(id, name);

    const { profBonus, attrMod, targetAC, charFeatures,
            brutalCriticalDice, sneakAttackDice } = ctx;

    // ── 1. RESOLVE ACTIVE FEATURES ────────────────────────────
    const active = _resolveFeatures(attack, charFeatures);

    // ── 2. ATTACK ROLL MODIFICATIONS ─────────────────────────

    // Base attack bonus from proficiency + attribute + magic bonus
    const profPart  = addProficiency ? profBonus : 0;
    let baseHitBonus = profPart + attrMod + attackBonus;

    // Feature-driven attack roll adjustments
    let extraHitBonus    = 0;
    let rerollAttackOn   = [];      // d20 faces that trigger a reroll (Lucky)
    let forceAdvantage   = false;   // feature forces advantage regardless of attack setting
    let useTripleAdv     = false;   // Elven Accuracy upgrade
    let effectiveCritRange = _clamp(critRange, 15, 20);

    if (active.archery)           extraHitBonus    += 2;
    if (active.gwm)               extraHitBonus    -= 5;
    if (active.sharpshooter)      extraHitBonus    -= 5;
    if (active.halflingLucky)     rerollAttackOn    = [1];
    if (active.elvenAccuracy)     useTripleAdv      = true;
    if (active.recklessAttack)    forceAdvantage    = true;

    // Improved/Superior Critical reduce the crit range.
    // These are tiered upgrades of the same feature — take the LARGEST reduction,
    // not a cumulative sum. Enabling both gives the same result as Superior alone.
    let critRangeReduction = 0;
    if (active.improvedCritical) critRangeReduction = Math.max(critRangeReduction, 1);
    if (active.superiorCritical) critRangeReduction = Math.max(critRangeReduction, 2);
    effectiveCritRange = _clamp(critRange - critRangeReduction, 15, 20);

    const totalHitBonus = baseHitBonus + extraHitBonus;

    // Resolve advantage mode — Reckless Attack grants advantage but is
    // cancelled by an existing disadvantage (they negate each other, 5e PHB)
    let effectiveMode = advantage;
    if (forceAdvantage) {
      effectiveMode = advantage === 'disadvantage' ? 'normal' : 'advantage';
    }

    // Elven Accuracy only activates when rolling at advantage
    const applyTripleAdv = useTripleAdv && effectiveMode === 'advantage';

    // Compute hit and crit probabilities with all modifiers applied
    const { hitChance, critChance, missChance } = Dice.hitProbabilityFull({
      attackBonus:    totalHitBonus,
      targetAC,
      critRange:      effectiveCritRange,
      mode:           effectiveMode,
      rerollOn:       rerollAttackOn,
      tripleAdvantage: applyTripleAdv,
    });

    const normalHitChance = hitChance - critChance;

    // ── 3. DAMAGE DICE OPTIONS ────────────────────────────────

    // GWF modifies reroll threshold: reroll damage dice showing ≤ 2 once
    let diceRerollBelow = rerollOnes ? 1 : 0;
    if (active.gwf) diceRerollBelow = Math.max(diceRerollBelow, 2);

    const diceOpts = {
      exploding:   explodingDice,
      rerollBelow: diceRerollBelow,
    };

    // Flat damage contributions
    let flatDamageMod = damageBonus + (addAttributeToDamage ? attrMod : 0);
    if (active.dueling)      flatDamageMod += 2;
    if (active.gwm)          flatDamageMod += 10;
    if (active.sharpshooter) flatDamageMod += 10;

    // ── 4. SNEAK ATTACK DAMAGE ────────────────────────────────

    // Sneak Attack is per-attack (exclusive: once per turn)
    // Dice count comes from character.sneakAttackDice (set in character state)
    const activeSneakDice = active.sneakAttack ? Math.max(0, sneakAttackDice) : 0;
    const sneakEV         = activeSneakDice > 0
      ? Dice.expectedTotal(activeSneakDice, 6, 0) : 0;

    // ── 5. AVERAGE DAMAGE ON A HIT ───────────────────────────

    let avgOnHit;

    if (active.savageAttacker) {
      // SA: roll weapon dice twice, keep the higher total.
      // GWF adjusts the per-die distribution before the comparison
      // → use expectedMaxOfTwoWithOptions for correct SA+GWF interaction.
      const saHitEV = Dice.expectedMaxOfTwoWithOptions(diceCount, diceType, diceOpts);
      avgOnHit = saHitEV + flatDamageMod + sneakEV;
    } else {
      avgOnHit = Dice.expectedTotal(diceCount, diceType, flatDamageMod, diceOpts) + sneakEV;
    }

    // ── 6. CRIT EXTRA DICE ────────────────────────────────────

    // 5e RAW: on a crit, roll weapon damage dice twice (add diceCount extra dice).
    // Feature bonuses add on top of this standard doubling.
    const piercerBonus    = active.piercer        ? 1 : 0;
    const brutalCritBonus = active.brutalCritical ? Math.max(1, brutalCriticalDice) : 0;
    // Total extra dice from features (beyond the standard weapon-dice doubling)
    const featureExtraDice = piercerBonus + brutalCritBonus;

    // ── 7. AVERAGE DAMAGE ON A CRIT ──────────────────────────

    let avgOnCrit;

    if (active.savageAttacker) {
      // On a crit, the weapon dice pool doubles before SA is applied:
      //   SA rolls 2×diceCount dice twice and takes the higher total.
      // Piercer and Brutal Critical add their dice independently (not part of SA).
      const saCritEV = Dice.expectedMaxOfTwoWithOptions(diceCount * 2, diceType, diceOpts);

      // Extra-feature dice: Piercer + Brutal Critical (not subject to SA)
      const extraFeatEV = featureExtraDice > 0
        ? Dice.expectedTotal(featureExtraDice, diceType, 0, diceOpts) : 0;

      // Sneak attack dice are also doubled on a crit (5e RAW)
      const critSneakEV = activeSneakDice > 0
        ? Dice.expectedTotal(activeSneakDice, 6, 0) : 0;

      avgOnCrit = saCritEV + flatDamageMod + sneakEV + critSneakEV + extraFeatEV;

    } else {
      // Standard crit: normal hit damage + extra weapon dice (+ feature dice)
      const allCritExtraDice = diceCount + featureExtraDice;
      const critExtraWeaponEV = Dice.expectedTotal(allCritExtraDice, diceType, 0, diceOpts);

      // Sneak attack dice also doubled
      const critSneakEV = activeSneakDice > 0
        ? Dice.expectedTotal(activeSneakDice, 6, 0) : 0;

      avgOnCrit = avgOnHit + critExtraWeaponEV + critSneakEV;
    }

    // ── 8. DPR ───────────────────────────────────────────────

    // E[damage per swing] = P(normal hit) × avgOnHit + P(crit) × avgOnCrit
    const dprPerSwing = normalHitChance * avgOnHit + critChance * avgOnCrit;
    const dpr         = dprPerSwing * attacksPerAction;

    // ── 9. DISPLAY BREAKDOWNS ────────────────────────────────

    // Attack bonus parts for tooltip display
    const attackBonusParts = [];
    if (profPart       !== 0) attackBonusParts.push({ label: 'Prof',    value: profPart });
    if (attrMod        !== 0) attackBonusParts.push({ label: 'Attr',    value: attrMod });
    if (attackBonus    !== 0) attackBonusParts.push({ label: 'Magic',   value: attackBonus });
    if (extraHitBonus  !== 0) attackBonusParts.push({ label: 'Feature', value: extraHitBonus });

    // Damage bonus parts for tooltip display
    const damageBonusParts = [];
    if (addAttributeToDamage && attrMod !== 0)
      damageBonusParts.push({ label: 'Attr',  value: attrMod });
    if (damageBonus !== 0)
      damageBonusParts.push({ label: 'Flat',  value: damageBonus });
    if (active.dueling)
      damageBonusParts.push({ label: 'Duel',  value: 2 });
    if (active.gwm || active.sharpshooter)
      damageBonusParts.push({ label: 'Feat',  value: 10 });

    // Active feature labels for result display
    const activeFeatureLabels = _featureDefs
      .filter(def => active[def.id])
      .map(def => ({ id: def.id, label: def.label, category: def.category, icon: def.icon }));

    // Damage range for display (theoretical, not accounting for SA max)
    const { min: dmgMin, max: dmgMax } = Dice.damageRange(
      diceCount, diceType, flatDamageMod, diceOpts
    );

    return {
      id,
      name,
      enabled: true,

      // Attack roll
      totalAttackBonus: totalHitBonus,
      attackBonusParts,
      hitChance,
      critChance,
      missChance,
      effectiveMode,
      effectiveCritRange,

      // Damage
      avgOnHit,
      avgOnCrit,
      dmgMin,
      dmgMax,
      damageBonusParts,
      diceExpression: Dice.formatExpression(diceCount, diceType, flatDamageMod),
      activeSneakDice,

      // Per-round totals
      attacksPerAction,
      dprPerSwing,
      dpr,

      // Feature metadata for display
      activeFeatureLabels,
    };
  };

  // ── Helpers ────────────────────────────────────────────────

  const _clamp = (v, lo, hi) => Math.min(Math.max(v, lo), hi);

  /** Zero-value result for a disabled attack — keeps the result shape consistent */
  const _disabledResult = (id, name) => ({
    id, name,
    enabled: false,
    totalAttackBonus: 0, attackBonusParts: [],
    hitChance: 0, critChance: 0, missChance: 1,
    effectiveMode: 'normal', effectiveCritRange: 20,
    avgOnHit: 0, avgOnCrit: 0, dmgMin: 0, dmgMax: 0,
    damageBonusParts: [], diceExpression: '—', activeSneakDice: 0,
    attacksPerAction: 0, dprPerSwing: 0, dpr: 0,
    activeFeatureLabels: [],
  });

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({ configure, calculate });

})();

/**
 * @typedef {object} FeatureDef
 * @property {string}  id
 * @property {string}  label
 * @property {string}  icon
 * @property {string}  category        'racial'|'style'|'feat'|'class'
 * @property {string}  description
 * @property {boolean} perAttack       true → needs per-attack override
 * @property {boolean} exclusive       true → once per turn (advisory only)
 * @property {object}  [extraInput]    Extra numeric input for parameterised features
 *
 * @typedef {object} AttackResult
 * @property {string}   id
 * @property {string}   name
 * @property {boolean}  enabled
 * @property {number}   totalAttackBonus
 * @property {number}   hitChance
 * @property {number}   critChance
 * @property {number}   missChance
 * @property {string}   effectiveMode
 * @property {number}   effectiveCritRange
 * @property {number}   avgOnHit
 * @property {number}   avgOnCrit
 * @property {number}   dmgMin
 * @property {number}   dmgMax
 * @property {string}   diceExpression
 * @property {number}   attacksPerAction
 * @property {number}   dpr
 * @property {Array}    activeFeatureLabels
 *
 * @typedef {object} CalculationResult
 * @property {number}         totalDPR
 * @property {AttackResult[]} attackResults
 * @property {object}         character
 */
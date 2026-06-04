/**
 * ============================================================
 * DICE ENGINE MODULE — js/dice.js
 * ============================================================
 * All dice-related mathematics, rolling, and probability.
 *
 * FEATURE-AWARE MATH:
 *  - Reroll-below (GWF: reroll ≤ 2, once, keep result even if ≤ 2 again)
 *  - Exploding dice (reroll on max, add, repeat)
 *  - Savage Attacker: E[max(X,Y)] via PMF convolution (exact)
 *  - Halfling's Lucky / feature-based d20 reroll
 *  - Elven Accuracy: triple advantage
 *
 * CORRECTED MATH NOTE:
 *  "Reroll once on 1" (RAW) keeps the second roll even if it's also 1.
 *  Formula: E = (sumAbove / n) + (threshold / n) * (n+1) / 2
 *  This differs from E[die | die ≥ 2] which wrongly assumes rerolls
 *  always produce a non-1 result.
 * ============================================================
 */

const Dice = (() => {

  // ── Core random ────────────────────────────────────────────

  /** Roll a single fair die. Returns 1 to `sides`. */
  const rollDie = (sides) => Math.floor(Math.random() * sides) + 1;

  // ── Single die with modifiers ──────────────────────────────

  /**
   * Roll one die applying reroll and exploding rules.
   *
   * @param {number} sides
   * @param {{ exploding?: boolean, rerollOnes?: boolean, rerollBelow?: number }} options
   *   rerollBelow: reroll once if result <= this threshold (GWF uses 2)
   *   rerollOnes:  alias for rerollBelow=1 (still just reroll once; keep result)
   *   exploding:   on max result, roll again and add (capped at 100 for safety)
   * @returns {number}
   */
  const rollOneDie = (sides, options = {}) => {
    const { exploding = false, rerollOnes = false, rerollBelow = 0 } = options;
    const threshold = rerollOnes ? Math.max(1, rerollBelow) : rerollBelow;

    let result = rollDie(sides);

    // Reroll ONCE if result is within threshold — keep second result regardless
    if (threshold > 0 && result <= threshold) {
      result = rollDie(sides);
    }

    // Exploding: keep rolling while result equals maximum
    if (exploding) {
      let explosions = 0;
      while (result === sides && explosions < 100) {
        const next = rollDie(sides);
        result += next;
        explosions++;
      }
    }

    return result;
  };

  // ── Multi-die rolling ──────────────────────────────────────

  /**
   * Roll `count` dice and apply a flat modifier.
   * @returns {{ total: number, rolls: number[], modifier: number }}
   */
  const roll = (count, sides, modifier = 0, options = {}) => {
    const rolls = Array.from({ length: count }, () => rollOneDie(sides, options));
    const total = rolls.reduce((s, v) => s + v, 0) + modifier;
    return { total, rolls, modifier };
  };

  // ── Expected value ─────────────────────────────────────────

  /**
   * Expected value of a single die with rules applied.
   *
   * BASE: E[dn] = (n+1)/2
   *
   * REROLL-BELOW (threshold t, reroll once, keep result):
   *   E = P(>t) * E[die | >t] + P(≤t) * E[fresh die]
   *     = (sum_{t+1..n} / n) + (t/n) * (n+1)/2
   *
   * EXPLODING (reroll on max, add):
   *   E_exp = E_base / (1 - 1/n)
   *
   * @param {number} sides
   * @param {{ exploding?: boolean, rerollOnes?: boolean, rerollBelow?: number }} options
   * @returns {number}
   */
  const expectedOneDie = (sides, options = {}) => {
    const { exploding = false, rerollOnes = false, rerollBelow = 0 } = options;
    const t = rerollOnes ? Math.max(1, rerollBelow) : rerollBelow;

    let ev;

    if (t > 0 && t < sides) {
      // sum of faces above threshold: sum(t+1..n) = n(n+1)/2 - t(t+1)/2
      const sumAbove = (sides * (sides + 1) / 2) - (t * (t + 1) / 2);
      ev = sumAbove / sides + (t / sides) * (sides + 1) / 2;
    } else {
      ev = (sides + 1) / 2;
    }

    if (exploding && sides > 1) {
      ev = ev / (1 - 1 / sides);
    }

    return ev;
  };

  /**
   * Expected total of `count` dice + flat modifier.
   *
   * @param {number} count
   * @param {number} sides
   * @param {number} modifier
   * @param {object} options
   * @returns {number}
   */
  const expectedTotal = (count, sides, modifier = 0, options = {}) =>
    count * expectedOneDie(sides, options) + modifier;

  // ── Savage Attacker: expected max of two rolls ─────────────

  /**
   * E[max(X, Y)] where X and Y are independent sums of `count`d`sides`.
   * Used for Savage Attacker ("reroll weapon dice, take higher result").
   *
   * Method: compute PMF of the dice sum via convolution, then
   *   E[max(X,Y)] = Σ_i i × P(max = i) = Σ_i i × (F(i)² - F(i-1)²)
   *
   * @param {number} count
   * @param {number} sides
   * @returns {number}
   */
  const expectedMaxOfTwo = (count, sides) => {
    if (count <= 0 || sides <= 0) return 0;

    const maxSum = count * sides;

    // Build PMF via convolution of `count` dice
    let pmf = new Float64Array(maxSum + 1);
    for (let i = 1; i <= sides; i++) pmf[i] = 1 / sides;

    for (let d = 1; d < count; d++) {
      const newPmf = new Float64Array(maxSum + 1);
      const curMin = d;
      const curMax = d * sides;
      for (let i = curMin; i <= curMax; i++) {
        if (pmf[i] === 0) continue;
        for (let j = 1; j <= sides; j++) {
          if (i + j <= maxSum) newPmf[i + j] += pmf[i] / sides;
        }
      }
      pmf = newPmf;
    }

    // Build CDF
    const cdf = new Float64Array(maxSum + 1);
    let cum = 0;
    for (let i = 0; i <= maxSum; i++) {
      cum += pmf[i];
      cdf[i] = Math.min(1, cum);
    }

    // E[max(X,Y)] = Σ_i i × (F(i)² - F(i-1)²)
    let ev = 0;
    for (let i = 1; i <= maxSum; i++) {
      const fi  = cdf[i];
      const fi1 = cdf[i - 1] || 0;
      ev += i * (fi * fi - fi1 * fi1);
    }

    return ev;
  };

  // ── PMF utilities for combined features ───────────────────

  /**
   * Build the probability mass function for a single die with reroll options applied.
   * Returns a Float64Array where pmf[i] = P(result = i), index 0 unused.
   *
   * Used to compose accurate multi-die PMFs when features alter the per-die distribution
   * (e.g. Savage Attacker + Great Weapon Fighting simultaneously).
   *
   * For reroll-below threshold t (e.g. t=2 for GWF):
   *   P(j ≤ t) = P(first ≤ t) × P(reroll = j) = (t/n)(1/n)
   *   P(j > t) = P(first = j) + P(first ≤ t) × P(reroll = j) = 1/n + (t/n)(1/n)
   *
   * @param {number} sides
   * @param {{ rerollBelow?: number, rerollOnes?: boolean }} options
   * @returns {Float64Array}  length sides+1, index 0 = 0
   */
  const singleDiePMF = (sides, options = {}) => {
    const { rerollBelow = 0, rerollOnes = false } = options;
    const t = rerollOnes ? Math.max(1, rerollBelow) : rerollBelow;

    const pmf = new Float64Array(sides + 1);

    if (t === 0 || t >= sides) {
      // No reroll or threshold covers all faces — uniform
      for (let i = 1; i <= sides; i++) pmf[i] = 1 / sides;
    } else {
      const pReroll        = t / sides;           // P(first roll triggers reroll)
      const pFace          = 1 / sides;           // P(any specific face)
      const pRerollAndFace = pReroll * pFace;     // P(reroll) × P(specific face on reroll)

      for (let j = 1; j <= sides; j++) {
        if (j <= t) {
          // Only reachable via a reroll (first roll ≤ t, reroll = j)
          pmf[j] = pRerollAndFace;
        } else {
          // Reachable directly (first roll = j) or via reroll
          pmf[j] = pFace + pRerollAndFace;
        }
      }
    }

    return pmf;
  };

  /**
   * E[max(X, Y)] for two independent rolls of `count`d`sides`,
   * where each die may have reroll-below applied (e.g. GWF).
   *
   * Falls back to the simpler `expectedMaxOfTwo` when no options are set.
   * Used for Savage Attacker interactions with Great Weapon Fighting.
   *
   * @param {number} count
   * @param {number} sides
   * @param {{ rerollBelow?: number, rerollOnes?: boolean }} [options={}]
   * @returns {number}
   */
  const expectedMaxOfTwoWithOptions = (count, sides, options = {}) => {
    const { rerollBelow = 0, rerollOnes = false } = options;
    if (rerollBelow === 0 && !rerollOnes) {
      return expectedMaxOfTwo(count, sides); // fast path
    }

    const maxSum = count * sides;
    const diePMF = singleDiePMF(sides, options);

    // Convolve `count` dice
    let pmf = new Float64Array(maxSum + 1);
    for (let i = 1; i <= sides; i++) pmf[i] = diePMF[i];

    for (let d = 1; d < count; d++) {
      const newPmf = new Float64Array(maxSum + 1);
      for (let i = d; i <= d * sides; i++) {
        if (pmf[i] === 0) continue;
        for (let j = 1; j <= sides; j++) {
          if (i + j <= maxSum) newPmf[i + j] += pmf[i] * diePMF[j];
        }
      }
      pmf = newPmf;
    }

    // CDF then E[max(X,Y)]
    const cdf = new Float64Array(maxSum + 1);
    let cum = 0;
    for (let i = 0; i <= maxSum; i++) {
      cum += pmf[i];
      cdf[i] = Math.min(1, cum);
    }

    let ev = 0;
    for (let i = 1; i <= maxSum; i++) {
      const fi  = cdf[i];
      const fi1 = cdf[i - 1] || 0;
      ev += i * (fi * fi - fi1 * fi1);
    }

    return ev;
  };

  // ── Attack rolls ───────────────────────────────────────────

  /**
   * Simulate a d20 attack roll with advantage / disadvantage.
   * @param {'normal'|'advantage'|'disadvantage'} mode
   * @returns {number}  Raw d20 result (1–20)
   */
  const rollAttack = (mode = 'normal') => {
    if (mode === 'advantage')    return Math.max(rollDie(20), rollDie(20));
    if (mode === 'disadvantage') return Math.min(rollDie(20), rollDie(20));
    return rollDie(20);
  };

  // ── Hit probability ────────────────────────────────────────

  /**
   * Full hit/crit probability computation with feature support.
   *
   * D&D 5e rules:
   *   - Natural 1 always misses.
   *   - Natural 20 always hits and crits.
   *   - Crits occur when raw d20 ≥ critRange.
   *
   * REROLL SUPPORT (Halfling's Lucky etc.):
   *   For faces in `rerollOn`, replace that face's contribution with the
   *   base hit/crit probability of a fresh roll (Lucky only rerolls once).
   *
   *   P(hit) = Σ_{roll=1..20} [ if roll ∈ rerollOn: baseHit/20, else: isHit/20 ]
   *
   * ADVANTAGE MODES:
   *   normal:        P(hit), P(crit) as computed above
   *   advantage:     P(miss)² → P(hit) = 1 - P(miss)²; P(crit) = 1 - P(noCrit)²
   *   disadvantage:  P(hit)²; P(crit)²
   *   tripleAdv:     Elven Accuracy; P(miss)³; P(crit) = 1 - P(noCrit)³
   *
   * @param {{ attackBonus, targetAC, critRange, mode, rerollOn, tripleAdvantage }} params
   * @returns {{ hitChance: number, critChance: number, missChance: number }}
   */
  const hitProbabilityFull = ({
    attackBonus,
    targetAC,
    critRange       = 20,
    mode            = 'normal',
    rerollOn        = [],       // d20 faces that trigger a reroll (e.g. [1] for Lucky)
    tripleAdvantage = false,    // Elven Accuracy — only applies when mode = 'advantage'
  }) => {
    const neededRoll = targetAC - attackBonus;

    // Base probabilities (no reroll) — used as the expected value of a rerolled face
    const _baseHitP  = Math.min(19 / 20, Math.max(1 / 20, (21 - neededRoll) / 20));
    const _baseCritP = Math.max(0, (21 - critRange) / 20);

    // Sum probabilities across all 20 faces
    let pHit = 0;
    let pCrit = 0;

    for (let roll = 1; roll <= 20; roll++) {
      if (rerollOn.includes(roll)) {
        // This face triggers a reroll — use base probability as expected contribution
        pHit  += _baseHitP  / 20;
        pCrit += _baseCritP / 20;
      } else {
        const isAutoMiss = roll === 1;
        const isAutoHit  = roll === 20;
        const isHit  = isAutoHit || (!isAutoMiss && roll >= neededRoll);
        const isCrit = roll >= critRange;
        pHit  += (isHit  ? 1 : 0) / 20;
        pCrit += (isCrit ? 1 : 0) / 20;
      }
    }

    pCrit = Math.min(pCrit, pHit);

    const pMiss   = 1 - pHit;
    const pNoCrit = 1 - pCrit;

    let hitChance, critChance;

    if (mode === 'advantage' && tripleAdvantage) {
      // Elven Accuracy: roll 3d20, take highest
      hitChance  = 1 - pMiss   * pMiss   * pMiss;
      critChance = 1 - pNoCrit * pNoCrit * pNoCrit;
    } else if (mode === 'advantage') {
      hitChance  = 1 - pMiss   * pMiss;
      critChance = 1 - pNoCrit * pNoCrit;
    } else if (mode === 'disadvantage') {
      hitChance  = pHit  * pHit;
      critChance = pCrit * pCrit;
    } else {
      hitChance  = pHit;
      critChance = pCrit;
    }

    critChance = Math.min(critChance, hitChance);

    return {
      hitChance,
      critChance,
      missChance: 1 - hitChance,
    };
  };

  /** Legacy wrapper — backwards compatible with hitProbability(bonus, AC, crit, mode) */
  const hitProbability = (attackBonus, targetAC, critRange = 20, mode = 'normal') =>
    hitProbabilityFull({ attackBonus, targetAC, critRange, mode });

  // ── Expression utilities ───────────────────────────────────

  /**
   * Parse "2d6+3" → { count: 2, sides: 6, modifier: 3 }
   * Returns null on parse failure.
   */
  const parseExpression = (expr) => {
    const m = String(expr).trim().match(/^(\d+)[dD](\d+)\s*([+-]\s*\d+)?$/);
    if (!m) return null;
    return {
      count:    parseInt(m[1], 10),
      sides:    parseInt(m[2], 10),
      modifier: m[3] ? parseInt(m[3].replace(/\s/g, ''), 10) : 0,
    };
  };

  /**
   * Format "2d6+3" / "1d8" / "1d8-2"
   */
  const formatExpression = (count, sides, modifier = 0) => {
    let str = `${count}d${sides}`;
    if (modifier > 0) str += `+${modifier}`;
    if (modifier < 0) str += `${modifier}`;
    return str;
  };

  /**
   * Damage range { min, max, avg } for display purposes.
   * Note: max is theoretical ceiling (ignores explosive infinite tails).
   */
  const damageRange = (count, sides, modifier = 0, options = {}) => {
    const { rerollOnes = false, rerollBelow = 0 } = options;
    const t = rerollOnes ? Math.max(1, rerollBelow) : rerollBelow;
    const minFace = t + 1; // minimum possible face after reroll (may still be t if reroll also low)
    // Conservative min: assume reroll also can be 1 (RAW)
    const min = count * 1 + modifier;
    const max = count * sides + modifier;
    const avg = expectedTotal(count, sides, modifier, options);
    return { min, max, avg };
  };

  // ── Public API ─────────────────────────────────────────────

  return Object.freeze({
    rollDie,
    rollOneDie,
    roll,
    rollAttack,
    expectedOneDie,
    expectedTotal,
    expectedMaxOfTwo,
    expectedMaxOfTwoWithOptions,
    singleDiePMF,
    hitProbability,
    hitProbabilityFull,
    parseExpression,
    formatExpression,
    damageRange,
  });

})();
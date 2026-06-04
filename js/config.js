/**
 * ============================================================
 * CONFIGURATION — js/config.js
 * ============================================================
 * Single source of truth for the calculator's structure,
 * content, and defaults. Edit this file to add fields,
 * sections, features, or entirely new calculators.
 *
 * SHAPE OVERVIEW
 * ──────────────
 *  meta               — App identity
 *  defaultState       — Initial state (must mirror all section IDs)
 *  featureDefinitions — All supported D&D features, with metadata
 *  sections           — Ordered list of UI sections (drives rendering)
 *
 * SECTION TYPES
 *  'static'   — Fixed fields rendered from section.fields[]
 *  'features' — Auto-generated from featureDefinitions; no fields[]
 *  'dynamic'  — Repeatable blocks from section.template.fields[]
 *
 * FIELD TYPES  number | text | checkbox | select | display
 *
 * FEATURE perAttack FLAG
 *  false → global; enabled once; applies to all attacks automatically
 *  true  → per-attack; user enables globally, then selects which
 *           specific attack uses it that turn (shown in attack block)
 * ============================================================
 */

const CONFIG = Object.freeze({

  // ── App identity ───────────────────────────────────────────

  meta: {
    title:       'D&D Combat Calculator',
    subtitle:    'Damage Per Round · Hit Probability · Critical Analysis',
    version:     '1.0.0',
    icon:        '⚔️',
  },

  // ── Default state ──────────────────────────────────────────
  // Must contain a key for every section id (except 'features').
  // attacks[] items must include featureOverrides for all perAttack features.

  defaultState: {
    character: {
      level:              5,
      attributeScore:     20,
      brutalCriticalDice: 1,    // Barbarian Brutal Critical: extra dice count (1–3)
      sneakAttackDice:    3,    // Rogue Sneak Attack: number of d6s
      features: {
        halflingLucky:     false,
        elvenAccuracy:     false,
        gwf:               false,
        dueling:           false,
        archery:           false,
        savageAttacker:    false,
        piercer:           false,
        gwm:               false,
        sharpshooter:      false,
        improvedCritical:  false,
        superiorCritical:  false,
        recklessAttack:    false,
        brutalCritical:    false,
        sneakAttack:       false,
      },
    },

    target: {
      ac: 15,
      hp: 0,
    },

    attacks: [
      {
        id:                  'attack_default',
        name:                'Longsword',
        enabled:             true,
        attackBonus:         0,
        diceCount:           1,
        diceType:            8,
        damageBonus:         0,
        addAttributeToDamage: true,
        addProficiency:      true,
        critRange:           20,
        attacksPerAction:    2,
        advantage:           'normal',
        explodingDice:       false,
        rerollOnes:          false,
        featureOverrides: {
          savageAttacker: false,
          piercer:        false,
          gwm:            false,
          sharpshooter:   false,
          sneakAttack:    false,
        },
      },
    ],
  },

  // ── Feature definitions ────────────────────────────────────
  // category: 'racial' | 'style' | 'feat' | 'class'
  // scope:    'attackRoll' | 'damageDice' | 'critDice' | 'both'
  // perAttack: false = global (always on), true = once-per-turn (chosen per attack)
  // exclusive: advisory — whether only one attack per turn should use it
  // extraInput: optional numeric input shown when feature is enabled
  //   { stateKey, type, label, min, max, default }

  featureDefinitions: [

    // ── RACIAL ──────────────────────────────────────────────

    {
      id:          'halflingLucky',
      label:       "Halfling's Lucky",
      icon:        '🍀',
      category:    'racial',
      description: 'When you roll a 1 on a d20 attack roll, you may reroll the die once and must use the new result.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'elvenAccuracy',
      label:       'Elven Accuracy',
      icon:        '🧝',
      category:    'racial',
      description: 'Whenever you have advantage on an attack roll, roll a third d20 and use the highest result.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },

    // ── FIGHTING STYLES ──────────────────────────────────────

    {
      id:          'gwf',
      label:       'Great Weapon Fighting',
      icon:        '⚔️',
      category:    'style',
      description: 'When you roll a 1 or 2 on a weapon damage die, you may reroll it once and must use the new result (even if ≤ 2).',
      scope:       'damageDice',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'dueling',
      label:       'Dueling',
      icon:        '🗡️',
      category:    'style',
      description: '+2 damage bonus when wielding a one-handed melee weapon and no other weapons.',
      scope:       'damageDice',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'archery',
      label:       'Archery',
      icon:        '🏹',
      category:    'style',
      description: '+2 bonus to attack rolls with ranged weapons.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },

    // ── FEATS ────────────────────────────────────────────────

    {
      id:          'savageAttacker',
      label:       'Savage Attacker',
      icon:        '💢',
      category:    'feat',
      description: 'Once per turn, when you roll damage for a melee weapon attack, you may reroll the weapon\'s damage dice and use either total.',
      scope:       'damageDice',
      perAttack:   true,
      exclusive:   true,
      extraInput:  null,
    },
    {
      id:          'piercer',
      label:       'Piercer',
      icon:        '🔱',
      category:    'feat',
      description: 'Once per turn, when you score a critical hit with a piercing weapon, you may roll one additional weapon damage die.',
      scope:       'critDice',
      perAttack:   true,
      exclusive:   true,
      extraInput:  null,
    },
    {
      id:          'gwm',
      label:       'Great Weapon Master',
      icon:        '🪓',
      category:    'feat',
      description: 'Before making a melee attack, take −5 to the attack roll. On a hit, deal +10 damage. Choose per attack.',
      scope:       'both',
      perAttack:   true,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'sharpshooter',
      label:       'Sharpshooter',
      icon:        '🎯',
      category:    'feat',
      description: 'Before making a ranged attack, take −5 to the attack roll. On a hit, deal +10 damage. Choose per attack.',
      scope:       'both',
      perAttack:   true,
      exclusive:   false,
      extraInput:  null,
    },

    // ── CLASS FEATURES ───────────────────────────────────────

    {
      id:          'improvedCritical',
      label:       'Improved Critical',
      icon:        '⭐',
      category:    'class',
      description: 'Champion Fighter (lv.3): Your weapon attacks score a critical hit on a roll of 19 or 20.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'superiorCritical',
      label:       'Superior Critical',
      icon:        '💫',
      category:    'class',
      description: 'Champion Fighter (lv.15): Your weapon attacks score a critical hit on a roll of 18, 19, or 20.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'recklessAttack',
      label:       'Reckless Attack',
      icon:        '🪖',
      category:    'class',
      description: 'Barbarian: Attack with advantage on all attacks this turn. Enemies also gain advantage against you.',
      scope:       'attackRoll',
      perAttack:   false,
      exclusive:   false,
      extraInput:  null,
    },
    {
      id:          'brutalCritical',
      label:       'Brutal Critical',
      icon:        '💥',
      category:    'class',
      description: 'Barbarian: Roll additional weapon damage dice when scoring a critical hit (1 die at lv.9, 2 at lv.13, 3 at lv.17).',
      scope:       'critDice',
      perAttack:   false,
      exclusive:   false,
      extraInput:  {
        stateKey:  'character.brutalCriticalDice',
        type:      'number',
        label:     'Extra Dice',
        min:       1,
        max:       3,
        default:   1,
      },
    },
    {
      id:          'sneakAttack',
      label:       'Sneak Attack',
      icon:        '🗡️',
      category:    'class',
      description: 'Rogue: Once per turn, deal extra d6 damage when you have advantage or an ally is adjacent. Sneak Attack dice are doubled on a critical hit.',
      scope:       'damageDice',
      perAttack:   true,
      exclusive:   true,
      extraInput:  {
        stateKey:  'character.sneakAttackDice',
        type:      'number',
        label:     'Sneak Attack Dice (d6)',
        min:       1,
        max:       13,
        default:   3,
      },
    },
  ],

  // ── Sections ───────────────────────────────────────────────

  sections: [

    // ── CHARACTER ──────────────────────────────────────────
    {
      id:      'character',
      label:   'Character',
      icon:    '🧙',
      type:    'static',
      columns: 2,
      fields:  [
        {
          id:      'level',
          type:    'number',
          label:   'Character Level',
          default: 5,
          min:     1,
          max:     20,
          help:    'Total character level. Proficiency bonus is derived from this (shown in results).',
        },
        {
          id:      'attributeScore',
          type:    'number',
          label:   'Attack Attribute Score',
          default: 20,
          min:     1,
          max:     30,
          help:    'The ability score used for attack and damage rolls — STR or DEX for martial, spellcasting modifier for spells.',
        },
      ],
    },

    // ── FEATURES ───────────────────────────────────────────
    // type:'features' is auto-generated from featureDefinitions.
    // No fields[] needed here — the renderer handles everything.
    {
      id:    'features',
      label: 'Features & Abilities',
      icon:  '✨',
      type:  'features',
    },

    // ── TARGET ─────────────────────────────────────────────
    {
      id:      'target',
      label:   'Target',
      icon:    '🎯',
      type:    'static',
      columns: 2,
      fields:  [
        {
          id:      'ac',
          type:    'number',
          label:   'Armor Class',
          default: 15,
          min:     1,
          max:     30,
          help:    'The Armor Class of the creature you are attacking.',
        },
        {
          id:      'hp',
          type:    'number',
          label:   'Hit Points (optional)',
          default: 0,
          min:     0,
          max:     99999,
          help:    'Target\'s maximum HP. Leave at 0 to skip. Used to calculate rounds-to-kill.',
        },
      ],
    },

    // ── ATTACKS ────────────────────────────────────────────
    {
      id:       'attacks',
      label:    'Attacks',
      icon:     '⚔️',
      type:     'dynamic',
      addLabel: 'Add Attack',
      minItems: 0,
      maxItems: 12,
      template: {
        defaultLabel:     'Attack',
        columns:          2,
        featureOverrides: true,  // renderer adds per-attack feature section
        fields: [
          {
            id:          'name',
            type:        'text',
            label:       'Weapon / Spell Name',
            default:     'New Attack',
            placeholder: 'e.g. Longsword, Fireball',
            span:        2,
          },
          {
            id:      'enabled',
            type:    'checkbox',
            label:   'Include in total DPR',
            default: true,
            span:    2,
          },
          // ── Dice ────────────────────────────────────────
          {
            id:      'diceCount',
            type:    'number',
            label:   'Number of Dice',
            default: 1,
            min:     1,
            max:     20,
          },
          {
            id:      'diceType',
            type:    'select',
            label:   'Damage Die',
            default: 8,
            options: [
              { value: 4,  label: 'd4'  },
              { value: 6,  label: 'd6'  },
              { value: 8,  label: 'd8'  },
              { value: 10, label: 'd10' },
              { value: 12, label: 'd12' },
              { value: 20, label: 'd20' },
            ],
          },
          // ── Bonuses ─────────────────────────────────────
          {
            id:      'attackBonus',
            type:    'number',
            label:   'Magic Attack Bonus',
            default: 0,
            min:     -5,
            max:     10,
            help:    'Flat bonus to attack rolls from magic items (e.g. +1 weapon).',
          },
          {
            id:      'damageBonus',
            type:    'number',
            label:   'Extra Damage Bonus',
            default: 0,
            min:     -10,
            max:     30,
            help:    'Flat damage bonus beyond your attribute modifier (e.g. magic weapon, hex).',
          },
          // ── Attack properties ────────────────────────────
          {
            id:      'critRange',
            type:    'number',
            label:   'Critical Hit On',
            default: 20,
            min:     15,
            max:     20,
            help:    'Minimum d20 roll for a critical hit. Normally 20. Champion Fighter can lower this via Improved/Superior Critical in Features.',
          },
          {
            id:      'attacksPerAction',
            type:    'number',
            label:   'Attacks per Action',
            default: 1,
            min:     1,
            max:     8,
            help:    'Number of times this attack is made per action (e.g. 2 for Extra Attack feature).',
          },
          {
            id:      'advantage',
            type:    'select',
            label:   'Roll Condition',
            default: 'normal',
            options: [
              { value: 'normal',      label: 'Normal' },
              { value: 'advantage',   label: 'Advantage' },
              { value: 'disadvantage', label: 'Disadvantage' },
            ],
            span: 2,
          },
          // ── Toggles ─────────────────────────────────────
          {
            id:      'addAttributeToDamage',
            type:    'checkbox',
            label:   'Add attribute modifier to damage',
            default: true,
          },
          {
            id:      'addProficiency',
            type:    'checkbox',
            label:   'Add proficiency to attack',
            default: true,
          },
          {
            id:      'explodingDice',
            type:    'checkbox',
            label:   'Exploding damage dice',
            default: false,
            help:    'Dice showing their maximum value are rolled again and added (e.g. some class features or magic effects).',
          },
          {
            id:      'rerollOnes',
            type:    'checkbox',
            label:   'Reroll 1s on damage (once)',
            default: false,
            help:    'Damage dice showing 1 are rerolled once and the new result kept. (Use GWF in Features for 1s and 2s.)',
          },
        ],
      },
    },
  ],
});
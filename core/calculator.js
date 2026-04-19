export function rollDice(count, sides) {
  let total = 0;

  for (let i = 0; i < count; i++) {
    total += Math.floor(Math.random() * sides) + 1;
  }

  return total;
}

export function parseDice(diceStr) {
  const [count, sides] = diceStr.toLowerCase().split("d").map(Number);
  return { count, sides };
}

export function calculateAction(action) {
  const { count, sides } = parseDice(action.dice);

  let rolls = rollDice(count, sides);
  let total = rolls + (action.modifier || 0);

  return {
    name: action.name,
    total,
    rolls
  };
}

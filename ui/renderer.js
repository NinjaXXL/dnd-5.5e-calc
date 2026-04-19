import { state } from "../core/state.js";
import { calculateAction } from "../core/calculator.js";

export function renderResults() {
  const container = document.getElementById("resultsContainer");

  const results = state.actions.map(calculateAction);

  container.innerHTML = results
    .map(r => `<p>${r.name}: ${r.total}</p>`)
    .join("");
}

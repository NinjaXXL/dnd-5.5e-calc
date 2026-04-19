import { state } from "../core/state.js";

export function initGlobalSettings() {
  const container = document.getElementById("globalSettingsContainer");

  container.innerHTML = `
    <label>
      Crit Mode:
      <select id="critMode">
        <option value="doubleDice">Double Dice</option>
        <option value="maxDamage">Max Damage</option>
      </select>
    </label>
  `;

  document.getElementById("critMode").addEventListener("change", (e) => {
    state.globalSettings.critMode = e.target.value;
  });
}
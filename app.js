import { state } from "./core/state.js";
import { initGlobalSettings } from "./ui/globalSettings.js";
import { initActionBuilder } from "./ui/actionBuilder.js";
import { renderResults } from "./ui/renderer.js";

function updateUI() {
  renderResults();
}

// expose globally so UI modules can call it
window.updateUI = updateUI;

// init UI
initGlobalSettings();
initActionBuilder();
updateUI();

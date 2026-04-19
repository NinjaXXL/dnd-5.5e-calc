import { state } from "./core/state.js";
import { initGlobalSettings } from "./ui/globalSettings.js";
import { initActionBuilder } from "./ui/actionBuilder.js";
import { renderResults } from "./ui/renderer.js";

// Initialize UI
initGlobalSettings();
initActionBuilder();
renderResults();

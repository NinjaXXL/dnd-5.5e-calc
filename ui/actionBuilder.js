import { state } from "../core/state.js";

export function initActionBuilder() {
  const container = document.getElementById("actionBuilderContainer");
  const btn = document.getElementById("addActionBtn");

  btn.addEventListener("click", () => {
    state.actions.push({
      name: "New Action",
      dice: "1d8",
      modifier: 0
    });

    renderActions();
    window.updateUI(); // 👈 IMPORTANT
  });

  function renderActions() {
    container.innerHTML = "";

    state.actions.forEach((action) => {
      const div = document.createElement("div");

      div.innerHTML = `
        <input value="${action.name}" />
        <input value="${action.dice}" />
        <input type="number" value="${action.modifier}" />
      `;

      container.appendChild(div);
    });
  }
}

import { state } from "../core/state.js";

export function initActionBuilder() {
  const container = document.getElementById("actionBuilderContainer");
  const btn = document.getElementById("addActionBtn");

  btn.addEventListener("click", () => {
    const action = {
      name: "New Action",
      dice: "1d8",
      modifier: 0
    };

    state.actions.push(action);
    renderActions();
  });

  function renderActions() {
    container.innerHTML = "";

    state.actions.forEach((action, index) => {
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

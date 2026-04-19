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
    window.updateUI(); // refresh results
  });

  function renderActions() {
    container.innerHTML = "";

    state.actions.forEach((action, index) => {
      const wrapper = document.createElement("div");
      wrapper.className = "action";

      // Name input
      const nameInput = document.createElement("input");
      nameInput.value = action.name;

      nameInput.addEventListener("input", (e) => {
        action.name = e.target.value;
        window.updateUI();
      });

      // Dice input
      const diceInput = document.createElement("input");
      diceInput.value = action.dice;

      diceInput.addEventListener("input", (e) => {
        action.dice = e.target.value;
        window.updateUI();
      });

      // Modifier input
      const modInput = document.createElement("input");
      modInput.type = "number";
      modInput.value = action.modifier;

      modInput.addEventListener("input", (e) => {
        action.modifier = Number(e.target.value);
        window.updateUI();
      });

      // Append all inputs
      wrapper.appendChild(nameInput);
      wrapper.appendChild(diceInput);
      wrapper.appendChild(modInput);

      container.appendChild(wrapper);
    });
  }

  // initial render
  renderActions();
}

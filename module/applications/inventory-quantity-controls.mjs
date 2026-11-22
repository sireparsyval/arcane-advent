// Build only serializable DOM; DialogV2 recreates the controls before rendering.
export function transferAmountControl({ id, name, available, numeric = true, selected = false, disabled = false, maximum = available, minimum = 0, value = selected ? maximum : 0 }) {
    const group = document.createElement("div"); group.className = "aa-transfer-amount";
    const control = document.createElement(numeric ? "input" : "button");
    if (numeric) {
        Object.assign(control, { type: "number", min: String(minimum), max: String(maximum), step: "1", defaultValue: String(value) });
        control.dataset.transferQuantity = "";
    } else {
        control.type = "button"; control.className = "aa-transfer-toggle"; control.dataset.transferToggle = "";
        control.setAttribute("aria-pressed", String(selected)); control.textContent = selected ? "✔️" : "❌";
    }
    if (id != null) control.dataset.transferItem = id;
    if (name) control.name = name;
    control.disabled = disabled;
    control.setAttribute("aria-label", numeric ? "Quantité à déplacer" : "Sélectionner cet objet");
    const current = document.createElement("span"); current.className = "aa-transfer-available";
    current.textContent = numeric ? `/ ${available}` : "";
    current.title = `Disponible : ${available}`;
    group.append(control, current);
    return group;
}

export function transferAmount(control) {
    return control.type === "number" ? control.valueAsNumber : control.getAttribute("aria-pressed") === "true" ? 1 : 0;
}

function updateWeight(control) {
    const row = control.closest(".aa-transfer-choice"), weight = row?.querySelector(".aa-transfer-weight");
    if (!weight) return;
    const quantity = transferAmount(control);
    weight.textContent = Number.isFinite(quantity) && quantity >= 0
        ? `${new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 }).format(quantity * Number(row.dataset.unitWeight))} kg` : "—";
}

export function setTransferAmount(control, selected) {
    if (control.type === "number") control.value = selected ? control.max : "0";
    else {
        control.setAttribute("aria-pressed", String(selected)); control.textContent = selected ? "✔️" : "❌";
    }
    updateWeight(control);
}

export function bindTransferAmounts(root) {
    for (const control of root.querySelectorAll("[data-transfer-quantity], [data-transfer-toggle]")) {
        if (control.type === "number") control.addEventListener("input", () => updateWeight(control));
        else control.addEventListener("click", () => setTransferAmount(control, transferAmount(control) === 0));
    }
}

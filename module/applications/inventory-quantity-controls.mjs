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


export function transferSelectionButtons() {
    const row = document.createElement("div"); row.className = "aa-transfer-selection";
    const clear = document.createElement("button"), all = document.createElement("button");
    clear.type = all.type = "button";
    clear.dataset.transferSelectNone = ""; clear.textContent = "Annuler la sélection";
    all.dataset.transferSelectAll = ""; all.textContent = "Tout sélectionner";
    row.append(clear, all);
    return row;
}
export function bindTransferSelection(root, refresh = () => {}) {
    const select = selected => {
        for (const control of root.querySelectorAll("[data-transfer-quantity], [data-transfer-toggle]")) {
            if (!control.disabled || control.dataset.transferParentLocked === "true") setTransferAmount(control, selected);
        }
        refresh();
    };
    root.querySelector("[data-transfer-select-none]")?.addEventListener("click", () => select(false));
    root.querySelector("[data-transfer-select-all]")?.addEventListener("click", () => select(true));
}
export function bindTransferHierarchy(root, items) {
    const controls = [...root.querySelectorAll("[data-transfer-item]")];
    const byId = new Map(controls.map(control => [control.dataset.transferItem, control]));
    const refresh = () => {
        // Clear inherited choices first: a deselected container also clears
        // nested containers, instead of turning them into independent choices.
        for (const control of controls) if (control.dataset.transferParentLocked === "true") {
            setTransferAmount(control, false); control.disabled = false;
            delete control.dataset.transferParentLocked;
            control.removeAttribute("aria-disabled"); control.removeAttribute("title");
            control.closest(".aa-transfer-choice")?.removeAttribute("data-transfer-included");
        }
        for (const control of controls) {
            const seen = new Set([control.dataset.transferItem]);
            let parent = items.get(control.dataset.transferItem)?.system.containerId;
            while (parent && !seen.has(parent)) {
                seen.add(parent);
                const ancestor = byId.get(parent);
                if (ancestor && items.get(parent)?.type === "container" && transferAmount(ancestor) > 0) {
                    setTransferAmount(control, true); control.disabled = true;
                    control.dataset.transferParentLocked = "true";
                    control.setAttribute("aria-disabled", "true"); control.title = "Inclus dans le contenant sélectionné";
                    control.closest(".aa-transfer-choice")?.setAttribute("data-transfer-included", "");
                    break;
                }
                parent = items.get(parent)?.system.containerId;
            }
        }
    };
    for (const control of controls) {
        control.addEventListener(control.type === "number" ? "input" : "click", refresh);
        if (control.type === "number") control.addEventListener("change", refresh);
    }
    refresh();
    return refresh;
}

export function bindTransferSubmit(root, isValid) {
    const refresh = () => {
        const valid = isValid();
        for (const button of root.querySelectorAll(".form-footer button[data-action]")) {
            if (button.dataset.action !== "cancel") button.disabled = !valid;
        }
    };
    for (const control of root.querySelectorAll("[data-transfer-quantity], [data-transfer-toggle]")) {
        control.addEventListener(control.type === "number" ? "input" : "click", refresh);
        if (control.type === "number") control.addEventListener("change", refresh);
    }
    refresh();
    return refresh;
}

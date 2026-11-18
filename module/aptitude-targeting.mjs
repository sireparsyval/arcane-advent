export const APTITUDE_RANGE_MODES = Object.freeze({ melee: "Mêlée", ranged: "Distance" });

export function aptitudeRangeMode(targeting = {}) {
    return targeting.rangeMode ?? (Number(targeting.range) > 0 ? "ranged" : "melee");
}

export function aptitudeRangeSummary(targeting = {}) {
    if (!targeting.mode || targeting.mode === "self") return "";
    const format = value => new Intl.NumberFormat("fr-FR").format(value ?? 0);
    if (aptitudeRangeMode(targeting) === "melee") {
        return targeting.range > 0 ? `Mêlée · Allonge ${format(targeting.range)} m` : "Mêlée";
    }
    return `Distance · ${format(targeting.range)} m${targeting.longRange > 0 ? ` / ${format(targeting.longRange)} m` : ""}`;
}

export function refreshAptitudeTargetingFields(editor) {
    const mode = editor.querySelector('[name="target.mode"]').value;
    const shape = editor.querySelector('[name="target.shape"]').value;
    const ranged = editor.querySelector('[name="target.rangeMode"]').value === "ranged";
    const toggle = editor.querySelector("[data-aa-range-toggle]");
    toggle.textContent = ranged ? "🏹" : "⚔️";
    toggle.title = ranged ? "Distance — Passer en mêlée" : "Mêlée — Passer à distance";
    toggle.setAttribute("aria-label", toggle.title);
    toggle.setAttribute("aria-pressed", String(ranged));
    editor.querySelector("[data-aa-range-caption]").textContent = ranged ? "Portée normale (m)" : "Allonge (m)";
    const visibleGroups = new Set();
    if (mode !== "self") {
        visibleGroups.add("targeted");
        if (ranged) visibleGroups.add("longRange");
    }
    if (mode === "multiple") visibleGroups.add("multiple");
    if (mode === "area") { visibleGroups.add("area"); visibleGroups.add(shape); }
    for (const checkbox of editor.querySelectorAll('input[type="checkbox"]:checked')) visibleGroups.add(checkbox.name);
    for (const group of editor.querySelectorAll("[data-aa-fields]")) {
        const visible = group.dataset.aaFields.split(" ").some(key => visibleGroups.has(key));
        group.hidden = !visible;
        for (const field of group.querySelectorAll("input, select, button")) field.disabled = !visible;
    }
}

export function bindAptitudeRangeToggle(editor) {
    editor.querySelector("[data-aa-range-toggle]").addEventListener("click", () => {
        const field = editor.querySelector('[name="target.rangeMode"]');
        field.value = field.value === "ranged" ? "melee" : "ranged";
        refreshAptitudeTargetingFields(editor);
    });
}

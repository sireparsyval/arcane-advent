export const DEFENSE_ZONE_LABELS = Object.freeze({ head: "Tête", torso: "Torse", arms: "Bras", legs: "Jambes" });

const PHYSICAL_TYPES = new Map([
    ["slashing", "Tranchants"], ["tranchant", "Tranchants"], ["tranchants", "Tranchants"],
    ["piercing", "Perforants"], ["perforant", "Perforants"], ["perforants", "Perforants"],
    ["bludgeoning", "Contondants"], ["contondant", "Contondants"], ["contondants", "Contondants"]
]);

export function defenseReductionsByZone(items) {
    const totals = Object.fromEntries(Object.keys(DEFENSE_ZONE_LABELS).map(zone => [zone, new Map()]));
    for (const item of items) {
        if (item.type !== "protection" || !item.system?.equipped) continue;
        const zones = item.system.zones;
        if (!(zones instanceof Set) && !Array.isArray(zones)) continue;
        const covered = [...new Set(zones)].filter(zone => Object.hasOwn(totals, zone));
        for (const [type, value] of Object.entries(item.system.damageReductions ?? {})) {
            const amount = Number(value);
            if (!Number.isFinite(amount) || amount <= 0) continue;
            const name = type.trim().replace(/\s+/g, " ").normalize("NFC");
            if (!name) continue;
            const normalized = name.toLocaleLowerCase("fr");
            const label = PHYSICAL_TYPES.get(normalized) ?? name;
            const key = label.toLocaleLowerCase("fr");
            for (const zone of covered) {
                const previous = totals[zone].get(key);
                totals[zone].set(key, { label: previous?.label ?? label, amount: (previous?.amount ?? 0) + amount });
            }
        }
    }
    return Object.fromEntries(Object.entries(totals).map(([zone, rows]) => [zone, [...rows.values()]]));
}

// Build with textContent so free-form damage names stay text in the native
// tooltip. A single table keeps amounts and units aligned across all rows.
export function bindDefenseReductionTooltips(root, items) {
    const byZone = defenseReductionsByZone(items);
    for (const element of root.querySelectorAll("[data-defense-zone]")) {
        const zone = element.dataset.defenseZone;
        const rows = byZone[zone] ?? [];
        delete element.dataset.tooltipHtml;
        delete element.dataset.tooltipClass;
        delete element.dataset.tooltipDirection;
        element.removeAttribute("tabindex");
        element.onfocus = element.onblur = null;
        if (!rows.length) continue;
        const table = root.ownerDocument.createElement("table");
        table.className = "aa-defense-reductions";
        table.setAttribute("aria-label", `Réductions — ${DEFENSE_ZONE_LABELS[zone]}`);
        const body = table.createTBody();
        for (const { label, amount } of rows) {
            const row = body.insertRow();
            const name = root.ownerDocument.createElement("th");
            name.scope = "row";
            name.textContent = label;
            row.append(name);
            const number = row.insertCell();
            number.className = "aa-defense-reduction-amount";
            number.textContent = `−${amount}`;
            const unit = row.insertCell();
            unit.className = "aa-defense-reduction-unit";
            unit.textContent = "Dgts";
        }
        element.dataset.tooltipHtml = table.outerHTML;
        element.dataset.tooltipClass = "aa-defense-tooltip";
        element.dataset.tooltipDirection = "UP";
        element.tabIndex = 0;
        element.onfocus = () => game.tooltip.activate(element);
        element.onblur = () => { if (game.tooltip.element === element) game.tooltip.deactivate(); };
    }
}

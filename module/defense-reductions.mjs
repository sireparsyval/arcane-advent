export const DEFENSE_ZONE_LABELS = Object.freeze({ head: "Tête", torso: "Torse", arms: "Bras", legs: "Jambes" });

const PHYSICAL_TYPES = new Map([
    ["slashing", "Tranchants"], ["tranchant", "Tranchants"], ["tranchants", "Tranchants"],
    ["piercing", "Perforants"], ["perforant", "Perforants"], ["perforants", "Perforants"],
    ["bludgeoning", "Contondants"], ["contondant", "Contondants"], ["contondants", "Contondants"]
]);

function addDamageReductions(totals, damageReductions) {
    for (const [type, value] of Object.entries(damageReductions ?? {})) {
        const amount = Number(value);
        if (!Number.isFinite(amount) || amount <= 0) continue;
        const name = type.trim().replace(/\s+/g, " ").normalize("NFC");
        if (!name) continue;
        const label = PHYSICAL_TYPES.get(name.toLocaleLowerCase("fr")) ?? name;
        const key = label.toLocaleLowerCase("fr");
        for (const rows of totals) {
            const previous = rows.get(key);
            rows.set(key, { label: previous?.label ?? label, amount: (previous?.amount ?? 0) + amount });
        }
    }
}

export function defenseReductionsByZone(items, effects = []) {
    const totals = Object.fromEntries(Object.keys(DEFENSE_ZONE_LABELS).map(zone => [zone, new Map()]));
    for (const item of items) {
        if (item.type !== "protection" || !item.system?.equipped) continue;
        const zones = item.system.zones;
        if (!(zones instanceof Set) && !Array.isArray(zones)) continue;
        const covered = [...new Set(zones)].filter(zone => Object.hasOwn(totals, zone));
        addDamageReductions(covered.map(zone => totals[zone]), item.system.damageReductions);
    }
    for (const effect of effects) {
        if (!["reduction", "resistance"].includes(effect.kind) || effect.enabled === false || effect.active === false || effect.amountError) continue;
        const zones = effect.damageZone === "all" || !effect.damageZone ? Object.keys(totals) : [effect.damageZone];
        const covered = zones.filter(zone => Object.hasOwn(totals, zone)).map(zone => totals[zone]);
        if (effect.kind === "resistance") {
            const amount = Number(effect.amount);
            if (!Number.isFinite(amount) || amount <= 0 || amount > 100) continue;
            const name = (effect.damageType?.trim() || "Tous types").replace(/\s+/g, " ").normalize("NFC");
            const label = PHYSICAL_TYPES.get(name.toLocaleLowerCase("fr")) ?? name;
            const key = "resistance:" + label.toLocaleLowerCase("fr");
            for (const rows of covered) {
                const previous = rows.get(key);
                rows.set(key, { label: previous?.label ?? label, amount: Math.max(previous?.amount ?? 0, amount), percent: true });
            }
        } else addDamageReductions(covered, { [effect.damageType?.trim() || "Tous types"]: effect.amount });
    }
    return Object.fromEntries(Object.entries(totals).map(([zone, rows]) => [zone, [...rows.values()]]));
}

export function shieldDamageReductions(items) {
    const totals = new Map();
    for (const item of items) {
        if (item.type !== "shield" || !item.system?.equipped) continue;
        addDamageReductions([totals], item.system.damageReductions);
    }
    return [...totals.values()];
}

// Build with textContent so free-form damage names stay text in the native
// tooltip. A single table keeps amounts and units aligned across all rows.
export function bindDefenseReductionTooltips(root, items, effects = []) {
    const equipment = Array.from(items);
    const byZone = defenseReductionsByZone(equipment, effects);
    const shieldRows = shieldDamageReductions(equipment);
    for (const element of root.querySelectorAll("[data-defense-zone], [data-defense-shield]")) {
        const shield = element.hasAttribute("data-defense-shield");
        const rows = shield ? shieldRows : (byZone[element.dataset.defenseZone] ?? []);
        const label = shield ? "Bouclier" : DEFENSE_ZONE_LABELS[element.dataset.defenseZone];
        delete element.dataset.tooltipHtml;
        delete element.dataset.tooltipClass;
        delete element.dataset.tooltipDirection;
        element.removeAttribute("tabindex");
        element.onfocus = element.onblur = null;
        if (!rows.length) continue;
        const table = root.ownerDocument.createElement("table");
        table.className = "aa-defense-reductions";
        table.setAttribute("aria-label", `Réductions — ${label}`);
        const body = table.createTBody();
        for (const { label, amount, percent } of rows) {
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
            unit.textContent = percent ? "%" : "Dgts";
        }
        element.dataset.tooltipHtml = table.outerHTML;
        element.dataset.tooltipClass = "aa-defense-tooltip";
        element.dataset.tooltipDirection = "UP";
        element.tabIndex = 0;
        element.onfocus = () => game.tooltip.activate(element);
        element.onblur = () => { if (game.tooltip.element === element) game.tooltip.deactivate(); };
    }
}

export function equipmentAllowsGuard(item) {
    if (item?.type === "shield") return Boolean(item.system?.guardEnabled);
    if (item?.type !== "weapon") return false;
    const properties = item.system?.properties;
    return properties instanceof Set ? properties.has("guard") : Boolean(properties?.includes("guard"));
}

export function equippedGuardItems(items) {
    return Array.from(items ?? []).filter(item => item.system?.equipped && equipmentAllowsGuard(item));
}

export function canRollGuard(actor, item) {
    const equipped = equippedGuardItems(actor?.items);
    return actor?.system?.defense?.stance === "defend" && equipped.length === 1 && equipped[0] === item;
}

// Une seule source de calcul pour la Défense passive de Garde et son JS actif.
export function guardValues(item, { strengthModifier, dexterityModifier, constitutionModifier, expertiseBonus }) {
    if (!item?.system?.equipped || !equipmentAllowsGuard(item)) return null;

    const savingThrowModifier = item.type === "weapon"
        ? strengthModifier + dexterityModifier + expertiseBonus
        : strengthModifier + constitutionModifier + item.system.defenseBonus + expertiseBonus;

    return {
        defense: 10 + savingThrowModifier,
        savingThrowModifier
    };
}

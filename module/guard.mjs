// Une seule source de calcul pour la Défense passive de Garde et son JS actif.
// Les effets des postures et la résolution des attaques restent à la table.
export function guardValues(item, { strengthModifier, dexterityModifier, constitutionModifier, expertiseBonus }) {
    if (!item?.system?.equipped) return null;

    let savingThrowModifier;
    const properties = item.system.properties;
    const weaponGuard = properties instanceof Set ? properties.has("guard") : properties?.includes("guard");
    if (item.type === "weapon" && weaponGuard) {
        savingThrowModifier = strengthModifier + dexterityModifier + expertiseBonus;
    } else if (item.type === "shield" && item.system.guardEnabled) {
        savingThrowModifier = strengthModifier + constitutionModifier
            + item.system.defenseBonus + expertiseBonus;
    } else {
        return null;
    }

    return {
        defense: 10 + savingThrowModifier,
        savingThrowModifier
    };
}

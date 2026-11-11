// Une seule source de calcul pour la Défense passive de Garde et son JS actif.
// Les effets des postures et la résolution des attaques restent à la table.
export function guardValues(item, { strengthModifier, dexterityModifier, constitutionModifier, expertiseBonus }) {
    if (!item?.system?.equipped || !item.system.guardEnabled) return null;

    let savingThrowModifier;

    if (item.type === "weapon" && item.system.properties?.has("twoHanded")) {
        // Une arme de Garde à deux mains pénalise uniquement la DEX négative.
        savingThrowModifier = strengthModifier
            + Math.min(dexterityModifier, 0)
            + expertiseBonus;
    }
    else if (item.type === "shield") {
        // Un bouclier de Garde subit uniquement le malus de CON négative.
        savingThrowModifier = strengthModifier
            + Math.min(constitutionModifier, 0)
            + item.system.defenseBonus
            + expertiseBonus;
    }
    else return null;

    return {
        defense: 10 + savingThrowModifier,
        savingThrowModifier
    };
}

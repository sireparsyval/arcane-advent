// Une seule source de calcul pour la Défense passive de Garde et son JS actif.
// Les effets des postures et la résolution des attaques restent à la table.
export function guardValues(item, { strengthModifier, dexterityModifier, expertiseBonus }) {
    if (!item?.system?.equipped || !item.system.guardEnabled) return null;

    let savingThrowModifier;

    if (item.type === "weapon" && item.system.properties?.has("twoHanded")) {
        // Une arme de Garde à deux mains pénalise uniquement la DEX négative.
        savingThrowModifier = strengthModifier
            + Math.min(dexterityModifier, 0)
            + expertiseBonus;
    }
    else if (item.type === "shield") {
        // En Garde, le bouclier apporte sa Défense en plus de la FOR et de l'Expertise.
        // Aucun modificateur de CON n'est impliqué dans cette formule.
        savingThrowModifier = strengthModifier
            + item.system.defenseBonus
            + expertiseBonus;
    }
    else return null;

    return {
        defense: 10 + savingThrowModifier,
        savingThrowModifier
    };
}

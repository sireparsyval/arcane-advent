export const COMBAT_STANCES = Object.freeze({
    dodge: { label: "Esquive", ability: "dexterity", saveLabel: "Dextérité" },
    defend: { label: "Se Défendre", ability: "constitution", saveLabel: "Constitution" }
});

export function combatStanceEffects(stance) {
    if (!Object.hasOwn(COMBAT_STANCES, stance)) return [];
    const { label, ability } = COMBAT_STANCES[stance];
    return [{ kind: "roll", scope: "save", ability, enabled: true,
        amount: 0, advantage: true, disadvantage: false, sourceName: label }];
}

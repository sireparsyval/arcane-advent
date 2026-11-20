export const COMBAT_STANCES = Object.freeze({
    dodge: {
        label: "Esquive", ability: "dexterity", saveLabel: "Dextérité",
        disadvantageAbility: "constitution", disadvantageSaveLabel: "Constitution"
    },
    defend: {
        label: "Se Défendre", ability: "constitution", saveLabel: "Constitution",
        disadvantageAbility: "dexterity", disadvantageSaveLabel: "Dextérité"
    }
});

export function combatStanceEffects(stance) {
    if (!Object.hasOwn(COMBAT_STANCES, stance)) return [];
    const { label, ability, disadvantageAbility } = COMBAT_STANCES[stance];
    const common = { kind: "roll", scope: "save", enabled: true, amount: 0, sourceName: label };
    return [
        { ...common, ability, advantage: true, disadvantage: false },
        { ...common, ability: disadvantageAbility, advantage: false, disadvantage: true }
    ];
}

// Les six caractéristiques sont modifiées avant la conversion en modificateur.
// Les quatre Trackers reçoivent leur ajustement après leur calcul habituel.
export const MODIFIER_TARGETS = Object.freeze({
    strength: "Force",
    dexterity: "Dextérité",
    constitution: "Constitution",
    intelligence: "Intelligence",
    wisdom: "Sagesse",
    charisma: "Charisme",
    defense: "Défense",
    passivePerception: "Perception passive",
    initiative: "Initiative",
    speed: "Vitesse"
});

export const ABILITY_MODIFIER_KEYS = Object.freeze([
    "strength", "dexterity", "constitution", "intelligence", "wisdom", "charisma"
]);

export const TRACKER_MODIFIER_KEYS = Object.freeze([
    "defense", "passivePerception", "initiative", "speed"
]);

export const CONDITION_MODIFIER_TYPES = Object.freeze(["alteration", "injury"]);

export function modifierSchema({ persisted = true } = {}) {
    const { SchemaField, NumberField } = foundry.data.fields;
    return new SchemaField(Object.fromEntries(
        Object.keys(MODIFIER_TARGETS).map(key => [
            key, new NumberField({
                required: true, nullable: false, initial: 0,
                integer: key !== "speed", persisted
            })
        ])
    ), { persisted });
}

export function modifierTotals(manual, items) {
    const totals = Object.fromEntries(Object.keys(MODIFIER_TARGETS).map(key => [key, Number(manual?.[key]) || 0]));
    for (const item of items ?? []) {
        if (!CONDITION_MODIFIER_TYPES.includes(item.type)) continue;
        for (const key of Object.keys(MODIFIER_TARGETS)) {
            totals[key] += Number(item.system.modifiers?.[key]) || 0;
        }
    }
    return totals;
}

// Même conversion qu'avant, mais après ajout des bonus/malus au score.
export function abilityScoreModifier(base, adjustment = 0) {
    return Math.floor((base + adjustment - 10) / 2);
}

export function signedModifier(value) {
    return value > 0 ? `+${value}` : String(value);
}

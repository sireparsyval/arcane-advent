import { activeCharacterEffects, resolveRollEffects } from "./character-effects.mjs";

export function unarmedDamage(actor) {
    const saved = actor.getFlag?.("arcane-advent", "unarmedDamage") ?? {};
    const ability = ["strength", "dexterity", "best"].includes(saved.ability) ? saved.ability : "strength";
    const ids = new Set(saved.expertiseIds ?? []);
    const expertise = [...actor.items].filter(item => item.type === "expertise" && ids.has(item.id))
        .reduce((total, item) => total + (Number(item.system.bonus) || 0), 0);
    const strength = actor.system.abilities.strength.modifier, dexterity = actor.system.abilities.dexterity.modifier;
    const modifier = ability === "best" ? Math.max(strength, dexterity) : ability === "dexterity" ? dexterity : strength;
    return { ability, expertiseIds: [...ids], bonusAction: Boolean(saved.bonusAction), damage: 1 + modifier + expertise, bonusDamage: 1 + expertise };
}

export function equippedAttackShortcuts(actor) {
    return [...actor.items].filter(item => item.type === "weapon" && item.system.equipped)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(weapon => {
            const ability = actor.getWeaponAbilityData(weapon), properties = new Set(weapon.system.properties);
            const bonus = actor.getExpertiseBonus("weaponClass", weapon.system.weaponClass, weapon)
                + resolveRollEffects(activeCharacterEffects(actor), { type: "attack", ability: ability.key }).bonus;
            const total = ability.modifier + bonus;
            return { id: weapon.id, name: weapon.name, attack: total >= 0 ? `+${total}` : String(total),
                icon: properties.has("thrown") ? "🗡️" : properties.has("ammunition") ? "🏹" : "⚔️",
                formula: weapon.system.damageFormula, versatile: properties.has("versatile") ? weapon.system.versatile.damageFormula : "",
                light: properties.has("light") };
        });
}

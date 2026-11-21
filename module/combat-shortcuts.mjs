import { activeCharacterEffects, applyStatisticEffects, resolveRollEffects } from "./character-effects.mjs";

export function unarmedDamage(actor) {
    const rules = activeCharacterEffects(actor);
    return { damage: applyStatisticEffects(1 + actor.system.abilities.strength.modifier, "unarmedDamage", rules) };
}

export function weaponAttackIcon(weapon) {
    const properties = new Set(weapon.system.properties ?? []);
    return properties.has("thrown") ? "🗡️" : properties.has("ammunition") ? "🏹" : "⚔️";
}

export function equippedAttackShortcuts(actor) {
    return [...actor.items].filter(item => item.type === "weapon" && item.system.equipped)
        .sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0)).map(weapon => {
            const ability = actor.getWeaponAbilityData(weapon), properties = new Set(weapon.system.properties);
            const bonus = actor.getExpertiseBonus("weaponClass", weapon.system.weaponClass, weapon)
                + resolveRollEffects(activeCharacterEffects(actor), { type: "attack", ability: ability.key }).bonus;
            const total = ability.modifier + bonus;
            return { id: weapon.id, name: weapon.name, attack: total >= 0 ? `+${total}` : String(total),
                icon: weaponAttackIcon(weapon),
                formula: weapon.system.damageFormula?.trim() ?? "",
                versatile: properties.has("versatile") ? weapon.system.versatile.damageFormula.trim() : "",
                hasVersatile: properties.has("versatile"),
                light: properties.has("light") };
        });
}

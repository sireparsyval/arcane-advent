export function weaponAttackRestrictions(actor, weapon) {
    const properties = new Set(weapon.system.properties ?? []), reasons = [];
    const ability = actor.getWeaponAbilityData(weapon);
    const score = actor.system.abilities[ability.key];
    if (properties.has("heavy") && (score.effective ?? score.value) < weapon.system.heavy.strengthRequirement) {
        reasons.push("Caractéristique inférieure au minimum de l’arme Lourde");
    }
    if (properties.has("twoHanded") && [...actor.items].some(other => other.id !== weapon.id && other.system.equipped
        && (other.type === "shield" || (other.type === "weapon" && !other.system.corporeal)))) {
        reasons.push("Deux mains : autre arme ou bouclier équipé");
    }
    return { disadvantage: reasons.length > 0, reasons };
}

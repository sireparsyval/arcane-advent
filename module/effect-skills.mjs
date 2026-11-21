import { activeCharacterEffects, EFFECT_ABILITIES, resolveRollEffects, rollRuleMatches } from "./character-effects.mjs";
import { signedModifier } from "./modifiers.mjs";

const abbreviations = { strength: "FOR", dexterity: "DEX", constitution: "CON", intelligence: "INT", wisdom: "SAG", charisma: "CHA" };
const abilityOrder = Object.keys(EFFECT_ABILITIES);
const normalized = value => String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");

// These are temporary, untrained tests. No Skill Item or mastery is created.
export function effectSkillRows(actor, { mode = actor.system.rollMode ?? "normal" } = {}) {
    const rules = activeCharacterEffects(actor);
    const skills = [...(actor.items ?? [])].filter(item => item.type === "skill");
    const groups = new Map();
    for (const rule of rules) {
        if (rule.kind !== "roll" || !["skill", "all"].includes(rule.scope) || !rule.skill?.trim()) continue;
        const reference = rule.skill.trim();
        const key = normalized(reference);
        // Every Skill Item is already listed under masteries, even with a zero bonus.
        if (skills.some(item => item.id === reference || normalized(item.name) === key)) continue;
        if (!groups.has(key)) groups.set(key, { name: reference, abilities: new Set() });
        const group = groups.get(key);
        const ability = rule.ability;
        if (Object.hasOwn(EFFECT_ABILITIES, ability)) group.abilities.add(ability);
    }
    const rows = [];
    for (const group of groups.values()) {
        for (const ability of group.abilities.size ? group.abilities : [""]) {
            const context = { type: "skill", ability, skillName: group.name, skillId: group.skillId };
            // Ignore an inferred ability if none of the named effects applies to this test.
            if (!rules.some(rule => rule.skill?.trim() && rollRuleMatches(rule, context))) continue;
            const effects = resolveRollEffects(rules, context, mode);
            const modifier = actor.system.abilities?.[ability]?.modifier;
            const canRoll = Boolean(ability) && Number.isFinite(modifier);
            const total = canRoll ? modifier + effects.bonus : null;
            rows.push({ key: encodeURIComponent(JSON.stringify([normalized(group.name), ability, group.skillId ?? ""])),
                name: group.name, skillId: group.skillId, ability, abilityLabel: abbreviations[ability] ?? "—",
                modifier, total, totalLabel: canRoll ? signedModifier(total) : "—", canRoll,
                mode: effects.mode, indicator: effects.mode === "advantage" ? "✔️" : effects.mode === "disadvantage" ? "❌" : "",
                status: effects.mode === "advantage" ? "Avantage" : effects.mode === "disadvantage" ? "Désavantage" : "Neutre" });
        }
    }
    return rows.sort((a, b) => (a.ability ? abilityOrder.indexOf(a.ability) : abilityOrder.length)
        - (b.ability ? abilityOrder.indexOf(b.ability) : abilityOrder.length)
        || a.name.localeCompare(b.name, "fr", { sensitivity: "base" }));
}

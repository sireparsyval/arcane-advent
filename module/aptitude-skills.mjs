import { activeCharacterEffects } from "./character-effects.mjs";

const normalize = name => String(name ?? "").trim().replace(/\s+/gu, " ")
    .normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
const skills = actor => Array.from(actor.items?.values?.() ?? actor.items ?? []).filter(item => item.type === "skill");

export function aptitudeSkillData(actor, config = {}) {
    const name = String(config.skillName ?? "").trim();
    const entries = skills(actor);
    const skill = entries.find(item => item.id === config.skillId)
        ?? (name ? entries.find(item => normalize(item.name) === normalize(name)) : undefined);
    return { skillName: skill?.name ?? name, skillId: skill?.id ?? "", mastery: Number(skill?.system?.mastery) || 0 };
}

export function aptitudeSkillSuggestions(actor) {
    const names = new Map(skills(actor).map(item => [normalize(item.name), item.name]));
    for (const rule of actor.system ? activeCharacterEffects(actor) : []) {
        if (rule.kind !== "roll" || !["all", "skill", "aptitude"].includes(rule.scope) || !rule.skill?.trim()) continue;
        const name = rule.skill.trim();
        if (!names.has(normalize(name))) names.set(normalize(name), name);
    }
    return [...names.values()].sort((a, b) => a.localeCompare(b, "fr", { sensitivity: "base" }));
}

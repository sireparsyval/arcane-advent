import { MODIFIER_TARGETS } from "./modifiers.mjs";
import { combatStanceEffects } from "./combat-stances.mjs";
import { aptitudeConditionStatus } from "./aptitude-conditions.mjs";
import { resolveEffectAmount } from "./effect-amounts.mjs";

export const EFFECT_ROLL_SCOPES = Object.freeze({
    all: "Tous les jets de d20", ability: "Tests de caractéristique", save: "Jets de sauvegarde",
    skill: "Tests de compétence", attack: "Jets d'attaque", initiative: "Initiative",
    guard: "Jets de Garde", aptitude: "Jets d'aptitude", death: "Contre-la-Mort"
});
export const EFFECT_ACTIVATIONS = Object.freeze({
    always: "Permanent — tant que cette source est présente",
    passive: "Seulement si l'aptitude est passive",
    manual: "Activation manuelle", conditions: "Automatique selon les conditions",
    duration: "Pendant la durée d'effet restante de l'aptitude"
});
export const EFFECT_ABILITIES = Object.freeze({ strength: "Force", dexterity: "Dextérité",
    constitution: "Constitution", intelligence: "Intelligence", wisdom: "Sagesse", charisma: "Charisme" });
export const EFFECT_STAT_TARGETS = Object.freeze({ ...MODIFIER_TARGETS,
    unarmedDamage: "Dégâts sans arme",
    carryingCapacity: "Charge maximale (kg)", consciousnessMax: "PdC — maximum",
    feverMax: "PdF — maximum", consciousnessDiceMax: "Dés de Conscience — maximum" });
export const EFFECT_DAMAGE_ZONES = Object.freeze({ all: "Globale", head: "Tête", torso: "Torse", arms: "Bras", legs: "Jambes" });

export function newEffectRule(kind = "stat") {
    return { label: "", enabled: true, kind, target: "strength", amount: 0, amountFormula: "", coefficient: 1,
        addBefore: false, scope: "all", ability: "", skill: "", advantage: false, disadvantage: false,
        activationMode: "always", conditionMode: "selected", conditionIds: [], conditionMatch: "all",
        damageType: "", damageZone: "all" };
}

export function sourceConditionsSatisfied(actor, system) {
    const conditions = Object.values(system.conditions ?? {});
    if (!conditions.length) return false;
    const values = conditions.map(condition => aptitudeConditionStatus(actor, condition));
    return system.conditionMatch === "any" ? values.some(Boolean) : values.every(Boolean);
}

export function effectRuleSettings(source, rule) {
    const independent = Object.hasOwn(EFFECT_ACTIVATIONS, rule.activationMode);
    if (independent || rule.conditionMode === "selected") {
        return { ...rule, enabled: rule.enabled !== false,
            activationMode: independent ? rule.activationMode === "manual" ? "always" : rule.activationMode : "conditions",
            conditionMode: "selected", conditionIds: Array.from(rule.conditionIds ?? []),
            conditionMatch: rule.conditionMatch ?? "all" };
    }
    // Transfer the old shared settings into each legacy effect without mutating stored data.
    const system = source.system ?? {};
    const activation = system.effectActivation ?? {};
    const mode = activation.mode ?? (source.type === "aptitude" ? "passive" : "always");
    const ids = mode === "conditions" ? Object.keys(system.conditions ?? {}) : [];
    return { ...rule,
        enabled: rule.enabled !== false && activation.enabled !== false
            && (mode !== "manual" || Boolean(activation.active)) && (mode !== "conditions" || ids.length > 0),
        activationMode: mode === "manual" ? "always" : mode, conditionMode: "selected",
        conditionIds: ids, conditionMatch: system.conditionMatch ?? "all" };
}

export function effectRuleActive(actor, source, rule) {
    const settings = effectRuleSettings(source, rule);
    if (!settings.enabled) return false;
    switch (settings.activationMode) {
        case "always": return true;
        case "passive": return source.type === "aptitude" && source.system?.category === "passive";
        case "duration": return source.type === "aptitude" && Boolean(source.system?.effectDuration?.enabled)
            && source.system.effectDuration.remaining > 0;
        case "conditions": {
            if (!settings.conditionIds.length) return true;
            const conditions = source.system?.conditions ?? {};
            const values = settings.conditionIds.map(id => Object.hasOwn(conditions, id)
                && aptitudeConditionStatus(actor, conditions[id]));
            return settings.conditionMatch === "any" ? values.some(Boolean) : values.every(Boolean);
        }
        default: return false;
    }
}

export function effectSourceActive(actor, source) {
    return Object.values(source.system?.effectRules ?? {}).some(rule => effectRuleActive(actor, source, rule));
}

// Conditions always inspect the pre-Trait/Aptitude snapshot, never their own result.
export function conditionActor(actor) {
    const snapshot = actor?.system?.effectSnapshot;
    return snapshot?.abilities ? { system: snapshot, items: actor.items } : actor;
}

export function characterEffectSources(actor) {
    if (!actor) return [];
    const viewer = conditionActor(actor);
    return [{ id: "actor", name: "Effets permanents du personnage", type: "character", system: actor.system },
        ...[...(actor.items ?? [])].filter(item => ["trait", "aptitude"].includes(item.type))]
        .map(source => ({ source, active: effectSourceActive(viewer, source),
            rules: Object.entries(source.system.effectRules ?? {}).map(([id, rule]) => {
                const settings = effectRuleSettings(source, rule);
                const amount = resolveEffectAmount(actor, settings);
                return { id, ...settings, amount: amount.value, amountResolved: true, amountError: amount.error,
                    active: !amount.error && effectRuleActive(viewer, source, settings) };
            }) }));
}

export function activeCharacterEffects(actor) {
    const effects = characterEffectSources(actor).filter(entry => entry.active).flatMap(({ source, rules }) =>
        rules.filter(rule => rule.active).map(rule => ({ ...rule, sourceId: source.id,
            sourceName: source.name, sourceType: source.type })));
    return [...effects, ...combatStanceEffects(actor?.system?.defense?.stance)];
}

// All additions before multiplication, then all coefficients, then additions after.
// Results are independent of item order and recalculated from stored base values.
export function applyStatisticEffects(base, target, rules = [], { integer = true, min = -Infinity } = {}) {
    let before = 0, after = 0, coefficient = 1;
    for (const rule of rules) {
        if (rule.enabled === false || rule.kind !== "stat" || rule.target !== target) continue;
        const amount = Number(rule.amount), factor = Number(rule.coefficient ?? 1);
        if (!Number.isFinite(amount) || !Number.isFinite(factor) || factor < 0) continue;
        if (rule.addBefore) before += amount;
        else after += amount;
        coefficient *= factor;
    }
    const result = (Number(base) + before) * coefficient + after;
    if (!Number.isFinite(result)) return Number(base) || 0;
    return Math.max(min, integer ? Math.floor(result) : result);
}

function normalize(value) {
    return String(value ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLocaleLowerCase("fr");
}

export function rollRuleMatches(rule, context = {}) {
    if (rule.kind !== "roll" || rule.enabled === false) return false;
    // Garde is a saving throw; initiative is also a Dexterity check.
    const scopes = new Set(["all", context.type]);
    if (context.type === "guard") scopes.add("save");
    if (context.type === "initiative") scopes.add("ability");
    if (!scopes.has(rule.scope ?? "all")) return false;
    const abilities = context.abilities ?? (context.ability ? [context.ability] : []);
    if (rule.ability && !abilities.includes(rule.ability)) return false;
    if (rule.skill && ![context.skillId, context.skillName].some(value => value && normalize(value) === normalize(rule.skill))) return false;
    return true;
}

export function resolveRollEffects(rules = [], context = {}, mode = "normal") {
    let advantage = mode === "advantage", disadvantage = mode === "disadvantage", bonus = 0;
    const sources = [];
    for (const rule of rules) {
        if (!rollRuleMatches(rule, context)) continue;
        advantage ||= Boolean(rule.advantage);
        disadvantage ||= Boolean(rule.disadvantage);
        const amount = Number(rule.amount);
        if (Number.isFinite(amount)) bonus += amount;
        sources.push(rule.sourceName ? `${rule.sourceName}${rule.label ? ` : ${rule.label}` : ""}` : rule.label || "Effet permanent");
    }
    return { advantage, disadvantage, bonus, sources,
        mode: advantage === disadvantage ? "normal" : advantage ? "advantage" : "disadvantage" };
}

export function effectRuleSummary(rule, { compact = false, actor = null } = {}) {
    const resolved = actor ? resolveEffectAmount(actor, rule) : null;
    const error = resolved?.error || rule.amountError;
    if (error) return "Bonus / malus indisponible : " + error;
    const value = resolved?.value ?? rule.amount;
    const reference = rule.amountFormula && !actor && !rule.amountResolved ? rule.amountFormula : "";
    const signed = value => Number(value) > 0 ? `+${Number(value)}` : String(Number(value) || 0);
    if (["reduction", "resistance"].includes(rule.kind)) return `${rule.kind === "resistance" ? "Résistance" : "Réduction"} : ${rule.damageType?.trim() || "Tous types"} · −${reference || value || 0} ${rule.kind === "resistance" ? "%" : "Dgts"} · ${EFFECT_DAMAGE_ZONES[rule.damageZone ?? "all"]}`;
    if (rule.kind === "roll") {
        const namedSkill = compact && rule.scope === "skill" && rule.skill?.trim();
        const pieces = namedSkill ? [] : [EFFECT_ROLL_SCOPES[rule.scope] ?? EFFECT_ROLL_SCOPES.all];
        if (rule.ability) pieces.push(EFFECT_ABILITIES[rule.ability]);
        if (rule.skill) pieces.push(rule.skill);
        if (reference) pieces.push(reference);
        else if (value) pieces.push(signed(value));
        if (rule.advantage) pieces.push("Avantage");
        if (rule.disadvantage) pieces.push("Désavantage");
        if (rule.advantage && rule.disadvantage) pieces.push("→ Neutre");
        return pieces.join(" · ");
    }
    const amount = reference ? `+ (${reference})` : signed(value), factor = Number(rule.coefficient ?? 1);
    const formula = rule.addBefore ? `(base ${amount}) × ${factor}` : `base × ${factor} ${amount}`;
    return `${EFFECT_STAT_TARGETS[rule.target] ?? rule.target} : ${formula}`;
}

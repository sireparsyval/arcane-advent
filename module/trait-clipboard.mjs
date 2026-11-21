import { newEffectRule } from "./character-effects.mjs";

const FORMAT = "arcane-advent.trait-parameters";
const forbidden = new Set(["__proto__", "prototype", "constructor"]);
const plain = value => value && typeof value === "object" && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const invalid = () => Error("Le presse-papiers ne contient pas des paramètres de Trait valides.");

function checkKeys(value) {
    if (!value || typeof value !== "object") return;
    for (const key of Object.keys(value)) {
        if (forbidden.has(key)) throw invalid();
        checkKeys(value[key]);
    }
}
function fields(value, defaults) {
    if (!plain(value)) throw invalid();
    return Object.fromEntries(Object.entries(defaults).map(([key, fallback]) => {
        const entry = Object.hasOwn(value, key) ? value[key] : fallback;
        if (Array.isArray(fallback)) {
            if (!Array.isArray(entry) || entry.some(id => typeof id !== "string")) throw invalid();
            return [key, [...entry]];
        }
        if (typeof entry !== typeof fallback || (typeof entry === "number" && !Number.isFinite(entry))) throw invalid();
        return [key, entry];
    }));
}
function parameters(value) {
    if (!plain(value)) throw invalid();
    checkKeys(value);
    const result = fields(value, { name: "", description: "", requirements: "", conditionMatch: "all" });
    if (!["all", "any"].includes(result.conditionMatch) || !plain(value.effectRules) || !plain(value.conditions)) throw invalid();
    result.effectRules = Object.fromEntries(Object.entries(value.effectRules).map(([id, rule]) => {
        if (!plain(rule) || !["stat", "roll", "reduction", "resistance"].includes(rule.kind)) throw invalid();
        return [id, fields(rule, newEffectRule(rule.kind))];
    }));
    result.conditions = Object.fromEntries(Object.entries(value.conditions).map(([id, condition]) => {
        if (!plain(condition) || !["manual", "automatic"].includes(condition.kind)) throw invalid();
        return [id, fields(condition, { label: "", kind: "manual", enabled: false, metric: "pdcRatio", operator: "<",
            value: 50, key: "", expression: "", consumes: false })];
    }));
    return result;
}

export function serializeTraitParameters(draft) {
    return JSON.stringify({ type: FORMAT, version: 1, parameters: parameters(draft) });
}
export function parseTraitParameters(text) {
    if (typeof text !== "string" || text.length > 1000000) throw invalid();
    let data;
    try { data = JSON.parse(text); } catch { throw invalid(); }
    if (data?.type !== FORMAT || data.version !== 1) throw invalid();
    return parameters(data.parameters);
}

function clipboardNavigator() {
    return globalThis.foundry?.applications?.detached?.focused?.navigator ?? globalThis.navigator;
}
export function createTraitParameterClipboard({
    writeText = text => {
        if (globalThis.game?.clipboard?.copyPlainText) return game.clipboard.copyPlainText(text);
        if (clipboardNavigator()?.clipboard?.writeText) return clipboardNavigator().clipboard.writeText(text);
        throw Error("Presse-papiers système indisponible.");
    },
    readText = () => {
        if (clipboardNavigator()?.clipboard?.readText) return clipboardNavigator().clipboard.readText();
        throw Error("Presse-papiers système indisponible.");
    }
} = {}) {
    let memory = "", sessionOnly = false;
    return {
        async copy(draft) {
            const text = serializeTraitParameters(draft);
            memory = text;
            try { await writeText(text); sessionOnly = false; }
            catch { sessionOnly = true; }
            return { sessionOnly };
        },
        async paste() {
            let text = memory;
            if (!sessionOnly) {
                try { text = await readText(); }
                catch { if (!memory) throw Error("Copiez d’abord les paramètres d’un Trait."); }
            }
            if (!text) throw Error("Copiez d’abord les paramètres d’un Trait.");
            return parseTraitParameters(text);
        }
    };
}
export const traitParameterClipboard = createTraitParameterClipboard();

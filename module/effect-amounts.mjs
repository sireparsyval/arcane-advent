const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const REFERENCE = /^([+-]?)\s*@?([a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_-]+)*)$/;
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);

export function fixedEffectAmount(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    return NUMBER.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
}

function referenceValue(actor, rule, reference) {
    const parts = reference.split(".");
    if (parts.some(key => FORBIDDEN.has(key))) throw Error("Cette référence n’est pas autorisée.");
    let data;
    if (parts[0] === "items") {
        parts.shift();
        const id = parts.shift();
        const item = actor?.items?.get?.(id) ?? [...(actor?.items ?? [])].find(entry => entry.id === id);
        if (!item || parts.shift() !== "system" || !parts.length) throw Error("Élément ou valeur introuvable : " + reference);
        data = item.system;
    } else {
        if (parts[0] === "system") parts.shift();
        // Statistical effects read the baseline, so they cannot increase their own input on each render.
        const snapshot = rule.kind === "stat" ? actor?.system?.effectSnapshot : null;
        data = snapshot && Object.hasOwn(snapshot, parts[0]) ? snapshot : actor?.system;
    }
    for (const key of parts) data = data?.[key];
    const value = typeof data === "number" || typeof data === "string" ? fixedEffectAmount(data) : null;
    if (value === null) throw Error("Référence introuvable ou non numérique : " + reference);
    return value;
}

export function resolveEffectAmount(actor, rule, { deferReferences = false } = {}) {
    try {
        const source = rule.amountFormula || String(rule.amount ?? 0);
        let value = fixedEffectAmount(source);
        if (value === null) {
            const match = REFERENCE.exec(String(source).trim());
            if (!match) throw Error("Saisissez un nombre ou une référence, par exemple @abilities.strength.modifier.");
            const parts = match[2].split(".");
            if (parts.some(key => FORBIDDEN.has(key))) throw Error("Cette référence n’est pas autorisée.");
            if (parts[0] === "items" && (parts.length < 4 || parts[2] !== "system")) {
                throw Error("Utilisez @items.ID.system.champ pour référencer un élément possédé.");
            }
            if (deferReferences) return { value: 0, error: "", pending: true };
            value = referenceValue(actor, rule, match[2]) * (match[1] === "-" ? -1 : 1);
        }
        if (!Number.isFinite(value)) throw Error("La valeur du bonus / malus n’est pas finie.");
        if (rule.kind === "roll" && !Number.isSafeInteger(value)) throw Error("Le bonus / malus au jet doit être un entier.");
        return { value, error: "" };
    } catch (error) {
        return { value: 0, error: error.message };
    }
}

const NUMBER = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
const FORBIDDEN = new Set(["__proto__", "prototype", "constructor"]);
const FUNCTIONS = Object.freeze({ min: Math.min, max: Math.max, abs: Math.abs,
    floor: Math.floor, ceil: Math.ceil, round: Math.round });

function referenceParts(reference) {
    const parts = reference.replace(/^@/, "").split(".");
    if (parts.some(key => FORBIDDEN.has(key))) throw Error("Cette référence n’est pas autorisée.");
    if (parts[0]?.toLowerCase() === "mod") {
        throw Error("Utilisez une référence complète, par exemple @abilities.dexterity.modifier.");
    }
    if (parts[0] === "items" && (parts.length < 4 || parts[2] !== "system")) {
        throw Error("Utilisez @items.ID.system.champ pour référencer un élément possédé.");
    }
    return parts;
}
export function fixedEffectAmount(value) {
    const text = String(value ?? "").trim().replace(",", ".");
    return NUMBER.test(text) && Number.isFinite(Number(text)) ? Number(text) : null;
}

function referenceValue(actor, rule, reference) {
    const parts = referenceParts(reference);
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

function evaluateAmount(source, actor, rule, deferReferences) {
    if (!source || source.length > 512) throw Error("La formule est vide ou trop longue (512 caractères maximum).");
    const tokens = [];
    let offset = 0;
    while (offset < source.length) {
        const rest = source.slice(offset);
        const space = /^\s+/.exec(rest);
        if (space) { offset += space[0].length; continue; }
        const number = /^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?/i.exec(rest);
        // Owned Item IDs may contain hyphens; ordinary '-' remains subtraction.
        const name = number ? null : /^@?items\.[a-zA-Z0-9_-]+\.system(?:\.[a-zA-Z0-9_]+)+/.exec(rest)
            ?? /^@?[a-zA-Z_][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_]+)*/.exec(rest);
        const value = number?.[0] ?? name?.[0] ?? rest[0];
        if (!number && !name && !"+-*/(),;".includes(value)) throw Error("Caractère non autorisé dans la formule.");
        tokens.push({ type: number ? "number" : name ? "name" : value, value });
        if (tokens.length > 200) throw Error("La formule contient trop d’éléments.");
        offset += value.length;
    }
    let index = 0;
    const finite = value => {
        if (value !== null && !Number.isFinite(value)) throw Error("Le résultat de la formule n’est pas fini.");
        return value;
    };
    const expression = (power = 0, depth = 0) => {
        if (depth > 32) throw Error("La formule contient trop de parenthèses ou de fonctions imbriquées.");
        const token = tokens[index++];
        let value;
        if (token?.type === "number") value = finite(Number(token.value));
        else if (token?.type === "+" || token?.type === "-") {
            const sub = expression(3, depth + 1);
            value = sub === null ? null : token.type === "-" ? -sub : sub;
        } else if (token?.type === "(") {
            value = expression(0, depth + 1);
            if (tokens[index++]?.type !== ")") throw Error("Parenthèse fermante manquante.");
        } else if (token?.type === "name") {
            if (tokens[index]?.type === "(") {
                const name = token.value;
                if (!Object.hasOwn(FUNCTIONS, name)) throw Error("Fonction inconnue : " + name);
                index++;
                const args = [];
                if (tokens[index]?.type !== ")") {
                    while (true) {
                        args.push(expression(0, depth + 1));
                        if (![",", ";"].includes(tokens[index]?.type)) break;
                        index++;
                    }
                }
                if (tokens[index++]?.type !== ")") throw Error("Arguments ou parenthèse de fonction invalides.");
                if (!args.length || (!["min", "max"].includes(name) && args.length !== 1)) {
                    throw Error("Nombre d’arguments invalide pour " + name + ".");
                }
                value = args.includes(null) ? null : finite(FUNCTIONS[name](...args));
            } else {
                referenceParts(token.value);
                value = deferReferences ? null : referenceValue(actor, rule, token.value);
            }
        } else throw Error("Nombre, référence ou fonction attendu.");
        const precedence = { "+": 1, "-": 1, "*": 2, "/": 2 };
        while (Object.hasOwn(precedence, tokens[index]?.type) && precedence[tokens[index].type] >= power) {
            const operator = tokens[index++].type;
            const right = expression(precedence[operator] + 1, depth + 1);
            if (operator === "/" && right === 0) throw Error("Division par zéro.");
            value = value === null || right === null ? null : finite(operator === "+" ? value + right
                : operator === "-" ? value - right : operator === "*" ? value * right : value / right);
        }
        return value;
    };
    const result = expression();
    if (index !== tokens.length) throw Error("Élément inattendu à la fin de la formule.");
    return result;
}

export function resolveEffectAmount(actor, rule, { deferReferences = false } = {}) {
    try {
        const source = String(rule.amountFormula || (rule.amount ?? 0)).trim();
        let value = fixedEffectAmount(source);
        if (value === null) value = evaluateAmount(source, actor, rule, deferReferences);
        if (value === null) return { value: 0, error: "", pending: true };
        if (!Number.isFinite(value)) throw Error("La valeur du bonus / malus n’est pas finie.");
        if (rule.kind === "roll" && !Number.isSafeInteger(value)) throw Error("Le bonus / malus au jet doit être un entier.");
        return { value, error: "" };
    } catch (error) {
        return { value: 0, error: error.message };
    }
}

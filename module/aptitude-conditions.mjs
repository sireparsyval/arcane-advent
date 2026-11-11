import { expertiseMatches } from "./expertise.mjs";

export const CONDITION_METRICS = Object.freeze({
    pdcRatio: "PdC (% du maximum)",
    pdfRatio: "PdF (% du maximum)",
    ability: "Caractéristique effective",
    alteration: "Altération présente",
    equipped: "Équipement porté",
    expertise: "Expertise utilisable",
    inventory: "Objet dans l'inventaire",
    luqa: "Pièces dans une bourse",
    formula: "Formule logique personnalisée"
});

const OPERATORS = {
    "<": (a, b) => a < b,
    "<=": (a, b) => a <= b,
    "=": (a, b) => a === b,
    ">=": (a, b) => a >= b,
    ">": (a, b) => a > b,
    "!=": (a, b) => a !== b
};

export function compareValues(a, operator, b) {
    return OPERATORS[operator]?.(a, b) ?? false;
}

function normalize(s) {
    return String(s ?? "").trim().toLocaleLowerCase("fr");
}

// Petit interpréteur mathématique/logique, sans eval(), sans accès au code JS.
export function evaluateAptitudeExpression(source, variables) {
    const input = String(source ?? "").trim();
    if (!input || input.length > 400) return false;
    const tokens = input.match(/\s*(?:>=|<=|==|!=|&&|\|\||(?:\d+\.?\d*|\.\d+)|[a-zA-Z_][a-zA-Z_\d]*|[()+*/!<>-])\s*/g) ?? [];
    if (tokens.join("").replace(/\s/g, "") !== input.replace(/\s/g, "")) return false;
    const parts = tokens.map(t => t.trim());
    let index = 0;
    let budget = 256;
    function expression(minPower = 0) {
        if (--budget < 0) throw Error("Trop d'opérations");
        const op = parts[index++];
        let value;
        if (op === "(") {
            value = expression();
            if (parts[index++] !== ")") throw Error("Parenthèse manquante");
        } else if (op === "!" || op === "-") {
            const sub = expression(9);
            value = op === "!" ? !sub : -sub;
        } else if (/^\d|^\.\d/.test(op ?? "")) {
            value = Number(op);
        } else if (Object.hasOwn(variables, op)) {
            value = variables[op];
        } else {
            throw Error("Variable inconnue");
        }
        const precedence = { "||": 1, "&&": 2, "==": 3, "!=": 3,
            "<": 3, "<=": 3, ">": 3, ">=": 3, "+": 4, "-": 4, "*": 5, "/": 5 };
        while (Object.hasOwn(precedence, parts[index]) && precedence[parts[index]] >= minPower) {
            const op = parts[index++];
            const right = expression(precedence[op] + 1);
            switch (op) {
                case "||": value = Boolean(value) || Boolean(right); break;
                case "&&": value = Boolean(value) && Boolean(right); break;
                case "==": value = value === right; break;
                case "!=": value = value !== right; break;
                case "<": value = value < right; break;
                case "<=": value = value <= right; break;
                case ">": value = value > right; break;
                case ">=": value = value >= right; break;
                case "+": value += right; break;
                case "-": value -= right; break;
                case "*": value *= right; break;
                case "/": if (right === 0) throw Error("Division par zéro"); value /= right; break;
            }
        }
        return value;
    }
    try {
        const result = expression();
        return index === parts.length && (typeof result === "boolean" || Number.isFinite(result))
            ? Boolean(result) : false;
    } catch {
        return false;
    }
}

export function aptitudeConditionStatus(actor, condition) {
    if (condition.kind === "manual") return Boolean(condition.enabled);
    const { metric, operator, key, value, expression } = condition;
    // Un champ libre vide ne doit jamais correspondre aux champs vides des objets.
    if (["alteration", "equipped", "expertise", "inventory"].includes(metric) && !normalize(key)) return false;
    const { consciousness, fever, abilities } = actor.system;
    const items = [...actor.items];
    const check = n => Number.isFinite(n) && compareValues(n, operator, value);
    switch (metric) {
        case "pdcRatio": return check(consciousness.max > 0 ? consciousness.value * 100 / consciousness.max : 0);
        case "pdfRatio": return check(fever.max > 0 ? fever.value * 100 / fever.max : 0);
        case "ability": return check(abilities[key]?.effective ?? NaN);
        case "alteration": {
            const has = items.some(item => item.type === "alteration" && (item.id === key || normalize(item.name) === normalize(key)));
            return compareValues(Number(has), operator, value);
        }
        case "equipped": {
            const has = items.some(item => item.system?.equipped && [
                item.name, item.system.weaponClass, item.system.shieldClass,
                item.system.armorClass, item.system.objectClass
            ].some(name => normalize(name) === normalize(key)));
            return compareValues(Number(has), operator, value);
        }
        case "expertise": {
            const has = items.some(item => item.type === "expertise"
                && (item.id === key || normalize(item.name) === normalize(key))
                && (item.system.domain === "other" || items.some(equipment => expertiseMatches(item, equipment))));
            return compareValues(Number(has), operator, value);
        }
        case "inventory": {
            const count = items.filter(item => ["object", "weapon", "shield", "protection", "accessory", "container"].includes(item.type)
                && [item.name, item.system.objectClass].some(name => normalize(name) === normalize(key)))
                .reduce((sum, item) => sum + (item.type === "object" ? item.system.quantity : 1), 0);
            return check(count);
        }
        case "luqa": {
            if (!["copper", "silver", "gold", "platinum"].includes(key)) return false;
            const denomination = key;
            const coins = items.filter(item => item.type === "purse")
                .reduce((sum, item) => sum + (item.system.coins?.[denomination] ?? 0), 0);
            return check(coins);
        }
        case "formula": {
            const vars = {
                pdc: consciousness.value, pdcMax: consciousness.max,
                pdf: fever.value, pdfMax: fever.max
            };
            for (const [code, ability] of Object.entries({
                FOR: "strength", DEX: "dexterity", CON: "constitution",
                INT: "intelligence", SAG: "wisdom", CHA: "charisma"
            })) vars[code] = abilities[ability]?.effective ?? 0;
            return evaluateAptitudeExpression(expression, vars);
        }
        default: return false;
    }
}

import { expertiseMatches } from "./expertise.mjs";

export const CONDITION_METRICS = Object.freeze({
    pdcRatio: "PdC (% du maximum)",
    pdfRatio: "PdF (% du maximum)",
    ability: "Caractéristique effective",
    alteration: "Altération présente",
    equipped: "Porte un équipement précis / une classe",
    expertise: "Expertise utilisable",
    inventory: "Objet dans l'inventaire",
    luqa: "Pièces dans une bourse",
    formula: "Expression avancée (sans code)",
    pdc: "PdC actuels", pdcMax: "PdC maximum (avant effets)",
    pdf: "PdF actuels", pdfMax: "PdF maximum (avant effets)",
    abilityBase: "Caractéristique — score de base", abilityModifier: "Caractéristique — modificateur",
    defense: "Défense de base ou partielle", tracker: "Tracker du personnage",
    encumbrance: "Inventaire — poids / capacité / encombrement",
    equipmentProperty: "Porte un équipement avec une propriété", equippedCount: "Nombre d'équipements portés",
    injury: "Blessure / maladie présente", trait: "Trait présent", aptitude: "Aptitude présente",
    skill: "Maîtrise d'une compétence", resource: "Autre ressource du personnage", volume: "Volume du personnage"
});

export const BOOLEAN_CONDITION_METRICS = Object.freeze([
    "alteration", "equipped", "expertise", "equipmentProperty", "injury", "trait", "aptitude", "volume"
]);
export const CONDITION_OPERATORS = Object.freeze({ "<": "inférieur à", "<=": "au plus",
    "=": "égal à", ">=": "au moins", ">": "supérieur à", "!=": "différent de" });
export const CONDITION_KEYS = Object.freeze({
    ability: { strength: "Force", dexterity: "Dextérité", constitution: "Constitution", intelligence: "Intelligence", wisdom: "Sagesse", charisma: "Charisme" },
    defense: { base: "Défense de base", head: "Tête", torso: "Torse", arms: "Bras", legs: "Jambes" },
    tracker: { passivePerception: "Perception passive", initiative: "Initiative", speed: "Vitesse de base", effectiveSpeed: "Vitesse effective" },
    encumbrance: { carried: "Poids transporté (kg)", maximum: "Charge maximale (kg)", percentage: "Encombrement (%)" },
    resource: { barrier: "Barrière", mercy: "Miséricorde", "consciousnessDice.value": "Dés de Conscience restants", "consciousnessDice.max": "Dés de Conscience maximum", "deathSaves.successes": "Contre-la-Mort : réussites", "deathSaves.failures": "Contre-la-Mort : échecs" },
    equipmentProperty: { twoHanded: "Deux mains", finesse: "Finesse", thrown: "Lancer", light: "Légère", heavy: "Lourde", versatile: "Polyvalente", ammunition: "Munitions" },
    equippedCount: { "*": "Tous les équipements", weapon: "Armes", shield: "Boucliers", protection: "Protections", accessory: "Accessoires" },
    luqa: { copper: "Cuivre", silver: "Argent", gold: "Or", platinum: "Platine" },
    volume: { gigantic: "Gigantesque", huge: "Très Grand", large: "Grand", medium: "Moyen", small: "Petit", verySmall: "Très Petit", tiny: "Minuscule", none: "Aucun" }
});

export function conditionKeyChoices(actor, metric) {
    const key = ["abilityBase", "abilityModifier"].includes(metric) ? "ability" : metric;
    if (CONDITION_KEYS[key]) return Object.entries(CONDITION_KEYS[key]).map(([value, label]) => ({ value, label }));
    const types = { alteration: ["alteration"], injury: ["injury"], trait: ["trait"], aptitude: ["aptitude"],
        skill: ["skill"], expertise: ["expertise"], equipped: ["weapon", "shield", "protection", "accessory"],
        inventory: ["object", "weapon", "shield", "protection", "accessory", "container", "purse"] }[metric] ?? [];
    const result = [...(actor?.items ?? [])].filter(item => types.includes(item.type))
        .map(item => ({ value: item.id, label: item.name }));
    if (["inventory", "equipped"].includes(metric)) {
        const classes = new Set([...(actor?.items ?? [])].filter(item => types.includes(item.type)).flatMap(item =>
            [item.system.weaponClass, item.system.shieldClass, item.system.armorClass, item.system.objectClass]).filter(Boolean));
        for (const value of classes) result.push({ value, label: `Classe : ${value}` });
    }
    return result;
}

export function conditionSummary(actor, condition) {
    if (condition.kind === "manual") return `${condition.label || "Condition manuelle"} : ${condition.enabled ? "validée" : "non validée"}`;
    const choice = conditionKeyChoices(actor, condition.metric).find(entry => entry.value === condition.key)?.label ?? condition.key;
    const metric = CONDITION_METRICS[condition.metric] ?? condition.metric;
    if (condition.metric === "formula") return `Expression : ${condition.expression || "à renseigner"}`;
    if (BOOLEAN_CONDITION_METRICS.includes(condition.metric)) {
        if (![0, 1].includes(Number(condition.value)) || !["=", "!="].includes(condition.operator)) return `${metric} : ancien critère à reconfigurer`;
        const present = (Number(condition.value) === 1) === (condition.operator === "=");
        return `${metric}${choice ? ` — ${choice}` : " — cible à choisir"} : ${present ? "oui" : "non"}`;
    }
    const suffix = ["pdcRatio", "pdfRatio"].includes(condition.metric) ? " %" : "";
    return `${metric}${choice ? ` — ${choice}` : ""} ${CONDITION_OPERATORS[condition.operator] ?? "?"} ${condition.value}${suffix}`;
}

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

export function aptitudeExpressionVariables(actor) {
    const system = actor.system;
    const vars = {
        pdc: system.consciousness?.value ?? 0, pdcMax: system.consciousness?.max ?? 0,
        pdf: system.fever?.value ?? 0, pdfMax: system.fever?.max ?? 0,
        defense: system.defense?.base ?? 0, defenseTete: system.defense?.zones?.head ?? 0,
        defenseTorse: system.defense?.zones?.torso ?? 0, defenseBras: system.defense?.zones?.arms ?? 0,
        defenseJambes: system.defense?.zones?.legs ?? 0,
        perception: system.trackers?.passivePerception ?? 0, initiative: system.trackers?.initiative ?? 0,
        vitesse: system.trackers?.effectiveSpeed ?? 0, poids: system.encumbrance?.carried ?? 0,
        chargeMax: system.encumbrance?.maximum ?? 0, encombrement: system.encumbrance?.percentage ?? 0,
        barriere: system.barrier ?? 0, misericorde: system.mercy ?? 0
    };
    for (const [code, ability] of Object.entries({ FOR: "strength", DEX: "dexterity", CON: "constitution", INT: "intelligence", SAG: "wisdom", CHA: "charisma" })) {
        vars[code] = system.abilities?.[ability]?.effective ?? 0;
    }
    return vars;
}

export function conditionMetricValue(actor, condition) {
    const { metric, key, expression } = condition;
    const { consciousness = {}, fever = {}, abilities = {} } = actor.system;
    const items = [...(actor.items ?? [])];
    const matches = item => item.id === key || normalize(item.name) === normalize(key);
    if (["alteration", "equipped", "expertise", "inventory", "injury", "trait", "aptitude", "skill", "equipmentProperty", "volume"].includes(metric) && !normalize(key)) return NaN;
    switch (metric) {
        case "pdc": return consciousness.value;
        case "pdf": return fever.value;
        case "pdcMax": return consciousness.max;
        case "pdfMax": return fever.max;
        case "pdcRatio": return consciousness.max > 0 ? consciousness.value * 100 / consciousness.max : 0;
        case "pdfRatio": return fever.max > 0 ? fever.value * 100 / fever.max : 0;
        case "ability": return abilities[key]?.effective ?? NaN;
        case "abilityBase": return abilities[key]?.value ?? NaN;
        case "abilityModifier": return abilities[key]?.modifier ?? NaN;
        case "defense": return key === "base" ? actor.system.defense?.base : actor.system.defense?.zones?.[key];
        case "tracker": return actor.system.trackers?.[key];
        case "encumbrance": return actor.system.encumbrance?.[key];
        case "resource": return key.split(".").reduce((data, part) => data?.[part], actor.system);
        case "volume": return Number(actor.system.identity?.volume === key);
        case "alteration": case "injury": case "trait": case "aptitude":
            return Number(items.some(item => item.type === metric && matches(item)));
        case "equipped": {
            return Number(items.some(item => item.system?.equipped && (item.id === key || [
                item.name, item.system.weaponClass, item.system.shieldClass,
                item.system.armorClass, item.system.objectClass
            ].some(name => normalize(name) === normalize(key)))));
        }
        case "equippedCount": return items.filter(item => item.system?.equipped && (key === "*" || item.type === key)).length;
        case "equipmentProperty": return Number(items.some(item => item.system?.equipped &&
            (item.system.properties?.has?.(key) || item.system.properties?.includes?.(key))));
        case "expertise": {
            const has = items.some(item => item.type === "expertise"
                && matches(item)
                && (item.system.domain === "other" || items.some(equipment => expertiseMatches(item, equipment))));
            return Number(has);
        }
        case "skill": return items.find(item => item.type === "skill" && matches(item))?.system.mastery ?? 0;
        case "inventory": {
            return items.filter(item => ["object", "weapon", "shield", "protection", "accessory", "container", "purse"].includes(item.type)
                && (matches(item) || normalize(item.system.objectClass) === normalize(key)))
                .reduce((sum, item) => sum + (item.type === "object" ? Number(item.system.quantity) || 0 : 1), 0);
        }
        case "luqa": {
            if (!["copper", "silver", "gold", "platinum"].includes(key)) return NaN;
            const denomination = key;
            return items.filter(item => item.type === "purse")
                .reduce((sum, item) => sum + (item.system.coins?.[denomination] ?? 0), 0);
        }
        case "formula": return Number(evaluateAptitudeExpression(expression, aptitudeExpressionVariables(actor)));
        default: return NaN;
    }
}

export function aptitudeConditionStatus(actor, condition) {
    if (condition.kind === "manual") return Boolean(condition.enabled);
    const value = conditionMetricValue(actor, condition);
    if (!Number.isFinite(value)) return false;
    if (condition.metric === "formula") return Boolean(value);
    if (BOOLEAN_CONDITION_METRICS.includes(condition.metric)
        && (![0, 1].includes(Number(condition.value)) || !["=", "!="].includes(condition.operator))) return false;
    return compareValues(value, condition.operator, Number(condition.value));
}

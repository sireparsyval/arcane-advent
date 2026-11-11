// Expertise : règles communes aux jets d'armes, de Garde et d'Aptitudes.
// Chaque expertise est comptée une seule fois, même si plusieurs classes correspondent.
export const WEAPON_PROPERTIES = Object.freeze({
    twoHanded: "Deux mains",
    finesse: "Finesse",
    thrown: "Lancer",
    light: "Légère",
    heavy: "Lourde",
    versatile: "Polyvalente",
    ammunition: "Munitions"
});

export const EXPERTISE_DOMAINS = Object.freeze({
    weaponClass: "Arme",
    shieldClass: "Bouclier",
    armorClass: "Protection",
    toolObject: "Outil / Objet",
    other: "Autre"
});

export const PROPERTY_FILTER_STATES = Object.freeze({
    required: "Requis",
    neutral: "Neutre",
    excluded: "À exclure"
});

export function normalizedClasses(expertise) {
    const list = expertise?.system?.classes;
    const classes = list instanceof Set || Array.isArray(list) ? [...list] : [];
    const legacy = expertise?.system?.target?.trim();
    return [...new Set((classes.length ? classes : legacy ? [legacy] : [])
        .map(name => String(name).trim()).filter(Boolean))];
}

export function itemClassForDomain(item, domain) {
    if (!item?.system) return "";
    if (domain === "weaponClass" && item.type === "weapon") return item.system.weaponClass ?? "";
    if (domain === "shieldClass" && item.type === "shield") return item.system.shieldClass ?? "";
    if (domain === "armorClass" && item.type === "protection") return item.system.armorClass ?? "";
    if (domain === "toolObject" && ["object", "container", "purse", "accessory", "weapon", "shield", "protection"].includes(item.type)) {
        // Les anciennes Expertises d'outils visaient le nom de l'objet.
        return item.system.objectClass || item.name || "";
    }
    return "";
}

export function expertiseMatches(expertise, item, { requireEquipped = true } = {}) {
    const { domain, propertyFilters } = expertise?.system ?? {};
    if (domain === "other") return true;
    if (!Object.hasOwn(EXPERTISE_DOMAINS, domain) || !item) return false;

    const className = itemClassForDomain(item, domain).trim().toLocaleLowerCase("fr");
    if (!className) return false;
    const classes = normalizedClasses(expertise).map(name => name.toLocaleLowerCase("fr"));
    if (classes.length && !classes.includes(className)) return false;
    if (!classes.length && !(domain === "weaponClass" && Object.values(propertyFilters ?? {}).includes("required"))) return false;
    if (requireEquipped && ["weapon", "shield", "protection", "accessory"].includes(item.type)
        && !item.system.equipped) return false;

    if (domain === "weaponClass") {
        const properties = item.system.properties ?? new Set();
        for (const key of Object.keys(WEAPON_PROPERTIES)) {
            const state = propertyFilters?.[key] ?? "neutral";
            const has = properties instanceof Set ? properties.has(key) : properties.includes?.(key) ?? false;
            if (state === "required" && !has) return false;
            if (state === "excluded" && has) return false;
        }
    }
    return true;
}

export function matchingExpertiseBonus(expertises, item, domain) {
    return expertises.filter(expertise => expertise.type === "expertise"
        && expertise.system.domain === domain && expertiseMatches(expertise, item))
        .reduce((sum, expertise) => sum + expertise.system.bonus, 0);
}

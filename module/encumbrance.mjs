// Volume : catégories affichées de la plus grande à la plus petite.
export const VOLUME_FACTORS = Object.freeze({
    gigantic: 1.75,
    huge: 1.5,
    large: 1.25,
    medium: 1,
    small: 0.8,
    verySmall: 0.6,
    tiny: 0.4,
    none: 0
});

export const VOLUME_LABELS = Object.freeze({
    gigantic: "Gigantesque",
    huge: "Très Grand",
    large: "Grand",
    medium: "Moyen",
    small: "Petit",
    verySmall: "Très Petit",
    tiny: "Minuscule",
    none: "Aucun"
});

export const ENCUMBRANCE_STAGES = Object.freeze({
    free: {
        label: "Libre",
        instruction: "Aucune pénalité.",
        speedModifier: 0,
        speedMultiplier: 1
    },
    encumbered: {
        label: "Encombré",
        instruction: "Vitesse −2 m. Appliquer manuellement les désavantages aux tests d’Acrobaties et de Discrétion liés au déplacement.",
        speedModifier: -2,
        speedMultiplier: 1
    },
    overloaded: {
        label: "Surchargé",
        instruction: "Vitesse divisée par deux, pas de sprint. Appliquer manuellement les désavantages aux tests de mobilité et d’équilibre.",
        speedModifier: 0,
        speedMultiplier: 0.5
    },
    immobilized: {
        label: "Immobilisé",
        instruction: "Vitesse 0. Le personnage ne peut plus se déplacer ni accomplir d’actions physiques avant de s’alléger.",
        speedModifier: 0,
        speedMultiplier: 0
    }
});

export function carryingCapacity(strength, volume = "medium", bonusKg = 0) {
    const factor = VOLUME_FACTORS[volume] ?? VOLUME_FACTORS.medium;
    const score = Number.isFinite(Number(strength)) ? Math.max(0, Number(strength)) : 0;
    const bonus = Number.isFinite(Number(bonusKg)) ? Number(bonusKg) : 0;
    return Math.max(0, 5 * score * factor + bonus);
}

export function calculateEncumbrance(carriedKg, maximumKg) {
    const carried = Number.isFinite(Number(carriedKg)) ? Math.max(0, Number(carriedKg)) : 0;
    const maximum = Number.isFinite(Number(maximumKg)) ? Math.max(0, Number(maximumKg)) : 0;
    // Charge maximale nulle + poids transporté : immobilisation immédiate.
    const percentage = maximum > 0 ? carried / maximum * 100 : carried > 0 ? 100 : 0;
    const stage = percentage >= 100 ? "immobilized"
        : percentage > 70 ? "overloaded"
        : percentage > 40 ? "encumbered" : "free";
    return { carried, maximum, percentage, stage };
}

export function encumberedSpeed(normalSpeed, stage) {
    const penalties = ENCUMBRANCE_STAGES[stage] ?? ENCUMBRANCE_STAGES.free;
    const base = Number.isFinite(Number(normalSpeed)) ? Math.max(0, Number(normalSpeed)) : 0;
    return Math.max(0, (base + penalties.speedModifier) * penalties.speedMultiplier);
}

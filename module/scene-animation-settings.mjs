export function animationSettings(source = {}) {
    const stored = source.animation ?? {};
    return { duration: source.projectileDuration ?? 0.8, arrival: "keep", finalEffectUuid: "",
        finalMode: "once-delete", finalDuration: 1, initialSize: 100, finalSize: 100, spin: 0, ...stored };
}

export function validateAnimationAppearance(data) {
    const result = {};
    for (const [key, fallback, min, max] of [["initialSize", 100, 1, 1000], ["finalSize", 100, 1, 1000], ["spin", 0, -3600, 3600]]) {
        const value = data[key] ?? fallback;
        if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
            throw Error(`Réglage d’animation invalide : ${key} (${min} à ${max}).`);
        }
        result[key] = value;
    }
    return result;
}

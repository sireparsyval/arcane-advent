const SCOPE = "arcane-advent";
const METERS_PER_UNIT = new Map([
    ["", 1], ["m", 1], ["meter", 1], ["meters", 1], ["metre", 1], ["metres", 1],
    ["ft", 0.3048], ["foot", 0.3048], ["feet", 0.3048], ["pied", 0.3048], ["pieds", 0.3048],
    ["cm", 0.01], ["km", 1000]
]);

// Foundry expects grid spaces/second. The sheet's current speed is in meters,
// interpreted here as meters/second solely for the visual movement animation.
export function tokenMovementSpeed(token, { mode = "tracker", fixedSpeed = 12 } = {}) {
    const actor = token?.actor ?? token?.document?.actor;
    if (!["character", "npc"].includes(actor?.type)) return null;
    const fallback = Number.isFinite(fixedSpeed) && fixedSpeed > 0 ? fixedSpeed : 12;
    if (mode === "fixed") return fallback;
    const trackers = actor.system?.trackers;
    const speed = trackers?.effectiveSpeed ?? trackers?.speed;
    const grid = (token.scene ?? token.document?.parent)?.grid;
    const unit = String(grid?.units ?? "").trim().normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase();
    const metersPerUnit = METERS_PER_UNIT.get(unit);
    const distance = grid?.distance;
    if (!Number.isFinite(speed) || speed <= 0 || !Number.isFinite(distance) || distance <= 0 || !metersPerUnit) return fallback;
    const result = speed / (distance * metersPerUnit);
    return Number.isFinite(result) && result > 0 ? result : fallback;
}

export function registerTokenMovementSettings() {
    game.settings.register(SCOPE, "tokenMovementMode", {
        name: "Vitesse d’animation des personnages",
        hint: "Utilise la Vitesse effective de chaque personnage/PNJ (effets et encombrement compris), ou une vitesse fixe commune. Le tracker est interprété en mètres par seconde d’animation et converti selon l’échelle de la scène. Aucun changement aux distances autorisées en jeu.",
        scope: "world", config: true, type: String, default: "tracker",
        choices: { tracker: "Selon le tracker Vitesse du personnage", fixed: "Vitesse fixe" }
    });
    game.settings.register(SCOPE, "tokenMovementFixedSpeed", {
        name: "Vitesse fixe d’animation (cases/seconde)",
        hint: "Utilisée en mode fixe, et en secours si le tracker est nul/absent ou l’échelle de la scène inconnue. Prise en compte au prochain déplacement.",
        scope: "world", config: true, type: Number, default: 12,
        range: { min: 1, max: 60, step: 1 }
    });
}

// Existing damage buttons keep working; an explicit purpose handles custom names
// and keeps healing/resource rolls outside damage effects.
export function isAptitudeDamageRoll(config = {}) {
    if (config.purpose === "damage") return true;
    if (config.purpose === "other") return false;
    const name = String(config.name ?? "").normalize("NFD").replace(/\p{Diacritic}/gu, "");
    return /\b(?:degats?|damage)\b/iu.test(name);
}

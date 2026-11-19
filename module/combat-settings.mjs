const SCOPE = "arcane-advent";
const APPLIED = "defaultTurnMarkerApplied";
const MARKER = "assets/arcane-advent/system/battlemark.png";

export function registerCombatSettings() {
    CONFIG.Combat.fallbackTurnMarker = MARKER;
    game.settings.register(SCOPE, APPLIED, {
        scope: "world", config: false, type: Boolean, default: false
    });
}

// Apply the requested world default once, without resetting subsequent GM edits.
export async function configureDefaultTurnMarker() {
    if (!game.users.activeGM?.isSelf || game.settings.get(SCOPE, APPLIED)) return;
    const settings = game.settings.get("core", "combatTrackerConfig");
    await game.settings.set("core", "combatTrackerConfig", {
        ...settings,
        turnMarker: { ...settings.turnMarker, src: MARKER, animation: "spin" }
    });
    await game.settings.set(SCOPE, APPLIED, true);
}

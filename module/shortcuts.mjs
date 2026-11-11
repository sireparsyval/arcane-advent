// Raccourcis : un slot appelle les jets vivants de la fiche, jamais une formule figée.
const HOTBAR_ACTIONS = new Set([
    "rollAptitude", "rollWeaponAttack", "rollWeaponDamage",
    "rollWeaponBonusDamage", "rollWeaponVersatileDamage",
    "rollGuard", "rollSkill", "rollAbility", "rollSavingThrow",
    "rollInitiativeCheck", "rollDeathSave", "rollConsciousnessDie"
]);

export function hotbarRollData(actor, button) {
    const action = button.dataset.action;
    if (!HOTBAR_ACTIONS.has(action)) return null;
    return {
        type: "ArcaneAdventRoll",
        actorUuid: actor.uuid,
        action,
        itemId: button.dataset.itemId ?? button.dataset.skillId ?? "",
        rollId: button.dataset.rollId ?? "",
        ability: button.dataset.ability ?? "",
        label: button.textContent.replace(/\s+/g, " ").trim()
    };
}

export async function runArcaneShortcut(data) {
    if (!HOTBAR_ACTIONS.has(data?.action)) return;
    const actor = await fromUuid(data.actorUuid);
    if (actor?.type !== "character" || !actor.isOwner) {
        ui.notifications.warn("Le personnage de ce raccourci est introuvable ou inaccessible.");
        return;
    }
    const mode = actor.system.rollMode ?? "normal";
    switch (data.action) {
        case "rollAptitude": return actor.rollAptitude(data.itemId, data.rollId, mode);
        case "rollWeaponAttack": return actor.rollWeaponAttack(data.itemId, mode);
        case "rollWeaponDamage": return actor.rollWeaponDamage(data.itemId);
        case "rollWeaponBonusDamage": return actor.rollWeaponDamage(data.itemId, { bonusAction: true });
        case "rollWeaponVersatileDamage": return actor.rollWeaponDamage(data.itemId, { versatile: true });
        case "rollGuard": return actor.rollGuard(data.itemId, mode);
        case "rollSkill": return actor.rollSkill(data.itemId, mode);
        case "rollAbility": return actor.rollAbility(data.ability, mode);
        case "rollSavingThrow": return actor.rollSavingThrow(data.ability, mode);
        case "rollInitiativeCheck": return actor.rollInitiativeCheck(mode);
        case "rollDeathSave": return actor.rollDeathSave();
        case "rollConsciousnessDie": return actor.rollConsciousnessDie();
    }
}

export function registerArcaneHotbar() {
    Hooks.on("hotbarDrop", (hotbar, data, slot) => {
        if (data?.type !== "ArcaneAdventRoll") return;
        // Retour synchrone : le traitement natif du dépôt dans ce slot est annulé.
        void (async () => {
            if (!HOTBAR_ACTIONS.has(data.action) || !data.actorUuid || !game.user) return;
            const actor = await fromUuid(data.actorUuid);
            if (!actor?.isOwner) {
                ui.notifications.warn("Vous ne pouvez pas créer un raccourci pour ce personnage.");
                return;
            }
            const name = data.label || "Jet Arcane Advent";
            const payload = {
                actorUuid: data.actorUuid,
                action: data.action,
                itemId: data.itemId ?? "",
                rollId: data.rollId ?? "",
                ability: data.ability ?? ""
            };
            const command = "await game.arcaneAdvent.runShortcut(" + JSON.stringify(payload) + ");";
            const macro = await foundry.documents.Macro.create({
                name: name.startsWith("🎲") ? name : "🎲 " + name,
                type: "script",
                img: actor.img || "icons/svg/d20-highlight.svg",
                command
            }, { renderSheet: false });
            if (macro) await game.user.assignHotbarMacro(macro, slot);
        })().catch(error => {
            console.error("Arcane Advent | Raccourci", error);
            ui.notifications.error("Impossible de créer le raccourci de jet.");
        });
        return false;
    });
}

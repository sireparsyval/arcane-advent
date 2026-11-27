const SCOPE = "arcane-advent", MODE = "characterHotbarMode", BAR = "characterHotbar";
const queues = new WeakMap(), bindings = new WeakMap();
const validSlot = slot => Number.isInteger(Number(slot)) && Number(slot) >= 1 && Number(slot) <= 50;

export function selectedHotbarActor(user = game.user) {
    if (user !== game.user || !user?.getFlag?.(SCOPE, MODE) || globalThis.canvas?.ready === false) return null;
    const controlled = globalThis.canvas?.tokens?.controlled ?? [];
    if (controlled.length !== 1) return null;
    const actor = controlled[0].actor;
    return ["character", "npc"].includes(actor?.type) && actor.isOwner && actor.uuid ? actor : null;
}

export function characterHotbarSlots(actor) {
    const stored = actor.getFlag(SCOPE, BAR)?.slots ?? {};
    return Object.fromEntries(Object.entries(stored).filter(([slot, id]) => validSlot(slot) && typeof id === "string" && id));
}

function enqueue(actor, work) {
    const result = (queues.get(actor) ?? Promise.resolve()).catch(() => {}).then(work);
    queues.set(actor, result);
    return result;
}

async function shareMacro(actor, macro) {
    if (!macro?.isOwner) return;
    const ownership = { ...(macro.ownership ?? {}) };
    const ownerLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.OWNER ?? 3;
    const executeLevel = globalThis.CONST?.DOCUMENT_OWNERSHIP_LEVELS?.LIMITED ?? 1;
    let changed = false;
    for (const [id, level] of Object.entries(actor.ownership ?? {})) {
        if (level >= ownerLevel && (ownership[id] ?? ownership.default ?? 0) < executeLevel) {
            ownership[id] = executeLevel; changed = true;
        }
    }
    if (changed) await macro.update({ ownership });
}

export function assignCharacterMacro(actor, macro, slot, fromSlot) {
    return enqueue(actor, async () => {
        if (!actor.isOwner) throw Error("Vous ne pouvez pas modifier les raccourcis de ce personnage.");
        const slots = characterHotbarSlots(actor);
        if (slot === undefined || slot === null) slot = Array.from({ length: 50 }, (_, i) => i + 1).find(i => !slots[i]);
        if (!validSlot(slot)) throw Error("Choisissez un emplacement libre entre 1 et 50.");
        if (macro && !macro.id) throw Error("Macro invalide.");
        await shareMacro(actor, macro);
        const path = `flags.${SCOPE}.${BAR}.slots`, changes = {};
        if (macro) changes[`${path}.${Number(slot)}`] = macro.id;
        else changes[`${path}.-=${Number(slot)}`] = null;
        if (macro && validSlot(fromSlot) && Number(fromSlot) !== Number(slot) && slots[fromSlot] === macro.id) {
            if (slots[slot]) changes[`${path}.${Number(fromSlot)}`] = slots[slot];
            else changes[`${path}.-=${Number(fromSlot)}`] = null;
        }
        await actor.update(changes);
        return actor;
    });
}

export async function syncCharacterHotbarPermissions(actor) {
    for (const id of new Set(Object.values(characterHotbarSlots(actor)))) {
        const macro = game.macros.get(id);
        if (macro) await shareMacro(actor, macro);
    }
}

// Capture the destination before asynchronous macro creation/import. A change
// of selection during that operation must never write into the next actor's bar.
export function assignCapturedHotbarMacro(user, actor, macro, slot, fromSlot) {
    return user.assignHotbarMacro(macro, slot, { fromSlot, characterActor: actor });
}

export function createCharacterHotbarUserClass(BaseUser) {
    return class CharacterHotbarUser extends BaseUser {
        getHotbarMacros(page = 1) {
            const actor = selectedHotbarActor(this);
            if (!actor) return super.getHotbarMacros(page);
            const slots = characterHotbarSlots(actor);
            page = Math.max(1, Math.min(5, Number(page) || 1));
            return Array.from({ length: 10 }, (_, i) => {
                const slot = (page - 1) * 10 + i + 1;
                return { slot, macro: game.macros.get(slots[slot]) ?? null };
            });
        }

        async assignHotbarMacro(macro, slot, context = {}) {
            const actor = Object.hasOwn(context, "characterActor") ? context.characterActor : selectedHotbarActor(this);
            if (!actor || this !== game.user) return super.assignHotbarMacro(macro, slot, { fromSlot: context.fromSlot });
            await assignCharacterMacro(actor, macro, slot, context.fromSlot);
            return this;
        }
    };
}

function macroForEntry(element) {
    const actor = selectedHotbarActor(), slot = element.closest("[data-slot]")?.dataset.slot;
    const id = actor ? characterHotbarSlots(actor)[slot] : game.user.hotbar[slot];
    return game.macros.get(id) ?? null;
}

export function createCharacterHotbarClass(BaseHotbar) {
    return class CharacterHotbar extends BaseHotbar {
        static DEFAULT_OPTIONS = {
            ...BaseHotbar.DEFAULT_OPTIONS,
            actions: { ...BaseHotbar.DEFAULT_OPTIONS.actions,
                execute: async function (event) {
                    const actor = selectedHotbarActor();
                    const entry = event.target.closest("[data-slot]"), slot = Number(entry?.dataset.slot);
                    if (!validSlot(slot)) return;
                    const macro = macroForEntry(entry);
                    if (macro) return actor ? macro.execute({ actor, token: canvas.tokens.controlled[0], event })
                        : BaseHotbar.DEFAULT_OPTIONS.actions.execute.call(this, event);
                    const cls = globalThis.CONFIG?.Macro?.documentClass ?? foundry.documents.Macro;
                    const created = new cls({ name: cls.defaultName({ type: "chat" }), type: "chat", scope: "global",
                        flags: { [SCOPE]: { characterHotbarDestination: { actorUuid: actor?.uuid ?? null, slot, userId: game.user.id } } } });
                    return created.sheet.render({ force: true });
                }
            }
        };

        // Core v14 stores rendered slots and reads user.hotbar directly in its
        // private click/context/drag handlers. Keep keyboard execution live too.
        get slots() {
            return game.user.getHotbarMacros(this.page).map((entry, i) => ({ ...entry,
                key: i < 9 ? i + 1 : 0, img: entry.macro?.img ?? null,
                cssClass: entry.macro ? "full" : "open", tooltip: entry.macro?.name ?? null,
                ariaLabel: entry.macro?.name ?? "Emplacement vide" }));
        }

        _getContextMenuOptions() {
            const custom = [
                { label: "MACRO.Edit", icon: "fa-solid fa-edit", visible: li => Boolean(macroForEntry(li)?.isOwner),
                    onClick: (_event, li) => macroForEntry(li)?.sheet.render({ force: true }) },
                { label: "MACRO.Remove", icon: "fa-solid fa-xmark", onClick: (_event, li) =>
                    assignCapturedHotbarMacro(game.user, selectedHotbarActor(), null, Number(li.dataset.slot)) },
                { label: "MACRO.Delete", icon: "fa-solid fa-trash", visible: li => Boolean(macroForEntry(li)?.isOwner),
                    onClick: (_event, li) => macroForEntry(li)?.deleteDialog() }
            ];
            return super._getContextMenuOptions().map(entry => {
                const replacement = custom.find(candidate => candidate.label === entry.label);
                if (!replacement) return entry;
                return { ...entry,
                    visible: li => selectedHotbarActor() ? replacement.visible?.(li) ?? true
                        : typeof entry.visible === "function" ? entry.visible(li) : entry.visible ?? true,
                    onClick: (event, li) => selectedHotbarActor() ? replacement.onClick(event, li) : entry.onClick(event, li)
                };
            });
        }
    };
}

function refreshHotbar() { return ui.hotbar?.render({ force: true }); }
function report(error) { console.error("Arcane Advent | Barre du personnage", error); ui.notifications.error(error.message); }

export function decorateCharacterHotbar(app, html) {
    const root = html instanceof HTMLElement ? html : html?.[0];
    if (!root) return;
    bindings.get(root)?.abort();
    const abort = new AbortController(); bindings.set(root, abort);
    const previous = root.querySelector("[data-character-hotbar-toggle]");
    const placeholder = root.querySelector('[data-action="clear"]') ?? previous;
    const enabled = Boolean(game.user.getFlag(SCOPE, MODE)), actor = selectedHotbarActor();
    const button = root.ownerDocument.createElement("button");
    button.type = "button"; button.className = "ui-control icon aa-character-hotbar-toggle";
    button.dataset.characterHotbarToggle = ""; button.textContent = "👤";
    button.setAttribute("aria-pressed", String(enabled));
    button.title = actor ? `Barre commune — ${actor.name}` : enabled
        ? "Mode personnage actif — sélectionnez un seul personnage ; barre habituelle affichée"
        : "Activer la barre commune du personnage sélectionné";
    button.setAttribute("aria-label", button.title);
    if (placeholder) placeholder.replaceWith(button);
    else (root.querySelector("#hotbar-controls-right > .flexcol, .hotbar-controls, #hotbar-controls, .bar-controls") ?? root).append(button);
    if (previous && previous !== placeholder) previous.remove();
    for (const clear of root.querySelectorAll('[data-action="clear"]')) clear.remove();
    root.classList.toggle("aa-character-hotbar-active", Boolean(actor));
    button.addEventListener("click", async event => {
        event.preventDefault(); event.stopPropagation(); button.disabled = true;
        try { await game.user.setFlag(SCOPE, MODE, !enabled); await refreshHotbar(); }
        catch (error) { report(error); }
        finally { button.disabled = false; }
    }, { signal: abort.signal });
    root.addEventListener("dragstart", event => {
        const target = selectedHotbarActor();
        const entry = event.target.closest("[data-slot]");
        if (!target || !entry || !event.dataTransfer) return;
        event.stopImmediatePropagation();
        const macro = macroForEntry(entry);
        if (!macro || app.locked) { event.preventDefault(); return; }
        const data = { ...macro.toDragData(), slot: entry.dataset.slot,
            aaCharacterBar: target.uuid, aaCharacterSlot: Number(entry.dataset.slot) };
        event.dataTransfer.setData("text/plain", JSON.stringify(data));
    }, { capture: true, signal: abort.signal });
}

export function registerCharacterHotbars() {
    CONFIG.User.documentClass = createCharacterHotbarUserClass(CONFIG.User.documentClass);
    CONFIG.ui.hotbar = createCharacterHotbarClass(CONFIG.ui.hotbar);
    Hooks.on("renderHotbar", decorateCharacterHotbar);
    let scheduled = false;
    const schedule = () => {
        if (scheduled) return;
        scheduled = true;
        queueMicrotask(() => { scheduled = false; void Promise.resolve(refreshHotbar()).catch(report); });
    };
    for (const hook of ["controlToken", "canvasReady", "canvasTearDown", "deleteToken", "deleteActor"]) Hooks.on(hook, schedule);
    Hooks.on("updateActor", (actor, changes) => {
        if (selectedHotbarActor()?.uuid === actor.uuid) schedule();
        if (changes.ownership && game.users.activeGM?.isSelf) void syncCharacterHotbarPermissions(actor).catch(report);
    });
    Hooks.on("updateUser", user => { if (user === game.user) schedule(); });
    Hooks.on("createMacro", (macro, _options, userId) => {
        const destination = macro.getFlag(SCOPE, "characterHotbarDestination");
        if (!destination || userId !== game.user.id || destination.userId !== game.user.id) return;
        void (async () => {
            const actor = destination.actorUuid ? await fromUuid(destination.actorUuid) : null;
            await macro.unsetFlag(SCOPE, "characterHotbarDestination");
            if (destination.actorUuid && !actor) throw Error("Le personnage de cette macro n’existe plus.");
            await assignCapturedHotbarMacro(game.user, actor, macro, destination.slot);
            await refreshHotbar();
        })().catch(report);
    });
    Hooks.on("hotbarDrop", (_hotbar, data, slot) => {
        const target = selectedHotbarActor();
        if (!target || data?.type !== "Macro") return;
        void (async () => {
            let macro = data.uuid ? await fromUuid(data.uuid) : game.macros.get(data.id);
            if (macro?.documentName !== "Macro") throw Error("Cette macro est introuvable.");
            if (macro.inCompendium) macro = await foundry.documents.Macro.create(macro.toObject(), { renderSheet: false });
            if (!macro) throw Error("La macro n’a pas pu être importée.");
            const origin = data.aaCharacterBar === target.uuid ? data.aaCharacterSlot : undefined;
            await assignCapturedHotbarMacro(game.user, target, macro, slot, origin);
            await refreshHotbar();
        })().catch(report);
        return false;
    });
}

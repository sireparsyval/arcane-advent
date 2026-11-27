import { decorateCharacterHotbar } from "../../module/character-hotbar.mjs";

export async function runCharacterHotbarTests({ test, assert, equal }) {
    const previous = { game: globalThis.game, canvas: globalThis.canvas, ui: globalThis.ui };
    const dialogs = foundry.applications.api.DialogV2;
    let mode = true, renders = 0, normalClear = 0, nativeDrags = 0;
    const slots = { 1: "m" }, bSlots = { 1: "other" };
    const makeActor = (uuid, data) => ({ uuid, type: "character", isOwner: true, name: uuid,
        getFlag: () => ({ slots: data }), async update(changes) {
            for (const path of Object.keys(changes)) delete data[path.split(".-=").at(-1)];
        } });
    const a = makeActor("Actor.a", slots), b = makeActor("Actor.b", bSlots);
    const root = document.createElement("aside"); root.id = "hotbar";
    root.innerHTML = '<div class="hotbar-controls"><button type="button" data-action="clear">Vider</button></div><menu><li class="slot full" data-slot="1" draggable="true"><img alt="Macro"></li></menu>';
    document.querySelector("main").replaceChildren(root);
    globalThis.game = { user: { id: "gm", getFlag: () => mode, async setFlag(_scope, _key, value) { mode = value; } },
        macros: new Map([["m", { id: "m", toDragData: () => ({ type: "Macro", uuid: "Macro.m" }) }]]) };
    globalThis.canvas = { ready: true, tokens: { controlled: [{ actor: a }] } };
    globalThis.ui = { hotbar: { render() { renders++; } }, notifications: { error: message => { throw Error(message); } } };
    root.addEventListener("click", event => { if (event.target.closest('[data-action="clear"]')) normalClear++; });
    root.querySelector("li").ondragstart = () => nativeDrags++;
    try {
        await test("le bouton garde le mode utilisateur et affiche le personnage actif sans doublon", async () => {
            decorateCharacterHotbar({ locked: false }, root); decorateCharacterHotbar({ locked: false }, root);
            equal(root.querySelectorAll("[data-character-hotbar-toggle]").length, 1);
            const button = root.querySelector("[data-character-hotbar-toggle]");
            assert(button.title.includes("Actor.a"), "Missing actor name");
            equal(button.getAttribute("aria-pressed"), "true");
            button.click(); await new Promise(resolve => setTimeout(resolve, 0));
            equal(mode, false); assert(renders > 0, "No hotbar refresh");
        });
        await test("zéro ou plusieurs sélections rendent la barre habituelle sans désactiver le mode", () => {
            mode = true;
            for (const controlled of [[], [{ actor: a }, { actor: b }]]) {
                canvas.tokens.controlled = controlled; decorateCharacterHotbar({ locked: false }, root);
                assert(!root.classList.contains("aa-character-hotbar-active"), "A character bar remains active");
                equal(root.querySelector("button[data-character-hotbar-toggle]").getAttribute("aria-pressed"), "true");
            }
        });
        await test("glisser une macro utilise la barre commune et respecte le verrouillage", () => {
            canvas.tokens.controlled = [{ actor: a }]; decorateCharacterHotbar({ locked: false }, root);
            const transfer = new DataTransfer();
            root.querySelector("li").dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: transfer }));
            const payload = JSON.parse(transfer.getData("text/plain"));
            equal(payload.uuid, "Macro.m"); equal(payload.aaCharacterBar, a.uuid); equal(payload.aaCharacterSlot, 1);
            equal(nativeDrags, 0);
            decorateCharacterHotbar({ locked: true }, root);
            const blocked = new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: new DataTransfer() });
            root.querySelector("li").dispatchEvent(blocked); assert(blocked.defaultPrevented, "Locked bar can be dragged");
        });
        await test("vider la barre commune capture le bon personnage et ne déclenche pas l’effacement personnel", async () => {
            decorateCharacterHotbar({ locked: false }, root);
            foundry.applications.api.DialogV2 = { async confirm() { canvas.tokens.controlled = [{ actor: b }]; return true; } };
            root.querySelector('[data-action="clear"]').click();
            await new Promise(resolve => setTimeout(resolve, 0));
            equal(slots, {}); equal(bSlots, { 1: "other" }); equal(normalClear, 0);
        });
    } finally {
        foundry.applications.api.DialogV2 = dialogs;
        Object.assign(globalThis, previous); root.remove();
    }
}

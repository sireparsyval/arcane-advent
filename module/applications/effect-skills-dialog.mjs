import { formDialog } from "./form-interactions.mjs";
import { effectSkillRows } from "../effect-skills.mjs";

const openDialogs = new WeakMap();
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export async function openEffectSkillsDialog(actor) {
    const current = openDialogs.get(actor);
    if (current?.rendered) { current.bringToFront(); return current; }
    const content = document.createElement("div");
    content.innerHTML = '<section data-effect-skills></section>';
    const dialog = formDialog.create({
        classes: ["arcane-advent", "aa-effect-skills-dialog"],
        window: { title: `Compétences — Effets actifs — ${actor.name}` },
        position: { width: 520 }, content,
        buttons: [{ action: "close", label: "Fermer", default: true }]
    });
    const render = () => {
        const root = dialog.element?.querySelector("[data-effect-skills]");
        if (!root) return;
        const rows = effectSkillRows(actor);
        root.innerHTML = rows.length ? `<div class="aa-effect-skills-list"><div class="aa-effect-skill-header"><span></span><span>Compétence</span><span>Carac.</span><span>Total</span><span></span></div>
            ${rows.map(row => `<div class="aa-effect-skill-row">
                <button type="button" data-effect-skill="${escape(row.key)}" title="${escape(row.canRoll ? `Lancer ${row.name}` : "Renseignez la caractéristique associée dans l’effet.")}" aria-label="Lancer ${escape(row.name)}" ${row.canRoll ? "" : "disabled"}>🎲</button>
                <span class="aa-skill-display-field aa-effect-skill-name">${escape(row.name)}</span>
                <span class="aa-skill-display-field">${row.abilityLabel}</span>
                <strong class="aa-skill-display-field" title="Modificateur de caractéristique + effets actifs, sans maîtrise">${row.totalLabel}</strong>
                <span class="aa-effect-skill-indicator" title="${row.status}" aria-label="${row.status}">${row.indicator}</span>
            </div>`).join("")}</div>
            ${rows.some(row => !row.canRoll) ? '<p class="hint">Une caractéristique manquante doit être renseignée dans l’effet correspondant.</p>' : ""}`
            : '<p class="hint">Aucune compétence sans maîtrise concernée par un effet actif.</p>';
        root.onclick = async event => {
            const button = event.target.closest("button[data-effect-skill]");
            if (!button || button.disabled) return;
            button.disabled = true;
            try { await actor.rollEffectSkill(button.dataset.effectSkill); }
            catch (error) { ui.notifications.error(error.message); }
            finally { if (dialog.rendered) render(); }
        };
    };
    dialog.addEventListener("render", render);
    const hooks = [];
    const sameActor = doc => doc === actor || (actor.uuid && doc?.uuid === actor.uuid);
    dialog.addEventListener("close", () => {
        for (const [name, id] of hooks) Hooks.off(name, id);
        if (openDialogs.get(actor) === dialog) openDialogs.delete(actor);
    }, { once: true });
    openDialogs.set(actor, dialog);
    await dialog.render({ force: true });
    hooks.push(["updateActor", Hooks.on("updateActor", updated => { if (sameActor(updated)) render(); })]);
    for (const event of ["createItem", "updateItem", "deleteItem"]) {
        hooks.push([event, Hooks.on(event, item => { if (sameActor(item.parent)) render(); })]);
    }
    hooks.push(["deleteActor", Hooks.on("deleteActor", deleted => { if (sameActor(deleted)) dialog.close(); })]);
    return dialog;
}

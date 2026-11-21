const boundForms = new WeakSet();

function buttonPosition(button) {
    const action = button.dataset.action;
    const label = button.textContent.normalize("NFD").replace(/\p{M}/gu, "").trim().toLowerCase();
    if (["cancel", "back", "return", "no", "close"].includes(action)
        || /^(annuler|retour|revenir|fermer)$/.test(label)) return 0;
    if (["save", "apply", "ok", "yes", "confirm", "add", "create", "launch", "submit", "validate"].includes(action)
        || /^(enregistrer|appliquer|valider|confirmer)(?:\s|$)/.test(label)) return 2;
    return 1;
}

export function orderDialogButtons(root) {
    for (const footer of root?.querySelectorAll?.(".form-footer") ?? []) {
        const buttons = [...footer.children].filter(child => child.tagName === "BUTTON");
        const ordered = buttons.map((button, index) => ({ button, index, position: buttonPosition(button) }))
            .sort((a, b) => a.position - b.position || a.index - b.index).map(entry => entry.button);
        if (ordered.every((button, index) => button === buttons[index])) continue;
        const focused = root.ownerDocument?.activeElement;
        // Move existing nodes: retain their callbacks, disabled/default states,
        // and make keyboard navigation follow the same order as the display.
        for (const button of ordered) footer.append(button);
        if (buttons.includes(focused)) focused.focus({ preventScroll: true });
    }
}

// Enter commits a single-line field through its normal blur/change handling.
// Explicit buttons keep keyboard activation; textareas keep their newlines.
export function bindFieldEnter(root) {
    if (!root?.addEventListener || boundForms.has(root)) return;
    boundForms.add(root);
    root.addEventListener("keydown", event => {
        if (event.key !== "Enter" || event.isComposing || event.keyCode === 229) return;
        const field = event.target;
        if (field?.tagName !== "INPUT" || ["button", "submit", "reset", "image", "file", "color"].includes(field.type)) return;
        event.preventDefault();
        event.stopPropagation();
        if (field.reportValidity?.() === false) return;
        field.blur();
    }, true);
}

function optionsWithFieldEnter(options) {
    const render = options.render;
    return { ...options, render: (event, dialog) => {
        bindFieldEnter(dialog.element);
        orderDialogButtons(dialog.element);
        return render?.(event, dialog);
    } };
}

// Keep the behavior scoped to our own dialogs, including prompt/wait factories.
// Resolve Foundry's API lazily so importing a sheet does not capture another
// application's Dialog class or change Foundry/third-party dialogs globally.
export const formDialog = {
    create(options) {
        const dialog = new foundry.applications.api.DialogV2(options);
        dialog.addEventListener("render", () => {
            bindFieldEnter(dialog.element);
            orderDialogButtons(dialog.element);
        });
        return dialog;
    },
    wait(options) { return foundry.applications.api.DialogV2.wait(optionsWithFieldEnter(options)); },
    prompt(options) { return foundry.applications.api.DialogV2.prompt(optionsWithFieldEnter(options)); },
    confirm(options) { return foundry.applications.api.DialogV2.confirm(optionsWithFieldEnter(options)); }
};

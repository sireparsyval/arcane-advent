const boundForms = new WeakSet();

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
        return render?.(event, dialog);
    } };
}

// Keep the behavior scoped to our own dialogs, including prompt/wait factories.
// Resolve Foundry's API lazily so importing a sheet does not capture another
// application's Dialog class or change Foundry/third-party dialogs globally.
export const formDialog = {
    create(options) {
        const dialog = new foundry.applications.api.DialogV2(options);
        dialog.addEventListener("render", () => bindFieldEnter(dialog.element));
        return dialog;
    },
    wait(options) { return foundry.applications.api.DialogV2.wait(optionsWithFieldEnter(options)); },
    prompt(options) { return foundry.applications.api.DialogV2.prompt(optionsWithFieldEnter(options)); },
    confirm(options) { return foundry.applications.api.DialogV2.confirm(optionsWithFieldEnter(options)); }
};

import test from "node:test";
import assert from "node:assert/strict";
import { bindFieldEnter, formDialog, orderDialogButtons } from "../module/applications/form-interactions.mjs";

class Surface {
    listeners = [];
    addEventListener(name, callback, capture) { this.listeners.push({ name, callback, capture }); }
    key(target, values = {}) {
        const event = { key: "Enter", target, prevented: false, stopped: false,
            preventDefault() { this.prevented = true; }, stopPropagation() { this.stopped = true; }, ...values };
        for (const listener of this.listeners) if (listener.name === "keydown") listener.callback(event);
        return event;
    }
}
const input = (type = "text") => ({ tagName: "INPUT", type, commits: 0,
    reportValidity: () => true, blur() { this.commits++; } });

function footerFixture(buttons) {
    const document = { activeElement: null };
    const footer = { children: [...buttons], append(button) {
        this.children.splice(this.children.indexOf(button), 1); this.children.push(button);
        if (document.activeElement === button) document.activeElement = null;
    } };
    for (const button of buttons) {
        button.tagName = "BUTTON";
        button.focus = () => { document.activeElement = button; };
    }
    return { document, footer, root: { ownerDocument: document, querySelectorAll: () => [footer] } };
}

test("dialog footers put dismissals on the left and Save on the right without changing callbacks, defaults or focus", () => {
    const callback = () => 42;
    const save = { dataset: { action: "save" }, textContent: "Enregistrer", autofocus: true, disabled: true, callback };
    const remove = { dataset: { action: "delete" }, textContent: "Supprimer" };
    const cancel = { dataset: { action: "cancel" }, textContent: "Annuler" };
    const { root, footer, document } = footerFixture([save, remove, cancel]);
    document.activeElement = save;
    orderDialogButtons(root);
    assert.deepEqual(footer.children, [cancel, remove, save]);
    assert.equal(document.activeElement, save);
    assert.equal(save.autofocus, true); assert.equal(save.disabled, true); assert.equal(save.callback, callback);
    orderDialogButtons(root);
    assert.deepEqual(footer.children, [cancel, remove, save]);
});

test("prompt factories order the actual generated OK/Cancel buttons while keeping the original result", async () => {
    const ok = { dataset: { action: "ok" }, textContent: "Appliquer" };
    const cancel = { dataset: { action: "back" }, textContent: "Retour" };
    const { root, footer } = footerFixture([ok, cancel]);
    globalThis.foundry = { applications: { api: { DialogV2: { prompt(options) {
        options.render(null, { element: root });
        return Promise.resolve("confirmed");
    } } } } };
    assert.equal(await formDialog.prompt({}), "confirmed");
    assert.deepEqual(footer.children, [cancel, ok]);
});

test("Enter commits text and number fields once without invoking the form's default action", () => {
    const root = new Surface();
    bindFieldEnter(root); bindFieldEnter(root);
    assert.equal(root.listeners.length, 1);
    assert.equal(root.listeners[0].capture, true);
    for (const type of ["text", "number", "search"]) {
        const field = input(type), event = root.key(field);
        assert.equal(event.prevented, true);
        assert.equal(event.stopped, true);
        assert.equal(field.commits, 1);
    }
});

test("an invalid field stays focused and composition keystrokes do not commit", () => {
    const root = new Surface(); bindFieldEnter(root);
    const invalid = input("number"); invalid.reportValidity = () => false;
    assert.equal(root.key(invalid).prevented, true);
    assert.equal(invalid.commits, 0);
    for (const extra of [{ isComposing: true }, { keyCode: 229 }, { key: "Escape" }]) {
        const field = input();
        assert.equal(root.key(field, extra).prevented, false);
        assert.equal(field.commits, 0);
    }
});

test("textareas, select dropdowns and explicit buttons retain their own keyboard behavior", () => {
    const root = new Surface(); bindFieldEnter(root);
    for (const field of [{ tagName: "TEXTAREA" }, { tagName: "SELECT" }, { tagName: "BUTTON" },
        ...["submit", "button", "reset", "file", "color"].map(type => input(type))]) {
        assert.equal(root.key(field).prevented, false);
        assert.equal(field.commits ?? 0, 0);
    }
});

test("created dialogs guard their live form on every render while leaving Save clicks available", async () => {
    class Dialog extends EventTarget {
        constructor(options) { super(); this.options = options; this.element = new Surface(); }
    }
    globalThis.foundry = { applications: { api: { DialogV2: Dialog } } };
    let writes = 0;
    const dialog = formDialog.create({ buttons: [{ action: "save", callback: () => { writes++; } }] });
    dialog.dispatchEvent(new Event("render")); dialog.dispatchEvent(new Event("render"));
    assert.equal(dialog.element.listeners.length, 1);
    assert.equal(dialog.element.key(input()).prevented, true);
    assert.equal(writes, 0);
    await dialog.options.buttons[0].callback();
    assert.equal(writes, 1);
    dialog.element = new Surface(); dialog.dispatchEvent(new Event("render"));
    assert.equal(dialog.element.key(input("number")).prevented, true);
});

for (const method of ["wait", "prompt", "confirm"]) test(`${method} guards fields and preserves the original render callback, options and return value`, async () => {
    const root = new Surface(), app = { element: root };
    const button = { action: "save", callback: () => 42 };
    let renders = 0;
    const original = { [method]: async options => {
        assert.equal(options.buttons[0], button);
        assert.equal(options.form.closeOnSubmit, false);
        options.render("render-event", app);
        assert.equal(root.key(input()).prevented, true);
        return "saved";
    } };
    globalThis.foundry = { applications: { api: { DialogV2: original } } };
    const result = await formDialog[method]({ buttons: [button], form: { closeOnSubmit: false },
        render: (event, dialog) => { assert.equal(event, "render-event"); assert.equal(dialog, app); renders++; } });
    assert.equal(result, "saved"); assert.equal(renders, 1);
    assert.equal(foundry.applications.api.DialogV2, original, "Native Foundry dialogs must remain untouched");
});

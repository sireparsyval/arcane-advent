import { glyphDisplay, insertGlyphId, isGlyphId, normalizeGlyphId, verseSegments } from "../../glyphs.mjs";
import { sendArcaneVerse } from "../../arcane-text.mjs";

const FIELDS = Object.freeze({
    glyphs: ["glyphId", "meaning", "pronunciation", "somatic", "notes"],
    verses: ["name", "formula", "translation", "notes"]
});

export class ArcanologyNotebook {
    constructor(sheet) {
        this.sheet = sheet;
        this.view = "glyphs";
        this.selected = { glyphs: null, verses: null };
        this.drafts = new Map();
        this.busy = false;
        this.focus = null;
    }

    collection(view = this.view) {
        return this.sheet.actor.system.arcanology?.[view] ?? {};
    }

    draftKey(view, id) {
        return view + "." + id;
    }

    draft() {
        const id = this.selected[this.view];
        const key = this.draftKey(this.view, id);
        const record = this.collection()[id];
        let draft = this.drafts.get(key);
        if (record && (!draft || !draft.dirty)) {
            const values = Object.fromEntries(FIELDS[this.view].map(field => [field, record[field]]));
            draft = { values, original: { ...values }, dirty: false, isNew: false };
            this.drafts.set(key, draft);
        }
        return draft;
    }

    prepare() {
        const active = this.sheet.element?.ownerDocument.activeElement;
        if (active?.matches("[data-notebook-field]") && this.sheet.element.contains(active)) {
            this.focus = { field: active.dataset.notebookField, start: active.selectionStart, end: active.selectionEnd };
        }
        const entries = Object.entries(this.collection());
        const selected = this.selected[this.view];
        if (!this.collection()[selected] && !this.drafts.has(this.draftKey(this.view, selected))) {
            this.selected[this.view] = entries[0]?.[0] ?? null;
        }
        const draft = this.draft();
        return {
            canEdit: this.sheet.isEditable,
            busy: this.busy,
            isGlyphs: this.view === "glyphs",
            rows: entries.map(([id, entry]) => ({
                id, selected: id === this.selected[this.view],
                label: this.view === "glyphs" ? entry.glyphId : entry.name,
                meaning: this.view === "glyphs" ? entry.meaning : "",
                pronunciation: this.view === "glyphs" ? entry.pronunciation : "",
                character: this.view === "glyphs" ? glyphDisplay(entry.glyphId).character : "",
                dirty: Boolean(this.drafts.get(this.draftKey(this.view, id))?.dirty)
            })),
            hasDraft: Boolean(draft),
            isNew: draft?.isNew,
            dirty: draft?.dirty,
            deleted: Boolean(draft && !draft.isNew && !this.collection()[this.selected[this.view]]),
            values: draft?.values,
            symbol: glyphDisplay(draft?.values.glyphId),
            segments: verseSegments(draft?.values.formula),
            insertionChoices: Object.values(this.collection("glyphs")).map(entry => ({
                id: entry.glyphId,
                label: entry.meaning ? entry.glyphId + " · " + entry.meaning : entry.glyphId
            }))
        };
    }

    bind(element) {
        this.element = element;
        if (!element) return;
        element.addEventListener("input", event => {
            const field = event.target.dataset.notebookField;
            if (!this.sheet.isEditable || this.busy || !FIELDS[this.view].includes(field)) return;
            const draft = this.draft();
            draft.values[field] = event.target.value;
            draft.dirty = true;
            this.updatePreview();
            this.status("Modifications à enregistrer");
        });
        element.addEventListener("change", event => event.stopPropagation());
        element.addEventListener("click", event => {
            const button = event.target.closest("[data-notebook-command]");
            if (!button || button.disabled) return;
            event.preventDefault();
            this.command(button).catch(error => {
                console.error("Arcane Advent | Carnet d’Arcanologie", error);
                ui.notifications.error("L’enregistrement du carnet a échoué. Votre saisie est conservée dans la fiche ouverte.");
            });
        });
        element.addEventListener("keydown", event => {
            if (event.key !== "Enter" || !event.target.matches("[data-notebook-field]")) return;
            if (event.target.tagName === "TEXTAREA" && !event.ctrlKey && !event.metaKey) return;
            event.preventDefault();
            element.querySelector('[data-notebook-command="save"]')?.click();
        });
        if (this.focus) {
            const field = element.querySelector(`[data-notebook-field="${this.focus.field}"]`);
            field?.focus({ preventScroll: true });
            field?.setSelectionRange?.(this.focus.start, this.focus.end);
            this.focus = null;
        }
    }

    status(message) {
        const status = this.element?.querySelector("[data-notebook-status]");
        if (status) status.textContent = message;
    }

    updatePreview() {
        const draft = this.draft();
        const preview = this.element.querySelector("[data-notebook-preview]");
        if (!preview || !draft) return;
        const state = this.element.querySelector("[data-notebook-symbol-state]");
        if (state) state.hidden = !glyphDisplay(draft.values.glyphId).pending;
        preview.replaceChildren();
        const segments = this.view === "glyphs"
            ? [{ ...glyphDisplay(draft.values.glyphId), glyph: true }]
            : verseSegments(draft.values.formula);
        for (const segment of segments) {
            if (!segment.glyph) {
                preview.append(preview.ownerDocument.createTextNode(segment.text));
                continue;
            }
            const symbol = preview.ownerDocument.createElement("span");
            if (segment.character) {
                symbol.className = "aa-arc-character";
                symbol.textContent = segment.character;
                symbol.title = segment.id;
                symbol.setAttribute("aria-label", segment.id);
            } else {
                symbol.className = "aa-arc-pending";
                symbol.textContent = segment.id || "Identifiant du glyphe";
                symbol.title = "Symbole à venir";
            }
            preview.append(symbol);
        }
        const send = this.element.querySelector('[data-notebook-command="chat"]');
        if (send) send.disabled = !draft.values.formula?.trim();
    }

    async command(button) {
        const command = button.dataset.notebookCommand;
        if (this.busy) return;
        if (command === "view") {
            this.view = button.dataset.view;
            await this.sheet.render();
            return;
        }
        if (command === "select") {
            this.selected[this.view] = button.dataset.entryId;
            await this.sheet.render();
            return;
        }
        if (!this.sheet.isEditable) return;
        if (command === "add") {
            const id = foundry.utils.randomID();
            this.selected[this.view] = id;
            this.drafts.set(this.draftKey(this.view, id), {
                values: Object.fromEntries(FIELDS[this.view].map(field => [field, ""])),
                original: {}, dirty: true, isNew: true
            });
            await this.sheet.render();
            this.element.querySelector("[data-notebook-field]")?.focus();
        } else if (command === "insert") {
            const id = this.element.querySelector("[data-notebook-insert]").value;
            const textarea = this.element.querySelector('[data-notebook-field="formula"]');
            if (!id || !textarea) return;
            const result = insertGlyphId(textarea.value, id, textarea.selectionStart, textarea.selectionEnd);
            textarea.value = result.formula;
            const draft = this.draft();
            draft.values.formula = result.formula;
            draft.dirty = true;
            this.updatePreview();
            this.status("Modifications à enregistrer");
            textarea.focus();
            textarea.setSelectionRange(result.cursor, result.cursor);
        } else if (command === "save") {
            await this.save();
        } else if (command === "chat" && this.view === "verses") {
            button.disabled = true;
            try {
                await sendArcaneVerse(this.sheet.actor, this.draft().values);
                this.status("Verset envoyé au chat");
            } finally {
                button.disabled = false;
            }
        } else if (command === "delete") {
            await this.remove();
        } else if (command === "cancel") {
            const id = this.selected[this.view];
            this.drafts.delete(this.draftKey(this.view, id));
            await this.sheet.render();
        }
    }

    async save() {
        const view = this.view;
        const id = this.selected[view];
        const draft = this.draft();
        if (!draft) return;
        if (!draft.isNew && !this.collection()[id]) {
            this.status("Cette entrée a été supprimée. Copiez vos notes dans une nouvelle entrée.");
            return;
        }
        const values = { ...draft.values };
        if (view === "glyphs") {
            values.glyphId = normalizeGlyphId(values.glyphId);
            if (!isGlyphId(values.glyphId)) {
                this.status("Saisissez un identifiant comme G042.");
                this.element.querySelector('[data-notebook-field="glyphId"]').focus();
                return;
            }
            if (Object.entries(this.collection()).some(([key, entry]) =>
                key !== id && normalizeGlyphId(entry.glyphId) === values.glyphId)) {
                this.status("Ce glyphe possède déjà une entrée dans ce carnet.");
                return;
            }
        } else {
            values.name = values.name.trim();
            if (!values.name) {
                this.status("Donnez un nom à ce Verset.");
                this.element.querySelector('[data-notebook-field="name"]').focus();
                return;
            }
        }
        const path = `system.arcanology.${view}.${id}`;
        const changes = draft.isNew ? { [path]: values } : Object.fromEntries(
            FIELDS[view].filter(field => values[field] !== draft.original[field])
                .map(field => [path + "." + field, values[field]])
        );
        await this.mutate(async () => {
            if (Object.keys(changes).length) await this.sheet.actor.update(changes);
            this.drafts.delete(this.draftKey(view, id));
        });
        this.status("Enregistré");
    }

    async remove() {
        const view = this.view;
        const id = this.selected[view];
        const draft = this.draft();
        if (!draft) return;
        if (!draft.isNew) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: view === "glyphs" ? "Supprimer le glyphe du carnet" : "Supprimer le Verset" },
                content: "<p>Supprimer cette entrée et ses notes ?</p>",
                yes: { label: "Supprimer" }, no: { label: "Conserver" }, rejectClose: false
            });
            if (!confirmed) return;
        }
        await this.mutate(async () => {
            if (this.collection()[id]) {
                await this.sheet.actor.update({
                    system: { arcanology: { [view]: { [id]: new foundry.data.operators.ForcedDeletion() } } }
                });
            }
            this.drafts.delete(this.draftKey(view, id));
            this.selected[view] = null;
        });
    }

    async mutate(operation) {
        this.busy = true;
        for (const control of this.element.querySelectorAll("button, input, textarea, select")) control.disabled = true;
        try {
            await operation();
        } finally {
            this.busy = false;
            await this.sheet.render();
        }
    }
}

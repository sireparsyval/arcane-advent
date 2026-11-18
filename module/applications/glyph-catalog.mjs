import { glyphDisplay, isGlyphId, normalizeGlyphId } from "../glyphs.mjs";
import {
    getGlyphCatalog, GLYPH_PACK, GLYPH_SORT_FIELDS, importGlyphReferences, isGlyphSort, nextGlyphSort,
    requireGlyphGM, showGlyphInChat, sortGlyphReferences
} from "../glyph-catalog.mjs";

const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const searchText = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLocaleLowerCase("fr");

export class GlyphCatalog extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "arcane-glyph-catalog",
        classes: ["arcane-advent", "aa-glyph-catalog"],
        position: { width: 1000, height: 650 },
        window: { title: "Glyphes — MJ", resizable: true },
        actions: {
            createGlyph: this._create,
            editGlyph: this._edit,
            deleteGlyph: this._delete,
            showGlyph: this._show,
            importGlyphs: this._import,
            sortGlyphs: this._sort
        }
    };

    static PARTS = {
        body: {
            template: "systems/arcane-advent/templates/glyph-catalog.hbs",
            scrollable: [".aa-glyph-catalog-table"]
        }
    };

    _query = "";
    _sortField = "sort";
    _sortDirection = "ascending";
    _hooks = [];
    _busy = false;

    _canRender(options) {
        requireGlyphGM();
        return super._canRender(options);
    }

    async _prepareContext(options) {
        const context = await super._prepareContext(options);
        const pack = await getGlyphCatalog();
        const documents = await pack.getDocuments({ type: "glyph" });
        const query = searchText(this._query);
        const rows = sortGlyphReferences(documents.map(item => {
            const { system } = item;
            const search = searchText([system.glyphId, system.meaning, system.pronunciation, system.category].join(" "));
            return {
                id: item.id, sort: item.sort ?? 0, ...system.toObject(), character: glyphDisplay(system.glyphId).character,
                search, visible: search.includes(query)
            };
        }), this._sortField, this._sortDirection);
        const columns = Object.entries(GLYPH_SORT_FIELDS).map(([field, label]) => {
            const active = field === this._sortField;
            return {
                field, label, active, isOrder: field === "sort",
                sort: active ? this._sortDirection : "none",
                descending: active && this._sortDirection === "descending"
            };
        });
        return {
            ...context, rows, columns, query: this._query,
            count: rows.filter(row => row.visible).length, busy: this._busy
        };
    }

    async _onRender(context, options) {
        await super._onRender(context, options);
        const search = this.element.querySelector("[data-glyph-query]");
        search.addEventListener("input", () => {
            this._query = search.value;
            const query = searchText(search.value);
            let count = 0;
            for (const row of this.element.querySelectorAll("[data-glyph-search]")) {
                row.hidden = !row.dataset.glyphSearch.includes(query);
                if (!row.hidden) count++;
            }
            this.element.querySelector("[data-glyph-count]").textContent = String(count);
        });
        this.element.querySelector("[data-glyph-import]").addEventListener("change", event => {
            const file = event.target.files[0];
            if (!file) return;
            this._perform(async () => {
                const data = JSON.parse(await file.text());
                const count = await importGlyphReferences(data);
                ui.notifications.info(count + (data.format === "arcane-advent.glyph-order" ? " positions importées." : " références importées."));
            });
        });
        for (const input of this.element.querySelectorAll("[data-glyph-order]")) {
            input.addEventListener("change", () => this._perform(async () => {
                const sort = input.valueAsNumber;
                if (!isGlyphSort(sort)) throw new Error("Saisissez un numéro d’ordre entier positif ou nul.");
                const item = await this._entry(input);
                if (item.sort !== sort) await item.update({ sort });
            }));
            input.addEventListener("keydown", event => {
                if (event.key === "Enter") { event.preventDefault(); input.blur(); }
            });
        }
        if (!this._hooks.length) {
            for (const hook of ["createItem", "updateItem", "deleteItem"]) {
                const id = Hooks.on(hook, item => {
                    if (item.pack === GLYPH_PACK && !this._busy) this.render({ force: false });
                });
                this._hooks.push([hook, id]);
            }
        }
    }

    async _onClose(options) {
        for (const [hook, id] of this._hooks) Hooks.off(hook, id);
        this._hooks = [];
        await super._onClose(options);
    }

    async _perform(operation) {
        if (this._busy) return;
        requireGlyphGM();
        this._busy = true;
        for (const control of this.element.querySelectorAll("button, [data-glyph-order]")) control.disabled = true;
        try {
            await operation();
        } catch (error) {
            ui.notifications.error(error.message);
        } finally {
            this._busy = false;
            if (this.rendered) await this.render({ force: false });
        }
    }

    async _entry(target) {
        requireGlyphGM();
        const pack = await getGlyphCatalog();
        const item = await pack.getDocument(target.dataset.glyphEntry);
        if (item?.type !== "glyph") throw new Error("Cette référence a été supprimée.");
        return item;
    }

    static async _sort(_event, target) {
        requireGlyphGM();
        const field = target.dataset.glyphSort;
        if (this._busy || !Object.hasOwn(GLYPH_SORT_FIELDS, field)) return;
        this._sortDirection = field === this._sortField && this._sortDirection === "ascending"
            ? "descending" : "ascending";
        this._sortField = field;
        await this.render({ force: false });
        this.element.querySelector(`[data-glyph-sort="${field}"]`)?.focus({ preventScroll: true });
    }

    static async _create() {
        return this._perform(async () => {
            const id = await DialogV2.prompt({
                window: { title: "Ajouter une référence de glyphe" },
                content: '<label>Identifiant<input name="glyphId" value="" placeholder="G019" required pattern="[Gg][0-9]{3,}" autofocus></label>',
                ok: { label: "Ajouter", callback: (_event, button) => normalizeGlyphId(new FormData(button.form).get("glyphId")) },
                rejectClose: false
            });
            if (id === null) return;
            if (!isGlyphId(id)) throw new Error("Saisissez un identifiant comme G019.");
            const pack = await getGlyphCatalog();
            const documents = await pack.getDocuments({ type: "glyph" });
            if (documents.some(item => item.system.glyphId === id)) throw new Error("Cet ID est déjà présent dans le répertoire.");
            const [item] = await foundry.documents.Item.implementation.createDocuments(
                [{ type: "glyph", name: id, sort: nextGlyphSort(documents), system: { glyphId: id }, ownership: { default: 0 } }],
                { pack: pack.collection }
            );
            await item.sheet.render({ force: true });
        });
    }

    static async _edit(_event, target) {
        return this._perform(async () => (await this._entry(target)).sheet.render({ force: true }));
    }

    static async _show(_event, target) {
        return this._perform(async () => showGlyphInChat((await this._entry(target)).system.glyphId));
    }

    static async _delete(_event, target) {
        return this._perform(async () => {
            const item = await this._entry(target);
            const confirmed = await DialogV2.confirm({
                window: { title: "Supprimer la référence du glyphe" },
                content: "<p>Supprimer cette référence et ses notes MJ ?</p>",
                yes: { label: "Supprimer" }, no: { label: "Conserver" }, rejectClose: false
            });
            if (confirmed) await item.delete();
        });
    }

    static _import() {
        requireGlyphGM();
        const input = this.element.querySelector("[data-glyph-import]");
        input.value = "";
        input.click();
    }
}

export function registerGlyphCatalog() {
    game.settings.register("arcane-advent", "glyphCatalogSeeded", {
        scope: "world", config: false, type: Boolean, default: false
    });
    game.settings.registerMenu("arcane-advent", "glyphCatalog", {
        name: "Glyphes — MJ", label: "Ouvrir le répertoire",
        hint: "Références arcaniques du monde, réservées au MJ.",
        icon: "fa-solid fa-book-open", type: GlyphCatalog, restricted: true
    });
    Hooks.on("renderCompendiumDirectory", (_app, element) => {
        if (!game.user.isGM || element.querySelector("[data-glyph-catalog-open]")) return;
        const header = element.querySelector(".directory-header");
        if (!header) return;
        const button = element.ownerDocument.createElement("button");
        button.type = "button";
        button.dataset.glyphCatalogOpen = "";
        button.innerHTML = '<i class="fa-solid fa-book-open" aria-hidden="true"></i><span>Glyphes — MJ</span>';
        button.addEventListener("click", () => {
            const existing = foundry.applications.instances.get("arcane-glyph-catalog");
            if (existing) existing.bringToFront();
            else new GlyphCatalog().render({ force: true });
        });
        header.append(button);
    });
}

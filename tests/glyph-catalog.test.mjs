import test from "node:test";
import assert from "node:assert/strict";
import { GLYPH_CHARACTERS } from "../module/glyphs.mjs";
import { getGlyphCatalog, GLYPH_PACK, importGlyphReferences, parseGlyphReferences, showGlyphInChat } from "../module/glyph-catalog.mjs";
import { sortGlyphReferences } from "../module/glyph-catalog.mjs";

function environment() {
    const documents = new Map();
    const settings = new Map();
    const created = [];
    const messages = [];
    let failUpdate = false;
    const pack = {
        collection: GLYPH_PACK, documentName: "Item", metadata: { packageType: "world" },
        ownership: { GAMEMASTER: "OWNER", ASSISTANT: "OWNER", TRUSTED: "NONE", PLAYER: "NONE" },
        locked: false,
        async configure(data) { Object.assign(this, data); },
        async getDocuments() { return [...documents.values()]; }
    };
    const withModel = data => ({
        ...data,
        id: data._id,
        system: { ...data.system, toObject() {
            const { toObject, ...values } = this;
            return values;
        } }
    });
    globalThis.game = {
        user: { isGM: true }, packs: new Map(),
        settings: { get: (_namespace, key) => settings.get(key), set: async (_namespace, key, value) => settings.set(key, value) }
    };
    globalThis.foundry = { documents: {
        collections: { CompendiumCollection: { async createCompendium(metadata) {
            assert.equal(metadata.ownership.PLAYER, "NONE");
            assert.equal(metadata.ownership.TRUSTED, "NONE");
            game.packs.set(GLYPH_PACK, pack);
            return pack;
        } } },
        Item: { implementation: {
            async createDocuments(records) {
                created.push(...records);
                return records.map(record => {
                    const id = record._id ?? ("new" + documents.size);
                    if (documents.has(id)) throw Error("Document déjà créé");
                    const item = withModel({ ...record, _id: id });
                    documents.set(id, item);
                    return item;
                });
            },
            async updateDocuments(updates) {
                if (failUpdate) { failUpdate = false; throw Error("Connexion interrompue"); }
                for (const update of updates) {
                    const item = documents.get(update._id);
                    item.name = update.name;
                    for (const [key, value] of Object.entries(update)) {
                        if (key.startsWith("system.")) item.system[key.slice(7)] = value;
                    }
                }
            }
        } },
        ChatMessage: { async create(data) { messages.push(data); return data; } }
    } };
    return { documents, created, messages, failNextUpdate() { failUpdate = true; } };
}

const file = glyphs => ({ format: "arcane-advent.glyph-references", version: 1, glyphs });

test("les quatre colonnes se trient en français dans les deux sens", () => {
    const entries = [
        { glyphId: "G094", meaning: "Zèbre", pronunciation: "Beta", category: "Famille 10" },
        { glyphId: "G019", meaning: "Énergie", pronunciation: "alpha", category: "Famille 2" },
        { glyphId: "G304", meaning: "Air", pronunciation: "Gamma", category: "Famille 2" }
    ];
    const expected = {
        glyphId: [["G019", "G094", "G304"], ["G304", "G094", "G019"]],
        meaning: [["G304", "G019", "G094"], ["G094", "G019", "G304"]],
        pronunciation: [["G019", "G094", "G304"], ["G304", "G094", "G019"]],
        category: [["G019", "G304", "G094"], ["G094", "G019", "G304"]]
    };
    for (const [field, [ascending, descending]] of Object.entries(expected)) {
        assert.deepEqual(sortGlyphReferences(entries, field).map(row => row.glyphId), ascending);
        assert.deepEqual(sortGlyphReferences(entries, field, "descending").map(row => row.glyphId), descending);
    }
    assert.deepEqual(entries.map(row => row.glyphId), ["G094", "G019", "G304"]);
});

test("l’import valide les références et ignore les propriétés étrangères", () => {
    assert.deepEqual(parseGlyphReferences(file([{ glyphId: " g019 ", meaning: "Hypothèse", actorId: "secret" }])),
        [{ glyphId: "G019", meaning: "Hypothèse" }]);
    assert.throws(() => parseGlyphReferences(file([{ glyphId: "G019" }, { glyphId: "g019" }])));
    assert.throws(() => parseGlyphReferences(file([{ glyphId: "G019", meaning: {} }])));
});

test("le catalogue et le partage exigent un compte MJ", async () => {
    const state = environment();
    game.user.isGM = false;
    await assert.rejects(getGlyphCatalog());
    await assert.rejects(importGlyphReferences(file([])));
    await assert.rejects(showGlyphInChat("G019"));
    assert.equal(state.created.length, 0);
    assert.equal(state.messages.length, 0);
});

test("le premier accès crée les IDs une seule fois et respecte les suppressions", async () => {
    const state = environment();
    await Promise.all([getGlyphCatalog(), getGlyphCatalog()]);
    assert.equal(state.created.length, Object.keys(GLYPH_CHARACTERS).length);
    assert.equal(new Set(state.created.map(item => item._id)).size, state.created.length);
    assert.ok(state.created.every(item => item._id.length === 16 && !item.system.meaning));
    state.documents.delete(state.created[0]._id);
    await getGlyphCatalog();
    assert.equal(state.documents.size, state.created.length - 1);
});

test("un import interrompu peut être repris sans doublons ni effacement des notes", async () => {
    const state = environment();
    await getGlyphCatalog();
    const existing = [...state.documents.values()].find(item => item.system.glyphId === "G019");
    existing.system.description = "Notes déjà saisies";
    const data = file([
        { glyphId: "G019", meaning: "Référence", description: "" },
        { glyphId: "G777", meaning: "Autre référence" }
    ]);
    state.failNextUpdate();
    await assert.rejects(importGlyphReferences(data));
    await importGlyphReferences(data);
    assert.equal([...state.documents.values()].filter(item => item.system.glyphId === "G777").length, 1);
    assert.equal(existing.system.meaning, "Référence");
    assert.equal(existing.system.description, "Notes déjà saisies");
    await showGlyphInChat("G019");
    assert.deepEqual(state.messages, [{ content: "@Arcane[G019]" }]);
});

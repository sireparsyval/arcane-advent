import test from "node:test";
import assert from "node:assert/strict";
import { STORAGE_IMAGE } from "../module/storage.mjs";
import { migrateStorageImages } from "../module/storage-migration.mjs";

const OLD = "assets/Arcane Advent/Entités/Objets/item.png";
function fixture(t, configured = OLD) {
    const previous = globalThis.game;
    t.after(() => { globalThis.game = previous; });
    const writes = [];
    const assign = (target, path, value) => {
        const keys = path.split(".");
        const last = keys.pop();
        const parent = keys.reduce((object, key) => object[key] ??= {}, target);
        parent[last] = structuredClone(value);
    };
    const document = (type, data, items = []) => ({
        type, id: data._id, data, items,
        get img() { return data.img; },
        get system() { return data.system; },
        get prototypeToken() { return data.prototypeToken; },
        getFlag() { return this.busy; },
        async update(changes) {
            writes.push({ id: this.id, changes: structuredClone(changes) });
            for (const [path, value] of Object.entries(changes)) assign(data, path, value);
        },
        async updateEmbeddedDocuments(type, updates) {
            assert.equal(type, "Item");
            for (const { _id, ...changes } of updates) await items.find(item => item.id === _id).update(changes);
        }
    });
    const tokens = [];
    const scene = { tokens, async updateEmbeddedDocuments(type, updates) {
        assert.equal(type, "Token");
        for (const { _id, ...changes } of updates) {
            writes.push({ id: _id, changes: structuredClone(changes) });
            const token = tokens.find(token => token.id === _id);
            for (const [path, value] of Object.entries(changes)) assign(token, path, value);
        }
    } };
    const settings = { value: configured, get() { return this.value; }, async set(scope, key, value) {
        assert.equal(scope, "arcane-advent"); assert.equal(key, "storageImage");
        writes.push({ setting: key, value }); this.value = value;
    } };
    globalThis.game = { users: { activeGM: { isSelf: true } }, settings, actors: [], items: [], scenes: [scene] };
    return { document, writes, tokens, settings };
}

test("the renamed stash image updates saved defaults, inventories and scene tokens without changing contents", async t => {
    const { document, writes, tokens, settings } = fixture(t);
    const contents = [
        { _id: "bag", name: "Sac", type: "container", img: OLD, system: { groundTokenImage: OLD } },
        { _id: "apple", name: "Pommes", type: "object", img: "assets/apple.webp",
            system: { quantity: 7, containerId: "bag", groundTokenImage: "assets/apple-token.webp" } }
    ];
    const bag = document("container", { _id: "carried", system: { groundTokenImage: OLD } });
    const model = document("storage", { _id: "model", img: OLD, prototypeToken: { texture: { src: encodeURI(OLD) } }, system: {} }, [bag]);
    const stash = document("storage", { _id: "stash", name: "Dépôt", img: encodeURI(OLD), system: { contents: structuredClone(contents) } });
    game.actors.push(model); game.items.push(stash);
    tokens.push({ id: "token", actorLink: true, texture: { src: OLD }, delta: { img: OLD } });
    await migrateStorageImages();
    assert.equal(settings.value, STORAGE_IMAGE);
    assert.equal(model.img, STORAGE_IMAGE);
    assert.equal(model.prototypeToken.texture.src, STORAGE_IMAGE);
    assert.equal(bag.system.groundTokenImage, STORAGE_IMAGE);
    assert.equal(stash.img, STORAGE_IMAGE);
    assert.deepEqual(stash.system.contents, [
        { ...contents[0], img: STORAGE_IMAGE, system: { groundTokenImage: STORAGE_IMAGE } }, contents[1]
    ]);
    assert.equal(tokens[0].texture.src, STORAGE_IMAGE);
    assert.equal(tokens[0].delta.img, STORAGE_IMAGE);
    const count = writes.length;
    await migrateStorageImages();
    assert.equal(writes.length, count, "A second load should not rewrite already migrated documents");
});

test("custom artwork and custom world defaults are preserved", async t => {
    const { document, tokens, writes, settings } = fixture(t, "assets/custom-default.webp");
    game.actors.push(document("character", { _id: "hero", img: "assets/portrait.webp",
        prototypeToken: { texture: { src: "assets/hero-token.webp" } }, system: {} }));
    game.items.push(document("storage", { _id: "chest", img: "assets/chest.webp", system: { contents: [] } }));
    tokens.push({ id: "custom", actorLink: true, texture: { src: "assets/chest-token.webp" } });
    await migrateStorageImages();
    assert.equal(settings.value, "assets/custom-default.webp");
    assert.deepEqual(writes, []);
});

test("unlinked inventories are migrated, while busy inventories wait until the next load", async t => {
    const { document, tokens } = fixture(t, STORAGE_IMAGE);
    const embedded = document("object", { _id: "unlinked-item", img: OLD, system: { quantity: 3 } });
    const synthetic = document("npc", { _id: "synthetic", system: {} }, [embedded]);
    tokens.push({ id: "unlinked", actorLink: false, actor: synthetic, texture: { src: "assets/npc.webp" } });
    const busy = document("storage", { _id: "busy", img: OLD, system: { contents: [] } });
    busy.busy = "transfer"; game.items.push(busy);
    await migrateStorageImages();
    assert.equal(embedded.img, STORAGE_IMAGE);
    assert.equal(embedded.system.quantity, 3);
    assert.equal(busy.img, OLD);
    busy.busy = false;
    await migrateStorageImages();
    assert.equal(busy.img, STORAGE_IMAGE);
});

test("only the active GM migrates saved image paths", async t => {
    const { writes, settings } = fixture(t);
    game.users.activeGM.isSelf = false;
    await migrateStorageImages();
    assert.equal(settings.value, OLD);
    assert.deepEqual(writes, []);
});

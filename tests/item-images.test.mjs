import test from "node:test";
import assert from "node:assert/strict";
import { directoryImageChanges, syncItemSourceImage, migrateDirectoryImages } from "../module/item-images.mjs";

const item = (type, system = {}, img = "icons/svg/item-bag.svg") => ({ type, system, img });
test("directory artwork follows custom ground images and scenery placement images", async () => {
    for (const type of ["object", "weapon", "shield", "protection", "accessory", "purse", "container"]) {
        assert.deepEqual(await directoryImageChanges(item(type, { groundTokenImage: "assets/custom.png" })), { img: "assets/custom.png" });
    }
    for (const type of ["sceneryElement", "interactiveElement", "visualEffect"]) {
        assert.deepEqual(await directoryImageChanges(item(type, { placement: { image: "assets/scene.png" } })), { img: "assets/scene.png" });
    }
    assert.deepEqual(await directoryImageChanges(item("trait", { groundTokenImage: "ignored.png" })), {});
});

test("new defaults replace white bags, while a separate custom icon is kept when no ground art is configured", async () => {
    for (const [type, name] of [["object", "item-generic.png"], ["container", "bag-item.png"], ["storage", "bag-item.png"], ["purse", "bag-luqa.png"]]) {
        assert.deepEqual(await directoryImageChanges(item(type)), { img: "assets/arcane-advent/entities/objects/" + name });
        assert.deepEqual(await directoryImageChanges(item(type, {}, "assets/icon.png")), {});
    }
    const source = item("weapon", { groundTokenImage: "old.png" }, "old.png");
    assert.deepEqual(await directoryImageChanges(source, { "system.groundTokenImage": "new.png" }), { img: "new.png" });
    assert.deepEqual(await directoryImageChanges(source, { system: { groundTokenImage: "" } }), { img: "assets/arcane-advent/entities/objects/item-generic.png" });
    assert.deepEqual(await directoryImageChanges(source, { system: { description: "changed" } }), {});
});

test("videos use a stable native thumbnail rather than a broken image URL", async () => {
    let count = 0;
    globalThis.game = { video: { thumbs: new Map(), async createThumbnail(path, options) {
        count++; assert.equal(path, "assets/fire.webm"); assert.deepEqual(options, { width: 128, height: 128 }); return "data:image/webp;base64,thumb";
    } } };
    const source = item("visualEffect", { placement: { image: "assets/fire.webm" } });
    await syncItemSourceImage(source);
    assert.equal(source.img, "data:image/webp;base64,thumb");
    assert.equal(source.flags["arcane-advent"].directoryVideoSource, "assets/fire.webm");
    assert.deepEqual(await directoryImageChanges(source), {}); assert.equal(count, 1);
    source.system.placement.image = "assets/fire.png"; await syncItemSourceImage(source);
    assert.equal(source.img, "assets/fire.png"); assert.equal(source.flags["arcane-advent"].directoryVideoSource, null);
    source.system.placement.image = "assets/fire.webm"; await syncItemSourceImage(source);
    assert.equal(count, 2); assert.equal(source.img, "data:image/webp;base64,thumb");
});

test("existing world models, carried items and serialized storage contents are synchronized without touching their parameters", async () => {
    const updates = [];
    const document = (type, system, img) => Object.assign(item(type, system, img), {
        getFlag() { return this.busy; },
        async update(changes) {
            updates.push(structuredClone(changes));
            if (changes.img) this.img = changes.img;
            if (changes["system.contents"]) this.system.contents = changes["system.contents"];
        }
    });
    const preset = document("weapon", { groundTokenImage: "sword.png", damageFormula: "1d6" });
    const carried = document("object", { groundTokenImage: "apple.png", quantity: 7 });
    const storage = document("storage", { contents: [{ _id: "nested", ...item("object", { groundTokenImage: "rope.png", quantity: 4 }) }] }, "chest.png");
    const actor = { items: [carried] };
    globalThis.game = { users: { activeGM: { isSelf: true } }, items: [preset, storage], actors: [actor], scenes: [] };
    await migrateDirectoryImages();
    assert.equal(preset.img, "sword.png"); assert.equal(preset.system.damageFormula, "1d6");
    assert.equal(carried.img, "apple.png"); assert.equal(carried.system.quantity, 7);
    assert.equal(storage.img, "chest.png"); assert.equal(storage.system.contents[0].img, "rope.png");
    assert.equal(storage.system.contents[0].system.quantity, 4);
    const count = updates.length; await migrateDirectoryImages(); assert.equal(updates.length, count);
    carried.system.groundTokenImage = "later.png"; actor.busy = true; actor.getFlag = () => actor.busy;
    await migrateDirectoryImages(); assert.equal(carried.img, "apple.png");
    game.users.activeGM.isSelf = false; actor.busy = false;
    await migrateDirectoryImages(); assert.equal(carried.img, "apple.png");
});

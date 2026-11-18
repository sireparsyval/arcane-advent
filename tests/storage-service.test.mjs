import test from "node:test";
import assert from "node:assert/strict";
import { isDeepStrictEqual } from "node:util";
import { registerStorageService, STORAGE_QUERY, storageAccess, requestInventoryAction, createStorage, isGroundTemplate } from "../module/storage.mjs";
import { inventoryForDocument, inventoryForToken } from "../module/storage-inventory.mjs";
import { migrateStorageActors } from "../module/storage-migration.mjs";

class Collection extends Map {
    [Symbol.iterator]() { return this.values(); }
    some(fn) { return [...this.values()].some(fn); }
    filter(fn) { return [...this.values()].filter(fn); }
    find(fn) { return [...this.values()].find(fn); }
}
let serial = 0, createCount = 0;
const gm = { id: "gm", isGM: true, isSelf: true };
const alice = { id: "alice", viewedScene: "scene" };
const bob = { id: "bob", viewedScene: "scene" };
const documents = new Map();
const scene = { id: "scene", grid: { size: 100 }, width: 2000, height: 2000, tokens: new Collection(),
    async createEmbeddedDocuments(_type, data) { return data.map(value => {
        const base = documents.get(`Actor.${value.actorId}`);
        const result = token(base);
        Object.assign(result, value);
        if (!value.actorLink) {
            const copy = actor(`copy${++serial}`, "gm", base.type);
            documents.delete(copy.uuid);
            game.actors.delete(copy.id);
            Object.assign(copy, { id: base.id, uuid: `${result.uuid}.Actor.${base.id}`,
                name: value.delta.name, img: value.delta.img, isToken: true, token: result,
                public: true, system: { ...base.system, ...value.delta.system }, flags: { ...base.flags } });
            documents.set(copy.uuid, copy);
            result.actor = copy;
        }
        return result;
    }); },
    async deleteEmbeddedDocuments(_type, ids) { ids.forEach(id => {
        const value = scene.tokens.get(id);
        if (value?.actor?.isToken) documents.delete(value.actor.uuid);
        if (value) documents.delete(value.uuid);
        scene.tokens.delete(id);
    }); },
    async updateEmbeddedDocuments(_type, changes) { return changes.map(change => {
        const value = scene.tokens.get(change._id);
        merge(value, change);
        if (change.actorId) value.actor = game.actors.get(change.actorId);
        return value;
    }); }
};

function item(id, quantity) {
    return { id, name: id, type: "object", system: { quantity, containerId: null },
        toObject() { return { _id: this.id, name: this.name, type: this.type, system: { ...this.system } }; } };
}
function actor(id, owner, type = "character") {
    const value = { id, uuid: `Actor.${id}`, type, name: id, system: {}, flags: {}, items: new Collection(),
        testUserPermission(user, permission) { return user.isGM || (permission === "OWNER" ? user.id === owner : this.public); },
        getFlag(_scope, key) { return this.flags[key]; },
        async setFlag(_scope, key, data) { this.flags[key] = data; },
        async unsetFlag(_scope, key) { delete this.flags[key]; },
        async createEmbeddedDocuments(_type, data) { return data.map(entry => {
            const result = item(entry._id, entry.system.quantity);
            Object.assign(result, { type: entry.type, name: entry.name, system: structuredClone(entry.system) });
            this.items.set(result.id, result); return result;
        }); },
        async updateEmbeddedDocuments(_type, data) { return data.map(entry => {
            const result = this.items.get(entry._id);
            if (entry.system) result.system = { ...entry.system };
            if (Object.hasOwn(entry, "system.quantity")) result.system.quantity = entry["system.quantity"];
            return result;
        }); },
        async deleteEmbeddedDocuments(_type, ids) { return ids.map(id => { const result = this.items.get(id); this.items.delete(id); return result; }); },
        async getTokenDocument(position) { return { toObject: () => ({ actorId: this.id, actorLink: true, ...position }) }; },
        async delete() { documents.delete(this.uuid); game.actors.delete(this.id); }
    };
    documents.set(value.uuid, value);
    game.actors.set(value.id, value);
    return value;
}
function token(actor, hidden = false) {
    const value = { documentName: "Token", id: `t${++serial}`, uuid: `Scene.scene.Token.t${serial}`, actor,
        parent: scene, hidden, x: 100, y: 100, width: 1, actorId: actor.id, actorLink: true,
        getFlag(scope, key) { return this.flags?.[scope]?.[key]; } };
    documents.set(value.uuid, value); scene.tokens.set(value.id, value); return value;
}
globalThis.fromUuid = async uuid => documents.get(uuid);
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.foundry = { utils: { randomID: () => `id${++serial}`, equals: isDeepStrictEqual } };
globalThis.canvas = { scene, stage: { pivot: { x: 300, y: 300 } } };
globalThis.game = { user: gm, users: { activeGM: gm }, scenes: new Collection([["scene", scene]]), actors: new Collection(), items: new Collection(),
    settings: { register() {}, get: () => "assets/test.png" } };
globalThis.CONFIG = { queries: {} };
const notifications = [];
globalThis.ui = { notifications: { error: message => notifications.push(message) } };
globalThis.Actor = { create: async data => {
    createCount++;
    const value = actor(`ground${serial++}`, "gm", "storage");
    value.system = data.system; value.flags = data.flags?.["arcane-advent"] ?? {};
    value.name = data.name; value.img = data.img; value.public = true; return value;
} };

function merge(target, changes) {
    for (const [path, value] of Object.entries(changes)) {
        const parts = path.split(".");
        let parent = target;
        for (const key of parts.slice(0, -1)) parent = parent[key] ??= {};
        const key = parts.at(-1);
        if (value && typeof value === "object" && !Array.isArray(value)) merge(parent[key] ??= {}, value);
        else parent[key] = structuredClone(value);
    }
    return target;
}
class StoredItem {
    constructor(data) {
        this._source = structuredClone(data);
        this._source._id ??= `stored${++serial}`;
        this._source.system = { containerId: null, quantity: 1, weight: 0, ...this._source.system };
        if (this.type === "storage") this._source.system.contents ??= [];
    }
    documentName = "Item";
    isOwner = true;
    get id() { return this._source._id; }
    get uuid() { return `Item.${this.id}`; }
    get type() { return this._source.type; }
    get system() { return this._source.system; }
    get name() { return this._source.name; }
    get img() { return this._source.img; }
    getFlag(scope, key) { return this._source.flags?.[scope]?.[key]; }
    async setFlag(scope, key, value) { merge(this._source, { [`flags.${scope}.${key}`]: value }); }
    async unsetFlag(scope, key) { delete this._source.flags?.[scope]?.[key]; }
    testUserPermission(user) { return user.isGM || this._source.ownership?.default >= 2; }
    toObject() { return structuredClone(this._source); }
    updateSource(changes) { merge(this._source, changes); }
    validate() { return true; }
    async update(changes) { this._source = merge(structuredClone(this._source), changes); return this; }
    async delete() { documents.delete(this.uuid); game.items.delete(this.id); }
    static async create(data) { const item = new this(data); game.items.set(item.id, item); documents.set(item.uuid, item); return item; }
}
globalThis.Item = StoredItem;
CONFIG.Item = { documentClass: StoredItem };
const groundToken = storage => [...scene.tokens].find(token => inventoryForToken(token)?.uuid === storage.uuid);
const stock = (storage, id, quantity) => storage.createEmbeddedDocuments("Item", [item(id, quantity).toObject()], { keepId: true });
registerStorageService();
const query = (data, user = alice) => CONFIG.queries[STORAGE_QUERY]({ requestId: `request${++serial}`, ...data }, { user });
function request(source, destination, extra = {}) {
    return { action: "transfer", source: source.uuid, targetToken: (destination.document ? groundToken(destination) : token(destination)).uuid,
        selections: [{ id: "apple", quantity: 1 }], ...extra };
}

test("authenticated sender cannot transfer another player's inventory", async () => {
    const source = actor("permission-source", "bob"); source.items.set("apple", item("apple", 2));
    const destination = actor("permission-dest", "alice");
    const result = await query(request(source, destination));
    assert.match(result.error, /accès/);
    assert.equal(source.items.get("apple").system.quantity, 2);
    assert.equal(destination.items.size, 0);
});

test("owner may give to another player's visible token", async () => {
    const source = actor("give-source", "alice"); source.items.set("apple", item("apple", 2));
    const destination = actor("give-dest", "bob");
    assert.equal((await query(request(source, destination))).count, 1);
    assert.equal(source.items.get("apple").system.quantity, 1);
    assert.equal(destination.items.size, 1);
});

test("hidden and off-scene receivers are rejected", async () => {
    const source = actor("hidden-source", "alice"); source.items.set("apple", item("apple", 2));
    const destination = actor("hidden-dest", "bob");
    assert.match((await query(request(source, destination, { targetToken: token(destination, true).uuid }))).error, /accessible/);
    assert.match((await query(request(source, destination), { ...alice, viewedScene: "elsewhere" })).error, /accessible/);
});

test("open scene storage can be looted but locked, hidden and unplaced storage cannot", async () => {
    const source = actor("chest", "gm", "storage"); source.public = true;
    source.items.set("apple", item("apple", 4));
    const destination = actor("looter", "alice");
    assert.equal(Boolean(storageAccess(source, alice)), false);
    const t = token(source, true);
    assert.equal(Boolean(storageAccess(source, alice)), false);
    t.hidden = false;
    assert.equal((await query(request(source, destination))).count, 1);
    source.system.locked = true;
    assert.match((await query(request(source, destination))).error, /accès/);
    assert.equal(source.items.get("apple").system.quantity, 3);
});

test("two simultaneous withdrawals of the last object have only one winner", async () => {
    const source = actor("last-apple", "gm", "storage"); source.public = true; token(source);
    source.items.set("apple", item("apple", 1));
    const a = actor("winner-a", "alice"), b = actor("winner-b", "bob");
    const results = await Promise.all([query(request(source, a)), query(request(source, b), bob)]);
    assert.equal(results.filter(value => value.count === 1).length, 1);
    assert.equal(a.items.size + b.items.size, 1);
    assert.equal(source.items.size, 0);
});

test("duplicate request ID returns the cached response without a second transfer", async () => {
    const source = actor("replay-source", "alice"); source.items.set("apple", item("apple", 3));
    const destination = actor("replay-dest", "bob");
    const data = request(source, destination, { requestId: `same${++serial}` });
    const results = await Promise.all([query(data), query(data)]);
    assert.equal(results[0].count, 1);
    assert.deepEqual(results[0], results[1]);
    assert.equal(source.items.get("apple").system.quantity, 2);
    assert.equal(destination.items.size, 1);
});

test("ground drops reuse one model and keep independent token inventories", async () => {
    const source = actor("drop-source", "alice"); source.items.set("apple", item("apple", 5));
    const previous = createCount;
    const result = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid, selections: [{ id: "apple", quantity: 2 }] });
    assert.equal(result.count, 1);
    assert.equal(createCount, previous + 1);
    assert.equal(source.items.get("apple").system.quantity, 3);
    const ground = [...scene.tokens].find(t => inventoryForToken(t)?.system.ground && inventoryForToken(t).items.size);
    assert.equal(ground.actorLink, false);
    assert.equal(ground.actor.isToken, true);
    assert.ok(inventoryForToken(ground).uuid.startsWith("Item."));
    assert.equal([...inventoryForToken(ground).items][0].system.quantity, 2);
    const second = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid,
        selections: [{ id: "apple", quantity: 1 }] });
    assert.equal(second.count, 1);
    assert.equal(createCount, previous + 1);
    const copies = [...scene.tokens].filter(t => inventoryForToken(t)?.system.ground && inventoryForToken(t).items.size);
    assert.equal(copies.length, 2);
    assert.equal(copies[0].actorId, copies[1].actorId);
    assert.notEqual(inventoryForToken(copies[0]).uuid, inventoryForToken(copies[1]).uuid);
    assert.equal([...inventoryForToken(copies[0]).items][0].system.quantity, 2);
    assert.equal([...inventoryForToken(copies[1]).items][0].system.quantity, 1);
    const template = game.actors.find(isGroundTemplate);
    assert.equal(template.items.size, 0);
    assert.equal(storageAccess(template, gm), false);
});

test("a failed ground drop removes its empty storage and token", async () => {
    const source = actor("failed-drop-source", "alice"); source.items.set("apple", item("apple", 1));
    const t = token(source);
    const tokenCount = scene.tokens.size;
    source.flags.inventoryBusy = "earlier";
    const result = await query({ action: "drop", source: source.uuid, sourceToken: t.uuid, selections: [{ id: "apple", quantity: 1 }] });
    assert.ok(result.error);
    assert.equal(scene.tokens.size, tokenCount);
    assert.equal(source.items.get("apple").system.quantity, 1);
    assert.equal(source.flags.inventoryBusy, "earlier");
});

test("a single dropped item uses its ground image and keeps it when picked up", async () => {
    const source = actor("image-source", "alice");
    const sword = item("sword", 3); sword.system.groundTokenImage = "assets/sword.webp";
    source.items.set(sword.id, sword);
    const before = new Set(scene.tokens.keys());
    const result = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid,
        selections: [{ id: "sword", quantity: 2 }] });
    assert.equal(result.count, 1);
    const deposit = [...scene.tokens].find(t => !before.has(t.id) && t.actor.isToken);
    assert.equal(deposit.texture.src, "assets/sword.webp");
    assert.equal(deposit.name, "sword");
    const recipient = actor("image-recipient", "alice");
    const dropped = [...inventoryForToken(deposit).items][0];
    assert.equal((await query(request(inventoryForToken(deposit), recipient, {
        selections: [{ id: dropped.id, quantity: 2 }]
    }))).count, 1);
    assert.equal([...recipient.items][0].system.groundTokenImage, "assets/sword.webp");
    assert.ok(scene.tokens.has(deposit.id), "Deletion must be opt-in");
});

test("a dropped container uses its own image and carries the whole nested inventory", async () => {
    const source = actor("bag-image-source", "alice");
    const bag = item("bag", 1); bag.type = "container"; bag.system.groundTokenImage = "assets/bag.webp";
    const inner = item("inner", 1); inner.type = "container"; inner.system.containerId = "bag";
    const potion = item("potion", 4); potion.system.containerId = "inner";
    for (const value of [bag, inner, potion]) source.items.set(value.id, value);
    const before = new Set(scene.tokens.keys());
    const result = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid,
        selections: [{ id: "bag", quantity: 1 }, { id: "potion", quantity: 1 }] });
    assert.equal(result.count, 3);
    const deposit = [...scene.tokens].find(t => !before.has(t.id) && t.actor.isToken);
    assert.equal(deposit.texture.src, "assets/bag.webp");
    const copies = [...inventoryForToken(deposit).items];
    const newBag = copies.find(i => i.name === "bag"), newInner = copies.find(i => i.name === "inner");
    assert.equal(newInner.system.containerId, newBag.id);
    assert.equal(copies.find(i => i.name === "potion").system.containerId, newInner.id);
    assert.equal(copies.find(i => i.name === "potion").system.quantity, 4);
    assert.equal(source.items.size, 0);
});

test("multiple roots or an item without a custom image use the default bag", async () => {
    for (const multiple of [true, false]) {
        const source = actor(`default-image-${multiple}`, "alice");
        const first = item("first", 1); if (multiple) first.system.groundTokenImage = "assets/first.webp";
        source.items.set(first.id, first);
        if (multiple) source.items.set("second", item("second", 1));
        const before = new Set(scene.tokens.keys());
        const result = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid,
            selections: [...source.items].map(i => ({ id: i.id, quantity: 1 })) });
        assert.equal(result.count, multiple ? 2 : 1);
        const deposit = [...scene.tokens].find(t => !before.has(t.id) && t.actor.isToken);
        assert.equal(deposit.texture.src, "assets/test.png");
    }
});

test("emptying a ground copy removes only that token when the option is checked", async () => {
    const ground = await createStorage({ ground: true, scene });
    const sibling = await createStorage({ ground: true, scene });
    await stock(ground, "apple", 1);
    await stock(sibling, "apple", 3);
    const groundId = groundToken(ground).id, siblingId = groundToken(sibling).id;
    const template = game.actors.find(isGroundTemplate);
    const recipient = actor("empty-recipient", "alice");
    const result = await query(request(ground, recipient, { deleteEmptyGround: true }));
    assert.equal(result.count, 1);
    assert.equal(result.deletedGround, true);
    assert.equal(scene.tokens.has(groundId), false);
    assert.equal(game.items.has(ground.id), false);
    assert.equal(scene.tokens.has(siblingId), true);
    assert.equal(sibling.items.get("apple").system.quantity, 3);
    assert.equal(game.actors.get(template.id), template);
    assert.equal(recipient.items.size, 1);
});

test("a partially looted ground copy remains even when cleanup is requested", async () => {
    const ground = await createStorage({ ground: true, scene });
    await stock(ground, "apple", 2);
    const result = await query(request(ground, actor("partial-recipient", "alice"), { deleteEmptyGround: true }));
    assert.equal(result.count, 1);
    assert.equal(result.deletedGround, undefined);
    assert.equal(ground.items.get("apple").system.quantity, 1);
    assert.ok(groundToken(ground));
});

test("the cleanup option cannot delete a permanent storage or a character", async () => {
    for (const type of ["storage", "character"]) {
        const source = actor(`permanent-${type}`, "alice", type); source.public = true;
        source.items.set("apple", item("apple", 1));
        const sourceToken = token(source);
        assert.equal((await query(request(source, actor(`permanent-recipient-${type}`, "alice"), { deleteEmptyGround: true }))).count, 1);
        assert.ok(documents.has(source.uuid));
        assert.ok(scene.tokens.has(sourceToken.id));
    }
});

test("legacy ground actors and linked tokens can still be removed after pickup", async () => {
    const source = actor("legacy-ground", "gm", "storage");
    source.system.ground = true; source.public = true; source.items.set("apple", item("apple", 1));
    const sourceToken = token(source);
    assert.equal((await query(request(source, actor("legacy-recipient", "alice"), { deleteEmptyGround: true }))).count, 1);
    assert.equal(documents.has(source.uuid), false);
    assert.equal(scene.tokens.has(sourceToken.id), false);
});

test("a failed transfer does not remove the ground copy or its contents", async () => {
    const ground = await createStorage({ ground: true, scene });
    await stock(ground, "apple", 1);
    const result = await query(request(ground, actor("failed-pickup", "alice"), {
        deleteEmptyGround: true, selections: [{ id: "apple", quantity: 2 }]
    }));
    assert.match(result.error, /quantité/i);
    assert.ok(groundToken(ground));
    assert.equal(ground.items.get("apple").system.quantity, 1);
});

test("cleanup failure reports a successful transfer with a warning instead of rolling it back", async () => {
    const ground = await createStorage({ ground: true, scene });
    await stock(ground, "apple", 1);
    const recipient = actor("cleanup-failure-recipient", "alice");
    const original = scene.deleteEmbeddedDocuments, log = console.error;
    scene.deleteEmbeddedDocuments = async () => { throw new Error("Token deletion failed"); };
    console.error = () => {};
    let result;
    try { result = await query(request(ground, recipient, { deleteEmptyGround: true })); }
    finally { scene.deleteEmbeddedDocuments = original; console.error = log; }
    assert.equal(result.count, 1);
    assert.match(result.warning, /transférés/);
    assert.equal(result.error, undefined);
    assert.equal(recipient.items.size, 1);
    assert.equal(ground.items.size, 0);
    assert.ok(groundToken(ground));
});

test("locks are cleared on a rejected transfer and a preexisting lock is preserved", async () => {
    const source = actor("lock-source", "alice"), destination = actor("lock-dest", "bob");
    source.items.set("apple", item("apple", 1));
    destination.flags.inventoryBusy = "earlier";
    assert.match((await query(request(source, destination))).error, /déjà utilisé/);
    assert.equal(source.flags.inventoryBusy, undefined);
    assert.equal(destination.flags.inventoryBusy, "earlier");
});

test("players are told that a GM is needed before sending requests", async () => {
    game.users.activeGM = null;
    await assert.rejects(requestInventoryAction({ uuid: "a" }, [], { action: "transfer" }), /MJ/);
    game.users.activeGM = gm;
});

test("a permanent storage Item receives and sends through its targeted proxy token", async () => {
    const storage = await createStorage({ name: "Coffre", scene });
    assert.ok(game.items.has(storage.id));
    const source = actor("item-storage-giver", "alice"); source.items.set("apple", item("apple", 4));
    assert.equal((await query(request(source, storage, { selections: [{ id: "apple", quantity: 3 }] }))).count, 1);
    const stored = [...storage.items][0];
    const recipient = actor("item-storage-taker", "alice");
    assert.equal((await query(request(storage, recipient, { selections: [{ id: stored.id, quantity: 2 }] }))).count, 1);
    assert.equal([...storage.items][0].system.quantity, 1);
    assert.equal([...recipient.items][0].system.quantity, 2);
    assert.equal(storage.document.system.contents[0].system.quantity, 1);
});

test("storage copies own their contents, support editing and rehome children after deleting a container", async () => {
    const storage = await createStorage({ name: "Bagages" });
    await storage.createEmbeddedDocuments("Item", [
        { _id: "bag", name: "Sac", type: "container", system: { containerId: null } },
        { _id: "apple", name: "Pomme", type: "object", system: { quantity: 4, containerId: "bag" } }
    ], { keepId: true });
    const copied = await Item.create({ ...storage.document.toObject(), _id: "independent-storage-copy" });
    const copy = inventoryForDocument(copied);
    await storage.updateInventoryItem("apple", { "system.quantity": 2, name: "Pommes" });
    assert.equal(storage.items.get("apple").system.quantity, 2);
    assert.equal(copy.items.get("apple").system.quantity, 4);
    assert.equal(copy.items.get("apple").name, "Pomme");
    await assert.rejects(storage.moveInventoryItem("bag", "bag"), /circulaire/);
    assert.equal(await storage.deleteInventoryItem("bag"), true);
    assert.equal(storage.items.get("apple").system.containerId, null);
    assert.equal(copy.items.get("apple").system.containerId, "bag");
    await storage.setFlag("arcane-advent", "inventoryBusy", "another-transfer");
    await assert.rejects(storage.updateInventoryItem("apple", { name: "Forbidden" }), /transfert/);
    assert.equal(storage.items.get("apple").name, "Pommes");
});

test("a vetoed storage quantity write rolls back the recipient instead of duplicating objects", async () => {
    const storage = await createStorage({ name: "Coffre", scene });
    await stock(storage, "apple", 3);
    const recipient = actor("veto-recipient", "alice");
    storage.document.update = async () => undefined;
    const result = await query(request(storage, recipient));
    assert.match(result.error, /enregistré/);
    assert.equal(storage.items.get("apple").system.quantity, 3);
    assert.equal(recipient.items.size, 0);
});

test("legacy storage migration moves inventories to Items and preserves token positions and images", async () => {
    const legacy = actor("migrate-chest", "gm", "storage");
    legacy.name = "Coffre ancien"; legacy.img = "assets/chest.webp"; legacy.ownership = { default: 2 };
    legacy.system = { ground: false, locked: true };
    const bag = item("bag", 1); bag.type = "container";
    const contents = item("apple", 7); contents.system.containerId = "bag";
    legacy.items.set(bag.id, bag); legacy.items.set(contents.id, contents);
    const placed = token(legacy); placed.texture = { src: "assets/chest-token.webp" };
    placed.x = 700; placed.y = 800;
    await migrateStorageActors();
    const converted = game.items.find(item => item.getFlag("arcane-advent", "storageOrigin") === legacy.uuid);
    assert.ok(converted);
    assert.equal(game.actors.has(legacy.id), false);
    assert.equal(converted.name, "Coffre ancien");
    assert.deepEqual(converted._source.ownership, { default: 2 });
    const inventory = inventoryForDocument(converted);
    assert.equal(inventory.items.get("apple").system.containerId, "bag");
    assert.equal(inventory.items.get("apple").system.quantity, 7);
    assert.equal(inventory.getFlag("arcane-advent", "inventoryBusy"), undefined);
    assert.equal(inventoryForToken(placed).uuid, converted.uuid);
    assert.equal(placed.x, 700); assert.equal(placed.y, 800);
    assert.equal(placed.texture.src, "assets/chest-token.webp");
    assert.equal(placed.actorLink, false);
    const count = game.items.size;
    await migrateStorageActors();
    assert.equal(game.items.size, count);
});

test("an interrupted conversion keeps its source locked and resumes without duplicating inventory", async () => {
    const legacy = actor("migrate-retry", "gm", "storage");
    legacy.system = { ground: true, locked: false }; legacy.ownership = { default: 2 };
    legacy.items.set("apple", item("apple", 3));
    const first = token(legacy), second = token(legacy);
    const original = scene.updateEmbeddedDocuments, log = console.error;
    scene.updateEmbeddedDocuments = async function (type, changes) {
        if (changes.some(change => change._id === second.id)) throw new Error("Disconnected");
        return original.call(this, type, changes);
    };
    console.error = () => {};
    try { await migrateStorageActors(); }
    finally { scene.updateEmbeddedDocuments = original; console.error = log; }
    assert.ok(game.actors.has(legacy.id));
    assert.equal(legacy.getFlag("arcane-advent", "inventoryBusy"), "storage-migration");
    const converted = game.items.find(item => item.getFlag("arcane-advent", "storageOrigin") === legacy.uuid);
    assert.equal(converted.getFlag("arcane-advent", "inventoryBusy"), "storage-migration");
    await migrateStorageActors();
    assert.equal(game.actors.has(legacy.id), false);
    assert.equal(game.items.filter(item => item.getFlag("arcane-advent", "storageOrigin") === legacy.uuid).length, 1);
    assert.equal(inventoryForToken(first).uuid, converted.uuid);
    assert.equal(inventoryForToken(second).uuid, converted.uuid);
    assert.equal(inventoryForDocument(converted).items.get("apple").system.quantity, 3);
    assert.equal(converted.getFlag("arcane-advent", "inventoryBusy"), undefined);
});

test("migration preserves a legacy unlinked token's inventory separately from its base Actor", async () => {
    const legacy = actor("migrate-unlinked", "gm", "storage");
    legacy.system = { ground: true, locked: false }; legacy.ownership = { default: 2 };
    legacy.items.set("apple", item("apple", 2));
    const [unlinked] = await scene.createEmbeddedDocuments("Token", [{ actorId: legacy.id, actorLink: false,
        delta: { name: "Dépôt indépendant", img: "assets/other.webp", system: { ground: true } } }]);
    unlinked.actor.ownership = { default: 2 };
    unlinked.actor.items.set("apple", item("apple", 9));
    await migrateStorageActors();
    const main = game.items.find(item => item.getFlag("arcane-advent", "storageOrigin") === legacy.uuid);
    assert.equal(inventoryForDocument(main).items.get("apple").system.quantity, 2);
    assert.equal(inventoryForToken(unlinked).items.get("apple").system.quantity, 9);
    assert.notEqual(inventoryForToken(unlinked).uuid, main.uuid);
});

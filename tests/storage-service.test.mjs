import test from "node:test";
import assert from "node:assert/strict";
import { registerStorageService, STORAGE_QUERY, storageAccess, requestInventoryAction } from "../module/storage.mjs";

class Collection extends Map {
    [Symbol.iterator]() { return this.values(); }
    some(fn) { return [...this.values()].some(fn); }
    filter(fn) { return [...this.values()].filter(fn); }
}
let serial = 0, createCount = 0;
const gm = { id: "gm", isGM: true, isSelf: true };
const alice = { id: "alice", viewedScene: "scene" };
const bob = { id: "bob", viewedScene: "scene" };
const documents = new Map();
const scene = { id: "scene", grid: { size: 100 }, width: 2000, height: 2000, tokens: new Collection(),
    async createEmbeddedDocuments(_type, data) { return data.map(value => { const token = { ...value, id: `token${++serial}`, parent: scene,
        documentName: "Token", actor: documents.get(`Actor.${value.actorId}`) }; scene.tokens.set(token.id, token); return token; }); },
    async deleteEmbeddedDocuments(_type, ids) { ids.forEach(id => scene.tokens.delete(id)); }
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
        async createEmbeddedDocuments(_type, data) { return data.map(entry => { const result = item(entry._id, entry.system.quantity); result.system = entry.system; this.items.set(result.id, result); return result; }); },
        async updateEmbeddedDocuments(_type, data) { return data.map(entry => {
            const result = this.items.get(entry._id);
            if (entry.system) result.system = { ...entry.system };
            if (Object.hasOwn(entry, "system.quantity")) result.system.quantity = entry["system.quantity"];
            return result;
        }); },
        async deleteEmbeddedDocuments(_type, ids) { return ids.map(id => { const result = this.items.get(id); this.items.delete(id); return result; }); },
        async getTokenDocument(position) { return { toObject: () => ({ ...position, actorId: this.id, actorLink: true }) }; },
        async delete() { documents.delete(this.uuid); }
    };
    documents.set(value.uuid, value);
    return value;
}
function token(actor, hidden = false) {
    const value = { documentName: "Token", id: `t${++serial}`, uuid: `Scene.scene.Token.t${serial}`, actor,
        parent: scene, hidden, x: 100, y: 100, width: 1 };
    documents.set(value.uuid, value); scene.tokens.set(value.id, value); return value;
}
globalThis.fromUuid = async uuid => documents.get(uuid);
globalThis.CONST = { DOCUMENT_OWNERSHIP_LEVELS: { OBSERVER: 2 }, TOKEN_DISPOSITIONS: { NEUTRAL: 0 } };
globalThis.foundry = { utils: { randomID: () => `id${++serial}` } };
globalThis.canvas = { scene, stage: { pivot: { x: 300, y: 300 } } };
globalThis.game = { user: gm, users: { activeGM: gm }, scenes: new Collection([["scene", scene]]),
    settings: { register() {}, get: () => "assets/test.png" } };
globalThis.CONFIG = { queries: {} };
globalThis.Actor = { create: async data => {
    createCount++;
    const value = actor(`ground${serial++}`, "gm", "storage");
    value.system = data.system; value.public = true; return value;
} };
registerStorageService();
const query = (data, user = alice) => CONFIG.queries[STORAGE_QUERY]({ requestId: `request${++serial}`, ...data }, { user });
function request(source, destination, extra = {}) {
    return { action: "transfer", source: source.uuid, targetToken: token(destination).uuid,
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

test("a ground drop creates a linked scene storage and moves the selected quantity", async () => {
    const source = actor("drop-source", "alice"); source.items.set("apple", item("apple", 5));
    const previous = createCount;
    const result = await query({ action: "drop", source: source.uuid, sourceToken: token(source).uuid, selections: [{ id: "apple", quantity: 2 }] });
    assert.equal(result.count, 1);
    assert.equal(createCount, previous + 1);
    assert.equal(source.items.get("apple").system.quantity, 3);
    const ground = [...scene.tokens].find(t => t.actor?.system.ground && t.actor.items.size);
    assert.equal(ground.actorLink, true);
    assert.equal([...ground.actor.items][0].system.quantity, 2);
});

test("a failed ground drop removes its empty storage and token", async () => {
    const source = actor("failed-drop-source", "alice"); source.items.set("apple", item("apple", 1));
    const t = token(source);
    const tokenCount = scene.tokens.size;
    const result = await query({ action: "drop", source: source.uuid, sourceToken: t.uuid, selections: [{ id: "apple", quantity: 20 }] });
    assert.ok(result.error);
    assert.equal(scene.tokens.size, tokenCount);
    assert.equal(source.items.get("apple").system.quantity, 1);
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

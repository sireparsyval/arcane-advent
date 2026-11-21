import test from "node:test";
import assert from "node:assert/strict";
import { ammunitionItems, withWeaponAmmunition } from "../module/weapon-ammunition.mjs";
class Items extends Map { [Symbol.iterator]() { return this.values(); } }
function setup(quantity = 3) {
    const ammo = { id: "stock", type: "object", name: "Flèches", system: { objectClass: " MUNITIONS ", quantity },
        toObject() { return { _id: this.id, type: this.type, name: this.name, system: { ...this.system } }; },
        async update(data) { this.system.quantity = data["system.quantity"]; } };
    const weapon = { id: "bow", type: "weapon", system: { properties: new Set(["ammunition"]), ammunition: { enabled: true, itemId: ammo.id, quantity: 1 } } };
    const actor = { isOwner: true, items: new Items([[ammo.id, ammo], [weapon.id, weapon]]),
        async deleteEmbeddedDocuments(_type, ids) { for (const id of ids) this.items.delete(id); },
        async createEmbeddedDocuments(_type, sources, options) { assert.equal(options.keepId, true); for (const source of sources) this.items.set(source._id, { ...ammo, system: source.system }); } };
    return { actor, ammo, weapon, attack: roll => withWeaponAmmunition(actor, weapon.id, roll ?? (async () => ({ total: 10 }))) };
}
test("an attack consumes the configured inventory quantity and removes an exhausted stack", async () => {
    const env = setup(3); env.weapon.system.ammunition.quantity = 2;
    await env.attack(); assert.equal(env.ammo.system.quantity, 1);
    env.weapon.system.ammunition.quantity = 1;
    await env.attack(); assert.equal(env.actor.items.has("stock"), false);
    let rolled = false;
    await assert.rejects(env.attack(async () => { rolled = true; }), /insuffisantes/);
    assert.equal(rolled, false);
});
test("failed attacks restore partial and exhausted stocks with the same ID", async () => {
    for (const count of [1,3]) {
        const env = setup(count);
        await assert.rejects(env.attack(async () => { throw Error("roll failed"); }), /roll failed/);
        assert.equal(env.actor.items.get("stock").system.quantity, count);
    }
});
test("disabled ammunition and weapons without Distance never consume ammunition", async () => {
    const env = setup(); env.weapon.system.ammunition.enabled = false;
    await env.attack(); assert.equal(env.ammo.system.quantity, 3);
    env.weapon.system.ammunition.enabled = true; env.weapon.system.properties.clear();
    await env.attack(); assert.equal(env.ammo.system.quantity, 3);
});
test("wrong class, missing stack, invalid cost and insufficient stock block the roll", async () => {
    for (const change of [e => e.ammo.system.objectClass = "Carquois", e => e.weapon.system.ammunition.itemId = "missing",
        e => e.weapon.system.ammunition.quantity = 0, e => e.weapon.system.ammunition.quantity = 1.5, e => e.weapon.system.ammunition.quantity = 4]) {
        const env = setup(); change(env); let calls = 0;
        await assert.rejects(env.attack(async () => { calls++; return {}; }), /insuffisantes/);
        assert.equal(calls, 0); assert.equal(env.ammo.system.quantity, 3);
    }
});
test("rapid attacks sharing the last projectile produce only one roll", async () => {
    const env = setup(1); let calls = 0;
    const roll = async () => { calls++; await new Promise(r => setImmediate(r)); return {}; };
    const results = await Promise.allSettled([env.attack(roll), env.attack(roll)]);
    assert.equal(calls, 1); assert.equal(results.filter(r => r.status === "fulfilled").length, 1);
});
test("only inventory objects of class Munitions are offered", () => {
    const env = setup(); env.actor.items.set("other", { id:"other", type:"weapon", system:{objectClass:"Munitions"} });
    assert.deepEqual(ammunitionItems(env.actor).map(i => i.id), ["stock"]);
});

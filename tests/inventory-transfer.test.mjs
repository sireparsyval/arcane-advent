import test from "node:test";
import assert from "node:assert/strict";
import { transferPlan, executeTransfer } from "../module/inventory-transfer.mjs";

class Items extends Map { [Symbol.iterator]() { return this.values(); } }
let serial = 0;
const randomID = () => `new${++serial}`;
function item(id, type = "object", system = {}) {
    return { id, name: id, type, system: { quantity: 1, containerId: null, ...system },
        toObject() { return structuredClone({ _id: this.id, name: this.name, type: this.type, system: this.system, flags: { custom: "retained" } }); } };
}
function collection(items) { return new Items(items.map(value => [value.id, value])); }
function actor(uuid, entries = []) {
    return { uuid, items: collection(entries),
        async createEmbeddedDocuments(_type, data) {
            return data.map(value => {
                const created = item(value._id, value.type, value.system);
                this.items.set(created.id, created); return created;
            });
        },
        async updateEmbeddedDocuments(_type, data) {
            return data.map(value => {
                const entry = this.items.get(value._id);
                if (value.system) entry.system = structuredClone(value.system);
                if (Object.hasOwn(value, "system.quantity")) entry.system.quantity = value["system.quantity"];
                return entry;
            });
        },
        async deleteEmbeddedDocuments(_type, ids) {
            return ids.map(id => { const entry = this.items.get(id); this.items.delete(id); return entry; });
        } };
}

test("a nested bag moves with its descendants and remaps every parent", () => {
    const source = collection([item("bag", "container"), item("inner", "container", { containerId: "bag" }),
        item("apple", "object", { containerId: "inner", quantity: 8 }), item("purse", "purse", { containerId: "bag", coins: { gold: 17 } })]);
    const plan = transferPlan(source, [{ id: "bag" }, { id: "apple", quantity: 2 }], randomID);
    assert.equal(plan.creates.length, 4);
    const byName = new Map(plan.creates.map(value => [value.name, value]));
    assert.equal(byName.get("inner").system.containerId, byName.get("bag")._id);
    assert.equal(byName.get("apple").system.containerId, byName.get("inner")._id);
    assert.equal(byName.get("apple").system.quantity, 8);
    assert.equal(byName.get("purse").system.coins.gold, 17);
    assert.deepEqual(plan.updates, []);
    assert.equal(plan.deletes.length, 4);
    assert.equal(byName.get("bag").flags.custom, "retained");
});

test("partial stacks retain the remainder, received equipment is unequipped", () => {
    const plan = transferPlan(collection([item("potions", "object", { quantity: 10, containerId: "other-bag" }),
        item("sword", "weapon", { equipped: true })]), [{ id: "potions", quantity: 3 }, { id: "sword" }], randomID);
    assert.equal(plan.creates[0].system.quantity, 3);
    assert.equal(plan.creates[0].system.containerId, null);
    assert.equal(plan.creates[1].system.equipped, false);
    assert.deepEqual(plan.updates, [{ _id: "potions", "system.quantity": 7 }]);
});

test("reject stale quantities, duplicates, non-inventory items and circular containers", () => {
    const items = collection([item("apple", "object", { quantity: 2 }), item("skill", "skill"),
        item("bag1", "container", { containerId: "bag2" }), item("bag2", "container", { containerId: "bag1" })]);
    for (const selections of [[{ id: "missing" }], [{ id: "apple", quantity: 3 }], [{ id: "apple", quantity: 0 }],
        [{ id: "apple", quantity: 1.5 }], [{ id: "skill" }], [{ id: "apple" }, { id: "apple" }], [{ id: "bag1" }]]) {
        assert.throws(() => transferPlan(items, selections, randomID));
    }
});

test("successful transfer changes both inventories exactly once", async () => {
    const source = actor("source", [item("apple", "object", { quantity: 10 })]);
    const destination = actor("destination");
    await executeTransfer(source, destination, [{ id: "apple", quantity: 4 }], randomID);
    assert.equal(source.items.get("apple").system.quantity, 6);
    assert.equal([...destination.items][0].system.quantity, 4);
});

test("destination creation failure preserves source and removes partial copies", async () => {
    const source = actor("source", [item("bag", "container"), item("apple", "object", { containerId: "bag" })]);
    const destination = actor("destination");
    const create = destination.createEmbeddedDocuments;
    destination.createEmbeddedDocuments = async function (type, data) { await create.call(this, type, data.slice(0, 1)); throw Error("creation failed"); };
    await assert.rejects(executeTransfer(source, destination, [{ id: "bag" }], randomID), /creation failed/);
    assert.equal(source.items.size, 2);
    assert.equal(destination.items.size, 0);
});

test("partial deletion failure restores quantities, parents and source items", async () => {
    const source = actor("source", [item("bag", "container"), item("child", "object", { containerId: "bag" }), item("stack", "object", { quantity: 8 })]);
    const destination = actor("destination");
    source.deleteEmbeddedDocuments = async function (_type, ids) { this.items.delete(ids[0]); throw Error("deletion failed"); };
    await assert.rejects(executeTransfer(source, destination, [{ id: "bag" }, { id: "stack", quantity: 2 }], randomID), /deletion failed/);
    assert.equal(source.items.size, 3);
    assert.equal(source.items.get("child").system.containerId, "bag");
    assert.equal(source.items.get("stack").system.quantity, 8);
    assert.equal(destination.items.size, 0);
});

test("cancelled source update rolls destination back", async () => {
    const source = actor("source", [item("apple", "object", { quantity: 10 })]);
    const destination = actor("destination");
    const update = source.updateEmbeddedDocuments;
    let first = true;
    source.updateEmbeddedDocuments = async function (...args) { if (first) { first = false; return []; } return update.apply(this, args); };
    await assert.rejects(executeTransfer(source, destination, [{ id: "apple", quantity: 3 }], randomID));
    assert.equal(source.items.get("apple").system.quantity, 10);
    assert.equal(destination.items.size, 0);
});

test("source and destination may not be the same actor", async () => {
    const source = actor("same", [item("apple")]);
    await assert.rejects(executeTransfer(source, source, [{ id: "apple" }], randomID));
    assert.equal(source.items.size, 1);
});

test("a multi-deposit transfer separates roots while a container retains all descendants", async () => {
    const source = actor("source", [item("bag", "container"), item("apple", "object", { containerId: "bag", quantity: 8 }),
        item("potion", "object", { quantity: 4 }), item("purse", "purse", { coins: { gold: 2 } })]);
    const deposits = [actor("bag-ground"), actor("potion-ground"), actor("purse-ground")];
    const result = await executeTransfer(source, deposits, [{ id: "bag" }, { id: "potion", quantity: 3 }, { id: "purse" }], randomID);
    assert.equal(result.count, 4);
    const bag = [...deposits[0].items].find(entry => entry.type === "container");
    assert.equal([...deposits[0].items].find(entry => entry.type === "object").system.containerId, bag.id);
    assert.equal([...deposits[0].items].find(entry => entry.type === "object").system.quantity, 8);
    assert.equal([...deposits[1].items][0].system.quantity, 3);
    assert.equal([...deposits[2].items][0].system.coins.gold, 2);
    assert.equal(source.items.size, 1);
    assert.equal(source.items.get("potion").system.quantity, 1);
});

test("a later deposit failure rolls back every destination and preserves the complete source", async () => {
    const source = actor("source", [item("apple", "object", { quantity: 5 }), item("sword", "weapon", { equipped: true })]);
    const deposits = [actor("first"), actor("second")];
    deposits[1].createEmbeddedDocuments = async () => { throw new Error("second deposit failed"); };
    await assert.rejects(executeTransfer(source, deposits, [{ id: "apple", quantity: 3 }, { id: "sword" }], randomID), /second deposit failed/);
    assert.equal(source.items.size, 2);
    assert.equal(source.items.get("apple").system.quantity, 5);
    assert.equal(source.items.get("sword").system.equipped, true);
    assert.ok(deposits.every(entry => entry.items.size === 0));
});

test("transfers serialize proxy-backed flags before copying and preserve their data", async () => {
    const source = actor("source", [item("apple", "object", { quantity: 2 })]);
    const original = source.items.get("apple").toObject;
    source.items.get("apple").toObject = function () {
        const data = original.call(this);
        data.flags = new Proxy({ custom: { note: "conservée" } }, {});
        return data;
    };
    const destination = actor("destination");
    const plan = transferPlan(source.items, [{ id: "apple", quantity: 1 }], randomID);
    assert.deepEqual(plan.creates[0].flags, { custom: { note: "conservée" } });
    await executeTransfer(source, destination, [{ id: "apple", quantity: 1 }], randomID);
    assert.equal(source.items.get("apple").system.quantity, 1);
    assert.equal([...destination.items][0].system.quantity, 1);
});

test("each transfer and rollback write gets an operation free of Foundry's previous mutations", async () => {
    for (const fail of [false, true]) {
        const source = actor("source", [item("apple", "object", { quantity: 5 })]);
        const destination = actor("destination");
        const operations = new Set();
        let rejectOnce = fail;
        for (const owner of [source, destination]) for (const method of ["createEmbeddedDocuments", "updateEmbeddedDocuments", "deleteEmbeddedDocuments"]) {
            const original = owner[method];
            owner[method] = async function (type, data, operation) {
                assert.equal(operation.parentUuid, undefined, "A previous database parent leaked into another write");
                assert.ok(!operations.has(operation), "The same operation object was reused");
                operations.add(operation);
                operation.parentUuid = this.uuid;
                operation.updates = data;
                if (owner === source && method === "updateEmbeddedDocuments" && rejectOnce) {
                    rejectOnce = false; throw new Error("write failed");
                }
                return original.call(this, type, data, operation);
            };
        }
        const transfer = executeTransfer(source, destination, [{ id: "apple", quantity: 2 }], randomID);
        if (fail) {
            await assert.rejects(transfer, /write failed/);
            assert.equal(source.items.get("apple").system.quantity, 5);
            assert.equal(destination.items.size, 0);
        } else {
            await transfer;
            assert.equal(source.items.get("apple").system.quantity, 3);
            assert.equal([...destination.items][0].system.quantity, 2);
        }
    }
});

test("a container cannot bypass the lock of a bodily weapon hidden among its descendants",()=>{
    const bag=item("bag","container"),body=item("body","weapon",{corporeal:true,containerId:"bag"});
    const items=collection([bag,body]);
    assert.throws(()=>transferPlan(items,[{id:bag.id,quantity:1}],randomID),/corporelle/);
    assert.equal(items.size,2);assert.equal(body.system.containerId,bag.id);
});

import test from "node:test";
import assert from "node:assert/strict";
import { stackGroups, mergeStackPlan } from "../module/inventory-stacks.mjs";
import { executeInventoryPlan } from "../module/inventory-transfer.mjs";
const item = (id, quantity, system = {}) => ({ id, name: "Corne", type: "object", sort: 0,
    system: { containerId: null, quantity, weight: 2, ...system },
    toObject() { return { _id: this.id, name: this.name, type: this.type, sort: this.sort, system: structuredClone(this.system) }; } });
test("only identical objects in the same parent form a merge group", () => {
    const a = item("a", 2), b = item("b", 3), otherBag = item("c", 4, { containerId: "bag" });
    const otherWeight = item("d", 1, { weight: 3 }), otherImage = item("e", 1, { groundTokenImage: "different.png" });
    const weapon = { ...item("sword", 1), type: "weapon" };
    assert.deepEqual(stackGroups([a,b,otherBag,otherWeight,otherImage,weapon]).map(g => g.map(i => i.id)), [["a","b"]]);
    assert.equal(mergeStackPlan([a,b], "b").updates[0]["system.quantity"], 5);
    assert.equal(a.system.quantity, 2);
    assert.throws(() => mergeStackPlan([a,otherBag], "a"), /identiques/);
});
test("merge conserves quantity and rolls back if removing a redundant pile fails", async () => {
    const a = item("a",2), b = item("b",3);
    const source = { uuid: "Actor.source", items: new Map([[a.id,a],[b.id,b]]),
        async updateEmbeddedDocuments(_type, changes) { return changes.map(change => {
            const target = this.items.get(change._id);
            if (change.system) target.system = structuredClone(change.system);
            else target.system.quantity = change["system.quantity"];
            return target;
        }); },
        async deleteEmbeddedDocuments() { throw Error("disconnected"); } };
    await assert.rejects(executeInventoryPlan(source,null,mergeStackPlan([a,b],"a")), /disconnected/);
    assert.equal(a.system.quantity,2); assert.equal(b.system.quantity,3);
    source.deleteEmbeddedDocuments = async (_type, ids) => ids.map(id => { const old=source.items.get(id); source.items.delete(id); return old; });
    await executeInventoryPlan(source,null,mergeStackPlan([a,b],"a"));
    assert.equal(source.items.size,1); assert.equal(a.system.quantity,5);
});
test("overflow and a vetoed quantity update cannot silently destroy a stack", async () => {
    const a=item("a",Number.MAX_SAFE_INTEGER),b=item("b",1);
    assert.throws(() => mergeStackPlan([a,b],"a"), /Quantité/);
    a.system.quantity=2;
    const source={uuid:"Actor.source",items:new Map([[a.id,a],[b.id,b]]),
        async updateEmbeddedDocuments(_type,changes){ return changes.map(change=>this.items.get(change._id)); },
        async deleteEmbeddedDocuments(){ assert.fail("Must validate the write before deleting"); }};
    await assert.rejects(executeInventoryPlan(source,null,mergeStackPlan([a,b],"a")), /Quantité non enregistrée/);
    assert.equal(source.items.size,2); assert.equal(a.system.quantity,2);
});

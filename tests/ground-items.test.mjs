import test from "node:test";
import assert from "node:assert/strict";
import { groundItemAppearance, groundMenu, firstInventoryPurse, checkedCoins, inventorySelectionRows, GROUND_IMAGES } from "../module/ground-items.mjs";
import { coinPlan, packStoragePlan } from "../module/inventory-ground-plans.mjs";

class Items extends Map { [Symbol.iterator]() { return this.values(); } }
let serial = 0;
const randomID = () => `copy${++serial}`;
function item(id, type = "object", system = {}) {
    return { id, type, name: id, img: `icons/${id}.png`, sort: 0, system: { containerId: null, quantity: 1, weight: 2, ...system },
        toObject() { return structuredClone({ _id: this.id, type: this.type, name: this.name, img: this.img, system: this.system }); } };
}
const storage = (entries, system = { ground: true }) => ({ uuid: "Item.storage", name: "Coffre", img: "icons/chest.png", system,
    items: new Items(entries.map(entry => [entry.id, entry])) });

test("ground defaults use the named assets and type-specific square sizes while preserving custom artwork and sizes", () => {
    for (const [type, img, size] of [["container", "bag-item.png", 1.5], ["purse", "bag-luqa.png", 1],
        ...["object", "weapon", "shield", "protection", "accessory"].map(type => [type, "item-generic.png", 1.25])]) {
        assert.deepEqual(groundItemAppearance(item(type, type)), { img: GROUND_IMAGES + img, size, depth: size });
        assert.deepEqual(groundItemAppearance(item(type, type, { groundTokenImage: "custom.png", groundTokenSize: 2 })), { img: "custom.png", size: 2, depth: 2 });
    }
});

test("single, homogeneous and mixed coins select the correct denomination image and size", () => {
    for (const key of ["copper", "silver", "gold", "platinum"]) {
        assert.deepEqual(groundItemAppearance(item("coins", "purse", { coinPile: true, coins: { [key]: 1 } })),
            { img: `${GROUND_IMAGES}coin-luqa-${key}.png`, size: 0.25, depth: 0.1 });
        assert.deepEqual(groundItemAppearance(item("coins", "purse", { coinPile: true, coins: { [key]: 2 } })),
            { img: `${GROUND_IMAGES}stack-luqa-${key}.png`, size: 0.35, depth: 0.35 });
    }
    assert.deepEqual(groundItemAppearance(item("coins", "purse", { coinPile: true, coins: { copper: 1, gold: 2 } })),
        { img: GROUND_IMAGES + "stack-luqa.png", size: 0.75, depth: 0.5 });
});

test("ground menus distinguish equipment, single objects, stacks and purses", () => {
    const actions = entry => groundMenu(storage([entry])).actions.map(row => row[0]);
    assert.deepEqual(actions(item("sword", "weapon")), ["equip", "take"]);
    assert.deepEqual(actions(item("one")), ["take"]);
    assert.deepEqual(actions(item("stack", "object", { quantity: 5 })), ["take", "takePart", "split"]);
    assert.deepEqual(actions(item("bag", "purse", { coins: { gold: 2 } })), ["take", "coinsAll", "coinsPart", "coinsDrop"]);
});

test("fixed storage hides whole-container pickup without hiding access to its contents", () => {
    for (const fixed of ["host", "container"]) {
        const bag = item("bag", "container", { fixedOnScene: fixed === "container" });
        const view = groundMenu(storage([bag], { ground: true, fixedOnScene: fixed === "host" }));
        assert.deepEqual(view.actions.map(row => row[0]), ["contents", "selection", "dropSelection"]);
    }
});

test("the first purse follows visible inventory order, including nested containers", () => {
    const bag = item("bag", "container"), nested = item("inside", "purse", { containerId: "bag", coins: {} }), later = item("later", "purse", { coins: {} });
    later.sort = 10;
    assert.equal(firstInventoryPurse(storage([later, nested, bag])), nested);
    later.sort = -10;
    assert.equal(firstInventoryPurse(storage([nested, bag, later])), later);
});

test("coin plans debit and credit each denomination, preserve bags and consume emptied loose piles", () => {
    const purse = item("source", "purse", { coins: { gold: 5, silver: 2 } });
    const target = item("target", "purse", { coins: { gold: 1 } });
    const plan = coinPlan(storage([purse]), storage([target]), purse.id, { gold: 3, silver: 1 }, { randomID });
    assert.deepEqual(plan.updates[0]["system.coins"], { copper: 0, silver: 1, gold: 2, platinum: 0 });
    assert.deepEqual(plan.destinationUpdates[0]["system.coins"], { copper: 0, silver: 1, gold: 4, platinum: 0 });
    assert.deepEqual(plan.deletes, []);
    purse.system.coinPile = true;
    const emptied = coinPlan(storage([purse]), storage([target]), purse.id, null, { all: true, randomID });
    assert.deepEqual(emptied.deletes, [purse.id]);
    assert.deepEqual(purse.system.coins, { gold: 5, silver: 2 }, "Planning must never mutate the source");
});

test("all-content currency transfer carries the purse if necessary; partial transfer requires a recipient purse", () => {
    const purse = item("source", "purse", { coins: { gold: 5 } });
    const source = storage([purse]), empty = storage([]);
    assert.equal(coinPlan(source, empty, purse.id, null, { all: true, randomID }).creates[0].type, "purse");
    assert.throws(() => coinPlan(source, empty, purse.id, { gold: 1 }, { randomID }), /aucune bourse/);
    const dropped = coinPlan(source, null, purse.id, { gold: 1 }, { drop: true, randomID });
    assert.equal(dropped.creates[0].system.coinPile, true);
    assert.equal(dropped.creates[0].system.containerId, null);
    assert.equal(dropped.updates[0]["system.coins"].gold, 4);
});

test("invalid, stale and overflowing coin selections are rejected before a write", () => {
    for (const coins of [{ gold: -1 }, { gold: 1.5 }, { gold: "2" }, { bogus: 1 }, { gold: Infinity }]) assert.throws(() => checkedCoins(coins));
    const purse = item("purse", "purse", { coins: { gold: 2 } });
    const target = item("target", "purse", { coins: { gold: Number.MAX_SAFE_INTEGER } });
    assert.throws(() => coinPlan(storage([purse]), storage([target]), purse.id, { gold: 3 }, { randomID }), /disponibles/);
    assert.throws(() => coinPlan(storage([purse]), storage([target]), purse.id, { gold: 1 }, { randomID }), /trop de Luqa/);
});

test("packing a permanent storage preserves nested contents and creates one portable principal container", () => {
    const bag = item("bag", "container"), object = item("inside", "object", { containerId: "bag", quantity: 5 });
    const source = storage([bag, object], { ground: false });
    assert.equal(groundMenu(source).item, null, "A bag inside a permanent chest is part of its contents");
    const plan = packStoragePlan(source, randomID);
    assert.equal(plan.creates[0].name, "Coffre");
    assert.equal(plan.creates[1].system.containerId, plan.creates[0]._id);
    assert.equal(plan.creates[2].system.containerId, plan.creates[1]._id);
    assert.equal(plan.creates[2].system.quantity, 5);
    assert.deepEqual(plan.deletes, ["bag", "inside"]);
});

test("selection rows retain hierarchy, stack weights and the attack icons used by inventory weapons", () => {
    const bag = item("bag", "container"), inside = item("inside", "object", { containerId: "bag", quantity: 3 });
    const knife = item("knife", "weapon", { equipped: true, properties: ["thrown"] });
    const rows = inventorySelectionRows(new Items([knife, bag, inside].map(entry => [entry.id, entry])));
    assert.equal(rows[0].icon, "🗡️");
    assert.equal(rows.find(row => row.item === inside).depth, 1);
    assert.equal(rows.find(row => row.item === inside).weight, 6);
    assert.equal(rows.find(row => row.item === bag).weight, 6);
});

test("loose Luqa have pickup/partial/split controls, never purse-content controls",()=>{
    const pile=item("coins","purse",{coinPile:true,coins:{gold:5}});
    assert.deepEqual(groundMenu(storage([pile])).actions.map(row=>row[0]),["coinsAll","coinsPart","coinsSplit"]);
    pile.system.coins.gold=1;
    assert.deepEqual(groundMenu(storage([pile])).actions.map(row=>row[0]),["coinsAll"]);
    assert.equal(firstInventoryPurse(storage([pile])),null);
    assert.throws(()=>coinPlan(storage([pile]),storage([]),pile.id,null,{all:true,randomID}),/aucune bourse/);
});

test("currency destinations accept only a real purse or a standalone pile on the ground",()=>{
    const pile=item("pile","purse",{coinPile:true,coins:{gold:2}});
    const origin=item("bag","purse",{coins:{gold:5,silver:3}});
    const target={...storage([pile]),type:"storage"};
    const plan=coinPlan(storage([origin]),target,origin.id,{gold:3,silver:1},{randomID});
    assert.deepEqual(plan.destinationUpdates[0]["system.coins"],{copper:0,silver:1,gold:5,platinum:0});
    assert.equal(plan.creates.length,0);assert.equal(plan.deletes.length,0);
    assert.throws(()=>coinPlan(storage([origin]),{...target,type:"character"},origin.id,{gold:1},{randomID}),/aucune bourse/);
    assert.throws(()=>coinPlan(storage([origin]),{...target,system:{ground:false}},origin.id,{gold:1},{randomID}),/aucune bourse/);
});
test("explicit Z settings are retained while empty Z defaults to the footprint",()=>{
    const object=item("custom","object",{groundTokenSize:2,groundTokenDepth:0.2});
    assert.deepEqual(groundItemAppearance(object),{img:GROUND_IMAGES+"item-generic.png",size:2,depth:0.2});
    object.system.groundTokenDepth=0;assert.equal(groundItemAppearance(object).depth,0);
    object.system.groundTokenDepth=null;assert.equal(groundItemAppearance(object).depth,2);
});

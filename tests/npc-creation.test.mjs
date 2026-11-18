import test from "node:test";
import assert from "node:assert/strict";

globalThis.Item = class {};
globalThis.Actor = class {
    constructor(data) { this._source = structuredClone(data); }
    get type() { return this._source.type; }
    getFlag(scope, key) { return this._source.flags?.[scope]?.[key]; }
    updateSource(updates) {
        for (const [path, value] of Object.entries(updates)) {
            const keys = path.split(".");
            const key = keys.pop();
            const parent = keys.reduce((data, name) => data[name] ??= {}, this._source);
            parent[key] = value;
        }
    }
    async _preCreate(...args) { this.parentArguments = args; return this.cancel ? false : undefined; }
};
const { ArcaneActor } = await import("../module/documents/actor.mjs");

test("un nouveau PNJ reçoit le mode compact avant son premier enregistrement", async () => {
    const source = {
        type: "npc", name: "Sentinelle", flags: { other: { kept: true } },
        system: { biography: { family: "Conservée" }, arcanology: { glyphs: {} } },
        items: [{ type: "weapon", system: { damageFormula: "1d8" } }]
    };
    const actor = new ArcaneActor(source);
    const options = { renderSheet: true };
    const user = { id: "mj" };
    await actor._preCreate(source, options, user);
    assert.equal(actor.getFlag("arcane-advent", "compactNPC"), true);
    assert.deepEqual(actor.parentArguments, [source, options, user]);
    assert.deepEqual(actor._source, {
        ...source, flags: { other: { kept: true }, "arcane-advent": { compactNPC: true } }
    });
    assert.equal(source.flags["arcane-advent"], undefined);
});

test("la création d’un personnage conserve le mode de fiche habituel", async () => {
    const source = { type: "character", name: "Personnage", system: {}, flags: {} };
    const actor = new ArcaneActor(source);
    await actor._preCreate(source, {}, {});
    assert.deepEqual(actor._source, source);
});

test("la copie ou l’import d’un PNJ respecte un mode explicitement choisi", async () => {
    for (const compactNPC of [false, true]) {
        const source = { type: "npc", flags: { "arcane-advent": { compactNPC, other: "Conservé" } } };
        const actor = new ArcaneActor(source);
        await actor._preCreate(source, {}, {});
        assert.deepEqual(actor._source, source);
    }
});

test("une création refusée par Foundry reste annulée", async () => {
    const source = { type: "npc", flags: {} };
    const actor = new ArcaneActor(source);
    actor.cancel = true;
    assert.equal(await actor._preCreate(source, {}, {}), false);
    assert.deepEqual(actor._source, source);
});

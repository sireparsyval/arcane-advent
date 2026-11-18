import test from "node:test";
import assert from "node:assert/strict";

globalThis.Item = class {};
globalThis.Actor = class {
    static createDialog(...args) { return args; }
    static async createDocuments(sources, options) {
        const created = [];
        for (const source of sources) {
            // Match v14's cleaning before _preCreate: even a minimal source
            // has a prototypeToken by the time that hook is called.
            const cleaned = { ...source, prototypeToken: source.prototypeToken ?? {
                name: source.name, actorLink: false, sight: { enabled: false }, displayName: 0
            } };
            const actor = new this(cleaned);
            if (await actor._preCreate(cleaned, options, {}) !== false) created.push(actor);
        }
        return created;
    }
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

test("la création d’un acteur propose personnages et PNJ, les stockages sont créés dans Objets", () => {
    const [data, createOptions, options] = ArcaneActor.createDialog({ name: "Test" }, { renderSheet: true }, { position: { width: 400 } });
    assert.deepEqual(data, { name: "Test" });
    assert.deepEqual(createOptions, { renderSheet: true });
    assert.deepEqual(options, { position: { width: 400 }, types: ["character", "npc"] });
});

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

function templateFixture(t) {
    const previous = globalThis.game;
    t.after(() => { globalThis.game = previous; });
    const settings = {
        name: "[TEMPLATE]", actorLink: true, displayName: 30, displayBars: 30,
        appendNumber: false, prependAdjective: false, disposition: 0,
        width: 1.5, height: 1.5, rotation: 0, lockRotation: true, alpha: 0.8,
        texture: { src: "assets/template-token.webp", scaleX: 0.9, scaleY: 0.9 },
        bar1: { attribute: "consciousness" }, bar2: { attribute: "fever" },
        sight: { enabled: true, range: 25, visionMode: "basic" },
        light: { dim: 8, bright: 3, color: "#ffe0aa" },
        detectionModes: [{ id: "basicSight", enabled: true, range: 25 }],
        ring: { enabled: true, colors: { ring: "#804080" } },
        flags: { module: { retained: { enabled: true } } }
    };
    const template = { id: "template", name: "[TEMPLATE]", type: "character",
        prototypeToken: { toObject: () => settings },
        system: { biography: { family: "Famille du modèle" } },
        items: [{ type: "weapon", name: "Arme du modèle" }], ownership: { default: 3 }
    };
    globalThis.game = { actors: [template] };
    return { settings, template };
}

test("Créer un acteur reprend le prototype courant du modèle pour les personnages et PNJ", async t => {
    const { settings } = templateFixture(t);
    const originalSettings = structuredClone(settings);
    for (const type of ["character", "npc"]) {
        const source = { type, name: `Nouveau ${type}`, flags: {}, ownership: { default: 0 },
            system: { biography: { family: "Sa famille" } }, items: [] };
        const sourceSnapshot = structuredClone(source);
        const [actor] = await ArcaneActor.createDocuments([source], {});
        assert.deepEqual(actor._source.prototypeToken, { ...settings, name: source.name });
        assert.deepEqual(actor._source.system, source.system);
        assert.deepEqual(actor._source.items, []);
        assert.deepEqual(actor._source.ownership, { default: 0 });
        assert.equal(actor.getFlag("arcane-advent", "compactNPC"), type === "npc" ? true : undefined);
        assert.deepEqual(source, sourceSnapshot);
        actor._source.prototypeToken.light.dim = 99;
        actor._source.prototypeToken.flags.module.retained.enabled = false;
        assert.deepEqual(settings, originalSettings);
    }
});

test("modifier le modèle affecte les créations suivantes sans changer les Actors précédents", async t => {
    const { settings } = templateFixture(t);
    const [first] = await ArcaneActor.createDocuments([{ type: "character", name: "Premier" }], {});
    settings.sight.range = 60;
    settings.bar2.attribute = null;
    const [second] = await ArcaneActor.createDocuments([{ type: "npc", name: "Second" }], {});
    assert.equal(first._source.prototypeToken.sight.range, 25);
    assert.equal(first._source.prototypeToken.bar2.attribute, "fever");
    assert.equal(second._source.prototypeToken.sight.range, 60);
    assert.equal(second._source.prototypeToken.bar2.attribute, null);
});

test("une duplication, un import ou un prototype explicite conserve tous ses propres réglages", async t => {
    templateFixture(t);
    for (const type of ["character", "npc"]) {
        const prototypeToken = { name: "Nom personnalisé", actorLink: false, displayName: 0,
            texture: { src: "assets/custom.webp" }, sight: { enabled: false }, bar2: { attribute: null } };
        const source = { type, name: "Import", prototypeToken };
        const [actor] = await ArcaneActor.createDocuments([source], { keepId: true });
        assert.deepEqual(actor._source.prototypeToken, prototypeToken);
    }
});

test("sans modèle valide, la création conserve les réglages Foundry et le modèle ne se copie pas lui-même", async t => {
    const { template } = templateFixture(t);
    for (const actors of [[], [{ ...template, type: "storage" }], [{ ...template, name: "Autre" }]]) {
        game.actors = actors;
        const source = { type: "character", name: "Nouveau", prototypeToken: undefined };
        const [actor] = await ArcaneActor.createDocuments([source], {});
        assert.deepEqual(actor._source.prototypeToken, {
            name: source.name, actorLink: false, sight: { enabled: false }, displayName: 0
        });
        assert.equal(source.prototypeToken, undefined);
    }
    game.actors = [template];
    const source = { type: "character", name: "[TEMPLATE]" };
    const [actor] = await ArcaneActor.createDocuments([source], {});
    assert.equal(actor._source.prototypeToken.actorLink, false);
    assert.equal(actor._source.prototypeToken.name, "[TEMPLATE]");
    assert.equal(source.prototypeToken, undefined);
});

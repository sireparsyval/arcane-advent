import test from "node:test";
import assert from "node:assert/strict";
import { createArcaneTokenClass, registerTokenBars } from "../module/token-bars.mjs";

const settings = new Map();
globalThis.game = { settings: { get: (_scope, key) => settings.get(key), register(_scope, key, config) { settings.set(key, config.default); } } };
globalThis.canvas = { ready: true, dimensions: { uiScale: 1 }, tokens: { placeables: [] } };
globalThis.foundry = { utils: { Color: { fromString: value => value } }, data: { fields: { ColorField: class {} } } };
globalThis.Hooks = { on() {} };

function bar() {
    const value = { visible: true, height: 8, x: 0, y: 0 };
    value.position = { set(x, y) { Object.assign(value, { x, y }); } };
    return value;
}
class NativeToken {
    constructor(attributes = ["consciousness", "fever"]) {
        this.height = 100;
        this.attributes = attributes;
        this.resources = { consciousness: { value: 19, max: 20 }, fever: { value: 6, max: 6 } };
        this.document = { getSize: () => ({ width: 100, height: this.height }) };
        this.nameplate = { y: 103, visible: true };
        this.bar1 = bar(); this.bar2 = bar();
        // Foundry v14 stores the graphics as properties, not named children.
        this.bars = { visible: false, bar1: this.bar1, bar2: this.bar2, getChildByName: () => null };
    }
    _getBarColors() { return { empty: "native-empty", full: "native-full" }; }
    _refreshSize() { this.nameplate.y = this.height + 3; }
    _refreshNameplate() { this.nameplate.y = this.height + 3; }
    drawBars() {
        for (const [index, name] of ["bar1", "bar2"].entries()) {
            const b = this[name];
            b.visible = Boolean(this.attributes[index]);
            b.height = 8 * canvas.dimensions.uiScale;
            b.position.set(0, index === 0 ? this.height - b.height : 0);
        }
    }
}
const Token = createArcaneTokenClass(NativeToken);
function fixture(attributes) {
    canvas.dimensions.uiScale = 1;
    settings.set("tokenBarsBelow", true);
    settings.set("tokenConsciousnessColor", "#bd3737");
    settings.set("tokenFeverColor", "#f2c94c");
    const token = new Token(attributes);
    token._refreshSize(); token.drawBars();
    return token;
}

test("both bars are below the token without covering each other or its name", () => {
    const token = fixture();
    assert.equal(token.bars.getChildByName("bar1"), null);
    assert.equal(token.bars.getChildByName("bar2"), null);
    assert.ok(token.bar1.y > token.height);
    assert.ok(token.bar2.y > token.bar1.y + token.bar1.height);
    assert.ok(token.nameplate.y > token.bar2.y + token.bar2.height);
    assert.equal(token.bars.visible, false, "Do not expose a hidden bar container");
    assert.deepEqual(token.resources, { consciousness: { value: 19, max: 20 }, fever: { value: 6, max: 6 } });
});

test("one enabled bar uses the first bottom slot, no enabled bars restores the name", () => {
    const token = fixture([null, "fever"]);
    assert.equal(token.bar1.visible, false);
    assert.equal(token.bar2.y, 102);
    token.attributes[1] = null; token.drawBars();
    assert.equal(token.bar2.visible, false);
    assert.equal(token.nameplate.y, 103);
});

test("redraws and resizing do not accumulate offsets and respect UI scale", () => {
    const token = fixture();
    const initial = token.nameplate.y;
    token.drawBars(); token.drawBars(); token._refreshSize();
    assert.equal(token.nameplate.y, initial);
    token.height = 200; canvas.dimensions.uiScale = 2;
    token._refreshSize(); token.drawBars();
    assert.equal(token.bar1.y, 204);
    assert.equal(token.bar2.y, 224);
    assert.ok(token.nameplate.y > 240);
});

test("turning the bottom layout off restores native positions", () => {
    const token = fixture();
    settings.set("tokenBarsBelow", false); token.drawBars();
    assert.equal(token.bar1.y, 92);
    assert.equal(token.bar2.y, 0);
    assert.equal(token.nameplate.y, 103);
});

test("les noms des personnages et PNJ restent dans le cadre après rafraîchissement, redimensionnement et changement d’ancre", () => {
    for (const type of ["character", "npc"]) for (const anchor of [0, 0.5, 1]) {
        const token = fixture(); token.actor = { type };
        token.nameplate.height = 20; token.nameplate.anchor = { y: anchor };
        token._refreshNameplate();
        const bottom = () => token.nameplate.y + token.nameplate.height * (1 - anchor);
        assert.equal(bottom(), 98);
        token.drawBars(); token._refreshNameplate(); token._refreshSize();
        assert.equal(bottom(), 98);
        assert.ok(token.bar1.y > token.height);
        token.height = 200; canvas.dimensions.uiScale = 2;
        token._refreshSize(); token.drawBars();
        assert.equal(bottom(), 196);
        token.nameplate.visible = false; token._refreshNameplate();
        assert.equal(token.nameplate.visible, false);
        assert.equal(bottom(), 196);
    }
});

test("le nom reste à l’intérieur sans barres et ne recouvre pas la barre basse en mode natif", () => {
    const token = fixture(); token.actor = { type: "character" }; token.nameplate.height = 20;
    token.bars = null; token._refreshNameplate();
    assert.equal(token.nameplate.y, 78);
    token.bars = { bar1: token.bar1, bar2: token.bar2 };
    settings.set("tokenBarsBelow", false); token.drawBars();
    assert.equal(token.bar1.y, 92);
    assert.equal(token.nameplate.y + token.nameplate.height, 90);
});

test("colors follow the attribute even when bar slots are swapped", () => {
    const token = fixture(["fever", "consciousness"]);
    assert.deepEqual(token._getBarColors(0, { attribute: "fever", value: 1, max: 6 }), { empty: "#f2c94c", full: "#f2c94c" });
    assert.deepEqual(token._getBarColors(1, { attribute: "consciousness" }), { empty: "#bd3737", full: "#bd3737" });
    settings.set("tokenFeverColor", "#ffee00");
    assert.equal(token._getBarColors(0, { attribute: "fever" }).full, "#ffee00");
    settings.set("tokenFeverColor", { css: "#000000" });
    assert.equal(token._getBarColors(0, { attribute: "fever" }).full, "#000000");
    assert.deepEqual(token._getBarColors(0, { attribute: "other" }), { empty: "native-empty", full: "native-full" });
});

test("world settings refresh existing tokens and safely handle a closed canvas", () => {
    const registered = new Map(), hooks = new Map(), flags = [];
    const prior = game.settings.register;
    game.settings.register = (_scope, key, config) => registered.set(key, config);
    Hooks.on = (name, callback) => hooks.set(name, callback);
    globalThis.CONFIG = { Token: { objectClass: NativeToken } };
    try {
        registerTokenBars();
        assert.equal(registered.get("tokenBarsBelow").default, true);
        assert.equal(registered.get("tokenFeverColor").default, "#f2c94c");
        assert.ok(registered.get("tokenFeverColor").type instanceof foundry.data.fields.ColorField);
        assert.equal(registered.get("tokenConsciousnessColor").scope, "world");
        assert.ok(hooks.has("renderTokenHUD"));
        assert.ok(CONFIG.Token.objectClass.prototype instanceof NativeToken);
        let redraws = 0;
        canvas.tokens.placeables = [{ drawBars: () => redraws++, renderFlags: { set: value => flags.push(value) } }];
        registered.get("tokenFeverColor").onChange();
        assert.equal(redraws, 1);
        assert.deepEqual(flags, [{ refreshBars: true, refreshNameplate: true }]);
        canvas.ready = false;
        registered.get("tokenBarsBelow").onChange();
        assert.equal(flags.length, 1);
    } finally { game.settings.register = prior; canvas.ready = true; canvas.tokens.placeables = []; }
});

import test from "node:test";
import assert from "node:assert/strict";
import { registerTokenMovementSettings, tokenMovementSpeed } from "../module/token-movement.mjs";
import { createArcaneTokenClass } from "../module/token-bars.mjs";
function token(speed = 10, distance = 1, units = "m", type = "character") {
    return { actor: { type, system: { trackers: { speed, effectiveSpeed: speed } } }, scene: { grid: { distance, units } } };
}

test("chaque personnage utilise son propre tracker courant et l’échelle de la scène", () => {
    const a = token(12), b = token(6, 2);
    assert.equal(tokenMovementSpeed(a), 12);
    assert.equal(tokenMovementSpeed(b), 3);
    a.actor.system.trackers.effectiveSpeed = 4;
    assert.equal(tokenMovementSpeed(a), 4);
    assert.equal(a.actor.system.trackers.speed, 12);
    assert.equal(tokenMovementSpeed(token(9, 1, "m", "npc")), 9);
});
test("les grilles sans quadrillage visible et les unités métriques ou pieds sont converties", () => {
    assert.equal(tokenMovementSpeed(token(10, 2, "mètres")), 5);
    assert.equal(tokenMovementSpeed(token(10, 200, "cm")), 5);
    assert.equal(tokenMovementSpeed(token(10, 0.002, "km")), 5);
    assert.equal(tokenMovementSpeed(token(3.048, 5, "ft")), 2);
    const t = token(8, 2); t.scene.grid.type = 0;
    assert.equal(tokenMovementSpeed(t), 4);
    t.document = { parent: t.scene }; delete t.scene;
    assert.equal(tokenMovementSpeed(t), 4);
});
test("le mode fixe et les données indisponibles utilisent un secours positif de 12 par défaut", () => {
    assert.equal(tokenMovementSpeed(token(2, 5), { mode: "fixed" }), 12);
    assert.equal(tokenMovementSpeed(token(2), { mode: "fixed", fixedSpeed: 20 }), 20);
    for (const speed of [undefined, null, 0, -2, NaN, Infinity]) {
        const t = token(); t.actor.system.trackers = { speed, effectiveSpeed: speed };
        assert.equal(tokenMovementSpeed(t), 12);
    }
    assert.equal(tokenMovementSpeed(token(10, 0)), 12);
    assert.equal(tokenMovementSpeed(token(10, 1, "cases")), 12);
    const missing = token(); delete missing.actor.system.trackers;
    assert.equal(tokenMovementSpeed(missing, { fixedSpeed: 16 }), 16);
    const base = token(); delete base.actor.system.trackers.effectiveSpeed;
    assert.equal(tokenMovementSpeed(base), 10);
});
test("les objets et animations explicites gardent le fonctionnement natif", () => {
    class Native { _getAnimationMovementSpeed() { return 6; } }
    const Token = createArcaneTokenClass(Native);
    const t = Object.assign(new Token(), token());
    const settings = new Map(); globalThis.game = { settings: { get: (_scope, key) => settings.get(key) } };
    assert.equal(t._getAnimationMovementSpeed(), 10);
    assert.equal(t._getAnimationMovementSpeed({ movementSpeed: 4 }), 4);
    settings.set("tokenMovementMode", "fixed"); settings.set("tokenMovementFixedSpeed", 18);
    assert.equal(t._getAnimationMovementSpeed(), 18);
    t.actor.type = "storage";
    assert.equal(tokenMovementSpeed(t), null);
    assert.equal(t._getAnimationMovementSpeed(), 6);
    delete t.actor;
    assert.equal(t._getAnimationMovementSpeed(), 6);
});
test("les paramètres partagés démarrent sur le tracker et une vitesse fixe de 12", () => {
    const settings = new Map(); globalThis.game = { settings: { register: (scope, key, config) => { assert.equal(scope, "arcane-advent"); settings.set(key, config); } } };
    registerTokenMovementSettings();
    assert.equal(settings.get("tokenMovementMode").default, "tracker");
    assert.equal(settings.get("tokenMovementFixedSpeed").default, 12);
    for (const config of settings.values()) { assert.equal(config.scope, "world"); assert.equal(config.config, true); }
});

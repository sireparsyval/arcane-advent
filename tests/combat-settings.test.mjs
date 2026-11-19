import test from "node:test";
import assert from "node:assert/strict";
import { registerCombatSettings, configureDefaultTurnMarker } from "../module/combat-settings.mjs";

function fixture(t, { gm = true, applied = false } = {}) {
    const previous = { game: globalThis.game, CONFIG: globalThis.CONFIG };
    t.after(() => Object.assign(globalThis, previous));
    const writes = [], registrations = [];
    const world = { resource: "consciousness", skipDefeated: true,
        turnMarker: { enabled: true, disposition: true, src: "old.png", animation: "pulse" } };
    const values = new Map([["core.combatTrackerConfig", world], ["arcane-advent.defaultTurnMarkerApplied", applied]]);
    globalThis.CONFIG = { Combat: {} };
    globalThis.game = { users: { activeGM: gm === null ? null : { isSelf: gm } }, settings: {
        register: (...args) => registrations.push(args),
        get: (scope, key) => values.get(`${scope}.${key}`),
        async set(scope, key, value) { writes.push([scope, key, value]); values.set(`${scope}.${key}`, value); }
    } };
    return { writes, registrations, values, world };
}

test("the global marker uses battlemark with Rotation and preserves unrelated combat preferences", async t => {
    const { writes, world } = fixture(t);
    const before = structuredClone(world);
    registerCombatSettings();
    await configureDefaultTurnMarker();
    assert.equal(CONFIG.Combat.fallbackTurnMarker, "assets/arcane-advent/system/battlemark.png");
    assert.deepEqual(writes, [
        ["core", "combatTrackerConfig", { ...before,
            turnMarker: { ...before.turnMarker, src: "assets/arcane-advent/system/battlemark.png", animation: "spin" } }],
        ["arcane-advent", "defaultTurnMarkerApplied", true]
    ]);
    assert.deepEqual(world, before);
});

test("the setting is applied once per world so later GM choices survive reloads", async t => {
    const { writes, values } = fixture(t);
    await configureDefaultTurnMarker();
    values.get("core.combatTrackerConfig").turnMarker.src = "custom-afterwards.png";
    await configureDefaultTurnMarker();
    assert.equal(writes.length, 2);
    assert.equal(values.get("core.combatTrackerConfig").turnMarker.src, "custom-afterwards.png");
});

test("players and sessions without an active GM do not modify world settings", async t => {
    for (const gm of [false, null]) {
        const { writes } = fixture(t, { gm });
        await configureDefaultTurnMarker();
        assert.equal(writes.length, 0);
    }
});

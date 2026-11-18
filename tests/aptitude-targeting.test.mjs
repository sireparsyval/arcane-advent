import test from "node:test";
import assert from "node:assert/strict";
import { aptitudeRangeMode, aptitudeRangeSummary } from "../module/aptitude-targeting.mjs";

globalThis.foundry = { abstract: { TypeDataModel: class { static migrateData(source) { return source; } } }, data: { fields: {} } };
const { AptitudeData } = await import("../module/data/aptitude-data.mjs");

test("legacy range values are preserved as normal distance ranges", () => {
    const source = { targeting: { mode: "single", range: 12.5 }, rolls: { existing: { formula: "1d20" } } };
    AptitudeData.migrateData(source);
    assert.deepEqual(source.targeting, { mode: "single", range: 12.5, rangeMode: "ranged" });
    assert.equal(source.rolls.existing.formula, "1d20");
});

test("new aptitudes default to melee and migration retains explicitly chosen modes", () => {
    assert.equal(aptitudeRangeMode(), "melee");
    for (const rangeMode of ["melee", "ranged"]) {
        const source = { targeting: { rangeMode, range: 3, longRange: 12 } };
        const previous = structuredClone(source);
        AptitudeData.migrateData(source);
        assert.deepEqual(source, previous);
        AptitudeData.migrateData(source);
        assert.deepEqual(source, previous);
    }
});

test("summaries show melee reach or both distance ranges, and hide ranges for self targeting", () => {
    assert.equal(aptitudeRangeSummary({ mode: "self", rangeMode: "ranged", range: 10, longRange: 30 }), "");
    assert.equal(aptitudeRangeSummary({ mode: "single", rangeMode: "melee", range: 1.5, longRange: 30 }), "Mêlée · Allonge 1,5 m");
    assert.equal(aptitudeRangeSummary({ mode: "area", rangeMode: "ranged", range: 10, longRange: 30 }), "Distance · 10 m / 30 m");
});

test("zero long range remains an optional absence of long range", () => {
    assert.equal(aptitudeRangeSummary({ mode: "multiple", rangeMode: "ranged", range: 15, longRange: 0 }), "Distance · 15 m");
});

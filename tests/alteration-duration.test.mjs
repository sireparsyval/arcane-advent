import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const source = readFileSync(new URL("../module/applications/actor/character-sheet.mjs", import.meta.url), "utf8");
const body = source.match(/static async _onStepAlterationDuration\(event, target\) \{([\s\S]*?)\n    \}/)[1];
const step = new (Object.getPrototypeOf(async function(){}).constructor)("event", "target", body);

test("alteration duration steps preserve units, clamp to zero and reject unauthorized or invalid changes", async () => {
    const writes = [], item = { type: "alteration", system: { duration: { enabled: true, remaining: 1, unit: "hours" } },
        async update(data) { writes.push(data); this.system.duration.remaining = data["system.duration.remaining"]; } };
    const sheet = { isEditable: true, actor: { items: new Map([["a", item]]) } };
    const click = delta => step.call(sheet, null, { dataset: { itemId: "a", step: String(delta) } });
    await click(-1); assert.equal(item.system.duration.remaining, 0);
    await click(-1); assert.equal(writes.length, 1);
    await click(1); assert.equal(item.system.duration.remaining, 1);
    assert.equal(item.system.duration.unit, "hours");
    sheet.isEditable = false; await click(1);
    sheet.isEditable = true; item.system.duration.enabled = false; await click(1);
    item.system.duration.enabled = true; item.type = "injury"; await click(1);
    item.type = "alteration"; await click(2);
    assert.equal(writes.length, 2);
});

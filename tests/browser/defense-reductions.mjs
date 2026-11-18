import { bindDefenseReductionTooltips } from "../../module/defense-reductions.mjs";

export async function runDefenseReductionTests({ test, assert, equal }) {
    const root = document.createElement("div");
    root.innerHTML = await (await fetch("/templates/actor/character-sheet.hbs")).text();
    document.querySelector("main").replaceChildren(root);
    const torso = root.querySelector('[data-defense-zone="torso"]');
    const head = root.querySelector('[data-defense-zone="head"]');
    const shield = root.querySelector("[data-defense-shield]");
    const items = [{ type: "protection", system: { equipped: true, zones: new Set(["torso"]),
        damageReductions: { Tranchants: 1, Contondants: 12, Feu: 0 } } },
        { type: "protection", system: { equipped: true, zones: new Set(["arms"]), damageReductions: { Feu: 5 } } },
        { type: "shield", system: { equipped: true, guardEnabled: false,
            damageReductions: { slashing: 2, Perforants: 12, Contondants: 1, Feu: 0 } } },
        { type: "shield", system: { equipped: false, damageReductions: { Froid: 99 } } }];
    const tooltip = document.createElement("div");
    tooltip.id = "tooltip";
    tooltip.style.cssText = "position:fixed;left:10px;top:10px;padding:10px;max-width:400px;";
    document.body.append(tooltip);
    game.tooltip = {
        element: null,
        activate(element) {
            this.element = element;
            tooltip.innerHTML = element.dataset.tooltipHtml;
            tooltip.className = element.dataset.tooltipClass;
            tooltip.hidden = false;
        },
        deactivate() { this.element = null; tooltip.hidden = true; }
    };

    await test("partial defense exposes only its reductions with aligned names, amounts and units", () => {
        bindDefenseReductionTooltips(root, items);
        assert(torso && head, "Defense zones are missing from the sheet template");
        assert(!head.dataset.tooltipHtml, "An unprotected head should not list reductions");
        equal(torso.dataset.tooltipDirection, "UP");
        torso.focus();
        // The same native tooltip data is used by hover and keyboard focus.
        assert(game.tooltip.element === torso, "Focusing the partial defense did not activate its tooltip");
        const rows = [...tooltip.querySelectorAll("tr")];
        equal(rows.map(row => [...row.cells].map(cell => cell.textContent)),
            [["Tranchants", "−1", "Dgts"], ["Contondants", "−12", "Dgts"]]);
        const [first, second] = rows;
        assert(Math.abs(first.cells[0].getBoundingClientRect().left - second.cells[0].getBoundingClientRect().left) < 1, "Names are not left aligned");
        assert(Math.abs(first.cells[1].getBoundingClientRect().right - second.cells[1].getBoundingClientRect().right) < 1, "Amounts are not right aligned");
        assert(Math.abs(first.cells[2].getBoundingClientRect().left - second.cells[2].getBoundingClientRect().left) < 1, "Damage units are not independently aligned");
        equal(getComputedStyle(first.cells[0]).textAlign, "left");
        equal(getComputedStyle(first.cells[1]).textAlign, "right");
        torso.blur();
        equal(game.tooltip.element, null);
    });

    await test("tooltip refresh escapes free damage names and removes stale entries", () => {
        items[0].system.damageReductions['<img src=x onerror="alert(1)">'] = 2;
        bindDefenseReductionTooltips(root, items);
        torso.focus();
        assert(!tooltip.querySelector("img"), "A damage name was interpreted as HTML");
        equal(tooltip.querySelectorAll("tr").length, 3);
        torso.blur();
        items[0].system.equipped = false;
        bindDefenseReductionTooltips(root, items);
        assert(!torso.dataset.tooltipHtml && !torso.dataset.tooltipClass, "Stale tooltip data remains after unequipping");
        equal(torso.tabIndex, -1);
    });

    await test("shield tooltip displays its own reductions with aligned columns", () => {
        bindDefenseReductionTooltips(root, items);
        assert(shield, "Shield bonus is missing from the character sheet template");
        equal(shield.dataset.tooltipDirection, "UP");
        equal(getComputedStyle(shield).cursor, "help");
        shield.focus();
        assert(game.tooltip.element === shield, "Focusing the shield did not activate its tooltip");
        equal(tooltip.querySelector("table").getAttribute("aria-label"), "Réductions — Bouclier");
        const rows = [...tooltip.querySelectorAll("tr")];
        equal(rows.map(row => [...row.cells].map(cell => cell.textContent)), [
            ["Tranchants", "−2", "Dgts"], ["Perforants", "−12", "Dgts"], ["Contondants", "−1", "Dgts"]
        ]);
        for (const row of rows.slice(1)) {
            assert(Math.abs(rows[0].cells[0].getBoundingClientRect().left - row.cells[0].getBoundingClientRect().left) < 1, "Shield damage names are not left aligned");
            assert(Math.abs(rows[0].cells[1].getBoundingClientRect().right - row.cells[1].getBoundingClientRect().right) < 1, "Shield reduction amounts are not right aligned");
            assert(Math.abs(rows[0].cells[2].getBoundingClientRect().left - row.cells[2].getBoundingClientRect().left) < 1, "Shield damage units are not aligned");
        }
        shield.blur();
        equal(game.tooltip.element, null);
    });

    await test("compact NPC shield tooltip refreshes and clears after unequipping", async () => {
        root.innerHTML = await (await fetch("/templates/actor/npc-sheet.hbs")).text();
        const compactShield = root.querySelector("[data-defense-shield]");
        assert(compactShield, "Shield bonus is missing from the compact NPC template");
        items[2].system.damageReductions.slashing = 4;
        bindDefenseReductionTooltips(root, items);
        compactShield.focus();
        equal(tooltip.querySelector("tr").cells[1].textContent, "−4");
        compactShield.blur();
        items[2].system.equipped = false;
        bindDefenseReductionTooltips(root, items);
        assert(!compactShield.dataset.tooltipHtml && !compactShield.dataset.tooltipClass, "Shield tooltip was not cleared after unequipping");
        equal(compactShield.tabIndex, -1);
    });
    tooltip.remove();
}

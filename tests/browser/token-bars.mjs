import { styleTokenHUD } from "../../module/token-bars.mjs";

export async function runTokenHUDTests({ test, assert, equal }) {
    const stylesheet = document.createElement("style");
    // Minimal native HUD layout. The actual system stylesheet is loaded below.
    stylesheet.textContent = `
        #token-hud { position: relative; width: 100px; height: 100px; }
        #token-hud .col.middle { display: flex; flex-direction: column; position: absolute;
            top: -50px; height: calc(100% + 100px); width: 100%; justify-content: space-between; }
        #token-hud .attribute { flex: 0 0 35px; }
        #token-hud input { width: 90px; height: 30px; border: 1px solid black; }
    ` + await (await fetch("/styles/arcane-advent.css")).text();
    document.head.append(stylesheet);
    const values = new Map([["tokenBarsBelow", true], ["tokenFeverColor", "#f2c94c"], ["tokenConsciousnessColor", "#bd3737"]]);
    game.settings = { get: (_scope, key) => values.get(key) };
    canvas.dimensions = { uiScale: 1 };
    const root = document.createElement("div");
    root.id = "token-hud";
    root.innerHTML = '<div class="col middle"><div class="attribute bar2"><input name="bar2" value="19"></div><div class="attribute bar1"><input name="bar1" value="6"></div></div>';
    document.querySelector("main").replaceChildren(root);
    const data = { bar1: "fever", bar2: "consciousness" };
    const bars = { bar1: { visible: true, y: 102, height: 8 }, bar2: { visible: true, y: 112, height: 8 } };
    const app = { document: { getSize: () => ({ height: 100 }), getBarAttribute: name => ({ attribute: data[name] }) },
        object: { actor: { type: "character" }, bars: { ...bars, getChildByName: () => null }, nameplate: { visible: true, y: 78, height: 20 } } };

    await test("HUD fields split consciousness left and fever right even when bar slots are swapped", () => {
        styleTokenHUD(app, root);
        const first = root.querySelector('[name="bar1"]'), second = root.querySelector('[name="bar2"]');
        assert(first.getBoundingClientRect().top > root.getBoundingClientRect().bottom, "First field is still over the token");
        const fever = first.getBoundingClientRect(), consciousness = second.getBoundingClientRect();
        assert(Math.abs(consciousness.top - fever.top) < 1, "Fields are not on the same row");
        assert(consciousness.right < fever.left, "PdC must be left of PdF without overlap");
        assert(Math.abs(consciousness.width - fever.width) < 1, "Fields do not have equal widths");
        assert(fever.right <= root.getBoundingClientRect().right + 1, "Fields overflow the token");
        equal(getComputedStyle(first).borderTopColor, "rgb(242, 201, 76)");
        equal(getComputedStyle(second).borderTopColor, "rgb(189, 55, 55)");
        equal(first.getAttribute("aria-label"), "Points de Fièvre");
        equal(first.value, "6"); equal(second.value, "19");
    });

    await test("character HUD stays below the frame with updated colors when native bars are enabled", () => {
        values.set("tokenFeverColor", { css: "#aabb00" }); values.set("tokenBarsBelow", false);
        styleTokenHUD(app, root);
        assert(root.classList.contains("aa-token-resources-split"), "Character layout was lost");
        equal(getComputedStyle(root.querySelector('[name="bar1"]')).borderTopColor, "rgb(170, 187, 0)");
        assert(root.querySelector('[name="bar2"]').getBoundingClientRect().top > root.getBoundingClientRect().bottom,
            "Character field moved onto the token");
    });

    await test("HUD ignores hidden bars for its offset and preserves noncharacter layouts", () => {
        app.object.bars.visible = false;
        styleTokenHUD(app, root);
        equal(root.style.getPropertyValue("--aa-token-resource-offset"), "6px");
        app.object.actor = { type: "storage" };
        styleTokenHUD(app, root);
        assert(!root.classList.contains("aa-token-resources-split"), "Storage received character layout");
        assert(!root.classList.contains("aa-token-bars-below"), "Native storage layout was not restored");
    });

    await test("HUD falls back to native colors when an attribute is replaced", () => {
        data.bar1 = "other";
        styleTokenHUD(app, root);
        equal(root.querySelector(".bar1").style.getPropertyValue("--aa-token-resource-color"), "");
        equal(getComputedStyle(root.querySelector('[name="bar1"]')).borderTopColor, "rgb(124, 208, 0)");
    });
}

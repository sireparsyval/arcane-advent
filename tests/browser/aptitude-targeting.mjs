import { bindAptitudeRangeToggle, refreshAptitudeTargetingFields } from "../../module/aptitude-targeting.mjs";

export async function runAptitudeRangeTests({ test, assert, equal }) {
    const form = document.createElement("form");
    // Parse the production template to exercise its actual field names and
    // visibility groups. Populate values normally supplied by Handlebars.
    form.innerHTML = await (await fetch("/templates/actor/aptitude-options-dialog.hbs")).text();
    document.querySelector("main").replaceChildren(form);
    const editor = form.querySelector(".aa-aptitude-options-editor");
    const mode = form.elements["target.mode"], shape = form.elements["target.shape"];
    mode.innerHTML = '<option value="self">Soi-même</option><option value="single">Cible unique</option><option value="area">Zone</option>';
    shape.innerHTML = '<option value="circle">Cercle</option><option value="cone">Cône</option>';
    mode.value = "single"; shape.value = "circle";
    form.elements["target.rangeMode"].value = "ranged";
    form.elements["target.range"].value = "10";
    form.elements["target.longRange"].value = "30";
    const refresh = () => refreshAptitudeTargetingFields(editor);
    editor.addEventListener("change", refresh);
    bindAptitudeRangeToggle(editor);
    refresh();

    await test("distance targeting exposes normal and long ranges in the form", () => {
        const fields = new FormData(form);
        equal(fields.get("target.rangeMode"), "ranged");
        equal(fields.get("target.range"), "10");
        equal(fields.get("target.longRange"), "30");
        equal(editor.querySelector("[data-aa-range-caption]").textContent, "Portée normale (m)");
        equal(editor.querySelector("[data-aa-range-toggle]").getAttribute("aria-pressed"), "true");
        assert(!form.elements["target.longRange"].closest("[data-aa-fields]").hidden, "Long range is hidden");
    });

    await test("melee-distance round trip hides long range without discarding its value", () => {
        const toggle = editor.querySelector("[data-aa-range-toggle]");
        toggle.click();
        equal(new FormData(form).get("target.rangeMode"), "melee");
        assert(!new FormData(form).has("target.longRange"), "Hidden long range must not overwrite saved values");
        equal(editor.querySelector("[data-aa-range-caption]").textContent, "Allonge (m)");
        equal(toggle.getAttribute("aria-pressed"), "false");
        toggle.click();
        equal(new FormData(form).get("target.longRange"), "30");
        equal(new FormData(form).get("target.range"), "10");
    });

    await test("self targeting hides and disables both ranges while retaining values", () => {
        mode.value = "self"; mode.dispatchEvent(new Event("change", { bubbles: true }));
        const fields = new FormData(form);
        assert(!fields.has("target.range") && !fields.has("target.longRange") && !fields.has("target.rangeMode"), "Self mode still submits ranges");
        mode.value = "single"; mode.dispatchEvent(new Event("change", { bubbles: true }));
        equal(new FormData(form).get("target.longRange"), "30");
    });

    await test("range changes preserve area shape controls, propagation and charge toggles", () => {
        mode.value = "area"; shape.value = "cone";
        editor.querySelector("[data-aa-range-toggle]").click();
        assert(!form.elements["target.angle"].disabled && !form.elements["target.length"].disabled, "Cone controls were hidden");
        assert(form.elements["target.radius"].disabled, "Circle controls were not hidden");
        assert(!form.elements["target.propagation"].disabled, "Melee should retain effect propagation");
        const charge = form.elements["enable.charge"];
        charge.checked = true; charge.dispatchEvent(new Event("change", { bubbles: true }));
        assert(!form.elements["charge.max"].disabled, "Charge controls no longer appear");
    });
}

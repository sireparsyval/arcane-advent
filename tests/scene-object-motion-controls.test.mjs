import test from "node:test";
import assert from "node:assert/strict";
import { selectSceneObject, animatePickedObject } from "../module/applications/scene-object-motion-controls.mjs";
import { registerObjectMotion } from "../module/scene-object-motion.mjs";

class Surface {
    events = new Map();
    addEventListener(name, callback) { this.events.set(name, callback); }
    removeEventListener(name, callback) { if (this.events.get(name) === callback) this.events.delete(name); }
    emit(name, values = {}) { this.events.get(name)?.({ button: 0, clientX: 150, clientY: 250, preventDefault() {}, stopPropagation() {}, ...values }); }
}
function environment(type = "character") {
    const view = new Surface(), keyboard = new Surface(), hooks = new Map(), graphics = [], writes = [], warnings = [];
    let hookId = 0;
    globalThis.Hooks = { on(name, callback) { const id = ++hookId; hooks.set(id, { name, callback }); return id; },
        once() {}, off(_name, id) { hooks.delete(id); } };
    globalThis.document = keyboard;
    globalThis.ui = { notifications: { info() {}, warn: message => warnings.push(message), error: message => assert.fail(message) } };
    globalThis.foundry = { utils: { randomID: () => "motion" } };
    globalThis.CONFIG = { queries: {} };
    globalThis.PIXI = { Graphics: class {
        constructor() { graphics.push(this); }
        clear() {} lineStyle() {} moveTo() {} lineTo() {}
        beginFill() { return this; } drawCircle() { return this; } endFill() { return this; }
        destroy() { this.destroyed = true; }
    } };
    const scene = { id: "scene", width: 2000, height: 1500, grid: { size: 100, distance: 1 }, tokens: new Map(), tiles: new Map() };
    const actor = { type, system: { consciousness: { value: 24 } }, items: [{ id: "equipment" }] };
    const token = { documentName: "Token", id: "pc", uuid: "Scene.scene.Token.pc", parent: scene,
        x: 100, y: 200, width: 2, height: 1, rotation: 45, actor, levels: new Set(["ground"]), flags: {},
        getFlag(_scope, name) { return this.flags[name]; },
        async update(update, options) {
            writes.push({ update, options });
            for (const [key, value] of Object.entries(update)) {
                if (key === "flags.arcane-advent.objectMotion") this.flags.objectMotion = value;
                else this[key] = value;
            }
        } };
    scene.tokens.set(token.id, token);
    const placeable = { actor, document: token, visible: true,
        bounds: { contains: (x, y) => x >= 100 && x <= 300 && y >= 200 && y <= 300 } };
    const tile = { document: { id: "table", documentName: "Tile", levels: new Set(["ground"]) }, visible: true, bounds: { contains: () => true } };
    globalThis.game = { user: { isGM: true }, users: { activeGM: { isSelf: true } }, time: { serverTime: 1000 }, scenes: new Map([[scene.id, scene]]) };
    globalThis.canvas = { ready: true, scene, level: { id: "ground" }, stage: {}, tokens: { placeables: [placeable] }, tiles: { placeables: [tile] },
        app: { view, ticker: { add() {}, remove() {} } }, interface: { addChild() {} }, canvasCoordinatesFromClient: point => point };
    return { view, keyboard, hooks, graphics, writes, warnings, token, placeable, tile, actor };
}

for (const type of ["character", "npc", "storage"]) test(`animation selection accepts a ${type} token ahead of the decor beneath it`, async () => {
    const { view, keyboard, hooks, token, warnings } = environment(type);
    const selected = selectSceneObject();
    view.emit("pointerdown");
    assert.equal(await selected, token);
    assert.equal(view.events.size, 0);
    assert.equal(keyboard.events.size, 0);
    assert.equal(hooks.size, 0);
    assert.deepEqual(warnings, []);
});

test("selection skips invisible tokens and tokens on other floors", async () => {
    const { view, placeable, tile } = environment();
    const otherFloor = { ...placeable, document: { ...placeable.document, levels: new Set(["upstairs"]) } };
    placeable.visible = false;
    canvas.tokens.placeables.push(otherFloor);
    const selected = selectSceneObject();
    view.emit("pointerdown");
    assert.equal(await selected, tile.document);
});

test("selection cancellation releases all canvas, keyboard and teardown listeners", async () => {
    for (const cancel of ["Escape", "right", "teardown"]) {
        const { view, keyboard, hooks } = environment();
        const selected = selectSceneObject();
        if (cancel === "Escape") keyboard.emit("keydown", { key: "Escape" });
        else if (cancel === "right") view.emit("pointerdown", { button: 2 });
        else for (const hook of [...hooks.values()]) if (hook.name === "canvasTearDown") hook.callback();
        assert.equal(await selected, null);
        assert.equal(view.events.size, 0);
        assert.equal(keyboard.events.size, 0);
        assert.equal(hooks.size, 0);
    }
});

test("the GM can select a character, trace waypoints and animate its real Token document without changing the actor", async () => {
    const { view, keyboard, token, actor, writes, graphics } = environment();
    registerObjectMotion();
    const before = structuredClone(actor);
    const animation = animatePickedObject({ duration: 2, rotation: "continuous", turns: 2, direction: -1 });
    view.emit("pointerdown");
    await Promise.resolve();
    view.emit("pointerdown", { clientX: 400, clientY: 250, ctrlKey: true });
    view.emit("pointerdown", { clientX: 450, clientY: 450 });
    assert.deepEqual(await animation, { ok: true });
    assert.equal(writes.length, 1);
    assert.equal(token.x, 350);
    assert.equal(token.y, 400);
    assert.equal(token.rotation, 45);
    assert.deepEqual(token.flags.objectMotion.points, [{ x: 200, y: 250 }, { x: 400, y: 250 }, { x: 450, y: 450 }]);
    assert.equal(token.flags.objectMotion.duration, 2000);
    assert.equal(token.flags.objectMotion.visual.spin, -360);
    assert.deepEqual(actor, before);
    assert.equal(view.events.size, 0);
    assert.equal(keyboard.events.size, 0);
    assert.equal(graphics[0].destroyed, true);
});

test("non-GM users cannot start this animation workflow", async () => {
    const { view, writes } = environment();
    game.user.isGM = false;
    assert.equal(await animatePickedObject({ duration: 1 }), undefined);
    assert.equal(view.events.size, 0);
    assert.equal(writes.length, 0);
});


test("throwing an equipped weapon traces immediately with its stored motion settings, without opening a dialog", async () => {
    const { view, keyboard, actor, token } = environment();
    const weapon={ id:"knife",type:"weapon",system:{equipped:true,corporeal:false,properties:new Set(["thrown"]),
        projection:{duration:2.5,rotation:"continuous",turns:3,direction:-1,offset:45}} };
    actor.isOwner=true;actor.uuid="Actor.source";actor.items=new Map([[weapon.id,weapon]]);actor.getActiveTokens=()=>[{document:token}];
    const requests=[];game.users.activeGM={query:async(_name,data)=>{requests.push(data);return {count:1};}};
    foundry.applications={api:{DialogV2:{wait(){assert.fail("No intermediate settings dialog");}}}};
    const {throwInventoryWeapon}=await import("../module/applications/scene-object-motion-controls.mjs");
    const thrown=throwInventoryWeapon(actor,weapon.id);
    view.emit("pointerdown",{clientX:400,clientY:250,ctrlKey:true});
    view.emit("pointerdown",{clientX:450,clientY:450});await thrown;
    assert.equal(requests.length,1);assert.equal(requests[0].action,"throw");
    assert.equal(requests[0].sourceToken,token.uuid);
    assert.deepEqual(requests[0].points,[{x:200,y:250},{x:400,y:250},{x:450,y:450}]);
    assert.deepEqual(requests[0].motion,weapon.system.projection);
    assert.equal(view.events.size,0);assert.equal(keyboard.events.size,0);
});

test("cancelling a direct throw or using a corporeal weapon never sends an inventory request", async () => {
    const {view,keyboard,actor,token}=environment();
    const weapon={id:"knife",type:"weapon",system:{equipped:true,properties:new Set(["thrown"])}};
    actor.isOwner=true;actor.items=new Map([[weapon.id,weapon]]);actor.getActiveTokens=()=>[{document:token}];
    game.users.activeGM={query:()=>assert.fail("No transfer on cancellation")};
    const {throwInventoryWeapon}=await import("../module/applications/scene-object-motion-controls.mjs");
    const thrown=throwInventoryWeapon(actor,weapon.id);keyboard.emit("keydown",{key:"Escape"});
    assert.equal(await thrown,undefined);weapon.system.corporeal=true;
    assert.equal(await throwInventoryWeapon(actor,weapon.id),undefined);assert.equal(view.events.size,0);
});

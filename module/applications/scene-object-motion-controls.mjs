import { formDialog } from "./form-interactions.mjs";
import { chooseAnimationPath } from "../scene-animation-path.mjs";
import { objectCenter, requestObjectMotion, motionSettings } from "../scene-object-motion.mjs";
import { requestInventoryAction } from "../storage.mjs";
import { weaponProjectile } from "../weapon-projectiles.mjs";

export function motionFields(settings = {}, prefix = "motion") {
    return `<div class="aa-object-motion-settings">
        <label>Vitesse <input name="${prefix}.duration" type="number" min="0.1" max="60" step="0.1" value="${settings.duration??1}" required> s</label>
        <label>Rotation <select name="${prefix}.rotation"><option value="locked" ${settings.rotation==="locked"||!settings.rotation?"selected":""}>Verrouillée</option><option value="direction" ${settings.rotation==="direction"?"selected":""}>Selon le trajet</option><option value="continuous" ${settings.rotation==="continuous"?"selected":""}>Continue</option></select></label>
        <label data-motion-direction>Offset <input name="${prefix}.offset" type="number" min="-3600" max="3600" step="any" value="${settings.offset??0}" required>°</label>
        <label data-motion-continuous>Tours <input name="${prefix}.turns" type="number" min="0" max="100" step="any" value="${settings.turns??1}" required><select name="${prefix}.direction"><option value="1" ${settings.direction!==-1?"selected":""}>↻ Horaire</option><option value="-1" ${settings.direction===-1?"selected":""}>↺ Antihoraire</option></select></label>
    </div>`;
}
export function readMotionFields(root, { validate = true, prefix = "motion" } = {}) {
    const value=key=>root.querySelector(`[name="${prefix}.${key}"]`)?.value;
    const settings={duration:Number(value("duration")),rotation:value("rotation"),offset:Number(value("offset")),turns:Number(value("turns")),direction:Number(value("direction"))};
    return validate ? motionSettings(settings) : settings;
}
export function bindMotionFields(root, prefix = "motion") {
    const mode=root.querySelector(`[name="${prefix}.rotation"]`);
    const refresh=()=>{
        for(const [selector,expected] of [["[data-motion-direction]","direction"],["[data-motion-continuous]","continuous"]]) {
            for(const node of root.querySelectorAll(selector)) {
                node.hidden=mode.value!==expected;
                for(const control of node.querySelectorAll("input,select"))control.disabled=node.hidden;
            }
        }
    };
    mode?.addEventListener("change",refresh);if(mode)refresh();
}
export async function configureObjectMotion(doc) {
    if (!game.user.isGM) return;
    let draft = doc.getFlag("arcane-advent", "motionSettings") ?? { rotation: "direction" };
    while (true) {
        const value = await formDialog.wait({ window: { title: "Réglages d’animation — " + doc.name }, position: { width: 620 },
            content: motionFields(draft), render: (_event, dialog) => bindMotionFields(dialog.element), rejectClose: false,
            buttons: [{ action: "save", label: "Enregistrer", callback: (_event, _button, dialog) => readMotionFields(dialog.element, { validate: false }) },
                { action: "cancel", label: "Annuler", type: "button", default: true, callback: () => null }] });
        if (!value) return;
        try { await doc.setFlag("arcane-advent", "motionSettings", motionSettings(value)); return; }
        catch (error) { ui.notifications.error(error.message); draft = value; }
    }
}
export async function quickObjectAnimation(doc) {
    const settings = motionSettings(doc.getFlag("arcane-advent", "motionSettings") ?? { rotation: "direction" });
    const scene = canvas.scene, route = await chooseAnimationPath({ start: objectCenter(doc) });
    if (!route) return;
    try { if (canvas.scene?.id !== scene.id) throw Error("La scène a changé."); return await requestObjectMotion(doc, route.points, settings); }
    finally { route.cleanup(); }
}
export function selectSceneObject() {
    if(!canvas.ready)return Promise.resolve(null);
    ui.notifications.info("Cliquez sur le token ou l’objet à déplacer. Échap ou clic droit annule.");
    return new Promise(resolve=>{
        const view=canvas.app.view;
        const finish=doc=>{view.removeEventListener("pointerdown",click,true);document.removeEventListener("keydown",key,true);Hooks.off("canvasTearDown",teardown);resolve(doc);};
        const click=event=>{
            if(![0,2].includes(event.button))return;event.preventDefault();event.stopPropagation();
            if(event.button===2)return finish(null);
            const p=canvas.canvasCoordinatesFromClient({x:event.clientX,y:event.clientY});
            const objects=[...(canvas.tokens?.placeables??[]),...(canvas.tiles?.placeables??[]).slice().reverse()];
            const selected=objects.find(o=>o.visible!==false&&(!o.document.levels?.size||o.document.levels.has(canvas.level?.id))&&o.bounds?.contains(p.x,p.y));
            if(selected)finish(selected.document);else ui.notifications.warn("Choisissez un token, un décor ou un objet déposé au sol.");
        };
        const key=event=>{if(event.key==="Escape"){event.preventDefault();finish(null);}};
        const teardown=Hooks.on("canvasTearDown",()=>finish(null));
        view.addEventListener("pointerdown",click,true);document.addEventListener("keydown",key,true);
    });
}
export async function animatePickedObject(settings) {
    if(!game.user.isGM)return;
    const doc=await selectSceneObject();if(!doc)return;
    if(doc.getFlag("arcane-advent","sceneObject")?.kind==="visualEffect")throw Error("Utilisez la liste des effets pour cette animation.");
    const scene=canvas.scene,route=await chooseAnimationPath({start:objectCenter(doc)});if(!route)return;
    try{if(canvas.scene?.id!==scene.id)throw Error("La scène a changé.");return await requestObjectMotion(doc,route.points,settings);}finally{route.cleanup();}
}
export async function throwInventoryWeapon(actor,weaponId) {
    const weapon=actor.items.get(weaponId);
    if(!actor.isOwner||weapon?.type!=="weapon"||!weapon.system.equipped)return;
    const thrown = weapon.system.properties.has("thrown");
    if (thrown ? weapon.system.corporeal : !weapon.system.properties.has("ammunition")) return;
    if (!thrown) weaponProjectile(actor, weapon);
    const token=actor.token?.parent?.id===canvas.scene?.id?actor.token:actor.getActiveTokens()?.find(t=>t.document.parent.id===canvas.scene?.id)?.document;
    if(!token)throw Error("Placez le personnage sur la scène active.");
    const settings = motionSettings(weapon.system.projection ?? { rotation: "direction" });
    const scene=canvas.scene,route=await chooseAnimationPath({start:objectCenter(token)});if(!route)return;
    try{if(canvas.scene?.id!==scene.id)throw Error("La scène a changé.");
        const result=await requestInventoryAction(actor,[{id:weaponId,quantity:1}],{action:thrown ? "throw" : "shot",sourceToken:token.uuid,points:route.points,motion:settings});
        if(result.warning)ui.notifications.warn(result.warning);return result;
    }finally{route.cleanup();}
}

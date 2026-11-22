import { validateAnimationRoute } from "./scene-animation-service.mjs";
import { sceneClock, projectileFrame, projectileAppearance } from "./scene-projectiles.mjs";
import { syncSceneObject } from "./scene-objects.mjs";
import { inventoryForToken } from "./storage-inventory.mjs";

export function defaultSceneObjectMovement(doc, _changes, options) {
    if (doc.documentName !== "Tile" && !(doc.documentName === "Token" && inventoryForToken(doc)?.type === "storage")) return;
    // Explicit API animations and the Animations menu retain their settings.
    // Otherwise normal dragging, keyboard and HUD updates are instantaneous.
    if (options.animate === undefined && options.animation === undefined) options.animate = false;
}

export const OBJECT_MOTION_QUERY = "arcane-advent.objectMotion";
export function objectCenter(doc) {
    const token = doc.documentName === "Token", size = doc.parent.grid.size;
    return { x: doc.x + (token ? doc.width * size / 2 : 0), y: doc.y + (token ? doc.height * size / 2 : 0) };
}
export function motionSettings(input = {}) {
    const result = { duration: input.duration ?? 1, rotation: input.rotation ?? "locked", offset: input.offset ?? 0, turns: input.turns ?? 1, direction: input.direction ?? 1 };
    if(!Number.isFinite(result.duration)||result.duration<0.1||result.duration>60)throw Error("La durée doit être comprise entre 0,1 et 60 secondes.");
    if (!["locked", "direction", "continuous"].includes(result.rotation)
        || !Number.isFinite(result.offset) || Math.abs(result.offset)>3600
        || !Number.isFinite(result.turns) || result.turns<0 || result.turns>100
        || ![1,-1].includes(result.direction)) throw Error("Réglages de rotation invalides.");
    return result;
}
export function sceneImageOffset(doc) {
    const inventory = doc.documentName === "Token" ? inventoryForToken(doc) : null;
    const roots = inventory?.type === "storage" ? [...inventory.items].filter(item => !item.system.containerId) : [];
    const value = roots.length === 1 ? roots[0].system.imageAngleOffset
        : inventory?.type === "storage" ? inventory.system?.imageAngleOffset
        : doc.getFlag?.("arcane-advent", "sceneObject")?.imageAngleOffset;
    return Number.isFinite(value) ? value : 0;
}
export function objectMotionPlan(doc, points, input = {}, { clock = sceneClock, id = () => foundry.utils.randomID(), imageOffset = sceneImageOffset(doc) } = {}) {
    const settings = motionSettings(input), route = validateAnimationRoute(doc.parent, points, settings.duration);
    const token = doc.documentName === "Token", center = objectCenter(doc);
    if (Math.hypot(route.points[0].x-center.x,route.points[0].y-center.y)>1) throw Error("L’objet a été déplacé. Recommencez le trajet.");
    const scale = token ? doc.parent.grid.size : 1;
    const flight = { id: id(), points: route.points, from: route.points[0], to: route.points.at(-1),
        startedAt: clock()+150, duration: route.duration, visual: { width: doc.width*scale, height: doc.height*scale,
            rotation: doc.rotation ?? 0, endScale: 1, rotationMode: settings.rotation, offset: settings.offset - imageOffset,
            spin: settings.rotation === "continuous" ? settings.turns*360*settings.direction/settings.duration : 0 } };
    const final = projectileAppearance(flight,flight.startedAt+flight.duration);
    const x = flight.to.x - (token ? doc.width*scale/2 : 0), y = flight.to.y - (token ? doc.height*scale/2 : 0);
    const width=doc.parent.dimensions?.width??doc.parent.width,height=doc.parent.dimensions?.height??doc.parent.height;
    if(x<0||y<0||(token&&(x+doc.width*scale>width||y+doc.height*scale>height))) throw Error("L’objet doit rester dans la scène.");
    return { x, y, rotation: ((final.rotation%360)+360)%360, "flags.arcane-advent.objectMotion": flight };
}
export async function animateSceneObject(doc, points, settings) {
    if (!game.user.isGM || !["Tile","Token"].includes(doc?.documentName)) throw Error("Choisissez un objet de scène en tant que MJ.");
    const previous = doc.getFlag("arcane-advent","objectMotion");
    if (previous && projectileFrame(previous)?.done === false) throw Error("Attendez la fin du déplacement.");
    const update = objectMotionPlan(doc,points,settings);
    await doc.update(update,{ animate:false, sceneObjectSync:true });
    if (doc.documentName === "Tile" && doc.getFlag("arcane-advent","sceneObject")) await syncSceneObject(doc);
    return { ok:true };
}
export async function requestObjectMotion(doc, points, settings) {
    if (!game.user.isGM) throw Error("Seul le MJ peut animer les objets.");
    const gm=game.users.activeGM;
    if(!gm)throw Error("Un MJ doit être connecté.");
    const data={sceneId:doc.parent.id,documentName:doc.documentName,id:doc.id,points,settings};
    const result=gm.isSelf?await CONFIG.queries[OBJECT_MOTION_QUERY](data,{user:game.user}):await gm.query(OBJECT_MOTION_QUERY,data,{timeout:30000});
    if(!result?.ok)throw Error(result?.error??"Déplacement impossible.");
    return result;
}

export function registerObjectMotion() {
    Hooks.on("preMoveToken", (doc, movement, options) => {
        defaultSceneObjectMovement(doc, movement, options);
        // v14 has already resolved the core auto-rotation setting here. Change
        // the writable movement instruction before it updates the token angle.
        if (inventoryForToken(doc)?.type === "storage" && !options.sceneObjectSync) movement.autoRotate = false;
    });
    Hooks.on("preUpdateToken", defaultSceneObjectMovement);
    Hooks.on("preUpdateTile", defaultSceneObjectMovement);
    let queue=Promise.resolve();
    CONFIG.queries[OBJECT_MOTION_QUERY]=(data,{user})=>{
        const run=queue.catch(()=>{}).then(async()=>{
            if(!user?.isGM)throw Error("Action réservée au MJ.");
            const scene=game.scenes.get(data.sceneId), docs=data.documentName==="Tile"?scene?.tiles:data.documentName==="Token"?scene?.tokens:null;
            const doc=docs?.get(data.id);
            if(!doc)throw Error("Objet introuvable.");
            return animateSceneObject(doc,data.points,data.settings);
        });
        queue=run.catch(()=>{});return run.catch(error=>({error:error.message}));
    };
    const running=new Map();
    function stop(doc) {
        const state=running.get(doc.uuid);if(!state)return;
        state.ticker.remove(state.tick);running.delete(doc.uuid);
        const object=doc.object,center=objectCenter(doc);
        object?.position?.set(doc.x,doc.y);object?.mesh?.position.set(center.x,center.y);
        if(object?.mesh)object.mesh.rotation=doc.rotation*Math.PI/180;
    }
    function start(doc) {
        if(doc.documentName!=="Token"||!canvas.ready||doc.parent.id!==canvas.scene?.id)return;
        const flight=doc.getFlag("arcane-advent","objectMotion");
        if(running.get(doc.uuid)?.id===flight?.id)return;
        stop(doc);if(!flight)return;
        const ticker=canvas.app.ticker;
        const tick=()=>{
            const frame=projectileFrame(flight),visual=projectileAppearance(flight);
            const center=objectCenter(doc);
            if(!frame||frame.done||Math.hypot(center.x-flight.to.x,center.y-flight.to.y)>1||!doc.parent.tokens.has(doc.id)||doc.getFlag("arcane-advent","objectMotion")?.id!==flight.id){
                stop(doc);
                if(game.users.activeGM?.isSelf&&doc.getFlag("arcane-advent","objectMotion")?.id===flight.id)doc.update({"flags.arcane-advent.objectMotion":null},{animate:false}).catch(error=>ui.notifications.error(error.message));
                return;
            }
            const object=doc.object;if(!object||doc.hidden)return;
            object.position.set(frame.x-visual.width/2,frame.y-visual.height/2);
            if(object.mesh){object.mesh.position.set(frame.x,frame.y);object.mesh.rotation=visual.rotation*Math.PI/180;}
        };
        running.set(doc.uuid,{id:flight.id,ticker,tick});ticker.add(tick,undefined,46);tick();
    }
    Hooks.on("drawToken",object=>start(object.document));Hooks.on("updateToken",start);Hooks.on("deleteToken",stop);
    Hooks.on("canvasReady",()=>{for(const doc of canvas.scene.tokens)start(doc);});
    Hooks.on("canvasTearDown",()=>{for(const doc of canvas.scene?.tokens??[])stop(doc);});
    let busy=false;
    Hooks.once("ready",()=>{
        const timer=setInterval(async()=>{
            if(busy||!game.users.activeGM?.isSelf)return;busy=true;
            try{for(const scene of game.scenes)for(const doc of [...scene.tiles,...scene.tokens]){
                const expires = doc.getFlag("arcane-advent", "transferVisual")?.expiresAt;
                if (expires && sceneClock() >= expires) { await scene.deleteEmbeddedDocuments("Tile", [doc.id]); continue; }
                const flight=doc.getFlag("arcane-advent","objectMotion");
                if(flight&&(!projectileFrame(flight)||projectileFrame(flight).done))await doc.update({"flags.arcane-advent.objectMotion":null},{animate:false,sceneObjectSync:true});
            }}catch(error){ui.notifications.error(error.message);}finally{busy=false;}
        },250);
        window.addEventListener("beforeunload",()=>clearInterval(timer),{once:true});
    });
}

import { formDialog } from "./form-interactions.mjs";
import { chooseAnimationPath } from "../scene-animation-path.mjs";
import { requestSceneAnimation } from "../scene-animation-service.mjs";
import { sceneObjectPosition } from "../scene-projectiles.mjs";
import { animationSettings, validateAnimationAppearance } from "../scene-animation-settings.mjs";
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export function animationModels() {
    return [...(game.items ?? [])].filter(item => item.type === "visualEffect")
        .sort((a, b) => a.name.localeCompare(b.name, "fr"));
}
function choices(selected) {
    return '<option value="">Choisir un effet…</option>' + animationModels().map(item =>
        `<option value="${escape(item.uuid)}" ${item.uuid === selected ? "selected" : ""}>${escape(item.name)}</option>`).join("");
}
function fields(draft, { transition = false } = {}) {
    const option = (value, label, current) => `<option value="${value}" ${current === value ? "selected" : ""}>${label}</option>`;
    return `<div class="standard-form aa-animation-options">
        ${transition ? "" : `<label>Durée totale du trajet (s)
            <input name="duration" type="number" min="0.1" max="60" step="0.1" value="${escape(draft.duration)}" required></label>
            <label>Taille initiale (% du placement)<input name="initialSize" type="number" min="1" max="1000" step="any" value="${escape(draft.initialSize ?? 100)}" required></label>
            <label>Taille finale (% de la taille initiale)<input name="finalSize" type="number" min="1" max="1000" step="any" value="${escape(draft.finalSize ?? 100)}" required></label>
            <label>Orientation<select name="rotationMode">${option("locked", "Conserver l’orientation", draft.rotationMode ?? "locked")}${option("direction", "Selon le trajet", draft.rotationMode)}</select></label>
            <label>Offset du trajet (°)<input name="offset" type="number" min="-3600" max="3600" step="any" value="${escape(draft.offset ?? 0)}"></label>
            <label>Rotation continue (°/s)<input name="spin" type="number" min="-3600" max="3600" step="any" value="${escape(draft.spin ?? 0)}" required></label>
            <label>À l’arrivée<select name="arrival">
                ${option("keep", "Garder l’effet sur place", draft.arrival)}
                ${option("delete", "Supprimer l’effet", draft.arrival)}
                ${option("replace", "Déclencher un effet final", draft.arrival)}
            </select></label>`}
        <fieldset data-final-options${!transition && draft.arrival !== "replace" ? " hidden disabled" : ""}><legend>${transition ? "Effet final" : "Effet final (si choisi à l’arrivée)"}</legend>
            <label>Modèle de l’effet final<select name="finalEffectUuid">${choices(draft.finalEffectUuid)}</select></label>
            <label>Lecture de l’effet final<select name="finalMode">
                ${option("once-delete", "Une lecture, puis supprimer", draft.finalMode)}
                ${option("once-keep", "Une lecture, puis conserver", draft.finalMode)}
                ${option("loop", "Lire en boucle et conserver", draft.finalMode)}
            </select></label>
            <label>Durée si image ou brume (s)
                <input name="finalDuration" type="number" min="0.1" max="60" step="0.1" value="${escape(draft.finalDuration)}" required></label>
            <p class="hint">Pour une vidéo, sa durée réelle est utilisée.</p>
        </fieldset>
    </div>`;
}
function read(dialog, defaults) {
    const value = name => dialog.element.querySelector(`[name="${name}"]`)?.value;
    return { ...defaults, duration: value("duration") === undefined ? defaults.duration : Number(value("duration")),
        rotationMode: value("rotationMode") ?? defaults.rotationMode ?? "locked", offset: value("offset") === undefined ? defaults.offset ?? 0 : Number(value("offset")),
        arrival: value("arrival") ?? defaults.arrival,
        finalEffectUuid: value("finalEffectUuid") ?? "", finalMode: value("finalMode") ?? "once-delete",
        finalDuration: Number(value("finalDuration")),
        ...Object.fromEntries(["initialSize", "finalSize", "spin"].map(key => [key,
            value(key) === undefined ? defaults[key] : Number(value(key))])) };
}
function validate(draft, transition = false) {
    if (!transition) validateAnimationAppearance(draft);
    if (!transition && (!Number.isFinite(draft.duration) || draft.duration < 0.1 || draft.duration > 60)) {
        throw Error("Choisissez une durée de trajet entre 0,1 et 60 secondes.");
    }
    if ((transition || draft.arrival === "replace") && !draft.finalEffectUuid) throw Error("Choisissez un effet final.");
}
async function configuration(draft, { title, transition = false, route = null, scene = null } = {}) {
    while (true) {
        const summary = route ? `<p><strong>${route.points.length} points</strong> · ${Math.round(route.points.slice(1).reduce((sum, p, i) =>
            sum + Math.hypot(p.x - route.points[i].x, p.y - route.points[i].y), 0) / (scene.grid.size / scene.grid.distance) * 10) / 10}
            ${escape(scene.grid.units ?? "")}. L’effet apparaîtra après confirmation.</p>` : "";
        const buttons = [{
            action: "confirm", label: transition ? "Déclencher" : "Tracer et lancer",
            callback: (_event, _button, dialog) => {
                const value = read(dialog, draft);
                return { ...value, decision: "launch" };
            }
        }];
        if (route) buttons.push({ action: "redraw", label: "Retracer le trajet",
            callback: (_event, _button, dialog) => ({ ...read(dialog, draft), decision: "redraw" }) });
        buttons.push({ action: "cancel", label: "Annuler", type: "button", default: true, callback: () => false });
        const result = await formDialog.wait({ position: { width: 560, height: "auto" }, window: { title },
            content: summary + fields(draft, { transition }), buttons, rejectClose: false,
            render: (_event, dialog) => {
                const arrival = dialog.element.querySelector('[name="arrival"]');
                const final = dialog.element.querySelector("[data-final-options]");
                arrival?.addEventListener("change", () => {
                    final.hidden = final.disabled = arrival.value !== "replace";
                });
            }
        });
        if (!result || result.decision === "redraw") return result;
        try { validate(result, transition); return result; }
        catch (error) { ui.notifications.error(error.message); draft = result; }
    }
}

export async function prepareSceneAnimation({ item = null, tile = null, quick = false } = {}) {
    if (!game.user.isGM) throw Error("Seul le MJ peut préparer une animation.");
    const scene = canvas.scene, levelId = canvas.level?.id;
    if (!canvas.ready || !scene) throw Error("Ouvrez une scène pour préparer une animation.");
    const model = tile?.getFlag?.("arcane-advent", "sceneObject") ?? tile?.flags?.["arcane-advent"]?.sceneObject;
    if (tile && model?.flight) throw Error("Attendez la fin du trajet en cours.");
    if (!tile && item?.type !== "visualEffect") throw Error("Choisissez un modèle d’effet visuel.");
    let draft = animationSettings(model ?? item?.system);
    if(quick && tile && model.sourceUuid){
        const source=await fromUuid(model.sourceUuid);
        if(source?.type==="visualEffect")draft=animationSettings(source.system);
    }
    // A continuation begins at the size reached by the previous trajectory.
    if (tile) draft.initialSize = 100;
    const name = tile ? model.name : item.name;
    if (!quick) draft = await configuration(draft, { title: "Préparer — " + name });
    if (!draft) return;
    validate(draft);
    if (canvas.scene?.id !== scene.id || canvas.level?.id !== levelId) throw Error("La scène ou l’étage a changé.");
    const route = await chooseAnimationPath({ start: tile ? sceneObjectPosition(tile) : null });
    if (!route) return;
    try {
        if (canvas.scene?.id !== scene.id || canvas.level?.id !== levelId) throw Error("La scène ou l’étage a changé.");
        return await requestSceneAnimation({ ...draft, action: tile ? "continue" : "launch",
            effectUuid: item?.uuid, tileId: tile?.id, sceneId: scene.id, levelId, points: route.points });
    } finally { route.cleanup(); }
}

export async function prepareSceneTransition(tile) {
    if (!game.user.isGM) throw Error("Seul le MJ peut déclencher un effet final.");
    const model = tile?.getFlag?.("arcane-advent", "sceneObject") ?? tile?.flags?.["arcane-advent"]?.sceneObject;
    const draft = await configuration(animationSettings(model),
        { title: "Déclencher l’effet final", transition: true });
    if (!draft) return;
    return requestSceneAnimation({ ...draft, action: "transition", sceneId: tile.parent.id, tileId: tile.id });
}

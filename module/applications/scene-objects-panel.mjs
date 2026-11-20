import { sceneMist, sceneLightEnabled } from "../scene-visual-settings.mjs";
import { chooseSceneObjectPosition, requestSceneObjectAction, sceneObject, sceneObjectAccess } from "../scene-objects.mjs";
const { ApplicationV2, HandlebarsApplicationMixin, DialogV2 } = foundry.applications.api;
const escape = value => foundry.utils.escapeHTML(String(value ?? ""));

export async function openSceneObjectInteraction(tile) {
    const model = sceneObject(tile);
    const access = sceneObjectAccess(tile);
    if (!access.visible) return;
    const locked = tile.locked && !game.user.isGM;
    const buttons = [];
    const canProject = game.user.isGM && model.kind === "visualEffect";
    const run = async (action, values) => {
        try { await requestSceneObjectAction(tile, action, values); }
        catch (error) { ui.notifications.error(error.message); }
    };
    if (access.toggleLight && !locked) buttons.push({
        action: "light", label: model.kind === "visualEffect"
            ? (model.active ? "Désactiver" : "Activer") : (model.active ? "Éteindre" : "Allumer"),
        callback: () => run("light", { active: !model.active })
    });
    if (access.movable && !locked) {
        buttons.push({ action: "move", label: "Déplacer", callback: () => {
            // Do not keep the modal open while the player chooses a point on the canvas.
            chooseSceneObjectPosition().then(point => { if (point) return run("move", point); })
                .catch(error => ui.notifications.error(error.message));
        } });
        buttons.push({ action: "rotate", label: "Tourner de 90°",
            callback: () => run("rotate", { rotation: tile.rotation + 90 }) });
    }
    if (canProject) buttons.push({
        action: "project", label: "Projeter (A → B)", callback: (_event, _button, dialog) => {
            const duration = Number(dialog.element.querySelector('[name="projectileDuration"]').value);
            if (!Number.isFinite(duration) || duration < 0.1 || duration > 10) {
                ui.notifications.error("La durée du trajet doit être comprise entre 0,1 et 10 secondes.");
                return;
            }
            // Close the dialog before picking either point.
            const sceneId = tile.parent.id, levelId = canvas.level?.id;
            (async () => {
                const from = await chooseSceneObjectPosition("Point A : cliquez sur le départ du projectile. Échap ou clic droit pour annuler.");
                if (!from) return;
                const to = await chooseSceneObjectPosition("Point B : cliquez sur la destination du projectile. Échap ou clic droit pour annuler.");
                if (!to) return;
                if (canvas.scene?.id !== sceneId || canvas.level?.id !== levelId) {
                    throw Error("La scène ou l’étage a changé : choisissez à nouveau le trajet.");
                }
                await run("project", { from, to, duration });
            })().catch(error => ui.notifications.error(error.message));
        }
    });
    buttons.push({ action: "close", label: "Fermer", default: true });
    return DialogV2.wait({
        window: { title: model.name },
        content: `<p class="aa-scene-object-description">${escape(model.description)}</p>`
            + (locked ? "<p>Cet objet est verrouillé par le MJ.</p>" : "")
            + (canProject ? `<label class="form-group">Durée du trajet (s)
                <input name="projectileDuration" type="number" min="0.1" max="10" step="0.1" value="${escape(model.projectileDuration ?? 0.8)}">
                </label><p>Projeter : choisissez le départ A, puis l’arrivée B sur la scène.</p>` : ""),
        buttons, rejectClose: false
    });
}

export class SceneObjectsPanel extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "aa-scene-objects", classes: ["arcane-advent", "aa-scene-objects"],
        position: { width: 560, height: 460 }, window: { title: "Objets de scène", resizable: true },
        actions: {
            interact: function (_event, target) {
                const tile = canvas.scene?.tiles.get(target.dataset.tileId);
                if (tile) return openSceneObjectInteraction(tile);
            },
            model: async function (_event, target) {
                if (!game.user.isGM) return;
                try {
                    const source = sceneObject(canvas.scene?.tiles.get(target.dataset.tileId));
                    const item = source?.sourceUuid && await fromUuid(source.sourceUuid);
                    if (item) item.sheet.render({ force: true });
                    else ui.notifications.info("Le modèle d’origine n’existe plus. L’exemplaire sur la scène reste utilisable.");
                } catch (error) { ui.notifications.error(error.message); }
            }
        }
    };
    static PARTS = {
        body: { template: "systems/arcane-advent/templates/scene-objects-panel.hbs", scrollable: [".aa-scene-objects-list"] }
    };
    _hooks = [];
    async _prepareContext(options) {
        const objects = [...(canvas.scene?.tiles ?? [])].filter(tile => sceneObjectAccess(tile).visible
            && (!tile.levels?.size || tile.levels.has(canvas.level?.id))).map(tile => {
                const model = sceneObject(tile);
                return { id: tile.id, name: model.name, img: model.sourceImage,
                    type: game.i18n.localize("TYPES.Item." + model.kind),
                    status: tile.hidden ? "Masqué" : tile.locked ? "Verrouillé"
                        : sceneMist(model).enabled ? (model.active ? "Brume active" : "Brume inactive")
                        : sceneLightEnabled(model) ? (model.active ? "Allumé" : "Éteint") : "" };
            });
        return { ...await super._prepareContext(options), objects, isGM: game.user.isGM, sceneName: canvas.scene?.name };
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        if (this._hooks.length) return;
        for (const event of ["createTile", "updateTile", "deleteTile", "canvasReady", "canvasTearDown"]) {
            this._hooks.push([event, Hooks.on(event, () => this.render({ force: false }))]);
        }
    }
    async _onClose(options) {
        for (const [event, id] of this._hooks) Hooks.off(event, id);
        this._hooks = [];
        return super._onClose(options);
    }
}

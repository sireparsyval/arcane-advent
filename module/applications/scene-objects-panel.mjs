import { prepareSceneAnimation, prepareSceneTransition, animationModels } from "./scene-animation-composer.mjs";
import { requestSceneAnimation } from "../scene-animation-service.mjs";
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
    if (canProject) {
        if (!model.flight) {
            buttons.push({ action: "project", label: "Continuer / préparer un trajet", callback: () => {
                prepareSceneAnimation({ tile }).catch(error => ui.notifications.error(error.message));
            } });
            buttons.push({ action: "transition", label: "Déclencher l’effet final", callback: () => {
                prepareSceneTransition(tile).catch(error => ui.notifications.error(error.message));
            } });
            buttons.push({ action: "remove", label: "Supprimer cet effet", callback: () =>
                requestSceneAnimation({ action: "remove", sceneId: tile.parent.id, tileId: tile.id })
                    .catch(error => ui.notifications.error(error.message)) });
        }
    }
    buttons.push({ action: "close", label: "Fermer", default: true });
    return DialogV2.wait({
        window: { title: model.name },
        content: `<p class="aa-scene-object-description">${escape(model.description)}</p>`
            + (locked ? "<p>Cet objet est verrouillé par le MJ.</p>" : "")
            + (canProject && model.flight ? "<p>Le trajet est en cours.</p>" : ""),
        buttons, rejectClose: false
    });
}

export class SceneObjectsPanel extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "aa-scene-objects", classes: ["arcane-advent", "aa-scene-objects"],
        position: { width: 680, height: 640 }, window: { title: "Animations", resizable: true },
        actions: {
            prepare: async function () {
                try {
                    const uuid = this.element.querySelector('[name="animationModel"]')?.value;
                    const item = uuid && await fromUuid(uuid);
                    await prepareSceneAnimation({ item });
                } catch (error) { ui.notifications.error(error.message); }
            },
            createModel: async function () {
                if (!game.user.isGM) return;
                const item = await Item.create({ name: "Nouvelle animation", type: "visualEffect" });
                item?.sheet.render({ force: true });
            },
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
    _selectedModel = "";
    async _prepareContext(options) {
        const objects = [...(canvas.scene?.tiles ?? [])].filter(tile => sceneObjectAccess(tile).visible
            && (!tile.levels?.size || tile.levels.has(canvas.level?.id))).map(tile => {
                const model = sceneObject(tile);
                return { id: tile.id, name: model.name, img: model.sourceImage,
                    type: game.i18n.localize("TYPES.Item." + model.kind),
                    status: model.flight ? "Trajet en cours" : model.playback?.state === "ended" ? "Lecture terminée"
                        : tile.hidden ? "Masqué" : tile.locked ? "Verrouillé"
                        : sceneMist(model).enabled ? (model.active ? "Brume active" : "Brume inactive")
                        : sceneLightEnabled(model) ? (model.active ? "Allumé" : "Éteint") : "" };
            });
        const models = game.user.isGM ? animationModels().map(item => ({
            uuid: item.uuid, name: item.name, selected: item.uuid === this._selectedModel
        })) : [];
        return { ...await super._prepareContext(options), objects, models, hasModels: models.length > 0,
            isGM: game.user.isGM, sceneName: canvas.scene?.name };
    }
    async _onRender(context, options) {
        await super._onRender(context, options);
        this.element?.querySelector('[name="animationModel"]')?.addEventListener("change", event => { this._selectedModel = event.target.value; });
        if (this._hooks.length) return;
        for (const event of ["createTile", "updateTile", "deleteTile", "createItem", "updateItem", "deleteItem", "canvasReady", "canvasTearDown"]) {
            this._hooks.push([event, Hooks.on(event, () => this.render({ force: false }))]);
        }
    }
    async _onClose(options) {
        for (const [event, id] of this._hooks) Hooks.off(event, id);
        this._hooks = [];
        return super._onClose(options);
    }
}

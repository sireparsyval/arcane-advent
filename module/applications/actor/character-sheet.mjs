const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;


export class ArcaneCharacterSheet
    extends HandlebarsApplicationMixin(ActorSheetV2) {

    static DEFAULT_OPTIONS = {
        classes: [
            "arcane-advent",
            "actor-sheet",
            "character-sheet"
        ],

        position: {
            width: 1000,
            height: 750
        },

        form: {
            closeOnSubmit: false,
            submitOnChange: true
        },

        actions: {
            rollAbility: this._onRollAbility,
            rollSavingThrow: this._onRollSavingThrow
        }
    };


    static PARTS = {
        body: {
            template:
                "systems/arcane-advent/templates/actor/character-sheet.hbs"
        }
    };


    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.actor = this.actor;
        context.system = this.actor.system;

        return context;
    }


    static async _onRollAbility(event, target) {
        const abilityKey = target.dataset.ability;
        const rollMode = this.actor.system.rollMode;

        await this.actor.rollAbility(
            abilityKey,
            rollMode
        );
    }


    static async _onRollSavingThrow(event, target) {
        const abilityKey = target.dataset.ability;
        const rollMode = this.actor.system.rollMode;

        await this.actor.rollSavingThrow(
            abilityKey,
            rollMode
        );
    }
}
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
            rollSavingThrow: this._onRollSavingThrow,

            addSkill: this._onAddSkill,
            deleteSkill: this._onDeleteSkill,
            rollSkill: this._onRollSkill
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

        context.skills = this.actor.items
            .filter(item => item.type === "skill")
            .map(skill => {

                const ability =
                    this.actor.system.abilities[
                        skill.system.ability
                    ];

                return {
                    id: skill.id,
                    name: skill.name,

                    ability: skill.system.ability,

                    mastery: skill.system.mastery,

                    total:
                        (ability?.modifier ?? 0)
                        + skill.system.mastery
                };
            });

        return context;
    }


    _getRollMode() {
        const select = this.element.querySelector(
            '[name="system.rollMode"]'
        );

        return select?.value
            ?? this.actor.system.rollMode
            ?? "normal";
    }


    static async _onRollAbility(event, target) {
        const abilityKey = target.dataset.ability;
        const rollMode = this._getRollMode();

        await this.actor.rollAbility(
            abilityKey,
            rollMode
        );
    }


    static async _onRollSavingThrow(event, target) {
        const abilityKey = target.dataset.ability;
        const rollMode = this._getRollMode();

        await this.actor.rollSavingThrow(
            abilityKey,
            rollMode
        );
    }


    static async _onAddSkill(event, target) {
        await this.actor.createEmbeddedDocuments(
            "Item",
            [
                {
                    name: "Nouvelle compétence",
                    type: "skill",

                    system: {
                        ability: "strength",
                        mastery: 0
                    }
                }
            ]
        );
    }


    static async _onDeleteSkill(event, target) {
        const skillId = target.dataset.skillId;

        if (!skillId) return;

        await this.actor.deleteEmbeddedDocuments(
            "Item",
            [skillId]
        );
    }


    static async _onRollSkill(event, target) {
        const skillId = target.dataset.skillId;
        const rollMode = this._getRollMode();

        await this.actor.rollSkill(
            skillId,
            rollMode
        );
    }


    async _onRender(context, options) {
        await super._onRender(context, options);

        // Onglets
        this._activeTab ??= "core";

        const tabs = new foundry.applications.ux.Tabs({
            navSelector: ".aa-tabs",
            contentSelector: ".aa-tab-content",
            initial: this._activeTab,
            group: "sheet"
        });

        tabs.bind(this.element);

        // Mémorise l'onglet actif en cas de re-render de la fiche.
        for (const tab of this.element.querySelectorAll(
            ".aa-tabs [data-tab]"
        )) {
            tab.addEventListener("click", () => {
                this._activeTab = tab.dataset.tab;
            });
        }


        // Tes champs de compétences déjà existants
        const fields =
            this.element.querySelectorAll(
                "[data-skill-edit]"
            );

        for (const field of fields) {
            field.addEventListener(
                "change",
                this._onSkillEdit.bind(this)
            );
        }
    }


    async _onSkillEdit(event) {
        event.stopPropagation();

        const field = event.currentTarget;

        const skillId =
            field.dataset.skillId;

        const skillField =
            field.dataset.skillField;

        const skill =
            this.actor.items.get(skillId);

        if (!skill) return;


        let value = field.value;

        if (skillField === "system.mastery") {
            value = Number(value) || 0;
        }


        await skill.update({
            [skillField]: value
        });
    }
}
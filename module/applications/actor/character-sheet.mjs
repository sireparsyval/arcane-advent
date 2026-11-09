import { ARCANE_NEEDS } from "../../config.mjs";
import { AlterationData, InjuryData, INJURY_ZONES } from "../../data/condition-data.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;


const CONDITION_SECTIONS = {
    alteration: {
        model: AlterationData,
        title: "Altérations d’état",
        addLabel: "Ajouter une altération",
        editLabel: "Modifier l’altération",
        empty: "Aucune altération.",
        severityLabel: "Intensité",
        severityShort: "Int."
    },
    injury: {
        model: InjuryData,
        title: "Blessures & Maladies",
        addLabel: "Ajouter une blessure ou une maladie",
        editLabel: "Modifier la blessure ou la maladie",
        empty: "Aucune blessure ni maladie.",
        severityLabel: "Gravité",
        severityShort: "Grav."
    }
};

const DEATH_SAVE_LABELS = {
    successes: "Réussites",
    failures: "Échecs"
};

function trackSteps(value, max) {
    return Array.from({ length: max }, (_, offset) => ({
        index: offset + 1,
        filled: value > offset
    }));
}

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
            rollGuard: this._onRollGuard,

            editCondition: this._onEditCondition,
            deleteCondition: this._onDeleteCondition,
            stepTrack: this._onStepTrack,
            showMercyHelp: this._onShowMercyHelp,

            addSkill: this._onAddSkill,
            deleteSkill: this._onDeleteSkill,
            rollSkill: this._onRollSkill,

            addEquipment: this._onAddEquipment,
            toggleEquipment: this._onToggleEquipment,
            deleteEquipment: this._onDeleteEquipment,

            toggleProtectionZone: this._onToggleProtectionZone,
            addProtectionReduction: this._onAddProtectionReduction,
            removeProtectionReduction: this._onRemoveProtectionReduction,

            rollWeaponAttack: this._onRollWeaponAttack,
            rollWeaponDamage: this._onRollWeaponDamage,

            toggleEquipmentProperty: this._onToggleEquipmentProperty,

            rollWeaponBonusDamage: this._onRollWeaponBonusDamage,
            rollWeaponVersatileDamage: this._onRollWeaponVersatileDamage,

            addExpertise: this._onAddExpertise,
            deleteExpertise: this._onDeleteExpertise,

            addWeaponDamageType: this._onAddWeaponDamageType,
            removeWeaponDamageType: this._onRemoveWeaponDamageType
        }
    };


    static PARTS = {
        body: {
            template:
                "systems/arcane-advent/templates/actor/character-sheet.hbs",
            scrollable: [""]
        }
    };


    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.actor = this.actor;
        context.system = this.actor.system;
        // L’onglet doit être visible avant que Foundry restaure le défilement.
        context.activeSheetTab = this._activeTab ?? "core";

        context.canEditState = this.isEditable;
        context.conditionSections = Object.entries(CONDITION_SECTIONS).map(([type, section]) => ({
            type,
            title: section.title,
            addLabel: section.addLabel,
            empty: section.empty,
            severityShort: section.severityShort,
            entries: this.actor.items.filter(item => item.type === type).map(item => ({
                id: item.id,
                name: item.name,
                severity: item.system.severity,
                description: item.system.description,
                zone: item.system.zone ? INJURY_ZONES[item.system.zone] : ""
            }))
        }));

        context.needs = Object.entries(ARCANE_NEEDS).map(([key, { label, stages }]) => {
            const value = this.actor.system.needs[key];
            return {
                key,
                label,
                max: stages.length - 1,
                steps: trackSteps(value, stages.length - 1),
                levels: stages.map((name, index) => ({
                    name,
                    index,
                    selected: index === value
                })).reverse()
            };
        });

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
        
        const equipmentTypes = [
            "weapon",
            "shield",
            "protection",
            "accessory"
        ];

        const equipment = this.actor.items.filter(
            item => equipmentTypes.includes(item.type)
        );


        context.equipment = {

            weapons: equipment
                .filter(
                    item =>
                        item.type === "weapon"
                        && item.system.equipped
                )
                .map(item => {

                    const ability =
                        this.actor.getWeaponAbilityData(item);

                    const properties =
                        item.system.properties;

                    const expertiseBonus =
                        this.actor.getExpertiseBonus(
                            "weaponClass",
                            item.system.weaponClass
                        );

                    return {
                        id: item.id,
                        name: item.name,
                        system: item.system,

                        attackAbility:
                            ability.label,

                        expertiseBonus,

                        attackTotal:
                            ability.modifier
                            + expertiseBonus,

                        damageTypes: [...item.system.damageTypes],

                        properties: {
                            twoHanded:
                                properties.has("twoHanded"),

                            finesse:
                                properties.has("finesse"),

                            thrown:
                                properties.has("thrown"),

                            light:
                                properties.has("light"),

                            heavy:
                                properties.has("heavy"),

                            versatile:
                                properties.has("versatile"),

                            ammunition:
                                properties.has("ammunition")
                        }
                    };
                }),

            shields: equipment
                .filter(item =>
                    item.type === "shield"
                    && item.system.equipped
                )
                .map(item => ({
                    id: item.id,
                    name: item.name,
                    system: item.system,

                    expertiseBonus:
                        this.actor.getExpertiseBonus(
                            "shieldClass",
                            item.system.shieldClass
                        )
                })),

            protections: equipment
                .filter(item =>
                    item.type === "protection"
                    && item.system.equipped
                )
                .map(item => ({

                    id: item.id,
                    name: item.name,
                    system: item.system,

                    zones: {
                        head:
                            item.system.zones.has("head"),

                        torso:
                            item.system.zones.has("torso"),

                        arms:
                            item.system.zones.has("arms"),

                        legs:
                            item.system.zones.has("legs")
                    },

                    damageReductions:
                        Object.entries(
                            item.system.damageReductions ?? {}
                        )
                        .map(([type, value]) => ({
                            type,
                            value
                        }))
                })),

            accessories: equipment.filter(
                item =>
                    item.type === "accessory"
                    && item.system.equipped
            ),

            inventory: equipment.filter(
                item => !item.system.equipped
            )
        };

        context.guardSources = [];


        // ==========================
        // ARMES À DEUX MAINS
        // ==========================

        for (const weapon of this.actor.items) {

            if (
                weapon.type !== "weapon"
                || !weapon.system.equipped
                || !weapon.system.properties.has("twoHanded")
                || !weapon.system.guardEnabled
            ) {
                continue;
            }


            const expertiseBonus =
                this.actor.getExpertiseBonus(
                    "weaponClass",
                    weapon.system.weaponClass
                );


            const strength =
                this.actor.system
                    .abilities
                    .strength
                    .modifier;

            const dexterity =
                this.actor.system
                    .abilities
                    .dexterity
                    .modifier;


            const guardValue =
                10
                + strength
                + expertiseBonus
                + Math.min(dexterity, 0);


            context.guardSources.push({
                id: weapon.id,
                name: weapon.name,
                type: "weapon",
                label: "Arme",
                value: guardValue
            });
        }


        // ==========================
        // BOUCLIERS
        // ==========================

        for (const shield of this.actor.items) {

            if (
                shield.type !== "shield"
                || !shield.system.equipped
                || !shield.system.guardEnabled
            ) {
                continue;
            }


            const expertiseBonus =
                this.actor.getExpertiseBonus(
                    "shieldClass",
                    shield.system.shieldClass
                );


            const strength =
                this.actor.system
                    .abilities
                    .strength
                    .modifier;


            const guardValue =
                10
                + strength
                + shield.system.defenseBonus
                + expertiseBonus;


            context.guardSources.push({
                id: shield.id,
                name: shield.name,
                type: "shield",
                label: "Bouclier",
                value: guardValue
            });
        }

        context.expertises = this.actor.items
            .filter(item =>
                item.type === "expertise"
            )
            .map(expertise => ({
                id: expertise.id,
                name: expertise.name,
                domain: expertise.system.domain,
                target: expertise.system.target,
                bonus: expertise.system.bonus
            }));

        context.deathSaves = Object.entries(DEATH_SAVE_LABELS).map(([key, label]) => ({
            key,
            label,
            steps: trackSteps(this.actor.system.deathSaves[key], 3)
        }));
        
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


    static async _onRollGuard(
        event,
        target
    ) {
        const itemId =
            target.dataset.itemId;

        if (!itemId) return;


        await this.actor.rollGuard(itemId);
    }


    static async _onEditCondition(event, target) {
        if (!this.isEditable) return;

        const itemId = target.dataset.itemId;
        const item = itemId ? this.actor.items.get(itemId) : null;
        const type = itemId ? item?.type : target.dataset.conditionType;
        if (!Object.hasOwn(CONDITION_SECTIONS, type)) return;
        const section = CONDITION_SECTIONS[type];

        const previous = {
            name: item?.name ?? "",
            system: item?.system.toObject() ?? section.model.schema.getInitialValue({})
        };

        const content = document.createElement("div");
        content.innerHTML = await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/condition-dialog.hbs",
            {
                ...previous,
                severityLabel: section.severityLabel,
                zones: type === "injury" ? INJURY_ZONES : null
            }
        );

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: item ? section.editLabel : section.addLabel },
            position: { width: 420 },
            content,
            modal: true,
            form: { closeOnSubmit: false },
            buttons: [
                {
                    action: "save",
                    label: item ? "Enregistrer" : "Ajouter",
                    callback: async (_event, button, app) => {
                        if (!button.form.reportValidity()) return;

                        const fields = new FormData(button.form);
                        const data = {
                            name: fields.get("name").trim(),
                            system: {
                                severity: Number(fields.get("severity")),
                                description: fields.get("description").trim()
                            }
                        };
                        if (type === "injury") data.system.zone = fields.get("zone");

                        try {
                            if (item) {
                                if (!this.actor.items.has(itemId)) {
                                    ui.notifications.warn("Cette condition a déjà été retirée.");
                                    await app.close();
                                    return;
                                }

                                const changes = foundry.utils.diffObject(previous, data);
                                if (Object.keys(changes).length) await item.update(changes);
                            } else {
                                await this.actor.createEmbeddedDocuments("Item", [
                                    { ...data, type }
                                ]);
                            }
                            await app.close();
                        } catch (error) {
                            Hooks.onError("ArcaneCharacterSheet#_onEditCondition", error, {
                                msg: "Impossible d’enregistrer la condition.",
                                log: "error",
                                notify: "error"
                            });
                        }
                    }
                },
                {
                    action: "cancel",
                    label: "Annuler",
                    type: "button",
                    callback: (_event, _button, app) => app.close()
                }
            ]
        });

        await dialog.render({ force: true });
    }


    static async _onDeleteCondition(event, target) {
        if (!this.isEditable) return;

        const item = this.actor.items.get(target.dataset.itemId);
        if (!item || !Object.hasOwn(CONDITION_SECTIONS, item.type)) return;

        const content = document.createElement("div");
        const message = document.createElement("p");
        message.textContent = `Retirer « ${item.name} » de la fiche du personnage ?`;
        content.append(message);

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Retirer la condition" },
            content,
            modal: true,
            rejectClose: false,
            yes: { label: "Retirer" },
            no: { label: "Annuler" }
        });

        if (confirmed && this.actor.items.has(item.id)) await item.delete();
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
        const tabs = new foundry.applications.ux.Tabs({
            navSelector: ".aa-tabs",
            contentSelector: ".aa-tab-content",
            initial: context.activeSheetTab,
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

        const equipmentFields =
            this.element.querySelectorAll(
                "[data-equipment-edit]"
            );

        for (const field of equipmentFields) {
            field.addEventListener(
                "change",
                this._onEquipmentEdit.bind(this)
            );
        }

        const expertiseFields =
            this.element.querySelectorAll(
                "[data-expertise-edit]"
            );

        for (const field of expertiseFields) {
            field.addEventListener(
                "change",
                this._onExpertiseEdit.bind(this)
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

    static async _onAddEquipment(event, target) {

        const type =
            target.dataset.equipmentType;


        const validTypes = [
            "weapon",
            "shield",
            "protection",
            "accessory"
        ];


        if (!validTypes.includes(type)) {
            return;
        }


        const names = {
            weapon: "Nouvelle arme",
            shield: "Nouveau bouclier",
            protection: "Nouvelle protection",
            accessory: "Nouvel accessoire"
        };


        // Equipping a shield may also unequip a two-handed weapon.
        const equipOnCreate = type !== "shield";
        const [item] = await this.actor.createEmbeddedDocuments(
            "Item",
            [{
                name: names[type],
                type,
                system: { equipped: equipOnCreate }
            }],
            { render: equipOnCreate }
        );

        if (!equipOnCreate && item) {
            await this._setEquipmentEquipped(item, true);
        }
    }

    static async _onToggleEquipment(
        event,
        target
    ) {
        const itemId =
            target.dataset.itemId;

        const item =
            this.actor.items.get(itemId);

        if (!item) return;


        await this._setEquipmentEquipped(item, !item.system.equipped);
    }

    async _setEquipmentEquipped(item, willEquip) {
        const updates = [{
            _id: item.id,
            "system.equipped": willEquip
        }];

        // ==========================
        // ÉQUIPE UN BOUCLIER
        // ==========================

        if (
            willEquip
            && item.type === "shield"
        ) {

            const twoHandedWeapons =
                this.actor.items.filter(other =>
                    other.type === "weapon"
                    && other.system.equipped
                    && other.system.properties.has("twoHanded")
                );


            updates.push(...twoHandedWeapons.map(weapon => ({
                _id: weapon.id,
                "system.equipped": false
            })));
        }


        // ==========================
        // ÉQUIPE UNE ARME 2 MAINS
        // ==========================

        if (
            willEquip
            && item.type === "weapon"
            && item.system.properties.has("twoHanded")
        ) {

            const shields =
                this.actor.items.filter(other =>
                    other.type === "shield"
                    && other.system.equipped
                );


            updates.push(...shields.map(shield => ({
                _id: shield.id,
                "system.equipped": false
            })));
        }


        await this.actor.updateEmbeddedDocuments("Item", updates);
    }
    
    static async _onDeleteEquipment(event, target) {
        const itemId = target.dataset.itemId;

        if (!itemId) return;

        await this.actor.deleteEmbeddedDocuments(
            "Item",
            [itemId]
        );
    }

    async _onEquipmentEdit(event) {
        event.stopPropagation();

        const field = event.currentTarget;

        const itemId = field.dataset.itemId;
        const itemField = field.dataset.itemField;

        const item =
            this.actor.items.get(itemId);

        if (!item) return;


        let value;


        if (field.type === "checkbox") {
            value = field.checked;
        }

        else if (field.type === "number") {
            value = Number(field.value) || 0;
        }

        else {
            value = field.value;
        }


        await item.update({
            [itemField]: value
        });
    }

    static async _onRollWeaponAttack(event, target) {
        const weaponId = target.dataset.itemId;
        const rollMode = this._getRollMode();

        await this.actor.rollWeaponAttack(
            weaponId,
            rollMode
        );
    }


    static async _onRollWeaponDamage(event, target) {
        const weaponId = target.dataset.itemId;

        await this.actor.rollWeaponDamage(
            weaponId
        );
    }

    static async _onToggleEquipmentProperty(
        event,
        target
    ) {
        const itemId = target.dataset.itemId;
        const property = target.dataset.property;

        const item =
            this.actor.items.get(itemId);

        if (!item || !property) return;


        const properties =
            new Set(item.system.properties);


        if (properties.has(property)) {
            properties.delete(property);
        }
        else {
            properties.add(property);
        }

        const update = {
            _id: item.id,
            "system.properties": [...properties]
        };
        const updates = [update];

        if (
            property === "twoHanded"
            && properties.has("twoHanded")
            && item.system.equipped
        ) {

            const shields =
                this.actor.items.filter(other =>
                    other.type === "shield"
                    && other.system.equipped
                );


            updates.push(...shields.map(shield => ({
                _id: shield.id,
                "system.equipped": false
            })));
        }


        if (
            property === "twoHanded"
            && !properties.has("twoHanded")
        ) {
            update["system.guardEnabled"] = false;
        }


        await this.actor.updateEmbeddedDocuments("Item", updates);
    }


    static async _onRollWeaponBonusDamage(
        event,
        target
    ) {
        const weaponId = target.dataset.itemId;

        await this.actor.rollWeaponDamage(
            weaponId,
            {
                bonusAction: true
            }
        );
    }


    static async _onRollWeaponVersatileDamage(
        event,
        target
    ) {
        const weaponId = target.dataset.itemId;

        await this.actor.rollWeaponDamage(
            weaponId,
            {
                versatile: true
            }
        );
    }

    static async _onAddExpertise(event, target) {
        await this.actor.createEmbeddedDocuments(
            "Item",
            [
                {
                    name: "Nouvelle expertise",
                    type: "expertise",

                    system: {
                        domain: "weaponClass",
                        target: "",
                        bonus: 0
                    }
                }
            ]
        );
    }


    static async _onDeleteExpertise(event, target) {
        const expertiseId =
            target.dataset.expertiseId;

        if (!expertiseId) return;

        await this.actor.deleteEmbeddedDocuments(
            "Item",
            [expertiseId]
        );
    }

    async _onExpertiseEdit(event) {
        event.stopPropagation();

        const field = event.currentTarget;

        const expertiseId =
            field.dataset.expertiseId;

        const expertiseField =
            field.dataset.expertiseField;

        const expertise =
            this.actor.items.get(expertiseId);

        if (!expertise) return;


        let value = field.value;

        if (field.type === "number") {
            value = Number(value) || 0;
        }


        await expertise.update({
            [expertiseField]: value
        });
    }

    static async _onAddWeaponDamageType(
        event,
        target
    ) {
        const itemId = target.dataset.itemId;

        const weapon =
            this.actor.items.get(itemId);

        if (!weapon || weapon.type !== "weapon") {
            return;
        }

        const input =
            this.element.querySelector(
                `[data-damage-type-input][data-item-id="${itemId}"]`
            );

        if (!input) return;

        const damageType =
            input.value.trim().toLowerCase();

        if (!damageType) return;

        const damageTypes =
            new Set(weapon.system.damageTypes);

        damageTypes.add(damageType);

        await weapon.update({
            "system.damageTypes": [...damageTypes]
        });
    }


    static async _onRemoveWeaponDamageType(
        event,
        target
    ) {
        const itemId = target.dataset.itemId;
        const damageType = target.dataset.damageType;

        const weapon =
            this.actor.items.get(itemId);

        if (!weapon || weapon.type !== "weapon") {
            return;
        }

        const damageTypes =
            new Set(weapon.system.damageTypes);

        damageTypes.delete(damageType);

        await weapon.update({
            "system.damageTypes": [...damageTypes]
        });
    }

    static async _onToggleProtectionZone(
        event,
        target
    ) {
        const itemId =
            target.dataset.itemId;

        const zone =
            target.dataset.zone;


        const protection =
            this.actor.items.get(itemId);


        if (
            !protection
            || protection.type !== "protection"
            || !zone
        ) {
            return;
        }


        const zones =
            new Set(protection.system.zones);


        if (zones.has(zone)) {
            zones.delete(zone);
        }
        else {
            zones.add(zone);
        }


        await protection.update({
            "system.zones": [...zones]
        });
    }

    static async _onAddProtectionReduction(
        event,
        target
    ) {
        const itemId =
            target.dataset.itemId;


        const protection =
            this.actor.items.get(itemId);


        if (
            !protection
            || protection.type !== "protection"
        ) {
            return;
        }


        const typeInput =
            this.element.querySelector(
                `[data-reduction-type-input][data-item-id="${itemId}"]`
            );


        const valueInput =
            this.element.querySelector(
                `[data-reduction-value-input][data-item-id="${itemId}"]`
            );


        if (!typeInput || !valueInput) {
            return;
        }


        const type =
            typeInput.value
                .trim()
                .toLowerCase()
                .replace(/\./g, "");


        const value =
            Math.max(
                0,
                Number(valueInput.value) || 0
            );


        if (!type) {
            return;
        }


        const reductions = {
            ...protection.system.damageReductions
        };


        reductions[type] = value;


        await protection.update({
            "system.damageReductions":
                reductions
        });


        typeInput.value = "";
        valueInput.value = "";
    }

    static async _onRemoveProtectionReduction(
        event,
        target
    ) {
        const itemId =
            target.dataset.itemId;

        const damageType =
            target.dataset.damageType;


        const protection =
            this.actor.items.get(itemId);


        if (
            !protection
            || protection.type !== "protection"
            || !damageType
        ) {
            return;
        }


        const reductions = {
            ...protection.system.damageReductions
        };


        delete reductions[damageType];


        await protection.update({
            "system.damageReductions":
                reductions
        });
    }

    static async _onShowMercyHelp(event, target) {
        await foundry.applications.api.DialogV2.prompt({
            window: { title: "Points de Miséricorde" },
            content: target.dataset.tooltipText,
            ok: { label: "Fermer" },
            rejectClose: false
        });
    }

    static async _onStepTrack(event, target) {
        if (!this.isEditable) return;

        const { track, key } = target.dataset;
        const index = Number(target.dataset.index);
        let max = 0;
        if (track === "needs" && Object.hasOwn(ARCANE_NEEDS, key)) {
            max = ARCANE_NEEDS[key].stages.length - 1;
        } else if (track === "deathSaves" && Object.hasOwn(DEATH_SAVE_LABELS, key)) {
            max = 3;
        }
        if (!max || !Number.isInteger(index) || index < (track === "needs" ? 0 : 1) || index > max) return;

        const current = this.actor.system[track][key];
        const value = track === "deathSaves" && index <= current ? index - 1 : index;
        await this.actor.update({ [`system.${track}.${key}`]: value });
    }
}

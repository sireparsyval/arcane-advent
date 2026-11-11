import { ARCANE_NEEDS } from "../../config.mjs";
import { VOLUME_LABELS, ENCUMBRANCE_STAGES } from "../../encumbrance.mjs";
import { MODIFIER_TARGETS, ABILITY_MODIFIER_KEYS, TRACKER_MODIFIER_KEYS, signedModifier } from "../../modifiers.mjs";
import { removeLinkedAptitudeFromTrait } from "../../documents/item.mjs";
import {
    EQUIPMENT_TYPES, LUQA_DENOMINATIONS, canPlaceInContainer,
    isInventoryContainer, isInventoryItem, luqaCounters, purseCoinWeight
} from "../../inventory.mjs";
import { AlterationData, InjuryData, INJURY_ZONES, ALTERATION_DURATION_UNITS } from "../../data/condition-data.mjs";
import {
    APTITUDE_CATEGORIES, APTITUDE_OPTIONS, APTITUDE_DURATION_UNITS, APTITUDE_RECOVERY_UNITS, parseLegacyAptitudeOption
} from "../../data/aptitude-data.mjs";

const { ActorSheetV2 } = foundry.applications.sheets;
const { HandlebarsApplicationMixin } = foundry.applications.api;

const IDENTITY_GENDERS = Object.freeze({
    masculine: "Masculin",
    feminine: "Féminin",
    unknown: "Inconnu"
});
const AGE_ESTIMATES = Object.freeze({
    unknown: "Inconnu",
    infant: "Nourrisson",
    child: "Enfant",
    adolescent: "Adolescent",
    youngAdult: "Jeune adulte",
    adult: "Adulte",
    elderly: "Âgé",
    venerable: "Vénérable"
});
const IDENTITY_TEXT_FIELDS = new Set(["title", "ethnicity", "alignment"]);
const IDENTITY_NUMBER_FIELDS = new Set(["ageNumber", "heightMeters", "bodyWeightKg"]);
const IDENTITY_SELECT_FIELDS = new Set(["gender", "volume", "ageMode", "ageEstimate"]);
const BIOGRAPHY_FIELDS = new Set([
    "feature", "motivation", "habit", "family", "raisedBy", "quest",
    "personality", "ideals", "bonds", "flaws"
]);

const INVENTORY_DRAG_TYPE = "application/x-arcane-advent-inventory-item";
const SHEET_SORT_DRAG_TYPE = "application/x-arcane-advent-sheet-sort";
const sortableItems = items => [...items].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0));

// Newly created items always start at the end of their visible group.
function nextItemSort(actor, group) {
    const siblings = actor.items.filter(item => group === "inventory"
        ? isInventoryItem(item) && !item.system.equipped && !item.system.containerId
        : item.type === group);
    return Math.max(0, ...siblings.map(item => item.sort ?? 0)) + 100000;
}
const INVENTORY_ITEM_NAMES = {
    object: "Nouvel objet",
    container: "Nouveau contenant",
    purse: "Bourse"
};
const WEIGHT_FORMAT = new Intl.NumberFormat("fr-FR", { maximumSignificantDigits: 15 });

function formatWeight(weight) {
    // Affichage tronqué au dixième, sans tronquer les calculs internes.
    const tenths = Math.floor((weight + Number.EPSILON) * 10) / 10;
    return `${WEIGHT_FORMAT.format(tenths)} kg`;
}

function* inventoryRows(roots, collapsed = new Set()) {
    const pending = [];
    for (let i = roots.length - 1; i >= 0; i--) pending.push({ node: roots[i], depth: 0 });

    while (pending.length) {
        const { node, depth } = pending.pop();
        yield { ...node, depth };
        if (collapsed.has(node.item.id)) continue;
        for (let i = node.children.length - 1; i >= 0; i--) {
            pending.push({ node: node.children[i], depth: depth + 1 });
        }
    }
}


const CONDITION_SECTIONS = {
    alteration: {
        model: AlterationData,
        title: "Altérations d’État",
        addLabel: "Ajouter une altération",
        editLabel: "Modifier l’altération",
        empty: "Aucune altération."
    },
    injury: {
        model: InjuryData,
        title: "Conditions Physiques",
        addLabel: "Ajouter une blessure ou une maladie",
        editLabel: "Modifier la blessure ou la maladie",
        empty: "Aucune blessure ni maladie."
    }
};

const DEATH_SAVE_LABELS = {
    successes: "Réussites",
    failures: "Échecs"
};

const DEFENSE_MODE_LABELS = {
    dex: "DEX",
    con: "CON",
    best: "↑ DEX/CON"
};

const ROLL_MODE_LABELS = {
    advantage: "Avantage",
    normal: "Neutre",
    disadvantage: "Désavantage"
};

const APTITUDE_FIELDS = new Set([
    "category", "level", "description", "requirements", "durationTurns", "durationUnit",
    "recoveryCounter.remaining", "recoveryCounter.max", "recoveryCounter.unit",
    "chargeCounter.remaining", "chargeCounter.max"
]);

const APTITUDE_ROLL_ABILITIES = {
    strength: "Force",
    dexterity: "Dextérité",
    constitution: "Constitution",
    intelligence: "Intelligence",
    wisdom: "Sagesse",
    charisma: "Charisme"
};

function isAptitudeOptionVisible(system, key) {
    const count = key === "duration" ? system.durationTurns : system[`${key}Counter`].max;
    return system.showOptions[key] ?? (count > 0 || Boolean(system[key]?.trim()));
}

function trackSteps(value, max) {
    return Array.from({ length: max }, (_, offset) => ({
        index: offset + 1,
        filled: value > offset
    }));
}

function damageTypeLabel(type) {
    return type.charAt(0).toUpperCase() + type.slice(1);
}

function damageReductionEntries(item) {
    return Object.entries(item.system.damageReductions ?? {}).map(([type, value]) => ({
        type,
        label: damageTypeLabel(type),
        value
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
            setRollMode: this._onSetRollMode,
            setDefenseMode: this._onSetDefenseMode,
            rollConsciousnessDie: this._onRollConsciousnessDie,
            rollDeathSave: this._onRollDeathSave,
            rollInitiativeCheck: this._onRollInitiativeCheck,
            rollAbility: this._onRollAbility,
            rollSavingThrow: this._onRollSavingThrow,
            rollGuard: this._onRollGuard,

            editCondition: this._onEditCondition,
            deleteCondition: this._onDeleteStateItem,
            addAptitude: this._onAddAptitude,
            toggleAptitudeConfig: this._onToggleAptitudeConfig,
            toggleAptitudeOption: this._onToggleAptitudeOption,
            editAptitudeRoll: this._onEditAptitudeRoll,
            rollAptitude: this._onRollAptitude,
            deleteAptitude: this._onDeleteStateItem,
            goToLinkedTrait: this._onGoToLinkedTrait,
            addTrait: this._onAddTrait,
            toggleTraitConfig: this._onToggleTraitConfig,
            createLinkedAptitude: this._onCreateLinkedAptitude,
            deleteLinkedAptitude: this._onDeleteLinkedAptitude,
            deleteTrait: this._onDeleteTrait,
            stepTrack: this._onStepTrack,
            showMercyHelp: this._onShowMercyHelp,

            addSkill: this._onAddSkill,
            deleteSkill: this._onDeleteSkill,
            rollSkill: this._onRollSkill,

            addEquipment: this._onAddEquipment,
            toggleEquipment: this._onToggleEquipment,
            addInventoryItem: this._onAddInventoryItem,
            editInventoryItem: this._onEditInventoryItem,
            moveInventoryItem: this._onMoveInventoryItem,
            moveInventoryItemToRoot: this._onMoveInventoryItemToRoot,
            toggleInventoryContainer: this._onToggleInventoryContainer,
            toggleInventoryWeights: this._onToggleInventoryWeights,

            toggleProtectionZone: this._onToggleProtectionZone,
            addDamageReduction: this._onAddDamageReduction,
            removeDamageReduction: this._onRemoveDamageReduction,

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

    _collapsedInventory = new Set();
    _showInventoryWeights = true;
    _inventoryDragId = null;
    _inventoryDropTarget = null;
    _inventoryDropPosition = null;
    _sheetSortDragId = null;
    _sheetSortDropTarget = null;


    get title() {
        return this.actor.name || this.actor.id;
    }


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
        context.genderOptions = IDENTITY_GENDERS;
        context.volumeOptions = VOLUME_LABELS;
        context.ageEstimateOptions = AGE_ESTIMATES;
        context.defenseModes = Object.entries(DEFENSE_MODE_LABELS).map(([key, label]) => ({
            key,
            label,
            selected: key === this.actor.system.defense.mode
        }));
        const rollMode = this._getRollMode();
        context.rollModes = Object.entries(ROLL_MODE_LABELS).map(([key, label]) => ({
            key,
            label,
            selected: key === rollMode
        }));
        const openConfigs = new Set(Array.from(
            this.element?.querySelectorAll("[data-aptitude-config]:not([hidden])") ?? [],
            panel => panel.dataset.aptitudeConfig
        ));
        const openDescriptions = new Set(Array.from(
            this.element?.querySelectorAll("details[data-aptitude-description][open]") ?? [],
            panel => panel.dataset.aptitudeDescription
        ));
        const openTraitConfigs = new Set(Array.from(
            this.element?.querySelectorAll("[data-trait-config]:not([hidden])") ?? [],
            panel => panel.dataset.traitConfig
        ));
        const openTraitDescriptions = new Set(Array.from(
            this.element?.querySelectorAll("details[data-trait-description][open]") ?? [],
            panel => panel.dataset.traitDescription
        ));
        const traitItems = sortableItems(this.actor.items.filter(item => item.type === "trait"));
        const aptitudeItems = sortableItems(this.actor.items.filter(item => item.type === "aptitude"));
        const traitsById = new Map(traitItems.map(item => [item.id, item]));
        context.traits = traitItems.map(item => ({
            id: item.id,
            name: item.name,
            system: item.system,
            configOpen: openTraitConfigs.has(item.id),
            descriptionOpen: openTraitDescriptions.has(item.id),
            linkedAptitudes: aptitudeItems
                .filter(aptitude => aptitude.system.traitId === item.id)
                .map(aptitude => ({
                    id: aptitude.id,
                    name: aptitude.name,
                    categoryLabel: APTITUDE_CATEGORIES[aptitude.system.category]
                }))
        }));
        context.aptitudeCategories = APTITUDE_CATEGORIES;
        context.aptitudeDurationUnits = APTITUDE_DURATION_UNITS;
        context.aptitudeRecoveryUnits = APTITUDE_RECOVERY_UNITS;
        context.aptitudes = aptitudeItems.map(item => ({
            id: item.id,
            name: item.name,
            system: item.system,
            linkedTraitName: traitsById.get(item.system.traitId)?.name ?? "",
            linkedTraitId: traitsById.get(item.system.traitId)?.id ?? "",
            categoryLabel: APTITUDE_CATEGORIES[item.system.category],
            durationUnitLabel: APTITUDE_DURATION_UNITS[item.system.durationUnit],
            recoveryUnitLabel: APTITUDE_RECOVERY_UNITS[item.system.recoveryCounter.unit],
            configOpen: openConfigs.has(item.id),
            descriptionOpen: openDescriptions.has(item.id),
            rolls: Object.entries(item.system.rolls).map(([id, roll]) => ({
                id,
                name: roll.name.replace(/^(?:🎲\uFE0F?\s*)+/u, "")
            })),
            options: Object.entries(APTITUDE_OPTIONS).map(([key, label]) => ({
                key,
                label,
                value: key === "duration" ? item.system.durationTurns : item.system[`${key}Counter`],
                note: item.system[key] && parseLegacyAptitudeOption(key, item.system[key]) === null
                    ? item.system[key].trim()
                    : "",
                active: isAptitudeOptionVisible(item.system, key)
            }))
        }));
        const totalModifiers = this.actor.system.modifierTotals;
        const manualModifiers = this.actor.system.manualModifiers;
        const modifierGroup = (title, keys) => ({
            title,
            entries: keys.map(key => ({
                key,
                label: MODIFIER_TARGETS[key],
                manual: manualModifiers[key],
                fromConditionsLabel: signedModifier(totalModifiers[key] - manualModifiers[key]),
                totalLabel: signedModifier(totalModifiers[key])
            }))
        });
        context.manualModifierGroups = [
            modifierGroup("Caractéristiques principales", ABILITY_MODIFIER_KEYS),
            modifierGroup("Trackers", TRACKER_MODIFIER_KEYS)
        ];
        context.conditionSections = Object.entries(CONDITION_SECTIONS).map(([type, section]) => ({
            type,
            title: section.title,
            addLabel: section.addLabel,
            empty: section.empty,
            entries: this.actor.items.filter(item => item.type === type).map(item => ({
                id: item.id,
                name: item.name,
                description: item.system.description,
                modifierLabel: Object.entries(MODIFIER_TARGETS)
                    .filter(([key]) => item.system.modifiers[key] !== 0)
                    .map(([key, label]) => `${label} ${signedModifier(item.system.modifiers[key])}`)
                    .join(" · "),
                zone: item.system.zone ? INJURY_ZONES[item.system.zone] : "",
                durationLabel: type === "alteration" && item.system.duration?.enabled
                    ? `${item.system.duration.remaining} ${ALTERATION_DURATION_UNITS[item.system.duration.unit]}` : ""
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

        context.skills = sortableItems(this.actor.items
            .filter(item => item.type === "skill"))
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
        
        const equipment = sortableItems(this.actor.items.filter(item => EQUIPMENT_TYPES.includes(item.type)));
        const equipmentView = item => ({
            id: item.id,
            name: item.name,
            system: item.system,
            weightLabel: formatWeight(item.system.weight ?? 0)
        });
        const { roots, totalWeight } = this.actor.inventory;
        const load = this.actor.system.encumbrance;
        const encumbranceStage = ENCUMBRANCE_STAGES[load.stage] ?? ENCUMBRANCE_STAGES.free;
        context.encumbrance = {
            currentLabel: formatWeight(load.carried),
            maxLabel: formatWeight(load.maximum),
            percentageLabel: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 1 }).format(load.percentage),
            barWidth: Math.min(100, Math.max(0, load.percentage)),
            stage: load.stage,
            label: encumbranceStage.label,
            instruction: encumbranceStage.instruction,
            effectiveSpeedLabel: new Intl.NumberFormat("fr-FR", { maximumFractionDigits: 2 })
                .format(this.actor.system.trackers.effectiveSpeed)
        };
        context.inventory = {
            totalLabel: formatWeight(totalWeight),
            showWeights: this._showInventoryWeights,
            rows: Array.from(inventoryRows(roots, this._collapsedInventory), ({ item, depth, weight }) => {
                const container = isInventoryContainer(item);
                const quantity = item.type === "object" ? item.system.quantity : null;
                return {
                    id: item.id,
                    name: item.name,
                    depth,
                    container,
                    isPurse: item.type === "purse",
                    nested: Boolean(item.system.containerId),
                    coins: luqaCounters(item),
                    expanded: !this._collapsedInventory.has(item.id),
                    quantity,
                    canEquip: EQUIPMENT_TYPES.includes(item.type),
                    showWeight: container || item.type === "purse" || this._showInventoryWeights,
                    weightLabel: formatWeight(weight),
                    unitWeight: weight,
                    perUnit: quantity > 1
                };
            })
        };


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
                        ...equipmentView(item),

                        attackAbility:
                            ability.label,

                        expertiseBonus,

                        attackTotal:
                            ability.modifier
                            + expertiseBonus,

                        damageTypes: [...item.system.damageTypes].map(type => ({
                            type,
                            label: damageTypeLabel(type)
                        })),

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
                    ...equipmentView(item),

                    damageReductions: damageReductionEntries(item),

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

                    ...equipmentView(item),

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

                    damageReductions: damageReductionEntries(item)
                })),

            accessories: equipment
                .filter(item => item.type === "accessory" && item.system.equipped)
                .map(equipmentView)
        };

        context.guardSources = [];
        for (const item of equipment) {
            const stats = this.actor.getGuardStatistics(item);
            if (!stats) continue;

            context.guardSources.push({
                id: item.id,
                name: item.name,
                defense: stats.defense,
                saveModifierLabel: stats.savingThrowModifier >= 0
                    ? "+" + stats.savingThrowModifier
                    : String(stats.savingThrowModifier)
            });
        }

        context.expertises = sortableItems(this.actor.items
            .filter(item =>
                item.type === "expertise"
            ))
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
        return this.actor.system.rollMode ?? "normal";
    }


    static async _onSetDefenseMode(event, target) {
        const mode = target.dataset.defenseMode;
        if (!this.isEditable || !Object.hasOwn(DEFENSE_MODE_LABELS, mode)) return;
        await this.actor.update({ "system.defense.mode": mode });
    }


    static async _onSetRollMode(event, target) {
        const mode = target.dataset.rollMode;
        if (!this.isEditable || !Object.hasOwn(ROLL_MODE_LABELS, mode)) return;
        await this.actor.update({ "system.rollMode": mode });
    }


    static async _onRollConsciousnessDie() {
        await this.actor.rollConsciousnessDie();
    }


    static async _onRollDeathSave(event, target) {
        if (!this.isEditable || target.disabled) return;

        target.disabled = true;
        try {
            await this.actor.rollDeathSave();
        } finally {
            target.disabled = !this.isEditable;
        }
    }


    static async _onRollInitiativeCheck() {
        await this.actor.rollInitiativeCheck(this._getRollMode());
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


        await this.actor.rollGuard(itemId, this._getRollMode());
    }


    static async _onAddAptitude() {
        if (!this.isEditable) return;
        await this.actor.createEmbeddedDocuments("Item", [
            { name: "Nouvelle aptitude", type: "aptitude", sort: nextItemSort(this.actor, "aptitude") }
        ]);
    }


    static async _onAddTrait() {
        if (!this.isEditable) return;
        await this.actor.createEmbeddedDocuments("Item", [{
            name: "Nouveau Trait", type: "trait", sort: nextItemSort(this.actor, "trait")
        }]);
    }

    static _onToggleTraitConfig(event, target) {
        const config = target.closest(".aa-trait-row")?.querySelector("[data-trait-config]");
        if (!config) return;
        config.hidden = !config.hidden;
        target.setAttribute("aria-expanded", String(!config.hidden));
    }

    static async _onCreateLinkedAptitude(event, target) {
        if (!this.isEditable) return;
        const trait = this.actor.items.get(target.dataset.traitId);
        if (trait?.type !== "trait") return;
        await this.actor.createEmbeddedDocuments("Item", [{
            name: "Nouvelle aptitude",
            type: "aptitude",
            sort: nextItemSort(this.actor, "aptitude"),
            system: { traitId: trait.id }
        }]);
    }

    static async _onDeleteLinkedAptitude(event, target) {
        if (!this.isEditable) return;
        const trait = this.actor.items.get(target.dataset.traitId);
        const aptitude = this.actor.items.get(target.dataset.itemId);
        if (trait?.type !== "trait" || aptitude?.type !== "aptitude"
            || aptitude.system.traitId !== trait.id) return;

        const content = document.createElement("div");
        const message = document.createElement("p");
        message.textContent = `Retirer l’aptitude « ${aptitude.name} », liée au Trait « ${trait.name} » ?`;
        content.append(message);
        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: "Retirer l’aptitude liée" },
            content, modal: true, rejectClose: false,
            yes: { label: "Retirer" }, no: { label: "Annuler" }
        });
        if (!confirmed) return;
        if (this.actor.items.get(aptitude.id)?.system.traitId !== trait.id) return;
        const deleted = await removeLinkedAptitudeFromTrait(this.actor, trait.id, aptitude.id);
        if (!deleted.length) ui.notifications.warn("L’aptitude liée n’a pas pu être supprimée.");
    }

    static async _onDeleteTrait(event, target) {
        if (!this.isEditable) return;
        const trait = this.actor.items.get(target.dataset.traitId);
        if (trait?.type !== "trait") return;
        const linked = this.actor.items.filter(item => item.type === "aptitude"
            && item.system.traitId === trait.id);
        const content = document.createElement("div");
        const heading = document.createElement("p");
        heading.textContent = `Retirer le Trait « ${trait.name} » ?`;
        content.append(heading);

        if (!linked.length) {
            const confirmed = await foundry.applications.api.DialogV2.confirm({
                window: { title: "Retirer le Trait" },
                content, modal: true, rejectClose: false,
                yes: { label: "Retirer" }, no: { label: "Annuler" }
            });
            if (confirmed && this.actor.items.get(trait.id)?.type === "trait") await trait.delete();
            return;
        }

        const explanation = document.createElement("p");
        explanation.textContent = `${linked.length} aptitude(s) liée(s) à ce Trait :`;
        content.append(explanation);
        const list = document.createElement("ul");
        for (const aptitude of linked) {
            const li = document.createElement("li");
            li.textContent = aptitude.name;
            list.append(li);
        }
        content.append(list);
        const hint = document.createElement("p");
        hint.textContent = "Choisissez si ces Aptitudes doivent être supprimées avec le Trait ou conservées comme Aptitudes indépendantes.";
        content.append(hint);

        const applyDeletion = async (keepAptitudes, app) => {
            const current = this.actor.items.get(trait.id);
            if (current?.type !== "trait") { await app.close(); return; }
            const live = this.actor.items.filter(item => item.type === "aptitude"
                && item.system.traitId === trait.id);
            if (live.length !== linked.length || live.some(item => !linked.some(old => old.id === item.id))) {
                ui.notifications.warn("Les Aptitudes liées ont changé. Relancez la suppression du Trait.");
                await app.close();
                return;
            }
            try {
                if (keepAptitudes) {
                    const detached = await this.actor.updateEmbeddedDocuments("Item", live.map(item => ({
                        _id: item.id, "system.traitId": ""
                    })));
                    if (detached.length !== live.length) {
                        ui.notifications.error("Impossible de délier toutes les Aptitudes. Le Trait a été conservé.");
                        return;
                    }
                    const removed = await this.actor.deleteEmbeddedDocuments("Item", [trait.id]);
                    if (removed.length !== 1) {
                        ui.notifications.error("Le Trait n’a pas été supprimé.");
                        return;
                    }
                } else {
                    const removed = await this.actor.deleteEmbeddedDocuments("Item", [trait.id, ...live.map(item => item.id)]);
                    if (removed.length !== live.length + 1) {
                        ui.notifications.error("Le Trait et ses Aptitudes liées n’ont pas pu être supprimés.");
                        return;
                    }
                }
                await app.close();
            } catch (error) {
                Hooks.onError("ArcaneCharacterSheet#_onDeleteTrait", error, {
                    msg: "Impossible de supprimer le Trait.", log: "error", notify: "error"
                });
            }
        };

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: "Suppression du Trait et de ses Aptitudes" },
            content, modal: true, form: { closeOnSubmit: false },
            buttons: [
                {
                    action: "keep", label: "Conserver les Aptitudes",
                    callback: (_event, _button, app) => applyDeletion(true, app)
                },
                {
                    action: "removeAll", label: "Tout supprimer",
                    callback: (_event, _button, app) => applyDeletion(false, app)
                },
                {
                    action: "cancel", label: "Annuler", type: "button",
                    callback: (_event, _button, app) => app.close()
                }
            ]
        });
        await dialog.render({ force: true });
    }

    static _onGoToLinkedTrait(event, target) {
        const trait = this.actor.items.get(target.dataset.traitId);
        if (trait?.type !== "trait") return;
        const row = this.element.querySelector(`[data-trait-row="${trait.id}"]`);
        if (!row) return;
        const config = row.querySelector("[data-trait-config]");
        const toggle = row.querySelector('[data-action="toggleTraitConfig"]');
        if (config && toggle) {
            config.hidden = false;
            toggle.setAttribute("aria-expanded", "true");
        }
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async _onTraitEdit(event) {
        event.stopPropagation();
        if (!this.isEditable) return;
        const field = event.currentTarget;
        const trait = this.actor.items.get(field.dataset.traitId);
        const key = field.dataset.traitField;
        if (trait?.type !== "trait" || !["name", "description", "requirements"].includes(key)
            || !field.reportValidity()) return;

        const value = field.value.trim();
        if (key === "name") {
            if (value && value !== trait.name) await trait.update({ name: value });
        } else if (value !== trait.system[key]) {
            await trait.update({ [`system.${key}`]: value });
        }
    }

    static _onToggleAptitudeConfig(event, target) {
        const config = target.closest(".aa-aptitude-row")?.querySelector("[data-aptitude-config]");
        if (!config) return;

        config.hidden = !config.hidden;
        target.setAttribute("aria-expanded", String(!config.hidden));
    }


    static async _onToggleAptitudeOption(event, target) {
        if (!this.isEditable) return;
        const { itemId, option } = target.dataset;
        const item = this.actor.items.get(itemId);
        if (item?.type !== "aptitude" || !Object.hasOwn(APTITUDE_OPTIONS, option)) return;

        await item.update({
            [`system.showOptions.${option}`]: !isAptitudeOptionVisible(item.system, option)
        });
    }


    static async _onRollAptitude(event, target) {
        const { itemId, rollId } = target.dataset;
        await this.actor.rollAptitude(itemId, rollId, this._getRollMode());
    }


    static async _onEditAptitudeRoll(event, target) {
        if (!this.isEditable) return;
        const { itemId, rollId } = target.dataset;
        const item = this.actor.items.get(itemId);
        if (item?.type !== "aptitude") return;
        if (rollId && !Object.hasOwn(item.system.rolls, rollId)) return;

        const current = rollId ? item.system.rolls[rollId] : { name: "Jet", formula: "1d20" };
        const content = document.createElement("div");
        content.innerHTML = await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/aptitude-roll-dialog.hbs",
            {
                current,
                abilities: APTITUDE_ROLL_ABILITIES,
                skills: this.actor.items.filter(entry => entry.type === "skill"),
                expertises: this.actor.items.filter(entry => entry.type === "expertise")
            }
        );

        const buttons = [{
            action: "save",
            label: rollId ? "Enregistrer" : "Ajouter",
            callback: async (_event, button, app) => {
                if (!button.form.reportValidity()) return;
                const fields = new FormData(button.form);
                const formula = fields.get("formula").trim();
                if (!formula || !foundry.dice.Roll.validate(formula)) {
                    ui.notifications.warn("La formule du jet est invalide.");
                    return;
                }

                if (!this.actor.items.has(itemId) || (rollId && !Object.hasOwn(item.system.rolls, rollId))) {
                    await app.close();
                    return;
                }
                const id = rollId ?? foundry.utils.randomID();
                await item.update({
                    [`system.rolls.${id}`]: {
                        name: fields.get("name").trim(),
                        formula,
                        ability: fields.get("ability"),
                        skillId: fields.get("skillId"),
                        expertiseId: fields.get("expertiseId")
                    }
                });
                await app.close();
            }
        }];

        if (rollId) buttons.push({
            action: "remove",
            label: "Supprimer",
            type: "button",
            callback: async (_event, _button, app) => {
                if (this.actor.items.has(itemId) && Object.hasOwn(item.system.rolls, rollId)) {
                    await item.update({
                        system: { rolls: { [rollId]: new foundry.data.operators.ForcedDeletion() } }
                    });
                }
                await app.close();
            }
        });

        buttons.push({
            action: "cancel",
            label: "Annuler",
            type: "button",
            callback: (_event, _button, app) => app.close()
        });

        const dialog = new foundry.applications.api.DialogV2({
            window: { title: rollId ? "Modifier le jet d’aptitude" : "Ajouter un jet d’aptitude" },
            position: { width: 430 },
            content,
            modal: true,
            form: { closeOnSubmit: false },
            buttons
        });
        await dialog.render({ force: true });
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

        const modifierGroup = (title, keys) => ({
            title,
            fields: keys.map(key => ({
                key, label: MODIFIER_TARGETS[key],
                value: previous.system.modifiers?.[key] ?? 0,
                step: key === "speed" ? "any" : "1"
            }))
        });
        const content = document.createElement("div");
        content.innerHTML = await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/condition-dialog.hbs",
            {
                ...previous,
                modifierGroups: [
                    modifierGroup("Caractéristiques principales", ABILITY_MODIFIER_KEYS),
                    modifierGroup("Trackers", TRACKER_MODIFIER_KEYS)
                ],
                zones: type === "injury" ? INJURY_ZONES : null,
                durationUnits: type === "alteration" ? ALTERATION_DURATION_UNITS : null
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
                        const modifiers = {};
                        for (const key of Object.keys(MODIFIER_TARGETS)) {
                            const amount = Number(fields.get(`modifier.${key}`));
                            if (!Number.isFinite(amount) || (key !== "speed" && !Number.isSafeInteger(amount))) {
                                ui.notifications.warn(`Bonus/malus invalide pour ${MODIFIER_TARGETS[key]}.`);
                                return;
                            }
                            modifiers[key] = amount;
                        }
                        const data = {
                            name: fields.get("name").trim(),
                            system: {
                                description: fields.get("description").trim(),
                                modifiers
                            }
                        };
                        if (type === "injury") data.system.zone = fields.get("zone");
                        if (type === "alteration") data.system.duration = {
                            enabled: fields.get("durationEnabled") === "on",
                            remaining: Number(fields.get("durationRemaining") ?? 0),
                            unit: fields.get("durationUnit") || "turns"
                        };

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


    static async _onDeleteStateItem(event, target) {
        if (!this.isEditable) return;

        const item = this.actor.items.get(target.dataset.itemId);
        if (!item || (item.type !== "aptitude" && !Object.hasOwn(CONDITION_SECTIONS, item.type))) return;
        if (item.type === "aptitude" && item.system.traitId
            && this.actor.items.get(item.system.traitId)?.type === "trait") {
            ui.notifications.warn("Cette Aptitude est liée à un Trait. Supprimez-la depuis les options de ce Trait.");
            return;
        }

        const content = document.createElement("div");
        const message = document.createElement("p");
        message.textContent = `Retirer « ${item.name} » de la fiche du personnage ?`;
        content.append(message);

        const confirmed = await foundry.applications.api.DialogV2.confirm({
            window: { title: item.type === "aptitude" ? "Retirer l’aptitude" : "Retirer la condition" },
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
                    sort: nextItemSort(this.actor, "skill"),

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


    _onDetach(from, to) {
        super._onDetach(from, to);
        this.element.classList.add("aa-detached-sheet");
    }


    _onAttach(from, to) {
        super._onAttach(from, to);
        this.element.classList.remove("aa-detached-sheet");
    }


    async _onRender(context, options) {
        await super._onRender(context, options);
        const isDetached = this.window.windowId === this.id;
        this.element.classList.toggle("aa-detached-sheet", isDetached);
        if (isDetached) this.element.ownerDocument.title = this.title;

        // Onglets
        const tabs = new foundry.applications.ux.Tabs({
            navSelector: ".aa-tabs",
            contentSelector: ".aa-tab-content",
            initial: context.activeSheetTab,
            group: "sheet"
        });

        tabs.bind(this.element);

        for (const field of this.element.querySelectorAll("[data-aptitude-field]")) {
            field.addEventListener("change", this._onAptitudeEdit.bind(this));
        }
        for (const field of this.element.querySelectorAll("[data-identity-field]")) {
            field.addEventListener("change", this._onIdentityEdit.bind(this));
        }
        for (const field of this.element.querySelectorAll("[data-biography-field]")) {
            field.addEventListener("change", this._onBiographyEdit.bind(this));
        }
        for (const field of this.element.querySelectorAll("[data-trait-field]")) {
            field.addEventListener("change", this._onTraitEdit.bind(this));
        }

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

        if (this.isEditable) this._bindSheetSortListeners();

        const equipmentTab = this.element.querySelector(".aa-equipment-tab");
        if (equipmentTab) {
            if (this.isEditable) this._bindInventoryListeners(equipmentTab);
            for (const control of equipmentTab.querySelectorAll(
                '[data-action="toggleInventoryWeights"], [data-action="toggleInventoryContainer"]'
            )) control.disabled = false;
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


    async _onIdentityEdit(event) {
        event.stopPropagation();
        if (!this.isEditable) return;
        const field = event.currentTarget;
        const key = field.dataset.identityField;
        if (!field.reportValidity() || !(
            IDENTITY_TEXT_FIELDS.has(key) || IDENTITY_NUMBER_FIELDS.has(key) || IDENTITY_SELECT_FIELDS.has(key)
        )) return;

        const identity = this.actor.system.identity;
        let value = IDENTITY_NUMBER_FIELDS.has(key) ? field.valueAsNumber : field.value.trim();
        if (IDENTITY_NUMBER_FIELDS.has(key) && (!Number.isFinite(value) || value < 0
            || (key === "ageNumber" && !Number.isSafeInteger(value)))) {
            ui.notifications.warn("La valeur de cette information est invalide.");
            return;
        }
        if (IDENTITY_SELECT_FIELDS.has(key)) {
            const choices = key === "gender" ? IDENTITY_GENDERS
                : key === "volume" ? VOLUME_LABELS
                : key === "ageEstimate" ? AGE_ESTIMATES : { estimated: "Estimation", number: "Numérique" };
            if (!Object.hasOwn(choices, value)) return;
        }
        if (identity[key] !== value) await this.actor.update({ [`system.identity.${key}`]: value });
    }

    async _onBiographyEdit(event) {
        event.stopPropagation();
        if (!this.isEditable) return;
        const field = event.currentTarget;
        const key = field.dataset.biographyField;
        if (!BIOGRAPHY_FIELDS.has(key)) return;
        const value = field.value.trim();
        if (this.actor.system.biography[key] !== value) {
            await this.actor.update({ [`system.biography.${key}`]: value });
        }
    }

    async _onAptitudeEdit(event) {
        event.stopPropagation();
        if (!this.isEditable) return;

        const field = event.currentTarget;
        const { itemId, aptitudeField } = field.dataset;
        const item = this.actor.items.get(itemId);
        if (item?.type !== "aptitude" || !field.reportValidity()) return;

        if (aptitudeField === "name") {
            const name = field.value.trim();
            if (name && name !== item.name) await item.update({ name });
            return;
        }

        if (!APTITUDE_FIELDS.has(aptitudeField)) return;
        const value = field.type === "number" ? field.valueAsNumber : field.value;
        if (value === foundry.utils.getProperty(item.system, aptitudeField)) return;

        const changes = { [`system.${aptitudeField}`]: value };
        if (aptitudeField.endsWith(".max")) {
            const [counter] = aptitudeField.split(".");
            if (item.system[counter].remaining > value) {
                changes[`system.${counter}.remaining`] = value;
            }
        }
        await item.update(changes);
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

    _bindSheetSortListeners() {
        const root = this.element;
        root.addEventListener("dragstart", event => {
            const handle = event.target.closest("[data-sheet-sort-drag]");
            if (!handle || !event.dataTransfer) return;
            const id = handle.dataset.sheetSortDrag;
            const item = this.actor.items.get(id);
            if (!item) return;
            event.stopPropagation();
            this._sheetSortDragId = id;
            event.dataTransfer.setData(SHEET_SORT_DRAG_TYPE, id);
            event.dataTransfer.effectAllowed = "move";
        });
        root.addEventListener("dragover", event => {
            if (!event.dataTransfer?.types.includes(SHEET_SORT_DRAG_TYPE)) return;
            const row = event.target.closest("[data-sheet-sort-drop]");
            const id = this._sheetSortDragId;
            const item = this.actor.items.get(id);
            const target = this.actor.items.get(row?.dataset.sheetSortDrop);
            const allowed = row && item && target && item.id !== target.id
                && item.type === target.type;
            this._sheetSortDropTarget?.classList.remove("aa-sort-before", "aa-sort-after");
            this._sheetSortDropTarget = allowed ? row : null;
            if (!allowed) return;
            event.preventDefault();
            event.stopPropagation();
            const position = event.clientY < row.getBoundingClientRect().top + row.getBoundingClientRect().height / 2
                ? "before" : "after";
            row.classList.add(position === "before" ? "aa-sort-before" : "aa-sort-after");
            event.dataTransfer.dropEffect = "move";
        });
        root.addEventListener("drop", async event => {
            if (!event.dataTransfer?.types.includes(SHEET_SORT_DRAG_TYPE)) return;
            event.preventDefault();
            event.stopPropagation();
            const target = event.target.closest("[data-sheet-sort-drop]");
            const row = this._sheetSortDropTarget;
            const id = this._sheetSortDragId;
            const position = row?.classList.contains("aa-sort-before") ? "before" : "after";
            this._clearSheetSort();
            if (target && row === target && id && id === event.dataTransfer.getData(SHEET_SORT_DRAG_TYPE)) {
                try {
                    await this.actor.reorderSheetItem(id, target.dataset.sheetSortDrop, position);
                } catch (error) {
                    ui.notifications.error(error.message);
                }
            }
        });
        root.addEventListener("dragend", () => this._clearSheetSort());
    }

    _clearSheetSort() {
        this._sheetSortDragId = null;
        this._sheetSortDropTarget?.classList.remove("aa-sort-before", "aa-sort-after");
        this._sheetSortDropTarget = null;
    }

    _bindInventoryListeners(tab) {
        for (const quantity of tab.querySelectorAll("[data-inventory-quantity]")) {
            quantity.addEventListener("change", this._onInventoryQuantity.bind(this));
        }
        for (const weight of tab.querySelectorAll("[data-inventory-weight]")) {
            weight.addEventListener("change", this._onInventoryWeight.bind(this));
            weight.addEventListener("keydown", event => {
                if (event.key !== "Enter") return;
                event.preventDefault();
                weight.blur();
            });
        }
        for (const coin of tab.querySelectorAll("[data-luqa-denomination]")) {
            coin.addEventListener("change", this._onLuqaCount.bind(this));
        }

        tab.addEventListener("dragstart", event => {
            const source = event.target.closest("[data-inventory-drag]");
            const item = this.actor.items.get(source?.dataset.inventoryDrag);
            if (!isInventoryItem(item) || !event.dataTransfer) return;

            event.stopPropagation();
            event.dataTransfer.setData(INVENTORY_DRAG_TYPE, item.id);
            event.dataTransfer.effectAllowed = "move";
            this._inventoryDragId = item.id;
        });
        tab.addEventListener("dragover", event => {
            if (!event.dataTransfer?.types.includes(INVENTORY_DRAG_TYPE)) return;
            const row = event.target.closest("[data-inventory-drop]");
            const itemId = this._inventoryDragId;
            const targetId = row?.dataset.inventoryDrop;
            const targetItem = this.actor.items.get(targetId);
            if (!itemId || !row || itemId === targetId || !isInventoryItem(targetItem)) {
                this._setInventoryDropTarget(null);
                return;
            }
            const bounds = row.getBoundingClientRect();
            const offset = (event.clientY - bounds.top) / bounds.height;
            const position = isInventoryContainer(targetItem) && offset >= 0.25 && offset <= 0.75
                ? "inside" : offset < 0.5 ? "before" : "after";
            const destination = position === "inside" ? targetId : (targetItem.system.containerId || null);
            if (!canPlaceInContainer(this.actor.items, itemId, destination)) {
                this._setInventoryDropTarget(null);
                return;
            }
            event.preventDefault();
            event.stopPropagation();
            event.dataTransfer.dropEffect = "move";
            this._setInventoryDropTarget(row, position);
        });
        tab.addEventListener("dragleave", event => {
            if (!this._inventoryDropTarget?.contains(event.relatedTarget)) this._setInventoryDropTarget(null);
        });
        tab.addEventListener("drop", async event => {
            if (!event.dataTransfer?.types.includes(INVENTORY_DRAG_TYPE)) return;
            event.preventDefault();
            event.stopPropagation();
            const row = event.target.closest("[data-inventory-drop]");
            const itemId = this._inventoryDragId;
            const target = this._inventoryDropTarget;
            const position = this._inventoryDropPosition;
            this._clearInventoryDrag();
            if (!row || row !== target || !itemId || itemId !== event.dataTransfer.getData(INVENTORY_DRAG_TYPE)) return;
            const targetId = row.dataset.inventoryDrop;
            const targetItem = this.actor.items.get(targetId);
            if (!targetItem) return;
            const destination = position === "inside" ? targetId : (targetItem.system.containerId || null);
            await this._moveInventoryItem(itemId, destination, position === "inside" ? {} : {
                relativeToId: targetId, position
            });
        });
        tab.addEventListener("dragend", () => this._clearInventoryDrag());
    }

    _setInventoryDropTarget(target, position = null) {
        if (target === this._inventoryDropTarget && position === this._inventoryDropPosition) return;
        this._inventoryDropTarget?.classList.remove("aa-inventory-drop-active", "aa-sort-before", "aa-sort-after");
        this._inventoryDropTarget = target;
        this._inventoryDropPosition = position;
        if (position === "inside") target?.classList.add("aa-inventory-drop-active");
        else if (position) target?.classList.add(position === "before" ? "aa-sort-before" : "aa-sort-after");
    }

    _clearInventoryDrag() {
        this._inventoryDragId = null;
        this._setInventoryDropTarget(null);
    }

    async _onInventoryQuantity(event) {
        event.stopPropagation();
        if (!this.isEditable) return;

        const field = event.currentTarget;
        const item = this.actor.items.get(field.dataset.inventoryQuantity);
        if (item?.type !== "object") return;
        const quantity = field.valueAsNumber;
        if (!Number.isSafeInteger(quantity) || quantity < 1) {
            field.value = item.system.quantity;
            ui.notifications.warn("La quantité doit être un entier supérieur ou égal à 1.");
            return;
        }
        if (quantity !== item.system.quantity) {
            await item.update({ "system.quantity": quantity });
        }
    }

    async _onInventoryWeight(event) {
        event.stopPropagation();
        if (!this.isEditable) return;

        const field = event.currentTarget;
        const item = this.actor.items.get(field.dataset.inventoryWeight);
        if (!isInventoryItem(item) || isInventoryContainer(item)) return;

        const weight = field.valueAsNumber;
        if (!Number.isFinite(weight) || weight < 0) {
            field.value = item.system.weight;
            ui.notifications.warn("Le poids doit être un nombre positif ou nul.");
            return;
        }
        if (weight === item.system.weight) return;

        try {
            const updated = await this.actor.updateInventoryItem(item.id, { "system.weight": weight });
            if (!updated) field.value = item.system.weight;
        } catch (error) {
            field.value = item.system.weight;
            ui.notifications.error(error.message);
        }
    }

    async _onLuqaCount(event) {
        event.stopPropagation();
        if (!this.isEditable) return;

        const field = event.currentTarget;
        const item = this.actor.items.get(field.dataset.itemId);
        const denomination = field.dataset.luqaDenomination;
        if (item?.type !== "purse" || !LUQA_DENOMINATIONS.some(({ key }) => key === denomination)) return;

        const count = field.valueAsNumber;
        const previous = item.system.coins[denomination];
        if (!Number.isSafeInteger(count) || count < 0) {
            field.value = previous;
            ui.notifications.warn("Le nombre de Luqa doit être un entier positif ou nul.");
            return;
        }
        if (count === previous) return;

        try {
            const updated = await this.actor.updateInventoryItem(item.id, { [`system.coins.${denomination}`]: count });
            if (!updated) field.value = item.system.coins[denomination];
        } catch (error) {
            field.value = item.system.coins[denomination];
            ui.notifications.error(error.message);
        }
    }

    static async _onAddInventoryItem(event, target) {
        const type = target.dataset.inventoryType;
        if (!this.isEditable || !Object.hasOwn(INVENTORY_ITEM_NAMES, type)) return;

        await this.actor.createEmbeddedDocuments("Item", [
            { type, name: INVENTORY_ITEM_NAMES[type], sort: nextItemSort(this.actor, "inventory") }
        ]);
    }

    static async _onEditInventoryItem(event, target) {
        if (!this.isEditable) return;
        const item = this.actor.items.get(target.dataset.itemId);
        if (isInventoryItem(item)) await item.sheet.render({ force: true });
    }

    static async _onMoveInventoryItem(event, target) {
        if (!this.isEditable) return;
        const item = this.actor.items.get(target.dataset.itemId);
        if (!isInventoryItem(item)) return;

        const doc = this.element.ownerDocument;
        const content = doc.createElement("div");
        const label = doc.createElement("label");
        label.textContent = "Destination ";
        const select = doc.createElement("select");
        select.name = "destination";
        const current = item.system.containerId ?? "";
        select.add(new Option("Hors contenant", "", current === ""));
        for (const { item: container, depth } of inventoryRows(this.actor.inventory.roots)) {
            if (!isInventoryContainer(container) || !canPlaceInContainer(this.actor.items, item.id, container.id)) continue;
            const prefix = depth ? "\u00a0\u00a0".repeat(depth) + "↳ " : "";
            select.add(new Option(prefix + container.name, container.id, current === container.id));
        }
        label.append(select);
        content.append(label);

        const destination = await foundry.applications.api.DialogV2.prompt({
            window: { title: `Déplacer « ${item.name} »` },
            content,
            modal: true,
            rejectClose: false,
            buttons: [{ action: "cancel", label: "Annuler", type: "button", callback: () => false }],
            ok: {
                label: "Déplacer",
                callback: (_event, button) => new FormData(button.form).get("destination")
            }
        });
        if (typeof destination === "string") await this._moveInventoryItem(item.id, destination || null);
    }

    static async _onMoveInventoryItemToRoot(event, target) {
        const item = this.actor.items.get(target.dataset.itemId);
        if (isInventoryItem(item) && item.system.containerId) await this._moveInventoryItem(item.id, null);
    }

    async _moveInventoryItem(itemId, containerId, placement = {}) {
        if (!this.isEditable) return;
        if (!canPlaceInContainer(this.actor.items, itemId, containerId)) {
            ui.notifications.warn("Ce déplacement n’est plus possible.");
            return;
        }

        const reopened = [];
        for (let id = containerId; id; id = this.actor.items.get(id).system.containerId) {
            if (this._collapsedInventory.delete(id)) reopened.push(id);
        }
        let updated;
        try {
            updated = await this.actor.moveInventoryItem(itemId, containerId, placement);
        } catch (error) {
            Hooks.onError("ArcaneCharacterSheet#_moveInventoryItem", error, {
                msg: "Impossible de déplacer l’objet.",
                log: "error",
                notify: "error"
            });
        } finally {
            if (!updated) {
                for (const id of reopened) this._collapsedInventory.add(id);
            }
        }
    }

    static async _onToggleInventoryContainer(event, target) {
        const itemId = target.dataset.itemId;
        if (!this._collapsedInventory.delete(itemId)) this._collapsedInventory.add(itemId);
        await this.render();
        this.element.querySelector(`[data-action="toggleInventoryContainer"][data-item-id="${CSS.escape(itemId)}"]`)?.focus();
    }

    static async _onToggleInventoryWeights() {
        this._showInventoryWeights = !this._showInventoryWeights;
        await this.render();
        this.element.querySelector('[data-action="toggleInventoryWeights"]')?.focus();
    }

    static async _onAddEquipment(event, target) {

        const type =
            target.dataset.equipmentType;


        if (!this.isEditable || !EQUIPMENT_TYPES.includes(type)) {
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
                sort: nextItemSort(this.actor, type),
                system: { equipped: equipOnCreate }
            }],
            { render: equipOnCreate }
        );

        if (!equipOnCreate && item) {
            await this.actor.setEquipmentEquipped(item.id, true);
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

        if (!this.isEditable || !EQUIPMENT_TYPES.includes(item?.type)) return;
        await this.actor.setEquipmentEquipped(item.id, !item.system.equipped);
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

        if (!this.isEditable || item?.type !== "weapon" || !property) return;


        const properties =
            new Set(item.system.properties);


        if (properties.has(property)) {
            properties.delete(property);
        }
        else {
            properties.add(property);
        }

        await this.actor.updateInventoryItem(item.id, { "system.properties": [...properties] });
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
                    sort: nextItemSort(this.actor, "expertise"),

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
            damageTypeLabel(input.value.trim());

        if (!damageType) return;

        const damageTypes =
            new Set(weapon.system.damageTypes);

        if ([...damageTypes].some(type => type.toLowerCase() === damageType.toLowerCase())) {
            input.value = "";
            return;
        }

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

    static async _onAddDamageReduction(event, target) {
        const { itemId } = target.dataset;
        const item = this.actor.items.get(itemId);
        if (!["shield", "protection"].includes(item?.type)) return;

        const typeInput = this.element.querySelector(
            `[data-reduction-type-input][data-item-id="${itemId}"]`
        );
        const valueInput = this.element.querySelector(
            `[data-reduction-value-input][data-item-id="${itemId}"]`
        );
        if (!typeInput || !valueInput) return;

        const type = damageTypeLabel(typeInput.value.replace(/\./g, "").trim());
        if (!type || /^[-=]=/.test(type) || ["__proto__", "Constructor", "Prototype"].includes(type)) return;
        if (!valueInput.reportValidity()) return;

        const existingType = Object.keys(item.system.damageReductions).find(
            key => key.toLowerCase() === type.toLowerCase()
        );
        await item.update({
            [`system.damageReductions.${existingType ?? type}`]: Number(valueInput.value)
        });

        typeInput.value = "";
        valueInput.value = "";
    }

    static async _onRemoveDamageReduction(event, target) {
        const { itemId, damageType } = target.dataset;
        const item = this.actor.items.get(itemId);
        if (!["shield", "protection"].includes(item?.type)) return;
        if (!Object.hasOwn(item.system.damageReductions, damageType)) return;

        await item.update({
            system: {
                damageReductions: { [damageType]: new foundry.data.operators.ForcedDeletion() }
            }
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

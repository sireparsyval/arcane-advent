import { ARCANE_ALIGNMENTS, ARCANE_NEEDS } from "../../config.mjs";
import { bindDefenseReductionTooltips } from "../../defense-reductions.mjs";
import { APTITUDE_RANGE_MODES, aptitudeRangeMode, aptitudeRangeSummary,
    bindAptitudeRangeToggle, refreshAptitudeTargetingFields } from "../../aptitude-targeting.mjs";
import { inventoryActionDialog } from "../inventory-transfer.mjs";
import { VOLUME_LABELS, ENCUMBRANCE_STAGES } from "../../encumbrance.mjs";
import { MODIFIER_TARGETS, ABILITY_MODIFIER_KEYS, TRACKER_MODIFIER_KEYS, signedModifier } from "../../modifiers.mjs";
import { removeLinkedAptitudeFromTrait } from "../../documents/item.mjs";
import { canRollGuard } from "../../guard.mjs";
import { COMBAT_STANCES } from "../../combat-stances.mjs";
import { EXPERTISE_DOMAINS, WEAPON_PROPERTIES, PROPERTY_FILTER_STATES, normalizedClasses } from "../../expertise.mjs";
import { aptitudeConditionStatus, conditionSummary } from "../../aptitude-conditions.mjs";
import { characterEffectSources, conditionActor, effectRuleSummary, effectRuleSettings } from "../../character-effects.mjs";
import { openCharacterEffectsEditor, openCharacterEffectsManager } from "../character-effects-editor.mjs";
import { bindConditionControls, conditionControls, readConditionControls, validateCondition } from "../effect-condition-controls.mjs";
import { hotbarRollData } from "../../shortcuts.mjs";
import { ArcanologyNotebook } from "./arcanology-notebook.mjs";
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
const IDENTITY_TEXT_FIELDS = new Set(["title", "ethnicity"]);
const IDENTITY_NUMBER_FIELDS = new Set(["ageNumber", "heightMeters", "bodyWeightKg"]);
const IDENTITY_SELECT_FIELDS = new Set(["gender", "volume", "ageMode", "ageEstimate", "alignment"]);
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

const APTITUDE_TARGET_MODES = Object.freeze({
    self: "Soi-même", single: "Cible unique", multiple: "Cibles séparées", area: "Zone"
});

const APTITUDE_AREA_SHAPES = Object.freeze({
    circle: "Cercle", cone: "Cône", line: "Ligne", rectangle: "Rectangle", free: "Libre"
});

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
            manageCharacterEffects: function () { if (this.isEditable) return openCharacterEffectsManager(this.actor); },
            editCharacterEffects: function (_event, target) {
                const item = this.actor.items.get(target.dataset.itemId);
                if (this.isEditable && ["trait", "aptitude"].includes(item?.type)) return openCharacterEffectsEditor(item, { actor: this.actor });
            },
            editManualModifiers: this._onEditManualModifiers,
            toggleAgeMode: this._onToggleAgeMode,
            setDefenseMode: this._onSetDefenseMode,
            toggleCombatStance: this._onToggleCombatStance,
            rollConsciousnessDie: this._onRollConsciousnessDie,
            rollDeathSave: this._onRollDeathSave,
            rollInitiativeCheck: this._onRollInitiativeCheck,
            rollAbility: this._onRollAbility,
            rollSavingThrow: this._onRollSavingThrow,
            rollGuard: this._onRollGuard,

            editCondition: this._onEditCondition,
            deleteCondition: this._onDeleteStateItem,
            addAptitude: this._onAddAptitude,
            editAptitudeOptions: this._onEditAptitudeOptions,
            editAptitudeCondition: this._onEditAptitudeCondition,
            toggleManualCondition: this._onToggleManualCondition,
            toggleEffectRule: this._onToggleEffectRule,
            editAptitudeRoll: this._onEditAptitudeRoll,
            rollAptitude: this._onRollAptitude,
            deleteAptitude: this._onDeleteStateItem,
            goToLinkedTrait: this._onGoToLinkedTrait,
            goToLinkedAptitude: this._onGoToLinkedAptitude,
            addTrait: this._onAddTrait,
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
            transferInventory: function () { if (this.isEditable) return inventoryActionDialog(this.actor, "transfer"); },
            dropInventoryGround: function () { if (this.isEditable) return inventoryActionDialog(this.actor, "drop"); },
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
            editExpertise: this._onEditExpertise,
            deleteExpertise: this._onDeleteExpertise,

            addWeaponDamageType: this._onAddWeaponDamageType,
            removeWeaponDamageType: this._onRemoveWeaponDamageType
        }
    };

    _collapsedInventory = new Set();
    _arcanology = new ArcanologyNotebook(this);
    _showInventoryWeights = true;
    _inventoryDragId = null;
    _inventoryDropTarget = null;
    _inventoryDropPosition = null;
    _sheetSortDragId = null;
    _sheetSortDropTarget = null;


    get title() {
        return this.actor.name || this.actor.id;
    }

    get compactNPC() {
        return this.actor.getFlag("arcane-advent", "compactNPC") === true;
    }


    static PARTS = {
        body: {
            template:
                "systems/arcane-advent/templates/actor/character-sheet.hbs",
            templates: ["aptitudes", "conditions", "traits", "effect-quick-view", "manual-modifiers", "sheet-mode", "combat-stances"]
                .map(name => `systems/arcane-advent/templates/actor/parts/${name}.hbs`),
            scrollable: [""]
        }
    };

    _configureRenderParts(options) {
        const parts = super._configureRenderParts(options);
        if (this.compactNPC) parts.body.template = "systems/arcane-advent/templates/actor/npc-sheet.hbs";
        return parts;
    }


    async _prepareContext(options) {
        const context = await super._prepareContext(options);

        context.actor = this.actor;
        context.system = this.actor.system;
        context.hasEquippedShield = this.actor.items.some(item => item.type === "shield" && item.system.equipped);
        context.shieldBonusLabel = signedModifier(this.actor.system.defense.shieldBonus);
        context.compactNPC = this.compactNPC;
        context.npcOptionsOpen = Boolean(this.element?.querySelector("[data-npc-options][open]"));
        // L’onglet doit être visible avant que Foundry restaure le défilement.
        context.activeSheetTab = this._activeTab ?? "core";

        context.canEditState = this.isEditable;
        context.arcanologyHTML = context.compactNPC ? "" : await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/arcanology-notebook.hbs",
            this._arcanology.prepare()
        );
        context.genderOptions = IDENTITY_GENDERS;
        context.volumeOptions = VOLUME_LABELS;
        context.ageEstimateOptions = AGE_ESTIMATES;
        const alignment = this.actor.system.identity.alignment?.trim() || "Neutre";
        context.alignmentOptions = ARCANE_ALIGNMENTS.map(value => ({ value, label: value, selected: value === alignment }));
        if (!ARCANE_ALIGNMENTS.includes(alignment)) {
            context.alignmentOptions.push({ value: alignment, label: alignment, selected: true });
        }
        const abilityAbbreviations = ["FOR", "DEX", "CON", "INT", "SAG", "CHA"];
        context.compactAbilities = Object.entries(APTITUDE_ROLL_ABILITIES).map(([key, name], index) => ({
            key, name, label: abilityAbbreviations[index],
            ...this.actor.system.abilities[key],
            modifierLabel: signedModifier(this.actor.system.abilities[key].modifier),
            mastery: this.actor.system.savingThrows[key].mastery,
            saveLabel: signedModifier(this.actor.system.savingThrows[key].total)
        }));
        context.compactDefenseZones = Object.entries({ head: "Tête", torso: "Torse", arms: "Bras", legs: "Jambes" })
            .map(([key, label]) => ({ key, label, value: this.actor.system.defense.zones[key] }));
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
        const openDescriptions = new Set(Array.from(
            this.element?.querySelectorAll("details[data-aptitude-description][open]") ?? [],
            panel => panel.dataset.aptitudeDescription
        ));
        const openAptitudeSettings = new Set(Array.from(
            this.element?.querySelectorAll("details[data-aptitude-settings][open]") ?? [],
            panel => panel.dataset.aptitudeSettings
        ));
        const openEffects = new Set(Array.from(
            this.element?.querySelectorAll("details[data-source-effects][open]") ?? [],
            panel => panel.dataset.sourceEffects
        ));
        const openConditions = new Set(Array.from(
            this.element?.querySelectorAll("details[data-source-conditions][open]") ?? [],
            panel => panel.dataset.sourceConditions
        ));
        const openTraitDescriptions = new Set(Array.from(
            this.element?.querySelectorAll("details[data-trait-description][open]") ?? [],
            panel => panel.dataset.traitDescription
        ));
        const traitItems = sortableItems(this.actor.items.filter(item => item.type === "trait"));
        const aptitudeItems = sortableItems(this.actor.items.filter(item => item.type === "aptitude"));
        const traitsById = new Map(traitItems.map(item => [item.id, item]));
        const effectsById = new Map(characterEffectSources(this.actor).map(entry => [entry.source.id, entry]));
        const conditionViewer = conditionActor(this.actor);
        const effectContext = item => {
            const source = effectsById.get(item.id);
            return {
                effectCount: source?.rules.length ?? 0,
                effectActive: Boolean(source?.rules.some(rule => rule.active)),
                effectsOpen: openEffects.has(item.id),
                conditionsOpen: openConditions.has(item.id),
                effectEntries: (source?.rules ?? []).map(rule => ({
                    id: rule.id,
                    label: rule.label,
                    summary: effectRuleSummary(rule, { compact: true }),
                    enabled: rule.enabled !== false,
                    active: rule.active,
                    status: rule.enabled === false ? "Désactivé" : rule.amountError ? "Référence invalide" : rule.active ? "Actif" : "Inactif"
                })),
                conditionEntries: Object.entries(item.system.conditions ?? {}).map(([id, condition]) => ({
                    id,
                    label: condition.label?.trim() || (condition.kind === "manual" ? "Condition manuelle" : "Condition automatique"),
                    manual: condition.kind === "manual",
                    satisfied: aptitudeConditionStatus(conditionViewer, condition)
                }))
            };
        };
        context.resourceEffectTotals = [
            ["PdC", this.actor.system.consciousness], ["PdF", this.actor.system.fever], ["Dés de Conscience", this.actor.system.consciousnessDice]
        ].filter(([, pool]) => pool.effectiveMax !== pool.max).map(([label, pool]) => ({ label, base: pool.max, total: pool.effectiveMax }));
        context.traits = traitItems.map(item => ({
            ...effectContext(item),
            id: item.id,
            name: item.name,
            system: item.system,
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
            ...effectContext(item),
            id: item.id,
            name: item.name,
            system: item.system,
            linkedTraitName: traitsById.get(item.system.traitId)?.name ?? "",
            linkedTraitId: traitsById.get(item.system.traitId)?.id ?? "",
            categoryLabel: APTITUDE_CATEGORIES[item.system.category],
            isPassive: item.system.category === "passive",
            isTechnique: item.system.category === "technique",
            effectDuration: {
                active: item.system.effectDuration.enabled || isAptitudeOptionVisible(item.system, "duration"),
                remaining: item.system.effectDuration.enabled ? item.system.effectDuration.remaining : item.system.durationTurns,
                label: APTITUDE_RECOVERY_UNITS[item.system.effectDuration.enabled ? item.system.effectDuration.unit : item.system.durationUnit]
            },
            targetingSummary: [item.system.targeting?.mode === "multiple"
                ? `Cibles : ${item.system.targeting.maxTargets}`
                : item.system.targeting?.mode === "area"
                    ? `Zone · ${APTITUDE_AREA_SHAPES[item.system.targeting.shape]}`
                    : "", aptitudeRangeSummary(item.system.targeting)].filter(Boolean).join(" · "),
            durationUnitLabel: APTITUDE_DURATION_UNITS[item.system.durationUnit],
            recoveryUnitLabel: APTITUDE_RECOVERY_UNITS[item.system.recoveryCounter.unit],
            descriptionOpen: openDescriptions.has(item.id),
            settingsOpen: openAptitudeSettings.has(item.id),
            rolls: Object.entries(item.system.rolls).map(([id, roll]) => ({
                id,
                name: roll.name.replace(/^(?:🎲\uFE0F?\s*)+/u, "")
            })),
            options: Object.entries(APTITUDE_OPTIONS)
                .filter(([key]) => key !== "duration" && item.system.category !== "technique")
                .map(([key, label]) => ({
                key,
                label,
                value: key === "duration" ? item.system.durationTurns : item.system[`${key}Counter`],
                unitLabel: APTITUDE_RECOVERY_UNITS[item.system[`${key}Counter`]?.unit] ?? "",
                note: item.system[key] && parseLegacyAptitudeOption(key, item.system[key]) === null
                    ? item.system[key].trim()
                    : "",
                active: isAptitudeOptionVisible(item.system, key)
            }))
        }));
        const totalModifiers = this.actor.system.modifierTotals;
        const manualModifiers = this.actor.system.manualModifiers;
        const modifierGroup = (key, title, keys) => ({
            key, title,
            entries: keys.map(key => ({
                key,
                label: MODIFIER_TARGETS[key],
                manual: manualModifiers[key],
                fromConditionsLabel: signedModifier(totalModifiers[key] - manualModifiers[key]),
                totalLabel: signedModifier(totalModifiers[key])
            }))
        });
        context.manualModifierGroups = [
            modifierGroup("abilities", "Caractéristiques principales", ABILITY_MODIFIER_KEYS),
            modifierGroup("trackers", "Trackers et Défenses partielles", TRACKER_MODIFIER_KEYS),
            modifierGroup("savingThrows", "Jets de sauvegarde", Object.keys(MODIFIER_TARGETS).filter(key => key.startsWith("save")))
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

        context.needs = this.actor.system.needs ? Object.entries(ARCANE_NEEDS).map(([key, { label, stages }]) => {
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
        }) : [];

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
                            item.system.weaponClass,
                            item
                        );

                    return {
                        ...equipmentView(item),

                        attackAbility:
                            ability.label,

                        expertiseBonus,

                        attackTotal:
                            ability.modifier
                            + expertiseBonus,
                        attackModifierLabel: signedModifier(ability.modifier + expertiseBonus),

                        damageTypes: [...item.system.damageTypes].map(type => ({
                            type,
                            label: damageTypeLabel(type)
                        })),

                        properties: {
                            twoHanded:
                                properties.has("twoHanded"),

                            finesse:
                                properties.has("finesse"),

                            guard:
                                properties.has("guard"),

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
                            item.system.shieldClass,
                            item
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

        const guards = equipment.filter(item => this.actor.getGuardStatistics(item));
        const guard = guards.length === 1 ? guards[0] : null;
        const stats = guard ? this.actor.getGuardStatistics(guard) : null;
        const guardLabel = stats
            ? `${guard.name} — Défense de Garde ${stats.defense} · JS ${signedModifier(stats.savingThrowModifier)}. ${stats.calculation}`
            : guards.length > 1
                ? "Un seul équipement de Garde peut être équipé à la fois."
                : "Équipez une arme ou un bouclier permettant la Garde.";
        context.combatStances = Object.entries(COMBAT_STANCES).map(([key, stance]) => ({
            key, label: stance.label, selected: key === this.actor.system.defense.stance,
            title: `Avantage aux jets de sauvegarde de ${stance.saveLabel} ; désavantage aux jets de sauvegarde de ${stance.disadvantageSaveLabel}`
        }));
        context.guardAction = {
            itemId: guard?.id ?? "",
            hasEquipment: Boolean(stats),
            defense: stats?.defense,
            available: this.isEditable && canRollGuard(this.actor, guard),
            title: stats && this.actor.system.defense.stance !== "defend"
                ? `${guardLabel}. Activez Se Défendre pour lancer la Garde.`
                : guardLabel
        };

        context.expertises = sortableItems(this.actor.items
            .filter(item =>
                item.type === "expertise"
            ))
            .map(expertise => ({
                id: expertise.id,
                name: expertise.name,
                domain: expertise.system.domain,
                target: expertise.system.target,
                bonus: expertise.system.bonus,
                bonusLabel: signedModifier(expertise.system.bonus)
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


    static async _onToggleCombatStance(event, target) {
        const stance = target.dataset.combatStance;
        if (!this.isEditable || !Object.hasOwn(COMBAT_STANCES, stance)) return;
        await this.actor.update({
            "system.defense.stance": this.actor.system.defense.stance === stance ? "none" : stance
        });
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

        if (!this.isEditable || !itemId) return;

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
        const [trait] = await this.actor.createEmbeddedDocuments("Item", [{
            name: "Nouveau Trait", type: "trait", sort: nextItemSort(this.actor, "trait")
        }]);
        if (trait) await openCharacterEffectsEditor(trait, { actor: this.actor });
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
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    static _onGoToLinkedAptitude(event, target) {
        const aptitude = this.actor.items.get(target.dataset.itemId);
        if (aptitude?.type !== "aptitude") return;
        const row = this.element.querySelector(`[data-aptitude-row="${aptitude.id}"]`);
        if (!row) return;
        row.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }

    async _onTraitEdit(event) {
        event.stopPropagation();
        if (!this.isEditable) return;
        const field = event.currentTarget;
        const trait = this.actor.items.get(field.dataset.traitId);
        const key = field.dataset.traitField;
        if (trait?.type !== "trait" || !["name", "description"].includes(key)
            || !field.reportValidity()) return;

        const value = field.value.trim();
        if (key === "name") {
            if (value && value !== trait.name) await trait.update({ name: value });
        } else if (value !== trait.system[key]) {
            await trait.update({ [`system.${key}`]: value });
        }
    }

    static async _onEditAptitudeOptions(event, target) {
        if (!this.isEditable) return;
        const aptitude = this.actor.items.get(target.dataset.itemId);
        if (aptitude?.type !== "aptitude") return;

        const { DialogV2 } = foundry.applications.api;
        let system = aptitude.system;
        const content = document.createElement("div");
        const durationActive = system.effectDuration.enabled || isAptitudeOptionVisible(system, "duration");
        const hasEffectDuration = system.effectDuration.enabled
            || system.effectDuration.remaining > 0 || system.effectDuration.unit !== "turns";
        const list = data => Object.entries(data).map(([key, label]) => ({ key, label }));
        // Cinq unités proposées pour les nouvelles Aptitudes, sans supprimer les valeurs historiques.
        const unitLabels = { ...APTITUDE_DURATION_UNITS };
        for (const unit of [system.recoveryCounter.unit, system.castingCounter.unit,
            system.effectDuration.unit, system.durationUnit]) {
            if (Object.hasOwn(APTITUDE_RECOVERY_UNITS, unit) && !Object.hasOwn(unitLabels, unit)) {
                unitLabels[unit] = APTITUDE_RECOVERY_UNITS[unit];
            }
        }
        const renderOptions = () => { system = aptitude.system; return foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/aptitude-options-dialog.hbs", {
                system,
                isTechnique: system.category === "technique",
                chargeActive: isAptitudeOptionVisible(system, "charge"),
                recoveryActive: isAptitudeOptionVisible(system, "recovery"),
                castingActive: isAptitudeOptionVisible(system, "casting"),
                durationActive,
                effectRemaining: hasEffectDuration ? system.effectDuration.remaining : system.durationTurns,
                effectUnit: hasEffectDuration ? system.effectDuration.unit : system.durationUnit,
                units: list(unitLabels),
                targetModes: list(APTITUDE_TARGET_MODES),
                rangeMode: aptitudeRangeMode(system.targeting),
                shapes: list(APTITUDE_AREA_SHAPES),
                origins: list({ caster: "Lanceur", target: "Point ciblé" }),
                propagations: list({ projectile: "Projectile", beam: "Rayon", instant: "Instantané", wave: "Onde" }),
                rolls: Object.entries(aptitude.system.rolls).map(([id, roll]) => ({ id, name: roll.name }))
            }
        ); };
        content.innerHTML = await renderOptions();

        const readCounter = (fields, name) => {
            const remaining = Number(fields.get(name + ".remaining"));
            const max = Number(fields.get(name + ".max"));
            if (!Number.isSafeInteger(remaining) || !Number.isSafeInteger(max)
                || remaining < 0 || max < 0 || remaining > max) {
                throw Error(`${APTITUDE_OPTIONS[name]} — la valeur restante ne peut pas dépasser le maximum.`);
            }
            const unit = fields.get(name + ".unit");
            if (unit && !Object.hasOwn(APTITUDE_RECOVERY_UNITS, unit)) throw Error("Unité invalide.");
            return { remaining, max, unit };
        };
        const dialog = new DialogV2({
            window: { title: "Options — " + aptitude.name },
            position: { width: 590 }, content, modal: true, form: { closeOnSubmit: false },
            buttons: [
                {
                    action: "save", label: "Enregistrer",
                    callback: async (_event, button, app) => {
                        if (!button.form.reportValidity()) return;
                        const values = new FormData(button.form);
                        const updates = {};
                        try {
                            if (system.category !== "technique") {
                                for (const name of ["charge", "recovery", "casting"]) {
                                    const base = name + "Counter";
                                    const enabled = values.has("enable." + name);
                                    updates["system.showOptions." + name] = enabled;
                                    if (!enabled) continue;
                                    const counter = readCounter(values, name);
                                    updates["system." + base + ".remaining"] = counter.remaining;
                                    updates["system." + base + ".max"] = counter.max;
                                    if (counter.unit) updates["system." + base + ".unit"] = counter.unit;
                                }
                            }
                            const effectEnabled = values.has("effect.enabled");
                            updates["system.effectDuration.enabled"] = effectEnabled;
                            updates["system.showOptions.duration"] = effectEnabled;
                            if (effectEnabled) {
                                const effectRemaining = Number(values.get("effect.remaining"));
                                const effectUnit = values.get("effect.unit");
                                if (!Number.isSafeInteger(effectRemaining) || effectRemaining < 0
                                    || !Object.hasOwn(APTITUDE_RECOVERY_UNITS, effectUnit)) throw Error("Durée d’effet invalide.");
                                updates["system.effectDuration.remaining"] = effectRemaining;
                                updates["system.effectDuration.unit"] = effectUnit;
                                updates["system.durationTurns"] = effectRemaining;
                                if (Object.hasOwn(APTITUDE_DURATION_UNITS, effectUnit)) updates["system.durationUnit"] = effectUnit;
                            }
                            const validChoices = {
                                mode: Object.keys(APTITUDE_TARGET_MODES),
                                rangeMode: Object.keys(APTITUDE_RANGE_MODES),
                                shape: Object.keys(APTITUDE_AREA_SHAPES),
                                origin: ["caster", "target"],
                                propagation: ["projectile", "beam", "instant", "wave"]
                            };
                            for (const [key, choices] of Object.entries(validChoices)) {
                                if (!values.has("target." + key)) continue;
                                const value = values.get("target." + key);
                                if (!choices.includes(value)) throw Error("Paramètre de ciblage invalide : " + key);
                                updates["system.targeting." + key] = value;
                            }
                            for (const key of ["maxTargets", "range", "longRange", "radius", "length", "width", "angle"]) {
                                if (!values.has("target." + key)) continue;
                                const value = Number(values.get("target." + key));
                                if (!Number.isFinite(value) || value < 0 || (key === "angle" && value > 360)
                                    || (key === "maxTargets" && !Number.isSafeInteger(value))) {
                                    throw Error("Valeur de ciblage invalide : " + key);
                                }
                                updates["system.targeting." + key] = value;
                            }
                            if (values.get("target.rangeMode") === "ranged" && values.has("target.longRange")) {
                                const normal = Number(values.get("target.range"));
                                const long = Number(values.get("target.longRange"));
                                if (long > 0 && long < normal) throw Error("La portée longue doit être au moins égale à la portée normale (ou 0 si absente).");
                            }
                            if (values.get("target.mode") !== "self") {
                                updates["system.targeting.travels"] = values.has("target.travels");
                            }
                        } catch (error) {
                            ui.notifications.warn(error.message);
                            return;
                        }
                        if (this.actor.items.has(aptitude.id)) await aptitude.update(updates);
                        await app.close();
                    }
                },
                { action: "cancel", label: "Annuler", type: "button",
                    callback: (_event, _button, app) => app.close() }
            ]
        });
        dialog.addEventListener("render", () => {
            const editor = dialog.element.querySelector(".aa-aptitude-options-editor");
            const updateFields = () => refreshAptitudeTargetingFields(editor);
            bindAptitudeRangeToggle(editor);
            updateFields();
            editor.addEventListener("change", updateFields);
            editor.addEventListener("invalid", event => {
                const section = event.target.closest("details");
                if (section) section.open = true;
            }, true);
            editor.addEventListener("click", async event => {
                if (event.target.closest("[data-aa-effects]")) {
                    await openCharacterEffectsEditor(aptitude, { actor: this.actor, parent: dialog });
                    return;
                }
                const control = event.target.closest("[data-aa-roll], [data-aa-add-roll]");
                if (!control) return;
                const data = control.dataset;
                const child = await ArcaneCharacterSheet._onEditAptitudeRoll.call(this, null, {
                    dataset: { itemId: aptitude.id, rollId: Object.hasOwn(data, "aaAddRoll") ? null : data.aaRoll }
                }, dialog);
                child?.addEventListener("close", async () => {
                    const refreshed = editor.ownerDocument.createElement("div");
                    refreshed.innerHTML = await renderOptions();
                    const selector = '[data-aa-options-list="rolls"]';
                    const list = editor.querySelector(selector);
                    const replacement = refreshed.querySelector(selector);
                    if (list.innerHTML !== replacement.innerHTML) {
                        const restoreFocus = list.contains(editor.ownerDocument.activeElement);
                        list.replaceChildren(...replacement.childNodes);
                        if (restoreFocus) (list.querySelector("button") ?? list.nextElementSibling.querySelector("button")).focus();
                    }
                }, { once: true });
            });
        });
        await dialog.render({ force: true });
    }

    static async _onToggleEffectRule(event, target) {
        if (!this.isEditable) return;
        const source = this.actor.items.get(target.dataset.itemId);
        const rule = source?.system.effectRules?.[target.dataset.effectId];
        if (!["trait", "aptitude"].includes(source?.type) || !rule) return;
        const settings = effectRuleSettings(source, rule);
        const prefix = `system.effectRules.${target.dataset.effectId}`;
        const updates = { [prefix + ".enabled"]: !settings.enabled };
        if (!rule.activationMode || rule.activationMode === "legacy") {
            for (const key of ["activationMode", "conditionMode", "conditionIds", "conditionMatch"]) {
                updates[prefix + "." + key] = settings[key];
            }
        }
        await source.update(updates);
    }

    static async _onToggleManualCondition(event, target) {
        if (!this.isEditable) return;
        const source = this.actor.items.get(target.dataset.itemId);
        const condition = source?.system.conditions?.[target.dataset.conditionId];
        if (!["trait", "aptitude"].includes(source?.type) || condition?.kind !== "manual") return;
        await source.update({
            [`system.conditions.${target.dataset.conditionId}.enabled`]: !condition.enabled
        });
    }

    static async _onEditAptitudeCondition(event, target) {
        if (!this.isEditable) return;
        const aptitude = this.actor.items.get(target.dataset.itemId);
        if (aptitude?.type !== "aptitude") return;
        await this._openAptitudeConditionEditor(aptitude, target.dataset.conditionId);
    }

    async _openAptitudeConditionEditor(aptitude, conditionId = null, requestedKind = "manual", parent = null) {
        if (!this.isEditable) return;
        const current = conditionId ? aptitude.system.conditions[conditionId] : null;
        if (conditionId && !current) return;
        const kind = current?.kind ?? (requestedKind === "automatic" ? "automatic" : "manual");
        const starting = current ?? {
            label: "", kind, enabled: false,
            metric: "pdcRatio", operator: "<", value: 50, key: "", expression: "", consumes: false
        };
        const content = document.createElement("div");
        let conditionDraft = { ...starting };
        content.innerHTML = `<section class="aa-effects-editor"><div data-single-condition>${conditionControls(this.actor, conditionDraft)}</div></section>`;
        const buttons = [{
            action: "save", label: "Enregistrer / Appliquer",
            callback: async (_event, button, app) => {
                if (!button.form.reportValidity()) return;
                const data = readConditionControls(app.element.querySelector("[data-single-condition]"), conditionDraft);
                try { validateCondition(data); } catch (error) { ui.notifications.warn(error.message); return; }
                data.label = data.label.trim();
                const id = conditionId ?? foundry.utils.randomID();
                if (this.actor.items.has(aptitude.id)) {
                    await aptitude.update({ [`system.conditions.${id}`]: data });
                }
                await app.close();
            }
        }];
        if (conditionId) buttons.push({
            action: "delete", label: "Supprimer", type: "button",
            callback: async (_event, _button, app) => {
                if (this.actor.items.has(aptitude.id)) await aptitude.update({
                    system: { conditions: { [conditionId]: new foundry.data.operators.ForcedDeletion() } }
                });
                await app.close();
            }
        });
        buttons.push({ action: "cancel", label: "Annuler", type: "button",
            callback: (_event, _button, app) => app.close() });
        const dialog = new foundry.applications.api.DialogV2({
            window: { title: kind === "automatic" ? "Condition automatique" : "Condition manuelle" },
            position: { width: 650 }, content, modal: true, form: { closeOnSubmit: false }, buttons
        });
        dialog.addEventListener("render", () => bindConditionControls(dialog.element.querySelector("[data-single-condition]"),
            this.actor, conditionDraft, data => { conditionDraft = data; }));
        return parent ? parent.renderChild(dialog) : dialog.render({ force: true });
    }

    static async _onRollAptitude(event, target) {
        const { itemId, rollId } = target.dataset;
        await this.actor.rollAptitude(itemId, rollId, this._getRollMode());
    }


    static async _onEditAptitudeRoll(event, target, parent = null) {
        if (!this.isEditable) return;
        const { itemId } = target.dataset;
        // An explicit add action has no roll ID. Preserve an empty ID when
        // editing a roll saved by older versions, including its hotbar links.
        const rollId = target.dataset.rollId ?? null;
        const editing = rollId !== null;
        const item = this.actor.items.get(itemId);
        if (item?.type !== "aptitude") return;
        if (editing && !Object.hasOwn(item.system.rolls, rollId)) return;

        let id = rollId;
        if (!editing) {
            do { id = foundry.utils.randomID(); } while (Object.hasOwn(item.system.rolls, id));
        }

        const current = editing ? item.system.rolls[rollId] : { name: "Jet", formula: "1d20" };
        const content = document.createElement("div");
        content.innerHTML = await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/aptitude-roll-dialog.hbs",
            {
                current,
                abilities: Object.entries(APTITUDE_ROLL_ABILITIES).map(([key, label]) => ({
                    key, label, selected: current.abilities?.size
                        ? current.abilities.has(key)
                        : current.ability === key
                })),
                skills: this.actor.items.filter(entry => entry.type === "skill"),
                expertises: this.actor.items.filter(entry => entry.type === "expertise")
            }
        );

        const buttons = [{
            action: "save",
            label: editing ? "Enregistrer" : "Ajouter",
            callback: async (_event, button, app) => {
                if (!button.form.reportValidity()) return;
                const fields = new FormData(button.form);
                const formula = fields.get("formula").trim();
                if (!formula || !foundry.dice.Roll.validate(formula)) {
                    ui.notifications.warn("La formule du jet est invalide.");
                    return;
                }

                if (!this.actor.items.has(itemId) || (editing && !Object.hasOwn(item.system.rolls, rollId))) {
                    await app.close();
                    return;
                }
                await item.update({
                    [`system.rolls.${id}`]: {
                        name: fields.get("name").trim(),
                        formula,
                        ability: "",
                        abilities: fields.getAll("abilities").filter(key => Object.hasOwn(APTITUDE_ROLL_ABILITIES, key)),
                        skillId: fields.get("skillId"),
                        expertiseId: fields.get("expertiseId")
                    }
                });
                await app.close();
            }
        }];

        if (editing) buttons.push({
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
            window: { title: editing ? "Modifier le jet d’aptitude" : "Ajouter un jet d’aptitude" },
            position: { width: 430 },
            content,
            modal: true,
            form: { closeOnSubmit: false },
            buttons
        });
        return parent ? parent.renderChild(dialog) : dialog.render({ force: true });
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
                    modifierGroup("Trackers et Défenses partielles", TRACKER_MODIFIER_KEYS),
                    modifierGroup("Jets de sauvegarde", Object.keys(MODIFIER_TARGETS).filter(key => key.startsWith("save")))
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
        bindDefenseReductionTooltips(this.element, this.actor.items);
        this._arcanology.bind(this.element.querySelector(".aa-arcanology"));
        const isDetached = this.window.windowId === this.id;
        this.element.classList.toggle("aa-detached-sheet", isDetached);
        if (isDetached) this.element.ownerDocument.title = this.title;
        this.element.classList.toggle("aa-npc-sheet", context.compactNPC);
        if (context.compactNPC !== this._renderedCompactNPC) {
            if (!isDetached) {
                if (context.compactNPC) {
                    this._fullSheetWidth = this.position.width;
                    this.setPosition({ width: Math.min(this.position.width, 800) });
                } else if (this._renderedCompactNPC && this._fullSheetWidth) {
                    this.setPosition({ width: this._fullSheetWidth });
                }
            }
            this.element.querySelector(".aa-character").scrollTop = 0;
            this._renderedCompactNPC = context.compactNPC;
        }
        this.element.querySelector("[data-compact-npc]")?.addEventListener("change", this._onCompactNPCChange.bind(this));

        // Onglets
        if (!context.compactNPC) {
            const tabs = new foundry.applications.ux.Tabs({
                navSelector: ".aa-tabs",
                contentSelector: ".aa-tab-content",
                initial: context.activeSheetTab,
                group: "sheet"
            });

            tabs.bind(this.element);
        }

        // Les boutons de jets peuvent être glissés sur la barre native de Foundry.
        // Les raccourcis appelleront les jets d'origine, avec leurs modificateurs actuels.
        for (const button of this.element.querySelectorAll("button[data-action]")) {
            if (!hotbarRollData(this.actor, button)) continue;
            button.draggable = true;
            button.title = (button.title ? button.title + " · " : "") + "Glisser vers la barre de raccourcis";
            button.addEventListener("dragstart", event => {
                const data = hotbarRollData(this.actor, button);
                if (!data || !event.dataTransfer) return;
                event.dataTransfer.setData("text/plain", JSON.stringify(data));
                event.dataTransfer.effectAllowed = "copy";
                event.stopPropagation();
            });
        }

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


    }

    static _onEditManualModifiers(event, target) {
        const key = target.dataset.modifierGroup;
        if (!["abilities", "trackers"].includes(key)) return;
        const options = this.element.querySelector("[data-npc-options]");
        const group = options?.querySelector(`[data-manual-modifier-group="${key}"]`);
        if (!group) return;
        options.open = true;
        group.scrollIntoView({ block: "start" });
        group.querySelector("input")?.focus({ preventScroll: true });
    }

    async _onCompactNPCChange(event) {
        event.stopPropagation();
        if (!this.isEditable) return;
        const control = event.currentTarget;
        const enabled = control.checked;
        control.disabled = true;
        try {
            // Uniquement une préférence d'affichage, aucune donnée de jeu modifiée.
            await this.actor.setFlag("arcane-advent", "compactNPC", enabled);
        } catch (error) {
            control.checked = this.compactNPC;
            ui.notifications.error("Impossible de modifier le mode de fiche.");
            console.error("Arcane Advent | Mode PNJ compact", error);
        } finally {
            control.disabled = !this.isEditable;
        }
    }


    static async _onToggleAgeMode(_event, target) {
        if (!this.isEditable || target.disabled) return;
        target.disabled = true;
        try {
            const mode = this.actor.system.identity.ageMode === "estimated" ? "number" : "estimated";
            await this.actor.update({ "system.identity.ageMode": mode });
        } finally {
            target.disabled = !this.isEditable;
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
                : key === "alignment" ? Object.fromEntries(ARCANE_ALIGNMENTS.map(value => [value, value]))
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

        if (!this.isEditable || !property) return;
        if (item?.type === "shield" && property === "guard") {
            await this.actor.updateInventoryItem(item.id, { "system.guardEnabled": !item.system.guardEnabled });
            return;
        }
        if (item?.type !== "weapon") return;


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

    static async _onEditExpertise(event, target) {
        if (!this.isEditable) return;
        const expertise = this.actor.items.get(target.dataset.expertiseId);
        if (expertise?.type !== "expertise") return;

        const { DialogV2 } = foundry.applications.api;
        const content = document.createElement("div");
        content.innerHTML = await foundry.applications.handlebars.renderTemplate(
            "systems/arcane-advent/templates/actor/expertise-dialog.hbs", {
                name: expertise.name,
                bonus: expertise.system.bonus,
                classesText: normalizedClasses(expertise).join("\n"),
                domains: Object.entries(EXPERTISE_DOMAINS).map(([key, label]) =>
                    ({ key, label, selected: key === expertise.system.domain })),
                isWeapon: expertise.system.domain === "weaponClass",
                properties: Object.entries(WEAPON_PROPERTIES).map(([key, label]) => {
                    const state = expertise.system.propertyFilters[key] ?? "neutral";
                    return { key, label, state, stateLabel: PROPERTY_FILTER_STATES[state] };
                })
            }
        );
        const dialog = new DialogV2({
            window: { title: "Options — " + expertise.name },
            position: { width: 500 }, content, modal: true,
            form: { closeOnSubmit: false },
            buttons: [
                {
                    action: "save", label: "Enregistrer",
                    callback: async (_event, button, app) => {
                        if (!button.form.reportValidity()) return;
                        const values = new FormData(button.form);
                        const name = String(values.get("name") ?? "").trim();
                        const bonus = Number(values.get("bonus"));
                        if (!name || !Number.isSafeInteger(bonus)) {
                            ui.notifications.warn("Nom ou niveau d’Expertise invalide.");
                            return;
                        }
                        const domain = values.get("domain");
                        if (!Object.hasOwn(EXPERTISE_DOMAINS, domain)) return;
                        const classes = [...new Set(String(values.get("classes") ?? "").split(/\r?\n/u)
                            .map(v => v.trim()).filter(Boolean))];
                        const propertyFilters = {};
                        for (const key of Object.keys(WEAPON_PROPERTIES)) {
                            const state = values.get("property." + key);
                            if (!Object.hasOwn(PROPERTY_FILTER_STATES, state)) return;
                            propertyFilters[key] = state;
                        }
                        if (domain !== "other" && !classes.length
                            && !(domain === "weaponClass"
                                && Object.values(propertyFilters).includes("required"))) {
                            ui.notifications.warn("Précisez au moins une classe ou une propriété d'arme requise.");
                            return;
                        }
                        if (!this.actor.items.has(expertise.id)) { await app.close(); return; }
                        await expertise.update({
                            name,
                            "system.domain": domain,
                            "system.target": classes[0] ?? "",
                            "system.classes": classes,
                            "system.propertyFilters": propertyFilters,
                            "system.bonus": bonus
                        });
                        await app.close();
                    }
                },
                {
                    action: "delete", label: "Supprimer", type: "button",
                    callback: async (_event, _button, app) => {
                        const confirmed = await DialogV2.confirm({
                            window: { title: "Supprimer l’Expertise" },
                            content: "Supprimer cette Expertise ?", yes: { label: "Supprimer" },
                            no: { label: "Annuler" }, rejectClose: false
                        });
                        if (confirmed && this.actor.items.has(expertise.id)) {
                            await expertise.delete();
                            await app.close();
                        }
                    }
                },
                { action: "cancel", label: "Annuler", type: "button",
                    callback: (_event, _button, app) => app.close() }
            ]
        });
        dialog.addEventListener("render", () => {
            const editor = dialog.element.querySelector(".aa-expertise-editor");
            const domain = editor.querySelector("[data-expertise-domain]");
            const filters = editor.querySelector("[data-expertise-weapon-filters]");
            domain.addEventListener("change", () => { filters.hidden = domain.value !== "weaponClass"; });
            const states = ["neutral", "required", "excluded"];
            for (const toggle of filters.querySelectorAll("[data-aa-property-toggle]")) {
                toggle.addEventListener("click", () => {
                    const field = toggle.nextElementSibling;
                    const next = states[(states.indexOf(field.value) + 1) % states.length];
                    field.value = next;
                    toggle.dataset.state = next;
                    toggle.textContent = PROPERTY_FILTER_STATES[next];
                    toggle.setAttribute("aria-label", `${toggle.dataset.propertyLabel} · ${toggle.textContent}`);
                });
            }
        });
        await dialog.render({ force: true });
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

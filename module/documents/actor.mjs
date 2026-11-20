import { buildInventory, canPlaceInContainer, EQUIPMENT_TYPES, isInventoryContainer, isInventoryItem } from "../inventory.mjs";
import { getEquipmentConflictType } from "./item.mjs";
import { guardValues, equipmentAllowsGuard, canRollGuard } from "../guard.mjs";
import { signedModifier } from "../modifiers.mjs";
import { expertiseMatches, matchingExpertiseBonus } from "../expertise.mjs";
import { STORAGE_IMAGE } from "../storage.mjs";
import { activeCharacterEffects, conditionActor, resolveRollEffects, sourceConditionsSatisfied } from "../character-effects.mjs";

const SORT_SPACING = 100000;

// Reindex only a single visual group. Item.sort is a built-in, persisted Foundry field.
function orderedSiblingUpdates(siblings, item, relativeToId = null, position = "after") {
    const ordered = [...siblings].sort((a, b) => (a.sort ?? 0) - (b.sort ?? 0))
        .filter(entry => entry.id !== item.id);
    const targetIndex = relativeToId ? ordered.findIndex(entry => entry.id === relativeToId) : -1;
    if (relativeToId && targetIndex < 0) return null;
    const index = relativeToId ? targetIndex + (position === "after" ? 1 : 0) : ordered.length;
    ordered.splice(index, 0, item);
    return ordered.map((entry, position) => ({
        _id: entry.id,
        sort: (position + 1) * SORT_SPACING
    })).filter(update => update._id === item.id || ordered.find(entry => entry.id === update._id)?.sort !== update.sort);
}

export class ArcaneActor extends Actor {

    #inventoryOperation = Promise.resolve();

    static createDialog(data = {}, createOptions = {}, options = {}) {
        return super.createDialog(data, createOptions, {
            ...options, types: (options.types ?? ["character", "npc"]).filter(type => type !== "storage")
        });
    }

    static createDocuments(data = [], operation = {}) {
        // Apply defaults before Foundry cleans the input: v14 materializes a
        // default prototypeToken before _preCreate, even for the empty dialog.
        const sources = data.map(source => {
            if (!["character", "npc"].includes(source.type) || source.prototypeToken != null
                || source.name === "[TEMPLATE]") return source;
            const template = globalThis.game?.actors?.find(actor => actor.name === "[TEMPLATE]"
                && ["character", "npc"].includes(actor.type));
            if (!template?.prototypeToken) return source;
            const prototypeToken = JSON.parse(JSON.stringify(template.prototypeToken.toObject()));
            prototypeToken.name = source.name || "";
            return { ...source, prototypeToken };
        });
        return super.createDocuments(sources, operation);
    }

    async _preCreate(data, options, user) {
        if (await super._preCreate(data, options, user) === false) return false;
        if (this.type === "npc" && this.getFlag("arcane-advent", "compactNPC") == null) {
            this.updateSource({ "flags.arcane-advent.compactNPC": true });
        }
        if (this.type === "storage") {
            const img = data.img || game.settings.get("arcane-advent", "storageImage") || STORAGE_IMAGE;
            this.updateSource({ img,
                "ownership.default": data.ownership?.default ?? CONST.DOCUMENT_OWNERSHIP_LEVELS.OBSERVER,
                "prototypeToken.actorLink": !this.getFlag("arcane-advent", "groundTemplate"), "prototypeToken.texture.src": img,
                "prototypeToken.bar1.attribute": null, "prototypeToken.bar2.attribute": null });
        }
    }

    get inventory() {
        return buildInventory(this.items);
    }

    // Resolve destinations and equipment conflicts against the latest local state.
    #queueInventoryOperation(callback) {
        const operation = this.#inventoryOperation.then(callback);
        this.#inventoryOperation = operation.catch(() => {});
        return operation;
    }

    // Drop before/after a sibling, drop inside a container, or move to root/container end.
    moveInventoryItem(itemId, containerId, { relativeToId = null, position = "after" } = {}) {
        return this.#queueInventoryOperation(async () => {
            const item = this.items.get(itemId);
            const relative = relativeToId ? this.items.get(relativeToId) : null;
            if (!isInventoryItem(item) || (relativeToId && (!isInventoryItem(relative)
                || relative.id === item.id || relative.system.equipped))) return;

            const destination = relative ? (relative.system.containerId || null) : (containerId || null);
            if (destination && !isInventoryContainer(this.items.get(destination))) return;
            if (!canPlaceInContainer(this.items, itemId, destination)) {
                ui.notifications.warn("Ce déplacement créerait un cycle ou viserait un contenant invalide.");
                return;
            }

            const siblings = this.items.filter(entry => isInventoryItem(entry) && !entry.system.equipped
                && (entry.system.containerId || null) === destination);
            const updates = orderedSiblingUpdates(siblings, item, relativeToId, position);
            if (!updates) return;

            const moved = updates.find(update => update._id === itemId);
            moved.system = { containerId: destination };
            if (EQUIPMENT_TYPES.includes(item.type)) moved.system.equipped = false;

            const result = await this.updateEmbeddedDocuments("Item", updates);
            return result.find(document => document.id === itemId);
        });
    }

    // Aptitudes, compétences, expertises and each equipped equipment category.
    reorderSheetItem(itemId, relativeToId, position = "before") {
        return this.#queueInventoryOperation(async () => {
            const item = this.items.get(itemId);
            const relative = this.items.get(relativeToId);
            const types = ["aptitude", "trait", "skill", "expertise", ...EQUIPMENT_TYPES];
            if (!item || !relative || item.id === relative.id || item.type !== relative.type
                || !types.includes(item.type) || !["before", "after"].includes(position)) return;
            const equipment = EQUIPMENT_TYPES.includes(item.type);
            if (equipment && (!item.system.equipped || !relative.system.equipped)) return;

            const siblings = this.items.filter(entry => entry.type === item.type
                && (!equipment || entry.system.equipped));
            const updates = orderedSiblingUpdates(siblings, item, relativeToId, position);
            if (updates?.length) await this.updateEmbeddedDocuments("Item", updates);
        });
    }

    setEquipmentEquipped(itemId, equipped) {
        if (!EQUIPMENT_TYPES.includes(this.items.get(itemId)?.type)) return;
        return this.updateInventoryItem(itemId, { "system.equipped": equipped });
    }

    updateInventoryItem(itemId, changes) {
        return this.#queueInventoryOperation(async () => {
            const item = this.items.get(itemId);
            if (!item || !isInventoryItem(item)) return;

            const update = foundry.utils.expandObject(changes);
            const system = update.system ??= {};
            const containerChanged = Object.hasOwn(system, "containerId");
            if (containerChanged && !canPlaceInContainer(this.items, itemId, system.containerId)) {
                ui.notifications.warn("Ce déplacement créerait un cycle ou viserait un contenant invalide.");
                return;
            }

            const updates = [{ ...update, _id: itemId }];
            if (EQUIPMENT_TYPES.includes(item.type)) {
                if (containerChanged && system.containerId) system.equipped = false;
                else if (system.equipped) system.containerId = null;

                const equipped = system.equipped ?? item.system.equipped;
                const properties = system.properties ?? item.system.properties;
                const conflictType = equipped && getEquipmentConflictType(item.type, properties);
                const loadoutChanged = system.equipped || Object.hasOwn(system, "properties") || Object.hasOwn(system, "guardEnabled");
                if (conflictType && loadoutChanged) {
                    for (const other of this.items) {
                        if (other.type !== conflictType || !other.system.equipped) continue;
                        if (conflictType === "weapon" && !other.system.properties.has("twoHanded")) continue;
                        updates.push({ _id: other.id, system: { equipped: false } });
                    }
                }
                if (equipped && loadoutChanged && equipmentAllowsGuard({ type: item.type,
                    system: { properties, guardEnabled: system.guardEnabled ?? item.system.guardEnabled } })) {
                    for (const other of this.items) {
                        if (other.id === itemId || !other.system.equipped || !equipmentAllowsGuard(other)
                            || updates.some(update => update._id === other.id)) continue;
                        updates.push({ _id: other.id, system: { equipped: false } });
                    }
                }
            }

            const updated = await this.updateEmbeddedDocuments("Item", updates);
            return updated.find(document => document.id === itemId);
        });
    }

    deleteInventoryItem(itemId) {
        return this.#queueInventoryOperation(async () => {
            const item = this.items.get(itemId);
            if (!item || !isInventoryItem(item)) return;
            const deleted = await this.deleteEmbeddedDocuments("Item", [itemId]);
            return deleted.includes(item);
        });
    }

    async modifyConsciousness(amount) {
        const current = this.system.consciousness.value;
        const maximum = this.system.consciousness.effectiveMax ?? this.system.consciousness.max;

        const newValue = Math.min(
            maximum,
            Math.max(0, current + amount)
        );

        await this.update({
            "system.consciousness.value": newValue
        });

        return newValue;
    }

    async modifyTokenAttribute(attribute, value, isDelta = false, isBar = true) {
        const pool = ["consciousness", "fever", "consciousnessDice"].includes(attribute) ? this.system[attribute] : null;
        if (!isBar || !Number.isFinite(pool?.effectiveMax)) return super.modifyTokenAttribute(attribute, value, isDelta, isBar);
        const next = isDelta ? pool.value + value : value;
        if (!Number.isFinite(next) || next === pool.value) return this;
        const updates = { [`system.${attribute}.value`]: Math.min(pool.effectiveMax, Math.max(0, next)) };
        const allowed = Hooks.call("modifyTokenAttribute", { attribute, value, isDelta, isBar }, updates, this);
        return allowed !== false ? this.update(updates) : this;
    }

    async _rollD20(modifier, mode, flavor, context = {}, { createMessage = true, messageMode, messageOptions = {} } = {}) {
        const isInitiative = context.type === "initiative";
        const effects = isInitiative
            ? resolveRollEffects([], context, "normal")
            : resolveRollEffects(activeCharacterEffects(this), context, mode ?? this.system.rollMode);
        mode = effects.mode;
        modifier += effects.bonus;
        if (effects.sources.length) {
            flavor += `<br><small>Effets : ${foundry.utils.escapeHTML(effects.sources.join(" · "))}${effects.advantage && effects.disadvantage ? " — Avantage et Désavantage : Neutre" : ""}</small>`;
        }
        const formulas = {
            normal: "1d20",
            advantage: "2d20kh",
            disadvantage: "2d20kl"
        };

        const modeLabels = {
            normal: "Neutre",
            advantage: "Avantage",
            disadvantage: "Désavantage"
        };

        const finalMode =
            formulas[mode] ? mode : "normal";


        // Formule complète affichée par Foundry.
        let formula = formulas[finalMode];

        if (modifier > 0) {
            formula += ` + ${modifier}`;
        }
        else if (modifier < 0) {
            formula += ` - ${Math.abs(modifier)}`;
        }


        const roll = new foundry.dice.Roll(formula);

        await roll.evaluate();


        // Avec avantage/désavantage, values ne contient
        // que le d20 retenu par kh / kl.
        const natural = roll.dice[0].values[0];


        // L'initiative garde la somme du dé et de son modificateur, même à zéro ou négative.
        // Les autres jets conservent leurs critiques naturels et leur minimum de 1.
        const finalResult = isInitiative
            ? natural + modifier
            : natural === 1 || natural === 20 ? natural : Math.max(1, natural + modifier);


        // On prépare le message Foundry sans encore le créer.
        const chatData = await roll.toMessage(
            {
                speaker: foundry.documents.ChatMessage.getSpeaker({
                    actor: this
                }),

                flavor:
                    `${flavor} — ${modeLabels[finalMode]}`,
                ...messageOptions
            },
            {
                create: false,
                messageMode
            }
        );


        // On garde le rendu natif de Foundry :
        // formule, détail des dés, tooltip, etc.
        let content = await roll.render();


        // On remplace uniquement le total par
        // le résultat final selon les règles Arcane Advent.
        content = content.replace(
            /(<h4 class="dice-total[^"]*">)([\s\S]*?)(<\/h4>)/,
            `$1${finalResult}$3`
        );


        // On ajoute une classe uniquement si
        // le d20 RETENU est naturellement 20.
        if (!isInitiative && natural === 20) {
            content = content.replace(
                'class="dice-total"',
                'class="dice-total aa-natural-20"'
            );
        }

        // Même chose pour un 1 naturel.
        else if (!isInitiative && natural === 1) {
            content = content.replace(
                'class="dice-total"',
                'class="dice-total aa-natural-1"'
            );
        }


        chatData.content = content;


        if (createMessage) await foundry.documents.ChatMessage.create(chatData);


        return {
            roll,
            natural,
            modifier,
            total: finalResult,
            mode: finalMode,
            chatData
        };
    }


    async rollConsciousnessDie() {
        const formula = this.system.consciousnessDice.formula.trim();
        if (!formula || !foundry.dice.Roll.validate(formula)) {
            ui.notifications.warn("La formule des dés de conscience est invalide.");
            return;
        }

        const roll = new foundry.dice.Roll(formula, this.getRollData());
        await roll.evaluate();
        await roll.toMessage({
            speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this }),
            flavor: "Dé de conscience"
        });
        return roll;
    }


    async rollDeathSave() {
        const effects = resolveRollEffects(activeCharacterEffects(this), { type: "death" }, this.system.rollMode);
        const roll = new foundry.dice.Roll({ normal: "1d20", advantage: "2d20kh", disadvantage: "2d20kl" }[effects.mode]);
        await roll.evaluate();

        const natural = roll.dice[0].values[0];
        const success = natural === 20 || (natural !== 1 && natural + effects.bonus >= 11);
        const key = success ? "successes" : "failures";
        const count = natural === 20 ? 3 : natural === 1 ? 2 : 1;
        const value = Math.min(3, this.system.deathSaves[key] + count);
        await this.update({ [`system.deathSaves.${key}`]: value });

        const label = success ? "réussite" : "échec";
        await roll.toMessage({
            speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this }),
            flavor: `Contre-la-Mort — ${count} ${label}${count > 1 ? "s" : ""}${effects.bonus ? ` (bonus/malus ${effects.bonus})` : ""}`
        });
        return roll;
    }


    async rollInitiativeCheck(mode = this.system.rollMode ?? "normal", options = {}) {
        return this._rollD20(this.system.trackers.initiative, mode, "Jet d’initiative", { type: "initiative", ability: "dexterity" }, options);
    }


    async rollAbility(abilityKey, mode = this.system.rollMode ?? "normal") {
        const ability = this.system.abilities[abilityKey];

        if (!ability) return;

        const labels = {
            strength: "Force",
            dexterity: "Dextérité",
            constitution: "Constitution",
            intelligence: "Intelligence",
            wisdom: "Sagesse",
            charisma: "Charisme"
        };

        return this._rollD20(
            ability.modifier,
            mode,
            `Jet de ${labels[abilityKey]}`, { type: "ability", ability: abilityKey }
        );
    }


    async rollSavingThrow(abilityKey, mode = this.system.rollMode ?? "normal") {
        const savingThrow =
            this.system.savingThrows[abilityKey];

        if (!savingThrow) return;

        const labels = {
            strength: "Force",
            dexterity: "Dextérité",
            constitution: "Constitution",
            intelligence: "Intelligence",
            wisdom: "Sagesse",
            charisma: "Charisme"
        };

        return this._rollD20(
            savingThrow.total,
            mode,
            `Jet de sauvegarde de ${labels[abilityKey]}`, { type: "save", ability: abilityKey }
        );
    }


    async rollSkill(skillId, mode = this.system.rollMode ?? "normal") {
        const skill = this.items.get(skillId);

        if (!skill || skill.type !== "skill") {
            return;
        }

        const ability =
            this.system.abilities[skill.system.ability];

        if (!ability) {
            return;
        }

        const modifier =
            ability.modifier
            + skill.system.mastery;

        return this._rollD20(
            modifier,
            mode,
            `Jet de ${skill.name}`, { type: "skill", ability: skill.system.ability, skillId, skillName: skill.name }
        );
    }
    async rollAptitude(itemId, rollId, mode = this.system.rollMode ?? "normal") {
        const aptitude = this.items.get(itemId);
        if (aptitude?.type !== "aptitude" || !Object.hasOwn(aptitude.system.rolls, rollId)) return;
        if (aptitude.system.requireConditions && !sourceConditionsSatisfied(conditionActor(this), aptitude.system)) {
            ui.notifications.warn("Les conditions d'utilisation de cette aptitude ne sont pas remplies.");
            return;
        }

        const config = aptitude.system.rolls[rollId];
        const skill = this.items.get(config.skillId);
        const selectedAbilities = config.abilities?.size
            ? [...config.abilities]
            : config.ability ? [config.ability] : [];
        const ability = [...new Set(selectedAbilities)]
            .reduce((total, key) => total + (this.system.abilities[key]?.modifier ?? 0), 0);
        const mastery = skill?.type === "skill" ? skill.system.mastery : 0;
        const expertise = this.items.get(config.expertiseId);
        const bonus = expertise?.type === "expertise" && this._canApplyAptitudeExpertise(expertise)
            ? expertise.system.bonus
            : 0;
        const modifier = ability + mastery + bonus;
        const flavor = foundry.utils.escapeHTML(`${aptitude.name} — ${config.name}`);
        const formula = config.formula.trim();

        if (formula.toLowerCase() === "1d20") return this._rollD20(modifier, mode, flavor,
            { type: "aptitude", abilities: selectedAbilities, skillId: skill?.id, skillName: skill?.name });

        const customBonus = resolveRollEffects(activeCharacterEffects(this).filter(rule => rule.scope === "aptitude"),
            { type: "aptitude", abilities: selectedAbilities, skillId: skill?.id, skillName: skill?.name }).bonus;
        const customModifier = modifier + customBonus;
        const suffix = customModifier < 0 ? ` - ${Math.abs(customModifier)}` : customModifier > 0 ? ` + ${customModifier}` : "";
        const roll = new foundry.dice.Roll(formula + suffix, this.getRollData());
        await roll.evaluate();
        await roll.toMessage({
            speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this }),
            flavor
        });
        return roll;
    }

    _canApplyAptitudeExpertise(expertise) {
        if (expertise.system.domain === "other") return true;
        return this.items.some(item => expertiseMatches(expertise, item));
    }


    async rollWeaponAttack(
        weaponId,
        mode = this.system.rollMode ?? "normal"
    ) {
        const weapon = this.items.get(weaponId);

        if (!weapon || weapon.type !== "weapon") {
            return;
        }

        const ability =
            this.getWeaponAbilityData(weapon);

        const expertiseBonus =
            this.getExpertiseBonus(
                "weaponClass",
                weapon.system.weaponClass,
                weapon
            );


        const modifier =
            ability.modifier
            + expertiseBonus;

        return this._rollD20(
            modifier,
            mode,
            `Attaque — ${weapon.name}`, { type: "attack", ability: ability.key }
        );
    }

    async rollWeaponDamage(
        weaponId,
        {
            applyModifier = true,
            versatile = false,
            bonusAction = false
        } = {}
    ) {
        const weapon = this.items.get(weaponId);

        if (!weapon || weapon.type !== "weapon") {
            return;
        }


        const baseFormula = versatile
            ? weapon.system.versatile.damageFormula.trim()
            : weapon.system.damageFormula.trim();


        if (!baseFormula) {
            return;
        }


        const ability =
            this.getWeaponAbilityData(weapon);


        let formula = baseFormula;


        // Attaque bonus avec une arme Légère :
        // les bonus positifs sont ignorés,
        // mais un modificateur négatif reste appliqué.
        if (bonusAction) {

            if (ability.modifier < 0) {
                formula += ` - ${Math.abs(ability.modifier)}`;
            }
        }


        // Attaque normale : modificateur complet.
        else if (applyModifier) {

            if (ability.modifier > 0) {
                formula += ` + ${ability.modifier}`;
            }

            else if (ability.modifier < 0) {
                formula += ` - ${Math.abs(ability.modifier)}`;
            }
        }


        const roll =
            new foundry.dice.Roll(formula);

        await roll.evaluate();


        let flavor = `Dégâts — ${weapon.name}`;

        if (versatile) {
            flavor =
                `Dégâts polyvalents — ${weapon.name}`;
        }

        else if (bonusAction) {
            flavor =
                `Dégâts d'attaque bonus — ${weapon.name}`;
        }


        await roll.toMessage({
            speaker:
                foundry.documents.ChatMessage.getSpeaker({
                    actor: this
                }),

            flavor
        });


        return roll;
    }

    getWeaponAbilityData(weapon) {
        const strength =
            this.system.abilities.strength.modifier;

        const dexterity =
            this.system.abilities.dexterity.modifier;

        const finesse =
            weapon.system.properties.has("finesse");


        // Sans Finesse : toujours Force.
        if (!finesse) {
            return {
                key: "strength",
                label: "FOR",
                modifier: strength
            };
        }


        // Finesse : meilleur résultat entre FOR et DEX.
        if (dexterity > strength) {
            return {
                key: "dexterity",
                label: "DEX",
                modifier: dexterity
            };
        }


        // En cas d'égalité, on reste sur FOR.
        return {
            key: "strength",
            label: "FOR",
            modifier: strength
        };
    }

    getExpertiseBonus(domain, target, item = null) {
        // Une source réelle permet de vérifier toutes les propriétés, pas seulement la classe.
        const source = item ?? (typeof target === "object" ? target : null);
        if (source) return matchingExpertiseBonus([...this.items], source, domain);

        // Compatibilité des usages qui ne possèdent qu'un nom de classe.
        const name = String(target ?? "").trim();
        if (!name) return 0;
        const type = { weaponClass: "weapon", shieldClass: "shield",
            armorClass: "protection", toolObject: "object" }[domain];
        if (!type) return 0;
        const system = { equipped: true, properties: new Set() };
        system[domain] = name;
        if (domain === "toolObject") system.objectClass = name;
        return matchingExpertiseBonus([...this.items], { type, name, system }, domain);
    }

    getGuardStatistics(item) {
        if (!item) return null;

        const { strength, dexterity, constitution } = this.system.abilities;
        const expertiseBonus = item.type === "weapon"
            ? this.getExpertiseBonus("weaponClass", item.system.weaponClass, item)
            : item.type === "shield"
                ? this.getExpertiseBonus("shieldClass", item.system.shieldClass, item)
                : 0;

        const stats = guardValues(item, {
            strengthModifier: strength.modifier,
            dexterityModifier: dexterity.modifier,
            constitutionModifier: constitution.modifier,
            expertiseBonus
        });
        if (!stats) return null;

        const parts = [
            "10",
            `FOR (${signedModifier(strength.modifier)})`,
            item.type === "weapon"
                ? `DEX (${signedModifier(dexterity.modifier)})`
                : `CON (${signedModifier(constitution.modifier)})`,
            ...(item.type === "shield" ? [`Défense du bouclier (${signedModifier(item.system.defenseBonus)})`] : []),
            `Expertise (${signedModifier(expertiseBonus)})`
        ];
        return { ...stats, calculation: `${parts.join(" + ")} = ${stats.defense}` };
    }

    // Compatibilité avec les macros qui récupèrent déjà le modificateur du JS de Garde.
    getGuardModifier(item) {
        return this.getGuardStatistics(item)?.savingThrowModifier ?? null;
    }


    async rollGuard(itemId, mode = this.system.rollMode ?? "normal") {
        const item = this.items.get(itemId);
        const stats = this.getGuardStatistics(item);
        if (!stats || !canRollGuard(this, item)) return;

        // Un clic lance uniquement le JS de Garde (et non la Défense fixe).
        return this._rollD20(stats.savingThrowModifier, mode,
            foundry.utils.escapeHTML("Jet de sauvegarde de Garde — " + item.name), { type: "guard", ability: "strength" });
    }
}

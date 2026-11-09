import { buildInventory, canPlaceInContainer, EQUIPMENT_TYPES, isInventoryItem } from "../inventory.mjs";
import { getEquipmentConflictType } from "./item.mjs";

const EXPERTISE_EQUIPMENT_TYPES = {
    weaponClass: ["weapon"],
    shieldClass: ["shield"],
    armorClass: ["protection"],
    toolObject: ["weapon", "shield", "protection", "accessory"]
};

export class ArcaneActor extends Actor {

    #inventoryOperation = Promise.resolve();

    get inventory() {
        return buildInventory(this.items);
    }

    // Resolve destinations and equipment conflicts against the latest local state.
    #queueInventoryOperation(callback) {
        const operation = this.#inventoryOperation.then(callback);
        this.#inventoryOperation = operation.catch(() => {});
        return operation;
    }

    moveInventoryItem(itemId, containerId) {
        return this.updateInventoryItem(itemId, { "system.containerId": containerId });
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
                if (conflictType && (system.equipped || Object.hasOwn(system, "properties"))) {
                    for (const other of this.items) {
                        if (other.type !== conflictType || !other.system.equipped) continue;
                        if (conflictType === "weapon" && !other.system.properties.has("twoHanded")) continue;
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
        const maximum = this.system.consciousness.max;

        const newValue = Math.min(
            maximum,
            Math.max(0, current + amount)
        );

        await this.update({
            "system.consciousness.value": newValue
        });

        return newValue;
    }

    async _rollD20(modifier, mode, flavor) {
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


        let finalResult;


        // 1 et 20 naturels :
        // les modificateurs sont ignorés.
        if (natural === 1 || natural === 20) {
            finalResult = natural;
        }

        // Sinon : d20 + modificateur,
        // avec un minimum absolu de 1.
        else {
            finalResult = Math.max(
                1,
                natural + modifier
            );
        }


        // On prépare le message Foundry sans encore le créer.
        const chatData = await roll.toMessage(
            {
                speaker: foundry.documents.ChatMessage.getSpeaker({
                    actor: this
                }),

                flavor:
                    `${flavor} — ${modeLabels[finalMode]}`
            },
            {
                create: false
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
        if (natural === 20) {
            content = content.replace(
                'class="dice-total"',
                'class="dice-total aa-natural-20"'
            );
        }

        // Même chose pour un 1 naturel.
        else if (natural === 1) {
            content = content.replace(
                'class="dice-total"',
                'class="dice-total aa-natural-1"'
            );
        }


        chatData.content = content;


        await foundry.documents.ChatMessage.create(
            chatData
        );


        return {
            roll,
            natural,
            modifier,
            total: finalResult,
            mode: finalMode
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
        const roll = new foundry.dice.Roll("1d20");
        await roll.evaluate();

        const success = roll.total >= 11;
        const key = success ? "successes" : "failures";
        const count = roll.total === 20 ? 3 : roll.total === 1 ? 2 : 1;
        const value = Math.min(3, this.system.deathSaves[key] + count);
        await this.update({ [`system.deathSaves.${key}`]: value });

        const label = success ? "réussite" : "échec";
        await roll.toMessage({
            speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this }),
            flavor: `Contre-la-Mort — ${count} ${label}${count > 1 ? "s" : ""}`
        });
        return roll;
    }


    async rollInitiativeCheck(mode = "normal") {
        return this._rollD20(this.system.trackers.initiative, mode, "Jet d’initiative");
    }


    async rollAbility(abilityKey, mode = "normal") {
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
            `Jet de ${labels[abilityKey]}`
        );
    }


    async rollSavingThrow(abilityKey, mode = "normal") {
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
            `Jet de sauvegarde de ${labels[abilityKey]}`
        );
    }


    async rollSkill(skillId, mode = "normal") {
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
            `Jet de ${skill.name}`
        );
    }
    async rollAptitude(itemId, rollId, mode = "normal") {
        const aptitude = this.items.get(itemId);
        if (aptitude?.type !== "aptitude" || !Object.hasOwn(aptitude.system.rolls, rollId)) return;

        const config = aptitude.system.rolls[rollId];
        const skill = this.items.get(config.skillId);
        const ability = this.system.abilities[config.ability]?.modifier ?? 0;
        const mastery = skill?.type === "skill" ? skill.system.mastery : 0;
        const expertise = this.items.get(config.expertiseId);
        const bonus = expertise?.type === "expertise" && this._canApplyAptitudeExpertise(expertise)
            ? expertise.system.bonus
            : 0;
        const modifier = ability + mastery + bonus;
        const flavor = foundry.utils.escapeHTML(`${aptitude.name} — ${config.name}`);
        const formula = config.formula.trim();

        if (formula.toLowerCase() === "1d20") return this._rollD20(modifier, mode, flavor);

        const suffix = modifier < 0 ? ` - ${Math.abs(modifier)}` : modifier > 0 ? ` + ${modifier}` : "";
        const roll = new foundry.dice.Roll(formula + suffix, this.getRollData());
        await roll.evaluate();
        await roll.toMessage({
            speaker: foundry.documents.ChatMessage.getSpeaker({ actor: this }),
            flavor
        });
        return roll;
    }

    _canApplyAptitudeExpertise(expertise) {
        const { domain, target } = expertise.system;
        if (!Object.hasOwn(EXPERTISE_EQUIPMENT_TYPES, domain)) return domain === "other";

        const normalized = target.trim().toLowerCase();
        if (!normalized) return false;

        return this.items.some(item => {
            if (!item.system.equipped || !EXPERTISE_EQUIPMENT_TYPES[domain].includes(item.type)) return false;
            const equipmentTarget = domain === "toolObject" ? item.name : item.system[domain];
            return equipmentTarget?.trim().toLowerCase() === normalized;
        });
    }


    async rollWeaponAttack(
        weaponId,
        mode = "normal"
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
                weapon.system.weaponClass
            );


        const modifier =
            ability.modifier
            + expertiseBonus;

        return this._rollD20(
            modifier,
            mode,
            `Attaque — ${weapon.name}`
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

    getExpertiseBonus(domain, target) {
        const normalizedTarget =
            target?.trim().toLowerCase();

        if (!normalizedTarget) {
            return 0;
        }


        return this.items
            .filter(item =>
                item.type === "expertise"
                && item.system.domain === domain
                && item.system.target
                    .trim()
                    .toLowerCase() === normalizedTarget
            )
            .reduce(
                (total, expertise) =>
                    total + expertise.system.bonus,
                0
            );
    }

    getGuardModifier(item) {
        if (!item?.system.equipped || !item.system.guardEnabled) return null;

        const { strength, dexterity, constitution } = this.system.abilities;
        if (item.type === "weapon" && item.system.properties.has("twoHanded")) {
            return strength.modifier + Math.min(dexterity.modifier, 0)
                + this.getExpertiseBonus("weaponClass", item.system.weaponClass);
        }

        if (item.type === "shield") {
            return strength.modifier + Math.min(constitution.modifier, 0)
                + item.system.defenseBonus
                + this.getExpertiseBonus("shieldClass", item.system.shieldClass);
        }

        return null;
    }


    async rollGuard(itemId, mode = "normal") {
        const item = this.items.get(itemId);
        const modifier = this.getGuardModifier(item);
        if (modifier === null) return;

        return this._rollD20(modifier, mode, foundry.utils.escapeHTML("Garde — " + item.name));
    }
}

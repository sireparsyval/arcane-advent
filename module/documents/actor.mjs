export class ArcaneActor extends Actor {

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
}
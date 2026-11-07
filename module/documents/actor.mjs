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


        // On lance uniquement le ou les d20.
        const roll = new foundry.dice.Roll(
            formulas[finalMode]
        );

        await roll.evaluate();


        // "values" ne contient que les résultats encore actifs.
        // Donc avec kh/kl, on récupère directement le d20 conservé.
        const natural = roll.dice[0].values[0];


        let finalResult;
        let modifierApplied = true;


        // 1 et 20 naturels ignorent TOUS les modificateurs.
        if (natural === 1 || natural === 20) {
            finalResult = natural;
            modifierApplied = false;
        }

        // Sinon : d20 + modificateur, avec minimum 1.
        else {
            finalResult = Math.max(
                1,
                natural + modifier
            );
        }


        const modifierText =
            modifier >= 0
                ? `+${modifier}`
                : `${modifier}`;


        let formulaText;

        if (!modifierApplied) {
            formulaText =
                `${natural} naturel — modificateurs ignorés`;
        }
        else {
            formulaText =
                `${natural} ${modifierText}`;

            if (natural + modifier < 1) {
                formulaText += " — minimum 1";
            }
        }


        // On garde le vrai jet Foundry pour pouvoir voir
        // les dés individuels, notamment avec avantage/désavantage.
        const tooltip = await roll.getTooltip();


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


        // On remplace simplement l'affichage du résultat
        // par notre calcul Arcane Advent.
        chatData.content = `
            <div class="dice-roll">
                <div class="dice-result">

                    <div class="dice-formula">
                        ${formulaText}
                    </div>

                    <div class="dice-tooltip">
                        ${tooltip}
                    </div>

                    <h4 class="dice-total">
                        ${finalResult}
                    </h4>

                </div>
            </div>
        `;


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
            `Jet de sauvegarde de ${labels[abilityKey]}`
        );
    }
}
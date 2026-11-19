export class ArcaneCombat extends foundry.documents.Combat {
    /** Use the sheet's initiative rules for both individual and grouped tracker rolls. */
    async rollInitiative(ids, { formula = null, updateTurn = true, messageMode, messageOptions = {} } = {}) {
        // An explicit API formula remains a deliberate override of the system roll.
        if (formula) return super.rollInitiative(ids, { formula, updateTurn, messageMode, messageOptions });
        ids = typeof ids === "string" ? [ids] : ids;
        messageOptions = { ...messageOptions };
        if ("rollMode" in messageOptions) {
            messageMode = foundry.dice.Roll._mapLegacyRollMode(messageOptions.rollMode);
            delete messageOptions.rollMode;
        }

        const updates = [], messages = [];
        for (const id of ids) {
            const combatant = this.combatants.get(id);
            if (!combatant?.isOwner) continue;

            // combatant.actor also resolves the synthetic actor of an unlinked token.
            const actor = combatant.actor;
            const visibility = messageMode ?? (combatant.hidden ? "gm" : undefined);
            const messageData = foundry.utils.mergeObject({
                speaker: foundry.documents.ChatMessage.getSpeaker({ actor, token: combatant.token, alias: combatant.name }),
                flags: { "core.initiativeRoll": true }
            }, messageOptions);

            let total, chatData;
            if (["character", "npc"].includes(actor?.type)) {
                const result = await actor.rollInitiativeCheck(undefined, {
                    createMessage: false, messageMode: visibility, messageOptions: messageData
                });
                total = result?.total;
                chatData = result?.chatData;
            } else {
                // Preserve Foundry support for combatants without a character sheet.
                const roll = combatant.getInitiativeRoll();
                await roll.evaluate();
                total = roll.total;
                chatData = await roll.toMessage({
                    flavor: game.i18n.format("COMBAT.RollsInitiative", { name: foundry.utils.escapeHTML(combatant.name) }),
                    ...messageData
                }, { create: false, messageMode: visibility });
            }
            if (!Number.isFinite(total) || !chatData) continue;

            updates.push({ _id: id, initiative: total });
            if (messages.length) chatData.sound = null;
            messages.push(chatData);
        }
        if (!updates.length) return this;

        // v14 preserves the current combatant while re-sorting the initiative order.
        const updateOptions = { turnEvents: false };
        if (!updateTurn) updateOptions.combatTurn = this.turn;
        await this.updateEmbeddedDocuments("Combatant", updates, updateOptions);
        await foundry.documents.ChatMessage.create(messages);
        return this;
    }
}

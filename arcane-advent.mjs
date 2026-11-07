import { CharacterData } from "./module/data/character-data.mjs";
import { WeaponData } from "./module/data/weapon-data.mjs";
import { SkillData } from "./module/data/skill-data.mjs";

import { ArcaneActor } from "./module/documents/actor.mjs";
import { ArcaneItem } from "./module/documents/item.mjs";

import { ArcaneCharacterSheet } from "./module/applications/actor/character-sheet.mjs";


Hooks.once("init", () => {
    console.log("Arcane Advent | Initialisation");

    CONFIG.Actor.documentClass = ArcaneActor;
    CONFIG.Item.documentClass = ArcaneItem;

    CONFIG.Actor.dataModels.character = CharacterData;
    CONFIG.Actor.dataModels.npc = CharacterData;

    CONFIG.Item.dataModels.weapon = WeaponData;
    CONFIG.Item.dataModels.skill = SkillData;

    CONFIG.Actor.trackableAttributes = {
        character: {
            bar: [
                "consciousness",
                "fever"
            ],
            value: []
        },

        npc: {
            bar: [
                "consciousness",
                "fever"
            ],
            value: []
        }
    };


    const DocumentSheetConfig =
        foundry.applications.apps.DocumentSheetConfig;

    DocumentSheetConfig.registerSheet(
        foundry.documents.Actor,
        "arcane-advent",
        ArcaneCharacterSheet,
        {
            types: ["character"],
            makeDefault: true
        }
    );
});


Hooks.once("ready", () => {
    console.log("Arcane Advent | Ready");
});
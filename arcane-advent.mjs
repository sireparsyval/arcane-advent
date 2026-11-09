import { CharacterData, PlayerCharacterData } from "./module/data/character-data.mjs";
import { WeaponData } from "./module/data/weapon-data.mjs";
import { ShieldData } from "./module/data/shield-data.mjs";
import { ProtectionData } from "./module/data/protection-data.mjs";
import { AccessoryData } from "./module/data/accessory-data.mjs";

import { SkillData } from "./module/data/skill-data.mjs";
import { ExpertiseData } from "./module/data/expertise-data.mjs";
import { AlterationData, InjuryData } from "./module/data/condition-data.mjs";
import { AptitudeData } from "./module/data/aptitude-data.mjs";

import { ArcaneActor } from "./module/documents/actor.mjs";
import { ArcaneItem } from "./module/documents/item.mjs";

import { ArcaneCharacterSheet } from "./module/applications/actor/character-sheet.mjs";


Hooks.once("init", () => {
    console.log("Arcane Advent | Initialisation");

    CONFIG.Actor.documentClass = ArcaneActor;
    CONFIG.Item.documentClass = ArcaneItem;

    CONFIG.Actor.dataModels.character = PlayerCharacterData;
    CONFIG.Actor.dataModels.npc = CharacterData;

    CONFIG.Item.dataModels.weapon = WeaponData;
    CONFIG.Item.dataModels.shield = ShieldData;
    CONFIG.Item.dataModels.protection = ProtectionData;
    CONFIG.Item.dataModels.accessory = AccessoryData;

    CONFIG.Item.dataModels.skill = SkillData;
    CONFIG.Item.dataModels.expertise = ExpertiseData;
    CONFIG.Item.dataModels.alteration = AlterationData;
    CONFIG.Item.dataModels.injury = InjuryData;
    CONFIG.Item.dataModels.aptitude = AptitudeData;

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
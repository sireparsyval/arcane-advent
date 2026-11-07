import { CharacterData } from "./module/data/character-data.mjs";
import { WeaponData } from "./module/data/weapon-data.mjs";

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

    CONFIG.Actor.trackableAttributes = {
        character: {
            bar: ["consciousness"],
            value: []
        }
    };
});


Hooks.once("ready", () => {
    console.log("Arcane Advent | Ready");
});
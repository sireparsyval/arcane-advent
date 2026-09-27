import { CharacterData } from "./module/data/character-data.mjs";
import { WeaponData } from "./module/data/weapon-data.mjs";

import { ArcaneActor } from "./module/documents/actor.mjs";
import { ArcaneItem } from "./module/documents/item.mjs";


Hooks.once("init", () => {

    CONFIG.Actor.documentClass = ArcaneActor;
    CONFIG.Item.documentClass = ArcaneItem;

    CONFIG.Actor.dataModels.character = CharacterData;
    CONFIG.Item.dataModels.weapon = WeaponData;

});

import { CharacterData } from "./module/data/character-data.mjs";


Hooks.once("init", () => {
    CONFIG.Actor.dataModels.character = CharacterData;
});
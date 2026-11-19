import { CharacterData, PlayerCharacterData } from "./module/data/character-data.mjs";
import { WeaponData } from "./module/data/weapon-data.mjs";
import { ShieldData } from "./module/data/shield-data.mjs";
import { ProtectionData } from "./module/data/protection-data.mjs";
import { AccessoryData } from "./module/data/accessory-data.mjs";
import { ObjectData, ContainerData, PurseData } from "./module/data/inventory-data.mjs";
import { INVENTORY_TYPES } from "./module/inventory.mjs";
import { StorageData, StorageItemData } from "./module/data/storage-data.mjs";
import { ArcaneStorageSheet, ArcaneStorageItemSheet } from "./module/applications/actor/storage-sheet.mjs";
import { registerStorageService } from "./module/storage.mjs";
import { migrateStorageActors, migrateStorageImages } from "./module/storage-migration.mjs";
import { registerStorageDirectory, StorageDirectory } from "./module/applications/storage-directory.mjs";

import { SkillData } from "./module/data/skill-data.mjs";
import { ExpertiseData } from "./module/data/expertise-data.mjs";
import { AlterationData, InjuryData } from "./module/data/condition-data.mjs";
import { AptitudeData } from "./module/data/aptitude-data.mjs";
import { TraitData } from "./module/data/trait-data.mjs";

import { ArcaneActor } from "./module/documents/actor.mjs";
import { ArcaneItem } from "./module/documents/item.mjs";

import { ArcaneCharacterSheet } from "./module/applications/actor/character-sheet.mjs";
import { ArcaneInventoryItemSheet } from "./module/applications/item/inventory-item-sheet.mjs";
import { registerArcaneHotbar, runArcaneShortcut } from "./module/shortcuts.mjs";
import { registerArcaneText } from "./module/arcane-text.mjs";
import { GlyphData } from "./module/data/glyph-data.mjs";
import { GlyphSheet } from "./module/applications/item/glyph-sheet.mjs";
import { registerGlyphCatalog } from "./module/applications/glyph-catalog.mjs";
import { registerTokenBars } from "./module/token-bars.mjs";
import { CharacterEffectItemSheet } from "./module/applications/item/character-effect-sheet.mjs";


Hooks.once("init", () => {
    console.log("Arcane Advent | Initialisation");

    game.arcaneAdvent = { runShortcut: runArcaneShortcut };
    game.arcaneAdvent.openStorages = () => new StorageDirectory().render({ force: true });
    registerStorageService();
    registerStorageDirectory();
    registerArcaneHotbar();
    registerArcaneText();
    registerGlyphCatalog();
    registerTokenBars();

    CONFIG.Actor.documentClass = ArcaneActor;
    CONFIG.Item.documentClass = ArcaneItem;

    CONFIG.Actor.dataModels.character = PlayerCharacterData;
    CONFIG.Actor.dataModels.npc = CharacterData;
    CONFIG.Actor.dataModels.storage = StorageData;

    CONFIG.Item.dataModels.weapon = WeaponData;
    CONFIG.Item.dataModels.shield = ShieldData;
    CONFIG.Item.dataModels.protection = ProtectionData;
    CONFIG.Item.dataModels.accessory = AccessoryData;
    CONFIG.Item.dataModels.object = ObjectData;
    CONFIG.Item.dataModels.container = ContainerData;
    CONFIG.Item.dataModels.purse = PurseData;
    CONFIG.Item.dataModels.storage = StorageItemData;

    CONFIG.Item.dataModels.skill = SkillData;
    CONFIG.Item.dataModels.expertise = ExpertiseData;
    CONFIG.Item.dataModels.alteration = AlterationData;
    CONFIG.Item.dataModels.injury = InjuryData;
    CONFIG.Item.dataModels.aptitude = AptitudeData;
    CONFIG.Item.dataModels.trait = TraitData;
    CONFIG.Item.dataModels.glyph = GlyphData;

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
            types: ["character", "npc"],
            makeDefault: true
        }
    );
    DocumentSheetConfig.registerSheet(
        foundry.documents.Item,
        "arcane-advent",
        ArcaneInventoryItemSheet,
        {
            types: INVENTORY_TYPES,
            makeDefault: true,
            label: "Arcane Advent — Inventaire"
        }
    );
    DocumentSheetConfig.registerSheet(foundry.documents.Actor, "arcane-advent", ArcaneStorageSheet, {
        types: ["storage"], makeDefault: true, label: "Arcane Advent — Stockage"
    });
    DocumentSheetConfig.registerSheet(foundry.documents.Item, "arcane-advent", ArcaneStorageItemSheet, {
        types: ["storage"], makeDefault: true, label: "Arcane Advent — Stockage"
    });
    DocumentSheetConfig.registerSheet(foundry.documents.Item, "arcane-advent", GlyphSheet, {
        types: ["glyph"], makeDefault: true, label: "Arcane Advent — Référence de glyphe"
    });
    DocumentSheetConfig.registerSheet(foundry.documents.Item, "arcane-advent", CharacterEffectItemSheet, {
        types: ["trait", "aptitude"], makeDefault: true, label: "Arcane Advent — Traits et Aptitudes"
    });
});


Hooks.once("ready", async () => {
    console.log("Arcane Advent | Ready");
    await migrateStorageActors();
    await migrateStorageImages();
});

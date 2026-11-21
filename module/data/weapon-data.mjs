const {
    BooleanField,
    NumberField,
    SchemaField,
    SetField,
    StringField
} = foundry.data.fields;

import { EquipmentData } from "./equipment-data.mjs";


export class WeaponData extends EquipmentData {

    static migrateData(source, options) {
        if (source.guardEnabled) {
            source.properties = [...new Set([...(source.properties ?? []), "guard"])];
            source.guardEnabled = false;
        }
        return super.migrateData(source, options);
    }

    static defineSchema() {
        return {
            ...super.defineSchema(),

            weaponClass: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            }),

            damageFormula: new StringField({
                required: true,
                nullable: false,
                blank: true,
                initial: ""
            }),

            damageTypes: new SetField(
                new StringField({
                    required: true,
                    nullable: false,
                    blank: false
                }),
                {
                    required: true,
                    nullable: false,
                    initial: []
                }
            ),

            // Ancien indicateur conservé uniquement pour convertir les armes existantes.
            guardEnabled: new BooleanField({
                required: true,
                nullable: false,
                initial: false
            }),

            range: new NumberField({
                required: true,
                nullable: false,
                min: 0,
                initial: 0
            }),


            // Paramètres utilisés si propriété "Lancer".
            thrown: new SchemaField({

                normalRange: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0
                }),

                longRange: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0
                })
            }),


            // Paramètres utilisés si propriété "Lourde".
            heavy: new SchemaField({

                strengthRequirement: new NumberField({
                    required: true,
                    nullable: false,
                    integer: true,
                    min: 0,
                    initial: 0
                })
            }),


            // Paramètres utilisés si propriété "Polyvalente".
            versatile: new SchemaField({

                damageFormula: new StringField({
                    required: true,
                    nullable: false,
                    blank: true,
                    initial: ""
                })
            }),


            // Distance (clé historique conservée), chargement et consommation.
            ammunition: new SchemaField({
                enabled: new BooleanField({ initial: false }),
                itemId: new StringField({ initial: "", blank: true }),
                quantity: new NumberField({ initial: 1, min: 1, integer: true, required: true, nullable: false }),

                normalRange: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0
                }),

                longRange: new NumberField({
                    required: true,
                    nullable: false,
                    min: 0,
                    initial: 0
                }),

                loading: new BooleanField({
                    required: true,
                    nullable: false,
                    initial: false
                })
            })
        };
    }
}

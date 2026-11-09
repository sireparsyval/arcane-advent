export const ARCANE_DAMAGE_TYPES = [
    {
        id: "slashing",
        label: "Tranchant"
    },
    {
        id: "piercing",
        label: "Perforant"
    },
    {
        id: "bludgeoning",
        label: "Contondant"
    }
];

export const ARCANE_NEEDS = {
    hunger: {
        label: "Faim",
        stages: ["Inanition", "Faim extrême", "Affamé", "Faim marquée", "Petit creux", "Rassasié"]
    },
    thirst: {
        label: "Soif",
        stages: ["Soif critique", "Déshydraté", "Assoiffé", "Bouche sèche", "Un peu soif", "Hydraté"]
    },
    hygiene: {
        label: "Hygiène",
        stages: ["Souillé", "Crasseux", "Sale", "En sueur", "Poussiéreux", "Propre"]
    },
    fatigue: {
        label: "Fatigue",
        stages: ["À peine éveillé", "Épuisé", "Somnolent", "Paupières lourdes", "Un peu las", "Reposé"]
    },
    morale: {
        label: "Moral",
        stages: ["Désespéré", "Démoralisé", "Découragé", "Douteux", "Préoccupé", "Confiant"]
    },
    climate: {
        label: "Climat",
        stages: ["Insupportable", "Éprouvant", "Pénible", "Inconfortable", "Un peu gênant", "À l’aise"]
    }
};
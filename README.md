# arcane-advent

## Fiche personnage (Foundry VTT 14)

### Expertises
Chaque Expertise est présentée sur une seule ligne : **Nom · Niveau/bonus · Options · Supprimer**.
Le menu **Options** permet de définir un domaine, plusieurs noms de classe (un nom par ligne),
les propriétés des armes à **Requis / Neutre / À exclure**, et le niveau du bonus.
Les classes sont alternatives (**OU**) ; toutes les propriétés requises doivent être présentes
(**ET**) et aucune propriété exclue ne doit être présente. Une Expertise n'est comptée
**qu'une seule fois par objet**, même si plusieurs critères correspondent ; plusieurs
Expertises distinctes peuvent se cumuler. Les anciennes fiches à cible unique sont
conservées et leur champ `target` est toujours reconnu.

Les objets de l'inventaire peuvent désormais recevoir une **Classe d'objet** depuis
leur fiche d'édition. Les propriétés d'armes utilisées par l'éditeur d'Expertise
sont partagées avec celles de l'éditeur d'équipement.

### Aptitudes
Les Passifs n'affichent pas de niveau ; les autres Aptitudes conservent leur
niveau comme coût en PdF (aucun coût ou effet critique n'est automatiquement appliqué).
La Description déroulante reste libre pour préciser les effets conditionnels.

Le bouton **Options** ouvre les sections :
- **Contraintes** : charges, récupération, incantation ; uniquement pour Sort, Hybride et Passif ;
- **Conditions** : indicateurs manuels ou automatiques, sans blocage des jets ;
- **Effets** : durée, nombre de cibles, forme, dimensions, portée, origine et propagation ;
- **Jets** : formules personnalisables avec plusieurs modificateurs de caractéristiques,
  une Compétence et/ou une Expertise.

Une condition peut tester les PdC/PdF (en %), une caractéristique, une altération,
un objet équipé, une Expertise applicable, une quantité d'objets ou une dénomination
de Luqa. Le type « Formule » utilise un mini-langage **sans JavaScript** :
`pdc < pdcMax * 0.5 && FOR >= 14`. Variables disponibles :
`pdc`, `pdcMax`, `pdf`, `pdfMax`, `FOR`, `DEX`, `CON`, `INT`,
`SAG`, `CHA` (caractéristiques effectives).

Les indicateurs automatiques sont calculés à partir de la fiche ;
un clic ouvre leur configuration. Les indicateurs manuels se cochent à la main.
**Aucune condition n'interdit le jet.** L'option « consommer des objets / Luqa »
n'est qu'un **rappel** pour les joueurs et le MJ : elle ne débite rien automatiquement.

### Raccourcis de jets : barre native Foundry
1. Ouvrir une fiche personnage et repérer le **bouton d'un jet**.
2. **Glisser le bouton** vers un emplacement de la barre de raccourcis,
   en bas de Foundry.
3. Un raccourci de macro appelle le même jet sur le personnage d'origine,
   avec sa formule et ses bonus actuels (les modifications de la fiche se reflètent
   automatiquement au prochain lancer).

Les jets d'Aptitudes, d'armes, de Garde, de Compétences, de caractéristiques,
les jets de sauvegarde, l'initiative et la Conscience sont pris en charge.
Les raccourcis restent attachés au **personnage d'origine** et à l'ID du jet :
si l'élément est supprimé, il ne retrouve pas automatiquement un remplacement.
La création/exécution de macros de script nécessite les permissions Foundry
correspondantes pour les joueurs concernés.

> **Esprit de conception :** automatiser les calculs utiles et l'affichage,
> jamais l'interprétation des actions, critiques, postures ou conséquences narratives.

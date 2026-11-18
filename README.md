# arcane-advent

## Objets au sol et stockages

Après une mise à jour du système, redémarrer le monde pour charger le nouveau
type d’acteur **Stockage**.

Dans l’onglet **Équipement**, les boutons **Transférer…** et **Déposer au sol…**
ouvrent la sélection des objets, équipements et quantités à déplacer.
Sélectionner un contenant emporte tout son contenu, y compris ses sous-contenants.
Les équipements transférés arrivent non équipés. Les bourses gardent leurs Luqa.

Pour donner ou récupérer des objets, cibler **un seul jeton destinataire** sur la
scène, ouvrir l’inventaire source et cliquer sur **Transférer…**. Le destinataire
peut être un personnage, un PNJ ou un stockage. Un MJ doit être connecté pour
traiter les échanges ; les joueurs n’ont pas besoin de modifier les permissions
du personnage destinataire. Ils ne peuvent donner que les objets de leurs propres
personnages, ou prendre ceux d’un stockage ouvert accessible sur leur scène.

**Déposer au sol…** crée un sac à côté du jeton de l’inventaire source. Les objets
quittent cet inventaire et restent disponibles dans le sac. Double-cliquer sur
le sac ouvre son inventaire. Pour récupérer son contenu, cibler son personnage
puis transférer depuis le sac. Un sac vide reste en place jusqu’à sa suppression
par le MJ. Supprimer un jeton ne supprime pas l’inventaire conservé dans le monde.

Le bouton **Stockages** du répertoire des acteurs et le menu **Stockages** dans
les paramètres du système regroupent les stockages accessibles. Le MJ peut en
créer, les placer sur la scène, les renommer, changer leur image et verrouiller
les échanges des joueurs. Les stockages reposent sur des acteurs dédiés et
leurs jetons sont liés : placer plusieurs jetons du même stockage donne plusieurs
accès au même contenu. Créer un nouveau stockage pour un coffre indépendant.
Le MJ peut ajouter des objets depuis cette fiche ou y glisser des Items du
répertoire/compendium. Utiliser **Transférer…** pour les objets d’un personnage.

L’image par défaut est `assets/Arcane Advent/Entités/Objets/item.png`, réglable
dans **Image des dépôts au sol**. Chaque stockage peut ensuite recevoir sa propre
image ; sa modification se répercute sur ses jetons liés.

Les transferts sont traités un à un par le MJ, avec remappage des identifiants
de contenants, verrouillage temporaire et compensation des écritures échouées.
Une coupure complète du MJ pendant l’écriture nécessite une vérification des
deux inventaires avant de recommencer. Le menu Stockages permet au MJ de
débloquer une opération interrompue après cette vérification.

Validation automatisée : `node --test tests/*.test.mjs`.
Pour vérifier dans Foundry : essayer un don entre deux comptes joueurs, une pile
partielle, un contenant imbriqué avec une bourse, sa dépose puis sa récupération,
un stockage verrouillé, un jeton non lié et deux récupérations simultanées du
dernier objet. Vérifier les quantités et la charge des deux côtés.

## Mode PNJ compact

Les nouveaux acteurs de type **PNJ** sont créés directement en mode compact.
Le choix explicite d'une fiche complète reste conservé lors d'une copie ou d'un import.

Dans **Options**, activer **Mode PNJ compact** pour réunir les informations de jeu
sur une seule vue : PdC/PdF, Barrière, Dés de Conscience, Défense, mobilité,
caractéristiques et sauvegardes, attaques, Aptitudes, Traits, Compétences,
Expertises et conditions. Les jets et leurs raccourcis restent utilisables.
Les armes équipées peuvent être utilisées et modifiées directement dans cette vue.
Les boutons **Bonus/malus** près des caractéristiques et des Trackers ouvrent
directement les ajustements manuels correspondants. Saisir une valeur négative
pour un malus, positive pour un bonus.

Les onglets Équipement, Informations et Arcanologie ainsi que les détails d'identité,
les besoins, les jets contre la mort et la Miséricorde sont masqués.
**Options de la fiche**, en haut de la vue compacte, permet de désactiver le mode
et conserve l'accès aux bonus/malus manuels et aux réglages des sauvegardes.
Le choix est enregistré sur chaque acteur, sans modifier son type ou ses données.
L'inventaire, les biographies et les carnets sont conservés lors du changement de mode.
Cette fiche est disponible pour les acteurs **Personnage** et **PNJ**.

## Répertoire des glyphes du MJ

Dans l’onglet **Compendiums**, le bouton **Glyphes — MJ** ouvre les références
du monde. Il est également accessible dans les paramètres du système.
La première ouverture crée le compendium privé `world.arcane-glyphs` et les
entrées correspondant aux 16 symboles disponibles, avec leurs IDs.

Le MJ peut renseigner la signification, la prononciation, le schéma somatique,
la famille et ses notes. **Montrer le symbole au chat** partage uniquement l’ID
et son caractère visuel. Les références sont conservées dans le monde Foundry.

**Importer des références** accepte un fichier JSON privé sous la forme
`{"format":"arcane-advent.glyph-references","version":1,"glyphs":[{"glyphId":"G019","meaning":"…","pronunciation":"…"}]}`.
Les champs facultatifs sont `somatic`, `category` et `description`. Les champs
renseignés mettent à jour l’entrée du même ID. Les champs vides sont ignorés.
Le fichier d’import contenant les références réelles se conserve côté MJ.

La première colonne **Ordre** permet de définir un numéro pour chaque référence.
Modifier le numéro puis quitter le champ ou appuyer sur Entrée pour l’enregistrer.
Le répertoire s’ouvre sur cet ordre personnalisé ; cliquer sur un en-tête change
le tri et un second clic inverse son sens. Les nouveaux glyphes sont ajoutés à la fin.
Un numéro `sort` facultatif peut être inclus dans chaque entrée du JSON de références.
Un import privé au format `arcane-advent.glyph-order`, version `1`, avec des entrées
`{"glyphId":"G019","sort":1}`, met uniquement à jour l’ordre des références existantes.

## Carnet d’Arcanologie

L’onglet **Arcanologie** conserve les glyphes et Versets personnels de chaque
personnage. Les interprétations, prononciations, gestes et notes sont des saisies
libres. Les brouillons restent disponibles pendant que la fiche est ouverte,
y compris lors d’une mise à jour d’une autre partie de la fiche. Cliquer sur
**Enregistrer** pour les conserver durablement.

Le registre public `module/glyphs.mjs` associe uniquement les IDs stables aux
caractères visuels de la police **ArcaneGlyphs**. Les 16 premiers caractères sont
inclus avec leurs sources vectorielles dans `assets/glyphs/`. Les significations
et prononciations de référence peuvent être conservées dans des journaux dont
le MJ règle les permissions d’accès.

Les Versets conservent la formule saisie, ses regroupements et ses retours à
la ligne. Le bouton **Insérer** ajoute un ID du carnet à la position du curseur.
**Envoyer au chat** publie la formule actuellement affichée avec son nom personnel.
Une formule peut également être saisie directement dans un message ou un journal
avec `@AA[G019 G742]`. Les IDs restent enregistrés dans les messages et
s’affichent avec leur symbole dès qu’il est disponible. L’ancienne notation
`@Arcane[...]` reste reconnue dans les messages et journaux existants.

Pour ajouter un caractère, placer son SVG en contours pleins sur une page
`0 0 1000 1000` dans `assets/glyphs/`, puis lui attribuer un nouveau caractère
privé Unicode dans `GLYPH_CHARACTERS`. Conserver les associations déjà attribuées.
Installer `fonttools` et `brotli`, puis lancer
`python tools/build-glyph-font.py` pour reconstruire la police WOFF2.

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

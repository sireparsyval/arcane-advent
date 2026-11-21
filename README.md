# arcane-advent

## Traits, Aptitudes et effets permanents

Le bouton **Effets permanents** du Cœur (également présent dans Options) ouvre
les sources du personnage et le résultat actuel des Avantages/Désavantages par
type de jet. Le choix Avantage / Neutre / Désavantage de la fiche reste manuel :
il se combine avec les sources automatiques. Un Avantage et un Désavantage
s'annulent, même si plusieurs sources donnent l'un des deux. Ils ne se cumulent pas.

La roue dentée des Traits et le bouton **Effets** des Aptitudes ouvrent le même
éditeur. Il est aussi disponible pour ces Objets dans le répertoire. Les onglets
séparent les effets, leur activation, la description et le récapitulatif.
Les changements restent un brouillon jusqu'à **Enregistrer**.

- **Bonus / malus / coefficient** : caractéristiques, JS, Défense de base,
  chacune des quatre Défenses partielles, Perception passive, Initiative,
  Vitesse, dégâts sans arme, charge maximale et maxima de PdC/PdF/Dés de Conscience.
- **Effet sur les jets** : bonus fixe et indicateurs indépendants Avantage et
  Désavantage. Filtrer par famille de jet, caractéristique associée et compétence.
- **Réduction de dégâts** : montant fixe positif, pour tous les dégâts (type vide)
  ou un type précis, sur toutes les zones ou seulement Tête, Torse, Bras ou Jambes.
- **Résistance aux dégâts (%)** : même sélection de type et de zone, avec une
  valeur de 0 à 100 %. La plus forte résistance du même type est retenue par zone.
- **Activation** : permanente, aptitude passive, manuelle, durée d'effet restante
  ou conditions automatiques, réunies avec ET ou OU. Les effets d'une source
  peuvent aussi être désactivés sans supprimer leur configuration.

Les montants « avant » s'additionnent, puis les coefficients se multiplient,
puis les montants « après » s'ajoutent. L'ordre des Traits dans la fiche n'a
donc aucune influence. Les caractéristiques et valeurs entières sont arrondies
à l'inférieur ; la vitesse et les poids conservent les décimales. Les bonus aux
scores sont pris en compte dans leurs modificateurs et les calculs dépendants.
Un bonus à la Défense de base concerne toutes les zones ; un bonus à une Défense
partielle ne concerne que cette zone.

Dans Options, la charge maximale possède aussi son coefficient manuel (1 par
défaut) et une case **Ajouter le montant fixe avant la multiplication**.
Exemple avec une base de 50 kg, +10 kg et ×2 : 120 kg avant, 110 kg après.
Les règles des Traits/Aptitudes utilisent le même calcul, coefficients compris.

Les conditions proposent des cibles prises dans la fiche et affichent leur
lecture actuelle. Une présence d'équipement se règle avec **Oui / Non**, un nom
ou une classe ; un poids ou un score se compare à un seuil numérique. Pour
réutiliser un Trait sur d'autres personnages, préférer une classe ou un nom
personnalisé à l'identifiant d'un équipement précis. Les anciens critères de
présence numériques (ex. « équipement <= 50 ») sont signalés comme à reconfigurer.

Les conditions automatiques des effets lisent la fiche **avant les effets des
Traits et Aptitudes** (mais après les ajustements manuels, altérations et
blessures). Ainsi, un bonus conditionnel ne peut pas s'activer lui-même ni
osciller à chaque actualisation. Les critères d'Aptitude peuvent aussi devenir
obligatoires pour ses jets en cochant l'option correspondante.

Les effets de maximum ne changent pas les maxima de base ni les points actuels :
un total effectif apparaît sur la fiche et les barres des jetons utilisent ce
total pour PdC/PdF. Les Avantages/Désavantages s'appliquent aux jets standards de
d20 ; pour une formule d'Aptitude personnalisée autre que `1d20`, seul un bonus
fixe ciblant les jets d'Aptitude est ajouté, la formule écrite reste inchangée.

## Paramètres des nouveaux jetons

Un Actor Personnage ou PNJ nommé exactement **[TEMPLATE]** sert de modèle pour
les paramètres du prototype de jeton des nouveaux Actors créés avec **Créer un
acteur**. Régler son prototype depuis sa fiche : visibilité du nom et des barres,
liaison à l’Actor, image, dimensions, vision, lumière et autres options du jeton.
Le nouveau jeton porte le nom de son nouvel Actor. Seuls les paramètres du jeton
sont copiés, pas les caractéristiques, les objets ou les permissions du modèle.

Les modifications du modèle sont reprises à chaque nouvelle création. Les Actors
existants, les duplications et les imports conservant leur propre prototype ne
sont pas modifiés. Sans **[TEMPLATE]**, la création utilise les réglages habituels.

## Barres des jetons et Points de Fièvre

Les deux barres de ressources sont empilées sous les jetons. Le nom du jeton
et les champs de saisie du clic droit sont décalés pour rester lisibles.
Dans **Paramètres du système**, le MJ peut désactiver **Placer les deux barres
sous les jetons**, ou choisir les couleurs des **Points de Conscience** et des
**Points de Fièvre** sur les jetons. Les couleurs suivent la ressource choisie,
même si les emplacements Barre 1 et Barre 2 sont inversés. Ces réglages se
répercutent sur les jetons existants et conservent leurs règles de visibilité.

Les couleurs par défaut sont le rouge pour les PdC et le jaune pour les PdF.
Dans les fiches complètes, la barre de Points de Fièvre est également jaune.

## Barres des jetons

Les deux barres de ressources sont affichées sous le jeton, avec le nom décalé
pour éviter les chevauchements. Les champs du clic droit suivent cette disposition.
Les valeurs, maxima, attributs choisis et permissions d’affichage restent gérés
par Foundry.

Dans les paramètres du système, le MJ peut désactiver **Placer les deux barres
sous les jetons** ou choisir les couleurs des **Points de Conscience** et des
**Points de Fièvre** sur les jetons. Les couleurs par défaut sont rouge et jaune.
Elles suivent la ressource même si les emplacements Barre 1 et Barre 2 sont inversés.
Les changements s’appliquent aux jetons existants sur la scène.

La barre de Points de Fièvre des fiches complètes utilise également un dégradé jaune.

## Objets au sol et stockages

Après une mise à jour du système, redémarrer le monde pour charger le nouveau
type d’objet **Stockage / dépôt au sol** dans le répertoire **Objets**.
Les anciens acteurs de stockage sont convertis au chargement par le MJ : leur
contenu, leurs permissions et leurs jetons sont conservés.

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
puis transférer depuis le sac. L’option **Supprimer le dépôt s’il est vide après
le transfert**, décochée par défaut, supprime aussi l’Objet correspondant lorsque
le transfert a réussi et qu’il ne reste rien. Elle ne s’applique pas aux stockages
permanents. Supprimer seulement un jeton conserve son Objet dans le répertoire.

Le bouton **Stockages** du répertoire **Objets** et le menu **Stockages** dans
les paramètres du système regroupent les stockages accessibles. Le MJ peut en
créer, les placer sur la scène, les renommer, changer leur image et verrouiller
les échanges des joueurs. Le répertoire distingue les **Stockages permanents**
et les **Dépôts au sol**. Chacun est un Objet qui possède ses propres copies des
items contenus. Glisser un stockage du répertoire Objets sur la scène, ou utiliser
**Placer**. Plusieurs jetons du même Objet donnent accès au même contenu ; dupliquer
l’Objet crée un inventaire indépendant, contenant compris. Un unique Actor technique,
masqué dans le répertoire Acteurs, fournit les jetons natifs ciblables avec **T**.
Le MJ peut ajouter des objets depuis cette fiche ou y glisser des Items du
répertoire/compendium. Utiliser **Transférer…** pour les objets d’un personnage.

L’image par défaut est `assets/arcane-advent/entities/objects/item-stash.png`, réglable
dans **Image des dépôts au sol**. Chaque stockage peut ensuite recevoir sa propre
image ; sa modification se répercute sur ses jetons. Les options de chaque objet,
contenant ou équipement proposent aussi **Image du jeton au sol** : elle est utilisée
si l’objet est déposé seul, avec son contenu éventuel. Un lot de plusieurs objets
ou un objet sans image personnalisée utilise le sac par défaut.

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

### Réductions par zone

Survoler une Défense partielle (**Tête, Torse, Bras ou Jambes**) affiche les
réductions cumulées par type de dégâts des protections équipées couvrant cette
zone. Seuls les types ayant une réduction positive apparaissent, avec les noms,
montants et unités alignés en colonnes. L’infobulle est aussi accessible au clavier
et disponible sur les fiches PNJ compactes.

Les Effets actifs du personnage, de ses Traits et de ses Aptitudes y contribuent
aussi : les réductions fixes s’ajoutent à celles de l’équipement ; les résistances
s’affichent séparément en %. Une protection globale apparaît sur les quatre zones.
Les conditions et désactivations sont prises en compte. Les réductions propres au
bouclier restent dans son infobulle. Les dégâts restent appliqués manuellement.

Dans **Altérations d’État**, les boutons **−** et **+** entourent la durée restante
et la modifient d’une unité, sans changer l’unité choisie ni descendre sous zéro.

### Aptitudes
Une barre compacte entre **Statut** et **Aptitudes** regroupe les dégâts à mains
nues (1 + modificateur de Force, ajustés par les éventuels Effets sans arme), un
jet d’arme improvisée (1d4 + modificateur de Force) et les jets des armes équipées.
Le bouton 👊 est un simple repère sans menu, Expertise ni action bonus. Les armes
Légères proposent des dégâts bonus pour leur formule normale et polyvalente.

Le verrou 🔒 d’une arme en fait une **arme corporelle** : toujours équipée sur
le personnage, hors contenant et sans poids transporté. Déverrouiller permet
de la déséquiper ou de la transférer. Une arme **Lourde** impose un minimum sur la
valeur effective de la caractéristique utilisée pour attaquer ; en dessous, le
jet est désavantagé. Une arme **Deux mains** est désavantagée si un bouclier ou
une autre arme non corporelle est équipé. Les avantages et désavantages suivent
leur règle habituelle d’annulation ; le matériel n’est plus déséquipé pour ce conflit.
La restriction d’un seul équipement de Garde actif reste applicable.

Les dégâts normaux, bonus et polyvalents sont réunis avant les portées. **Distance**
garde les portées normale/longue et sa clé historique ammunition. ♻️ ouvre
Chargement/Munitions : choix d’un Objet de classe **Munitions** et de sa quantité
consommée à chaque attaque. Un stock insuffisant bloque le tir. **Lancer** affiche
ses portées et un bouton 🎯 : régler le mouvement, tracer depuis le personnage,
puis l’arme quitte son inventaire et devient un dépôt récupérable animé. Aucun
jet d’attaque ou dégât n’est lancé automatiquement par ce déplacement.

Les Passifs n'affichent pas de niveau ; les autres Aptitudes conservent leur
niveau comme coût en PdF (aucun coût ou effet critique n'est automatiquement appliqué).
La Description déroulante reste libre pour préciser les effets conditionnels.

Le bouton **Options** ouvre les sections :
- **Contraintes** : charges, récupération, incantation ; uniquement pour Sort, Hybride et Passif ;
- **Conditions** : indicateurs manuels ou automatiques, sans blocage des jets ;
- **Effets** : durée, nombre de cibles, forme, dimensions, portée, origine et propagation ;
- **Jets** : formules personnalisables avec plusieurs modificateurs de caractéristiques,
  une Compétence et/ou une Expertise.

Dans **Options → Jets**, **Ajouter un jet** ajoute un bouton indépendant à
l’aptitude. Répéter pour créer, par exemple, un jet d’attaque et un jet de dégâts.
Chaque jet conserve son nom, sa formule et ses bonus ; modifier ou supprimer
l’un des jets conserve les autres et leurs raccourcis de barre d’actions.

Dans **Options → Ciblage**, le toggle **⚔️ / 🏹** définit le type de
portée. En mêlée, renseigner l’**Allonge** ; à distance, renseigner la **Portée
normale** et la **Portée longue** en mètres (0 pour ne pas avoir de portée longue).
Le passage d’un mode à l’autre conserve les valeurs. Les anciennes portées
numériques restent enregistrées et deviennent la portée normale des aptitudes
à distance. Le mode et les portées apparaissent aussi dans le résumé de l’aptitude.
Les deux portées partagent la première ligne avec le ciblage et le toggle.
**Origine de l’effet** et **Propagation** occupent une deuxième ligne indépendante.

Une condition peut tester les PdC/PdF (en %), une caractéristique, une altération,
un objet équipé, une Expertise applicable, une quantité d'objets ou une dénomination
de Luqa. Le type « Formule » utilise un mini-langage **sans JavaScript** :
`pdc < pdcMax * 0.5 && FOR >= 14`. Variables disponibles :
`pdc`, `pdcMax`, `pdf`, `pdfMax`, `FOR`, `DEX`, `CON`, `INT`,
`SAG`, `CHA` (caractéristiques effectives).

Les indicateurs automatiques sont calculés à partir de la fiche ;
un clic ouvre leur configuration. Les indicateurs manuels se cochent à la main.
Les conditions interdisent le jet seulement si l'option dédiée a été activée
dans l'éditeur de l'Aptitude. L'option historique « consommer des objets / Luqa »
n'est qu'un **rappel** pour les joueurs et le MJ : elle ne débite rien automatiquement.

### Raccourcis de jets : barre native Foundry
1. Ouvrir une fiche personnage ou PNJ et repérer le **bouton d'un jet**.
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

### Initiative dans les rencontres de combat

Le bouton **Jet d’initiative** du suivi de combat appelle le même
`rollInitiativeCheck` que la fiche du personnage ou du PNJ. Le résultat final
Arcane Advent est inscrit dans la rencontre : bonus/malus actuels, effets,
Avantage/Neutre/Désavantage et règles des 1/20 naturels compris.
Les jets groupés et les relances utilisent aussi ce calcul, avec un seul message
par combattant. Les jets des combattants cachés restent réservés au MJ, sauf
choix explicite d’un autre mode de visibilité.

À la première ouverture du monde par le MJ, le marqueur de tour global utilise
`assets/arcane-advent/system/battlemark.png` avec l’animation **Rotation**.
Les jetons en mode **Par défaut** héritent de ce réglage. Les personnalisations
par jeton restent prioritaires ; le MJ peut ensuite modifier le réglage global
dans la configuration des rencontres sans qu’il soit réinitialisé au rechargement.

> **Esprit de conception :** automatiser les calculs utiles et l'affichage,
> jamais l'interprétation des actions, critiques, postures ou conséquences narratives.

## Décors, objets interactifs et effets visuels

Après la mise à jour, redémarrer le monde. Dans **Objets → Créer un objet** :

- **Élément du Décor** : image ou vidéo, dimensions, rotation et élévation.
- **Élément Interactif** : mêmes réglages, avec les autorisations de déplacement,
  de rotation et d’allumage/extinction pour les joueurs.
- **Effet Visuel** : zone circulaire de brume animée (couleur, densité, mouvement,
  bords diffus et taille des volutes), avec image ou vidéo facultative. Une source
  de lumière ou d’obscurité peut être ajoutée séparément.

Le MJ glisse le modèle du répertoire ou d’un compendium sur la scène. Le bouton
**Enregistrer et placer sur la scène** le dépose au centre de la vue.
Chaque dépôt crée une copie indépendante : éteindre une torche, déplacer une chaise,
modifier ou supprimer le modèle ne change pas les autres exemplaires.

Pour une torche, activer **Cet objet émet de la lumière**, régler ses rayons et
choisir une animation. Autoriser l’allumage/extinction dans **Actions des joueurs**.
Pour une chaise ou une table, autoriser le déplacement et la rotation.
En jeu, double-cliquer l’objet avec l’outil Jetons actif, ou ouvrir **Animations**
en bas du répertoire Objets. **Déplacer** demande de cliquer sur la destination ;
Échap ou clic droit annule. Un MJ connecté traite les actions des joueurs.
Un objet masqué ou placé sur un autre étage n’est pas proposé aux joueurs ;
verrouiller la tuile interdit leurs interactions.

Pour le gaz de Flaturgence, créer un **Effet Visuel** de rayon **3** sur une scène
graduée en mètres : sa zone mesure **6 m de diamètre**. Dans **Brume**, choisir
sa couleur, sa densité et sa vitesse. La brume est une nappe visuelle indépendante
de l’éclairage : elle n’émet pas de lumière. La densité recouvre visuellement
le décor, sans changer à elle seule les règles de vision des jetons.
Les anciens modèles et exemplaires utilisant l’animation lumineuse de brouillard
sont repris comme brume ; les animations de feu sont conservées.

Pour une zone d’ombre qui bloque lumière et vision, activer la source dans
**Lumière / Zone d’ombre** puis cocher **Source d’obscurité**. Sa priorité départage
les sources qui se chevauchent. Les animations proposées correspondent au type de
source choisi. Brume et obscurité peuvent être utilisées ensemble ou séparément.
Pour du feu, désactiver la brume et utiliser une vidéo ou une animation lumineuse.
Les distances suivent toujours l’échelle de la scène.

Le dépôt crée une tuile et, selon le modèle, une lumière et une région liées.
Déplacer, redimensionner ou masquer la tuile met à jour ces éléments ; supprimer
la tuile les supprime aussi. Le MJ peut utiliser le calque Tuiles pour ces opérations.
Les effets visuels ne lancent pas automatiquement de jets et n’appliquent pas
de conditions aux personnages ; la région sert ici à délimiter la zone.

### Animations : préparer, projeter et déclencher un impact

Chaque modèle d’**Effet Visuel** possède une section **Animation** : elle mémorise
la durée totale du trajet, la taille initiale (% des dimensions de placement), la
taille finale (% de la taille initiale), la rotation continue en degrés/seconde,
le comportement à l’arrivée, le modèle de remplacement et son mode de lecture.
100 % conserve la taille, 50 % la réduit de moitié, 200 % la double. Une rotation
à 0 est désactivée ; une valeur négative inverse son sens. Ces transformations
évoluent régulièrement pendant le trajet ; la taille et l’orientation finales
sont conservées à l’arrivée et la rotation s’arrête.

La fenêtre **Animations** reprend ce preset ; modifier ses valeurs pour une
projection ne change pas le modèle. Dupliquer un Effet Visuel permet de garder
plusieurs presets pour une même image/vidéo. Le trajet reste choisi à chaque
utilisation. Une continuation part de la position et de la taille atteintes ;
l’effet final manuel reprend aussi les réglages de fin de la projection.

La fenêtre **Animations** présente deux listes : modèles d’Effet Visuel du
répertoire à gauche, exemplaires présents sur la scène à droite. Chaque entrée
montre son icône, son nom et le chemin de dossiers de son modèle. **▶** reprend
les préréglages, demande le trajet et lance immédiatement à sa définition.
**✎** ouvre les réglages ponctuels avant **Tracer et lancer** ; **⚙** ouvre le
modèle de l’effet. Les réglages ponctuels ne modifient pas le modèle.

Cliquer sur A puis B ; **Ctrl + clic** ajoute des étapes, Retour arrière retire
la dernière étape, Échap ou clic droit annule. Le lancement suit directement la
fin du tracé, sans seconde confirmation. À l’arrivée, l’effet reste, disparaît
ou laisse place à l’effet final choisi (une lecture puis suppression, dernière
image conservée ou boucle). Le menu **⋯** conserve les commandes d’impact manuel,
de continuation et de suppression d’un effet présent.

En bas, **Animer un objet de la scène** permet de choisir directement un décor,
une tuile ou un objet déposé au sol, puis sa destination. La ligne de réglages
définit la durée du trajet en secondes et la rotation : verrouillée, orientée
selon le trajet avec un offset horaire (0° face au mouvement, 180° dos au mouvement),
ou continue avec un nombre de tours et un sens horaire/antihoraire. Le déplacement
conserve l’objet à l’arrivée, avec son contenu éventuel. La même rotation est
disponible pour le lancer d’une arme. Les participants voient le mouvement et
l’orientation synchronisés ; le MJ actif termine aussi les mouvements hors scène.

Les jets, dégâts, esquives et collisions restent décidés par le MJ.

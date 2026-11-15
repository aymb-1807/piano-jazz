# ADR-0004 : Quantification rythmique et classement des notes

**Statut :** Accepté (v1, à réviser après les premières prises réelles)
**Date :** 15/11/2026
**Décideur :** propriétaire du projet

## Contexte

Le moteur d'analyse compare une prise (ADR-0003) à la grille, accord par accord : notes de l'accord présentes ou manquantes, fausses notes, voicing, placement rythmique. Il doit être juste **pour un pianiste qui joue un arrangement** : la main droite joue une mélodie avec des notes de passage, la main gauche des voicings, avec des anticipations. Un moteur trop strict noierait le bilan sous de fausses alertes.

## Décisions

### 1. Repère temporel et calage de latence

- Position d'une note = interpolation entre les **temps réellement entendus** (pas de tempo théorique).
- **Calibration** : l'utilisateur joue une touche sur 8 clics ; la **médiane** des écarts (note − clic) donne `calageMs`, soustrait de toutes les notes. Ce calage absorbe la latence audio réelle du téléphone, que `getOutputTimestamp()` peut mal estimer (ADR-0001), et aussi la tendance personnelle à anticiper le clic. C'est assumé : on mesure le placement **par rapport à ce que le pianiste entend**.

### 2. Rattachement des notes aux accords

- Une note appartient à l'accord dont le segment contient `début + 0,15 temps`. Une attaque jusqu'à 0,15 temps **avant** un changement d'accord compte donc comme une **anticipation** de l'accord suivant, pas comme une note de l'accord précédent.
- Une **attaque** = notes commencées à moins de 60 ms d'écart (un accord plaqué, même légèrement arpégé).
- Notes **sonnantes** d'un segment = notes qui sonnent au moins 0,25 temps dans le segment, pédale de sustain comprise. Une note tenue depuis l'accord précédent compte donc pour le suivant.

### 3. Notes de l'accord présentes ou manquantes

- Évalué sur les notes sonnantes.
- On signale la **3ce** et la **7e** manquantes (6te pour les accords de 6te ; 3ce seule pour une triade). La **fondamentale manquante n'est pas une erreur** (voicings sans fondamentale, rôle du bassiste). La quinte est ignorée.

### 4. Classement de chaque note attaquée

| Classe | Définition |
|---|---|
| accord | note de l'accord |
| tension | tension disponible pour la qualité de l'accord (tableau ci-dessous) ou écrite dans le symbole |
| à éviter | note à éviter usuelle (11 juste sur maj7 et 7, ♭9 sur m7♭5…) |
| hors accord | autre |

Tensions retenues (pratique jazz courante, citée de mémoire, cf. M. Levine, *The Jazz Theory Book*, 1995) : maj7/6 : 9, ♯11, 13 ; m7 : 9, 11, 13 ; 7 : ♭9, 9, ♯9, ♯11, ♭13, 13 ; m7♭5 : 9, 11, ♭13 ; dim7 : un ton au-dessus de chaque note de l'accord ; triade mineure : celles de m7 + 7e mineure + 7e majeure.

### 5. Fausse note ou note de passage

Une note « hors accord » ou « à éviter » n'est une **fausse note** que si elle est **structurelle** : attaquée avec une autre note (dans un voicing), **ou** placée sur un temps (à ±0,15 temps) et tenue au moins un demi-temps. Sinon c'est une **note de passage**, comptée mais pas reprochée.

### 6. Placement rythmique

- **Attaque d'accord** : première attaque d'au moins deux notes à ±0,5 temps du début du segment. Écart en ms : positif = en retard.
- Tolérance « en place » : ±60 ms. Indicateurs : écart moyen (tendance avance/retard), écart-type (régularité), part des attaques en place.
- Pas de quantification au swing en v1 (cadrage : ballade en priorité).

### 7. Voicing

Degrés de chaque attaque, du grave à l'aigu. Types reconnus : shell (F-3-7 / F-7-3), sans fondamentale type A (3ce en bas) et type B (7e en bas), position fondamentale (F-3-5-7), sinon « autre » avec les degrés.

## Options écartées

- **Quantification sur une grille fixe calculée depuis le tempo** : fausse dès que le tempo change ou que l'audio dérive.
- **Toute note hors accord = fausse note** : inutilisable avec une mélodie (notes de passage chromatiques).
- **Comparer aux notes écrites de l'arrangement** (MusicXML, ADR-0002) : plus précis mais demande le fichier ; prévu en v2. La v1 reste fondée sur la grille, conformément au cadrage (« un exercice est une grille courte »).

## Conséquences et points à revoir

- Les seuils (0,15 temps, 60 ms, 0,25 temps) sont des valeurs de départ : **à ajuster sur de vraies prises** exportées du téléphone.
- Swing à tempo medium (Autumn Leaves) : les croches swinguées ne pénalisent pas (on ne mesure que les attaques d'accord), mais aucun indicateur de swing n'est calculé.
- Le moteur est une fonction pure (`analyserPrise(prise)`), testée dans Node sur des prises de référence (`docs/tests.md`).

## Avenant du 15/11/2026 : modes de jeu

Demande du propriétaire : jouer l'arrangement « plus jazz », ou librement comme l'original (« Play freely »), et ne faire juger que les accords.

| Mode (`prise.mode`) | Accompagnement | Ce qui est jugé |
|---|---|---|
| `mesure` (par défaut) | oui, au tempo choisi | accords + placement rythmique (règles ci-dessus) |
| `accords` | oui (balais ou swing avec ride) | accords seulement : `decalageMs` non calculé, `resume.rythme = null`, aucune mesure « à travailler » pour un motif rythmique |
| `libre` (rubato) | non, pas de tempo | accords seulement, après **alignement** de la prise sur la grille |

### Jeu libre : alignement prise → grille

- **Fenêtres harmoniques** : la prise est découpée aux attaques d'accord (au moins 2 notes à 60 ms près) ; à défaut, à chaque attaque.
- **Adéquation fenêtre/accord** (`scoreHarmonique`) : note guide +2, autre note de l'accord +1, tension +0,3, note à éviter −0,8, hors accord −1,5, basse égale à la fondamentale ou à la basse de l'accord +1,5.
- **Alignement monotone** par programmation dynamique : une fenêtre reste sur le même accord (−0,2, mélodie ou arpège) ou passe au suivant (0) ; sauter un accord coûte 3. La fin est libre : on juge les accords atteints, et un arrêt en cours de grille n'est pas reproché.
- **Note structurelle** sans temps de référence : attaquée dans un voicing, ou tenue au moins 400 ms.
- **Affichage en direct** (`js/suivi.js`) : version simplifiée et gloutonne (l'accord suivant doit coller nettement mieux, à chaque accord plaqué ; une note isolée ne fait pas avancer). L'analyse finale refait l'alignement complet, plus fiable.

Limites : une grille où deux accords consécutifs sont très proches (ex. Cm7 → Cm6) peut être mal suivie en direct ; un pianiste qui rejoue plusieurs fois une section non écrite dans la grille sera aligné au mieux mais sans reprise. À valider sur de vraies prises.

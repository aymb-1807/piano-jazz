# Format de grille

Un seul format pour un **morceau** et pour un **exercice** : un exercice est une grille courte avec un objectif.
L'accompagnement (étape 2) et l'analyse (étape 3) lisent les deux de la même façon.

## Exemple : morceau

```
titre: Misty
type: morceau
tonalité: Eb
mesure: 4/4
tempo: 60
style: ballade

[A1]
Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7
Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7

[A2]
...
[A3] = A1        // recopie une section entière
```

## Exemple : exercice

```
titre: Notes guides – Misty mes. 5-8
type: exercice
source: Misty, mesures 5-8
tonalité: Eb
tempo: 56
boucle: oui
objectif: Main gauche seule, 3ce et 7e de chaque accord sur le 1er temps...
critere: notes guides présentes sur 100 % des accords, attaque à ±80 ms du temps

[II-V]
Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7
```

## Règles

| Élément | Syntaxe | Effet |
|---|---|---|
| Métadonnée | `clé: valeur` sur sa propre ligne | Les clés sont normalisées (minuscules, sans accents : `tonalité` → `tonalite`). Les clés inconnues sont gardées dans `meta`. |
| Section | `[A1]` | Libellé affiché au-dessus des mesures qui suivent |
| Copie de section | `[A3] = A1` | Reprend les mesures de A1 |
| Mesure | texte entre deux `\|` | Une ligne peut contenir autant de mesures qu'on veut |
| Plusieurs accords | `Fm7 Bb7` | Les accords se partagent la mesure à parts égales (2 + 2 en 4/4) |
| Prolongation | `/` (ou `-`) | Prolonge l'accord précédent d'une part : `Fm7 / / Bb7` = 3 + 1 ; `/ Ebmaj7` en début de mesure = l'accord de la mesure précédente tient 2 temps |
| Répétition | `%` | Recopie la mesure précédente |
| Pas d'accord | `N.C.` (ou `NC`) | Accompagnement muet, clics du métronome seuls (levée, break) |
| Commentaire | `// …` | Ignoré (pas `#`, qui sert aux dièses) |

### Métadonnées utilisées

| Clé | Rôle | Par défaut |
|---|---|---|
| `titre` | Nom affiché | « Sans titre » |
| `type` | `morceau` ou `exercice` | `morceau` |
| `tonalite` | Information (servira à l'analyse) | – |
| `mesure` | Chiffrage ; seul le numérateur sert pour l'instant | `4/4` |
| `tempo` | BPM proposé ; imposé si `type: exercice` | 60 |
| `boucle` | `oui` pour lire en boucle (exercices) | non |
| `objectif` | Consigne affichée ; sera transmise au bilan (étape 4) | – |
| `critere` | Critère de réussite (étape 6 : tempo qui monte quand c'est réussi) | – |
| `source` | Morceau et mesures d'origine d'un exercice | – |

### Symboles d'accords reconnus

Fondamentale `A`–`G` avec `b`/`#` (ou ♭/♯), puis :
`maj7` `ma7` `M7` `Δ` · `6` `69` · `m` `m7` `m6` `m9` `m11` `m(maj7)` (`-` accepté pour mineur) · `7` `9` `13` · `7sus4` `sus4` · `m7b5` `ø` · `dim` `dim7` `°7` · `aug` `+` · tensions `b9 9 #9 11 #11 b13 13`, `b5` `#5`, `alt` · basse : `Eb/G`.

Pour chaque accord, le lecteur fournit : fondamentale, basse, qualité, notes de l'accord, tensions, **notes guides** (3ce et 7e) et position dans la mesure (temps de début, durée). L'analyse de l'étape 3 s'appuiera dessus.

## Transposition

La grille est écrite dans une tonalité ; la page propose une transposition de −6 à +6 demi-tons, appliquée à la lecture
(`lireGrille(texte, { transposition: n })`). Le texte d'origine n'est pas modifié. L'orthographe (♭ ou ♯) suit la tonalité
d'arrivée, d'où l'intérêt de renseigner `tonalité:` (ex. `Gm`, `Eb`).

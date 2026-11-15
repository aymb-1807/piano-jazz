# Stratégie de tests

## Lancer les tests

```bash
node --test tests/*.test.mjs
```

Aucune dépendance à installer (Node 20 ou plus récent, `node:test`). Les prises de référence se régénèrent avec :

```bash
node tests/fabriquer-prises.mjs
```

## Pyramide

| Niveau | Quoi | Outil | Quand |
|---|---|---|---|
| **Unitaire** (le gros des tests) | Moteur d'analyse sur des prises de référence ; classement des notes ; types de voicing ; calibration | `node --test`, fichiers `tests/prises/*.json` | À chaque modification de `js/analyse.js`, `js/grille.js`, `js/accords.js` |
| **Intégration navigateur** | Enregistrement pendant la lecture avec un piano simulé (`window.__simulerMidi`), rapport affiché, grille colorée ; calibration | Playwright + Chromium (émulation Pixel 7) | Avant chaque PR qui touche la page ou l'enregistrement |
| **Sur l'appareil** | Son, latence réelle, câble USB, rendu au pupitre | Le téléphone, panneau « Diagnostic » | À chaque étape ; c'est le seul niveau qui valide la latence |

## Prises de référence (`tests/prises/`)

Grille : exercice « notes guides » (Misty mes. 5-8), 60 BPM, voicings F-3-7.

| Prise | Ce qu'elle vérifie |
|---|---|
| `juste` | Aucune fausse alerte : 100 % de notes guides, 0 fausse note, attaques en place, voicings reconnus |
| `note-manquante` | 7e absente de Fm7 mes. 2, signalée et classée en tête des mesures à travailler |
| `fausse-note` | Mi bécarre structurel dans le voicing de E♭Δ7 détecté |
| `decalage-retard` | Retard constant de 90 ms mesuré ; un retard ne crée pas de fausse note |
| `anticipation` | Attaque une double-croche avant le temps rattachée à l'accord suivant |
| `notes-de-passage` | Chromatismes brefs à contretemps comptés mais pas reprochés |
| `pedale` | Notes staccato tenues par la pédale comptées comme sonnantes (et pas sans pédale) |
| `calage` | Un retard égal au calage mesuré est « en place » |
| `accord-non-joue` | Mesure silencieuse signalée en priorité |

## Ajouter une vraie prise

1. Sur le téléphone, après une prise : « Exporter la prise (JSON) ».
2. Copier le fichier dans `tests/prises/` avec un nom parlant.
3. Ajouter un test qui fixe le résultat attendu (établi en écoutant ou en relisant la prise).

Les vraies prises serviront surtout à **régler les seuils** de l'ADR-0004 (anticipation, tolérance rythmique, note structurelle).

## Lacunes connues

- Pas de prise de référence en boucle (plusieurs passages) ni avec changement de tempo en cours.
- Pas de test de non-régression automatique du rendu de la partition ; il est vérifié à la main (pixels verts du curseur).
- La latence réelle ne se teste que sur l'appareil.

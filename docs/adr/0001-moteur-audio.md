# ADR-0001 : Moteur audio de l'accompagnement

**Statut :** Accepté (rétroactif, implémenté à l'étape 2)
**Date :** 14/11/2026
**Décideur :** propriétaire du projet

## Contexte

L'appli doit jouer un accompagnement (basse, batterie, ou métronome) sous une grille, sur Chrome Android, pendant que le pianiste joue sur un piano relié en USB (Web MIDI). Contraintes :

- **Placement précis** : l'étape 3 mesure le placement rythmique de la prise par rapport aux temps de l'accompagnement. Une gigue de quelques dizaines de ms fausserait l'analyse.
- **Tempo lent** (ballade, à partir de 50 BPM) et tempo modifiable en direct.
- **Même repère temporel que le MIDI** : les horodatages Web MIDI sont dans le repère `performance.now()`.
- PWA statique hébergée sur GitHub Pages : pas de serveur, pas d'étape de build, poids réduit.
- Mono-utilisateur, téléphone Android de milieu de gamme.

## Décision

Synthèse sonore **en Web Audio natif, sans bibliothèque**, pilotée par un **ordonnanceur à anticipation** : une minuterie de 25 ms programme sur l'horloge `AudioContext` les sons des 150 ms à venir. Chaque temps joué est converti dans le repère `performance.now()` avec `AudioContext.getOutputTimestamp()`, qui tient compte de la latence de sortie. L'affichage se cale sur ce qui est réellement entendu.

Code : `js/accomp.js`.

## Options envisagées

### Option A : Web Audio natif, synthèse et ordonnanceur maison (retenue)

| Critère | Évaluation |
|---|---|
| Complexité | Moyenne (environ 300 lignes) |
| Poids | 0 ko de dépendance |
| Précision | Celle de l'horloge audio (à l'échantillon près) |
| Maîtrise du repère temporel | Totale |

**Pour :** aucune dépendance ; contrôle direct de la conversion audio → `performance.now()`, indispensable à l'étape 3 ; fonctionne hors ligne.
**Contre :** sons synthétiques moins réalistes ; ordonnanceur à maintenir soi-même.

### Option B : Tone.js

| Critère | Évaluation |
|---|---|
| Complexité | Faible pour jouer des sons |
| Poids | Environ 150 ko minifiés (estimation de mémoire, non vérifiée) |
| Précision | Bonne (même principe d'anticipation) |
| Maîtrise du repère temporel | Indirecte (Transport à recaler sur `performance.now()`) |

**Pour :** Transport, échantillonneurs et synthés prêts à l'emploi.
**Contre :** dépendance lourde pour un besoin limité ; la conversion vers le repère MIDI passe par la bibliothèque.

### Option C : échantillons enregistrés (contrebasse, balais)

**Pour :** son réaliste.
**Contre :** plusieurs Mo à charger et à mettre en cache ; droits sur les échantillons ; l'ordonnancement reste à faire (A ou B).

### Option D : `setTimeout` / `setInterval` direct

**Contre :** gigue de 10 à 50 ms et ralentissements quand l'onglet n'est plus au premier plan. Incompatible avec l'analyse rythmique. Écartée.

## Analyse des compromis

L'exigence qui décide est la précision et le repère temporel commun avec le MIDI, pas le réalisme sonore. A et B ont la même précision ; A l'obtient sans dépendance et avec la main sur la conversion de repère. Le réalisme (C) peut venir plus tard sans changer l'ordonnanceur : il suffit de remplacer les fonctions de son (`noteBasse`, `batterie`) par la lecture d'échantillons.

## Conséquences

- **Plus facile :** l'étape 3 dispose de `chronologie` (temps → `tPerf`) directement comparable aux horodatages MIDI.
- **Plus difficile :** son peu réaliste. Pas de swing écrit pour l'instant (balais, basse en blanches ou noires).
- **À revoir :**
  - **Latence réelle sur Android** : `getOutputTimestamp()` est-il fiable sur l'appareil cible ? Prévoir un réglage de calage manuel (ms) et une procédure de calibration (taper sur le piano en même temps que des clics).
  - Batterie swing (ride) si des morceaux medium/up deviennent prioritaires (Autumn Leaves est souvent joué medium).
  - Échantillons si le rendu gêne la pratique.

## Actions

1. [x] Ordonnanceur, basse, balais, métronome, décompte (étape 2).
2. [ ] Mesurer sur le téléphone l'écart entre `getOutputTimestamp()` et le son réellement entendu (étape 3).
3. [ ] Ajouter un réglage de calage de latence persistant (étape 3).

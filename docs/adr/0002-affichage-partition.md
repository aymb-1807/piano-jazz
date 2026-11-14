# ADR-0002 : Affichage de la partition avec curseur synchronisé

**Statut :** Accepté
**Date :** 14/11/2026
**Décideur :** propriétaire du projet

## Contexte

En pratique, la grille d'accords seule ne suffit pas : le pianiste joue un arrangement écrit (Autumn Leaves, arr. James Wolff) et garde la partition papier à côté, l'appli ne servant plus que de métronome. Besoin : afficher la partition dans l'appli avec un curseur qui suit l'accompagnement.

Contraintes :

- **Droits d'auteur** : les arrangements sont protégés et le dépôt est public. La partition ne doit **jamais** être versionnée ni publiée.
- Site statique sur GitHub Pages, sans build ; utilisable au pupitre sur un téléphone.
- Synchronisation avec l'horloge de l'accompagnement (ADR-0001).
- Pour l'étape 3, il serait très utile de connaître les **notes écrites**, pas seulement les accords.

## Décision

1. **Format d'entrée : MusicXML** (`.musicxml`, `.xml` ou `.mxl` compressé), le format d'échange standard que tous les logiciels de gravure exportent (MuseScore, Finale, Sibelius, Dorico).
2. **Rendu : OpenSheetMusicDisplay (OSMD) 2.2.1**, licence BSD-3-Clause, **copié dans `vendor/osmd/`** et non chargé depuis un CDN. Il est chargé à la demande, seulement quand une partition est affichée.
3. **Stockage : IndexedDB, sur l'appareil**, un fichier par grille. L'utilisateur l'importe lui-même ; rien n'est envoyé.
4. **Synchronisation** : à chaque image, l'accompagnement fournit la position entendue (mesure + temps décimal). Le curseur OSMD est placé sur la dernière note commencée à cet instant. La partition et la grille ont **la même numérotation de mesures**.

Code : `js/partition.js`, intégration dans `grille.html`.

## Options envisagées

### A. MusicXML + OSMD embarqué (retenue)

| Critère | Évaluation |
|---|---|
| Complexité | Faible à moyenne (environ 150 lignes) |
| Poids | 1,4 Mo, chargé seulement quand il sert |
| Précision du curseur | Note par note |
| Utilité pour l'étape 3 | Forte : les notes écrites deviennent lisibles par le programme |

**Pour :** curseur précis ; défilement automatique ; ouvre la comparaison prise / notes écrites ; fonctionne hors ligne.
**Contre :** il faut le fichier MusicXML, ce qu'un PDF ne fournit pas.

### B. PDF ou image + repérage manuel des mesures

**Pour :** marche avec n'importe quelle partition.
**Contre :** il faut indiquer la position de chaque mesure à la main (ou une détection automatique peu fiable) ; curseur mesure par mesure au mieux ; aucune donnée exploitable pour l'analyse.

### C. Application existante (MuseScore mobile)

**Pour :** existe déjà, avec curseur et métronome.
**Contre :** pas d'écoute MIDI, pas d'analyse, pas de bilan : ce qui fait l'objet de ce projet. Reste une bonne solution pour la seule lecture.

### D. OSMD depuis un CDN

**Contre :** dépendance réseau au pupitre ; pas de mode hors ligne pour la future PWA. Écartée au profit de la copie locale.

## Analyse des compromis

L'option A est la seule qui serve aussi l'étape 3. Sa limite (avoir le MusicXML) se contourne : export depuis le logiciel qui a gravé la partition, demande à la source, ou reconnaissance optique à partir du PDF (Audiveris, libre) avec relecture.

## Conséquences

- **Plus facile :** analyse note par note contre l'arrangement (étape 3) ; exercices tirés de passages précis (étape 6).
- **Plus difficile :** la grille et la partition doivent avoir le même nombre de mesures. Une levée incomplète ou des reprises décalent le curseur ; l'appli affiche un avertissement.
- **À revoir :**
  - Reprises et renvois : OSMD les déroule (`CurrentEnrolledTimestamp`), mais la synchronisation utilise pour l'instant le temps « source », sans reprise.
  - Extraire automatiquement la grille d'accords du MusicXML quand il contient des symboles d'accords (`<harmony>`), pour ne plus la saisir à la main.
  - Mise en cache hors ligne (service worker) quand la PWA sera installable.

## Actions

1. [x] Import local, affichage, curseur synchronisé, zoom.
2. [ ] Obtenir le MusicXML de l'arrangement Wolff (propriétaire).
3. [ ] Gérer les reprises.
4. [ ] Générer la grille depuis les `<harmony>` du MusicXML.

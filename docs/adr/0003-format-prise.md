# ADR-0003 : Format interne d'une prise

**Statut :** Accepté
**Date :** 15/11/2026
**Décideur :** propriétaire du projet

## Contexte

L'étape 3 enregistre ce que le pianiste joue (MIDI) pendant que l'accompagnement défile, puis l'analyse accord par accord. Le même objet doit servir à :

- l'analyse (étape 3) ;
- le bilan rédigé par le LLM (étape 4), via un résumé ;
- le suivi de progression (étape 5) ;
- les **tests** : des prises de référence écrites à la main ou exportées d'une vraie séance doivent pouvoir être rejouées dans le moteur d'analyse, sans navigateur.

Contraintes : horodatages Web MIDI dans le repère `performance.now()` ; temps de l'accompagnement convertis dans ce même repère (ADR-0001) ; tempo modifiable pendant la prise ; boucle possible.

## Décision

Une prise est un **objet JSON autonome** (`format: "piano-jazz/prise@1"`) :

```json
{
  "format": "piano-jazz/prise@1",
  "date": "2026-11-15T10:00:00.000Z",
  "grille": { "id": "autumn-leaves", "titre": "…", "texte": "…grille complète…", "transposition": 0 },
  "tempo": 80,
  "calageMs": 35,
  "temps":  [ { "tour": 0, "mesure": 1, "temps": 0, "t": 0 }, … ],
  "notes":  [ { "hauteur": 60, "debut": 12.5, "fin": 640.0, "velocite": 72 }, … ],
  "pedale": [ { "t": 300.0, "enfoncee": true }, … ]
}
```

- **Origine des temps** : `t = 0` au premier temps de la grille (après le décompte). Toutes les durées sont en ms. Les notes jouées pendant le décompte (levée) ont des temps négatifs.
- **`temps`** : la liste des temps **réellement entendus** (mesure 0-based, temps 0-based, numéro de passage en boucle). L'analyse se cale sur ces temps et non sur un tempo théorique, ce qui absorbe un changement de tempo en cours de prise.
- **`grille.texte`** : copie de la grille au moment de la prise, pour qu'une prise ancienne reste analysable même si la grille a été modifiée depuis.
- **`calageMs`** : compensation de latence mesurée par calibration (ADR-0004), **non appliquée** aux données brutes. L'analyse la soustrait, ce qui permet de recalculer si le calage change.
- Stockage local (IndexedDB) ; export JSON possible pour constituer des prises de référence.
- **Avenant du 15/11/2026** : champ facultatif `mode` (`mesure` par défaut, `accords`, `libre`). En mode `libre` (rubato), `temps` est vide, `tempo` vaut `null`, `t = 0` à la première note et `plage` (`{debut, fin}`, mesures 1-based) indique la portion de grille jouée. Ajout compatible : pas de changement de version du format.

## Options envisagées

| Option | Pour | Contre |
|---|---|---|
| **JSON autonome, temps relatifs (retenue)** | Rejouable dans Node, lisible, diffable, indépendant de l'horloge du jour | Un peu plus volumineux que du binaire (négligeable : quelques dizaines de ko) |
| Fichier MIDI standard (SMF) | Ouvrable dans un séquenceur | Pas de place naturelle pour la grille, les temps entendus et le calage ; il faudrait un analyseur SMF |
| Événements MIDI bruts (`performance.now()` absolu) | Aucune transformation | Non rejouable sans l'horloge d'origine ; tests fragiles |

## Conséquences

- Les tests du moteur d'analyse sont de simples fichiers JSON (`tests/prises/`).
- Une vraie prise exportée depuis le téléphone devient un cas de test en une copie de fichier.
- Le format est versionné (`@1`) : toute évolution incompatible passera par `@2` avec conversion.

Aucune donnée personnelle n'est stockée : uniquement des notes et des temps.

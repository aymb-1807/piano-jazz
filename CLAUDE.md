# Appli « prof de piano jazz » – consignes pour Claude Code

PWA Android mono-utilisateur, entrée MIDI par câble USB (Web MIDI, Chrome Android), hébergée sur GitHub Pages
(https://aymb-1807.github.io/piano-jazz/). Site statique, pas d'étape de build, modules ES natifs.

## Règle absolue

**Jamais de clé API dans le code côté client** (le dépôt est public). Les appels LLM passeront par un proxy
côté serveur (voir l'ADR dédiée quand elle existera).

## Méthode

- **Décisions structurantes** → une ADR dans `docs/adr/NNNN-titre.md` (skill `engineering:architecture`).
  À prévoir : format interne d'une prise, quantification rythmique, proxy LLM. Déjà écrite : 0001 moteur audio.
- **Moteur d'analyse (étape 3)** → stratégie de tests avec des prises MIDI de référence : prise juste, note
  manquante, fausse note, décalage rythmique (skill `engineering:testing-strategy`).
- **Interface** → lisible au pupitre, gros boutons, mode sombre (skill `anthropic-skills:frontend-design`
  s'il est installé ; sinon `design:accessibility-review` et `design:design-critique`).
- **Suivi de progression (étape 5)** → graphiques avec le skill `dataviz`.
- **Au fil de l'eau** → `engineering:code-review` avant chaque PR, `engineering:debug` pour les bugs.

## Règles de conception

- Un exercice est une grille courte avec un objectif : même format (`docs/format-grille.md`), même analyse
  qu'un morceau entier.
- Grilles : uniquement les accords dans le dépôt, jamais la partition elle-même (droits d'auteur).
- Tester dans Chromium (émulation Pixel 7) avant de pousser ; dire ce qui n'a pas pu être testé (son, latence réelle).

## Git

- Ouvrir **et fusionner** les PR sans demander la permission (accord du propriétaire, 14/11/2026).
- Commits et documentation en français.

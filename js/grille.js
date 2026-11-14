// Format de grille texte, commun aux morceaux et aux exercices.
// Voir docs/format-grille.md pour la spécification.

import { analyserAccord } from './accords.js';

/**
 * Lit une grille texte.
 * @returns {{meta: object, mesures: Array<{numero, section, accords: Array}>, sections: Array}}
 *   mesures[i].accords[j] = { symbole, temps (0-based dans la mesure), duree (en temps), ...analyserAccord }
 */
export function lireGrille(texte) {
  const meta = {};
  const sections = []; // { nom, debut (index mesure), fin }
  const mesures = [];
  const parSection = {}; // nom -> lignes de mesures brutes, pour [A3] = A1
  let sectionCourante = null;
  const erreurs = [];

  const lignes = texte.split(/\r?\n/);
  lignes.forEach((brute, i) => {
    const n = i + 1;
    const ligne = brute.replace(/\/\/.*$/, '').trim(); // commentaires : // …
    if (!ligne) return;

    // En-tête de section : [A1]  ou  [A3] = A1
    const sec = /^\[([^\]]+)\]\s*(?:=\s*\[?([^\]]+)\]?)?$/.exec(ligne);
    if (sec) {
      sectionCourante = { nom: sec[1].trim(), debut: mesures.length, fin: mesures.length };
      sections.push(sectionCourante);
      parSection[sectionCourante.nom] = [];
      if (sec[2]) {
        const src = parSection[sec[2].trim()];
        if (!src) erreurs.push(`ligne ${n} : section « ${sec[2].trim()} » inconnue`);
        else src.forEach(m => ajouterMesure(m.texte, m.ligne));
      }
      return;
    }

    // Métadonnée : clé: valeur (avant ou entre les sections)
    const kv = /^([\p{L}_][\p{L}\d _-]*?)\s*:\s*(.*)$/u.exec(ligne);
    if (kv && !ligne.includes('|')) {
      meta[normaliserCle(kv[1])] = kv[2].trim();
      return;
    }

    // Ligne de mesures : Ebmaj7 | Bbm7 Eb7 | …
    if (!sectionCourante) {
      sectionCourante = { nom: '', debut: mesures.length, fin: mesures.length };
      sections.push(sectionCourante);
      parSection[''] = [];
    }
    ligne.split('|').map(s => s.trim()).filter(Boolean).forEach(m => {
      parSection[sectionCourante.nom].push({ texte: m, ligne: n });
      ajouterMesure(m, n);
    });
  });

  function ajouterMesure(txt, n) {
    const tempsParMesure = parseInt((meta.mesure || '4/4').split('/')[0], 10) || 4;
    let jetons = txt.split(/\s+/);
    if (jetons.length === 1 && jetons[0] === '%') {
      const prec = mesures[mesures.length - 1];
      if (!prec) { erreurs.push(`ligne ${n} : « % » sans mesure précédente`); return; }
      jetons = prec.jetons;
    }
    const unite = tempsParMesure / jetons.length;
    const accords = [];
    jetons.forEach((j, k) => {
      if (j === '/' || j === '-') {
        const dernier = accords[accords.length - 1];
        if (dernier) dernier.duree += unite;
        else {
          // mesure qui commence par « / » : prolonge l'accord de la mesure précédente
          const prec = mesures[mesures.length - 1]?.accords.at(-1);
          if (!prec) erreurs.push(`ligne ${n} : « / » sans accord précédent`);
          else accords.push({ ...prec, temps: k * unite, duree: unite, prolonge: true });
        }
        return;
      }
      try {
        accords.push({ ...analyserAccord(j), temps: k * unite, duree: unite });
      } catch (e) {
        erreurs.push(`ligne ${n} : ${e.message}`);
      }
    });
    mesures.push({ numero: mesures.length + 1, section: sectionCourante.nom, accords, jetons, tempsParMesure });
    sectionCourante.fin = mesures.length;
  }

  if (!mesures.length) erreurs.push('aucune mesure trouvée');
  if (erreurs.length) {
    const err = new Error(erreurs.join('\n'));
    err.erreurs = erreurs;
    throw err;
  }

  meta.titre ??= 'Sans titre';
  meta.type ??= 'morceau';
  meta.tempo = parseInt(meta.tempo, 10) || 60;
  meta.boucle = /^(oui|true|1)$/i.test(meta.boucle || '');
  return { meta, mesures, sections };
}

function normaliserCle(k) {
  return k.trim().toLowerCase()
    .normalize('NFD').replace(/[̀-ͯ]/g, '') // tonalité → tonalite
    .replace(/\s+/g, '_');
}

/** Accord qui sonne à un instant donné (mesure 0-based, temps 0-based décimal). */
export function accordA(grille, iMesure, temps) {
  const m = grille.mesures[iMesure];
  if (!m) return null;
  return m.accords.findLast(a => a.temps <= temps + 1e-9) || m.accords[0];
}

// ---------------------------------------------------------------------------
// Grilles fournies

// ⚠ GRILLE PROVISOIRE : changements usuels de Misty en Eb, cités de mémoire.
// À remplacer par la grille de ton arrangement (bouton « Modifier la grille »).
export const MISTY = `titre: Misty
type: morceau
tonalité: Eb
mesure: 4/4
tempo: 60
style: ballade
note: grille provisoire (changements usuels) – à remplacer par celle de l'arrangement

[A1]
Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7
Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7

[A2]
Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7
Ebmaj7 Cm7 | Fm7 Bb7 | Eb6 | Bbm7 Eb7

[B]
Bbm7 | Eb7 | Abmaj7 | %
Am7 | D7 | Gm7 C7 | Fm7 Bb7

[A3]
Ebmaj7 | Bbm7 Eb7 | Abmaj7 | Abm7 Db7
Ebmaj7 Cm7 | Fm7 Bb7 | Eb6 | Fm7 Bb7
`;

// Exemple d'exercice : même format, plus un objectif.
export const EXERCICE_EXEMPLE = `titre: Notes guides – Misty mes. 5-8
type: exercice
source: Misty, mesures 5-8
tonalité: Eb
mesure: 4/4
tempo: 56
boucle: oui
objectif: Main gauche seule, 3ce et 7e de chaque accord sur le 1er temps de l'accord, en conduisant les voix au plus proche (pas de saut > 2 demi-tons).
critere: notes guides présentes sur 100 % des accords, attaque à ±80 ms du temps

[II-V]
Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7
`;

export const GRILLES = [
  { id: 'misty', texte: MISTY },
  { id: 'exercice-exemple', texte: EXERCICE_EXEMPLE },
];

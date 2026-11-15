// Format de grille texte, commun aux morceaux et aux exercices.
// Voir docs/format-grille.md pour la spécification.

import { analyserAccord, transposerSymbole, transposerTonalite } from './accords.js?v=2026-11-15j';

/**
 * Lit une grille texte.
 * @param {{transposition?: number}} opts  demi-tons (+/-), appliqués à tous les accords et à la tonalité
 * @returns {{meta: object, mesures: Array<{numero, section, accords: Array}>, sections: Array}}
 *   mesures[i].accords[j] = { symbole, temps (0-based dans la mesure), duree (en temps), ...analyserAccord }
 */
export function lireGrille(texte, { transposition = 0 } = {}) {
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

  function tonaliteArrivee() {
    return meta.tonalite ? transposerTonalite(meta.tonalite, transposition) : '';
  }

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
      if (/^N\.?C\.?$/i.test(j)) { // pas d'accord : silence de l'accompagnement (levée, break)
        accords.push({ symbole: 'N.C.', nc: true, intervalles: [], classes: [], classesTensions: [], tensions: [], notesGuides: [], temps: k * unite, duree: unite });
        return;
      }
      try {
        const sym = transposition ? transposerSymbole(j, transposition, tonaliteArrivee()) : j;
        accords.push({ ...analyserAccord(sym), temps: k * unite, duree: unite });
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

  meta.tonaliteOrigine = meta.tonalite;
  if (transposition && meta.tonalite) meta.tonalite = transposerTonalite(meta.tonalite, transposition);
  meta.transposition = transposition;
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
partition: exemples/notes-guides.musicxml

[II-V]
Ebmaj7 Cm7 | Fm7 Bb7 | Gm7 C7 | Fm7 Bb7
`;

// Autumn Leaves, arrangement de James Wolff (sol mineur). Accords relevés sur la partition
// (lecture des basses et des voicings), numérotation identique à la partition : mes. 1 = levée.
// Points incertains signalés en commentaire.
export const AUTUMN_LEAVES = `titre: Autumn Leaves (arr. James Wolff)
type: morceau
tonalité: Gm
mesure: 4/4
tempo: 80
style: medium lent, forme AABC
note: accords relevés sur la partition (mes. 1 = levée)

[Levée]
N.C.                                   // mes. 1 : levée sol-la-si♭, clics seuls

[A1]
Cm7 | F7 | Bbmaj7 | Ebmaj7
Am7b5 | D7 | Gm | Gm                   // mes. 9 : levée mélodique vers A2

[A2]
Cm7 | F7 | Bbmaj7 | Ebmaj7
Am7b5 | D7 | Gm | Gm

[B]
Am7b5 | D7 | Gm | Gm                   // mes. 21 : basse en silence, ré-fa + si♭ à la main droite
Cm7 | F7 | Bbmaj7 | Ebmaj7

[C]
Ebmaj7                                 // mes. 26 : sol de la basse lié depuis la mes. 25, levée do♯-ré à la mélodie
Cm | D7b9 | Gm7 Cm9 | Fm7 Bb7          // mes. 27 : do-mi♭-sol-do (pas de la) ; mes. 28 : ré, fa♯, la, do + mi♭ mélodie
                                       // mes. 29 : 2e accord sans fondamentale mi♭-si♭-ré, pas de bécarre (vérifié) → Cm9
                                       // mes. 29-30 : voicings sans fondamentale à la main gauche (si♭-ré-fa-la ; la♭-do-ré-sol)
Ebmaj7 | Am7b5 D7 | Gm                 // mes. 33 : accord final arpégé
`;

export const GRILLES = [
  { id: 'misty', texte: MISTY },
  { id: 'autumn-leaves', texte: AUTUMN_LEAVES },
  { id: 'exercice-exemple', texte: EXERCICE_EXEMPLE },
];

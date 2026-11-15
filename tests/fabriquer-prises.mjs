// Fabrique les prises de référence synthétiques (tests/prises/*.json).
// Usage : node tests/fabriquer-prises.mjs
// Grille : exercice « notes guides » (Misty mes. 5-8), 60 BPM → 1 temps = 1000 ms.

import { writeFileSync, mkdirSync } from 'node:fs';
import { EXERCICE_EXEMPLE } from '../js/grille.js?v=2026-11-15d';

const T = 1000; // ms par temps
const dossier = new URL('./prises/', import.meta.url);
mkdirSync(dossier, { recursive: true });

// Voicings F-3-7 (main gauche), un par demi-mesure
const VOICINGS = [
  ['Ebmaj7', [51, 55, 62]], ['Cm7', [48, 51, 58]],
  ['Fm7', [53, 56, 63]], ['Bb7', [46, 50, 56]],
  ['Gm7', [55, 58, 65]], ['C7', [48, 52, 58]],
  ['Fm7', [53, 56, 63]], ['Bb7', [46, 50, 56]],
];

function baseTemps() {
  const temps = [];
  for (let i = 0; i < 4; i++) temps.push({ tour: 0, mesure: -1, temps: i, decompte: true, t: (i - 4) * T });
  for (let m = 0; m < 4; m++) for (let b = 0; b < 4; b++) temps.push({ tour: 0, mesure: m, temps: b, t: (m * 4 + b) * T });
  return temps;
}

function prise(nom, description, { notes, pedale = [], calageMs = 0 }) {
  return {
    format: 'piano-jazz/prise@1',
    description,
    date: '2026-11-15T00:00:00.000Z',
    grille: { id: 'exercice-exemple', titre: 'Notes guides – Misty mes. 5-8', texte: EXERCICE_EXEMPLE, transposition: 0 },
    tempo: 60,
    calageMs,
    temps: baseTemps(),
    notes: notes.sort((a, b) => a.debut - b.debut || a.hauteur - b.hauteur),
    pedale,
  };
}

/** Voicings plaqués sur chaque changement d'accord, tenus 2 temps (moins 50 ms). */
function voicings({ decalage = 0, modifier = (i, v) => v, duree = 2 * T - 50 } = {}) {
  const notes = [];
  VOICINGS.forEach(([, v], i) => {
    const debut = i * 2 * T + (typeof decalage === 'function' ? decalage(i) : decalage);
    modifier(i, v).forEach((h, k) => notes.push({ hauteur: h, debut: debut + k * 8, fin: debut + duree, velocite: 70 }));
  });
  return notes;
}

const PRISES = {
  'juste': prise('juste', 'Voicings F-3-7 exacts, sur le temps, à chaque changement d\'accord.', { notes: voicings() }),

  'note-manquante': prise('note-manquante', 'Mesure 2, Fm7 joué sans sa 7e (mi♭) : fa-la♭ seulement.', {
    notes: voicings({ modifier: (i, v) => (i === 2 ? [53, 56] : v) }),
  }),

  'fausse-note': prise('fausse-note', 'Mesure 1, Ebmaj7 joué avec un mi bécarre (E3) dans le voicing.', {
    notes: voicings({ modifier: (i, v) => (i === 0 ? [51, 52, 55, 62] : v) }),
  }),

  'decalage-retard': prise('decalage-retard', 'Toutes les attaques d\'accord 90 ms en retard.', { notes: voicings({ decalage: 90 }) }),

  'anticipation': prise('anticipation', 'Cm7 (mes. 1, temps 3) attaqué une double-croche avant le temps (−125 ms) ; le reste exact.', {
    notes: voicings({ decalage: i => (i === 1 ? -125 : 0) }),
  }),

  'notes-de-passage': prise('notes-de-passage', 'Voicings exacts + mélodie en croches à la main droite avec notes chromatiques brèves à contretemps.', {
    notes: [
      ...voicings(),
      // mesure 1 (Ebmaj7) : sol sur le temps, puis mi bécarre bref à contretemps (♭9 de E♭ : hors accord → passage)
      // (un la bécarre serait une ♯11, donc une tension, pas une note de passage)
      { hauteur: 67, debut: 0, fin: 450, velocite: 60 },        // G4 sur le temps
      { hauteur: 64, debut: 500, fin: 700, velocite: 55 },      // E4 bref, contretemps → passage
      { hauteur: 70, debut: 1000, fin: 1900, velocite: 60 },    // Bb4 sur le temps
      // mesure 2 (Fm7) : do, si bécarre bref à contretemps (hors accord), do
      { hauteur: 72, debut: 4000, fin: 4450, velocite: 60 },
      { hauteur: 71, debut: 4500, fin: 4700, velocite: 55 },    // B4 → passage
      { hauteur: 72, debut: 5000, fin: 5900, velocite: 60 },
    ],
  }),

  'pedale': prise('pedale', 'Voicings joués staccato (150 ms) mais tenus par la pédale jusqu\'au changement suivant.', {
    notes: voicings({ duree: 150 }),
    pedale: VOICINGS.flatMap((_, i) => [{ t: i * 2 * T + 20, enfoncee: true }, { t: (i + 1) * 2 * T - 30, enfoncee: false }]),
  }),

  'calage': prise('calage', 'Toutes les attaques 40 ms en retard, avec un calage mesuré de 40 ms : doit être en place.', {
    notes: voicings({ decalage: 40 }), calageMs: 40,
  }),

  'accord-non-joue': prise('accord-non-joue', 'Mesure 3 entièrement silencieuse (Gm7 C7 non joués).', {
    notes: voicings().filter(n => n.debut < 8 * T || n.debut >= 12 * T),
  }),
};

for (const [nom, p] of Object.entries(PRISES)) {
  writeFileSync(new URL(`${nom}.json`, dossier), JSON.stringify(p, null, 1) + '\n');
}
console.log(`${Object.keys(PRISES).length} prises écrites dans tests/prises/`);

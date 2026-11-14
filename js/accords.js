// Analyse des symboles d'accords (notation jazz anglo-saxonne).
// Sert à l'accompagnement (étape 2) et servira à l'analyse des prises (étape 3).

export const NOMS = ['C', 'Db', 'D', 'Eb', 'E', 'F', 'Gb', 'G', 'Ab', 'A', 'Bb', 'B'];
const BASE = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

// Qualités reconnues : intervalles de l'accord (fondamentale, 3ce, 5te, 7e/6te).
// L'ordre compte : la première expression qui correspond gagne.
const QUALITES = [
  [/^(maj7|ma7|M7|Δ7?|j7)/, 'maj7', [0, 4, 7, 11]],
  [/^(maj9|ma9|M9|Δ9)/, 'maj7', [0, 4, 7, 11], ['9']],
  [/^(maj13|ma13|M13|Δ13)/, 'maj7', [0, 4, 7, 11], ['9', '13']],
  [/^(m|mi|min|-)\(?(maj7|Maj7|ma7|M7|Δ7?)\)?/, 'mMaj7', [0, 3, 7, 11]],
  [/^(m7b5|mi7b5|-7b5|ø7?)/, 'm7b5', [0, 3, 6, 10]],
  [/^(dim7|o7|°7)/, 'dim7', [0, 3, 6, 9]],
  [/^(dim|o|°)/, 'dim', [0, 3, 6]],
  [/^(m|mi|min|-)69/, 'm6', [0, 3, 7, 9], ['9']],
  [/^(m|mi|min|-)6/, 'm6', [0, 3, 7, 9]],
  [/^(m|mi|min|-)11/, 'm7', [0, 3, 7, 10], ['9', '11']],
  [/^(m|mi|min|-)9/, 'm7', [0, 3, 7, 10], ['9']],
  [/^(m|mi|min|-)7/, 'm7', [0, 3, 7, 10]],
  [/^(m|mi|min|-)(?![a-z])/, 'm', [0, 3, 7]],
  [/^69/, '6', [0, 4, 7, 9], ['9']],
  [/^6/, '6', [0, 4, 7, 9]],
  [/^13sus4?/, '7sus4', [0, 5, 7, 10], ['9', '13']],
  [/^9sus4?/, '7sus4', [0, 5, 7, 10], ['9']],
  [/^7sus4?/, '7sus4', [0, 5, 7, 10]],
  [/^sus4?/, 'sus4', [0, 5, 7]],
  [/^13/, '7', [0, 4, 7, 10], ['9', '13']],
  [/^11/, '7sus4', [0, 5, 7, 10], ['9']],
  [/^9/, '7', [0, 4, 7, 10], ['9']],
  [/^7/, '7', [0, 4, 7, 10]],
  [/^(aug|\+)/, 'aug', [0, 4, 8]],
  [/^(maj|M)?(?![a-z0-9])/, '', [0, 4, 7]],
];

const TENSIONS = { b9: 1, '9': 2, '#9': 3, '11': 5, '#11': 6, b5: 6, '#5': 8, b13: 8, '13': 9 };

/**
 * Analyse un symbole d'accord.
 * @returns {{symbole, fondamentale, basse, qualite, intervalles, tensions, notesGuides, classes}}
 *   fondamentale/basse : classe de hauteur 0-11 ; classes : classes de hauteur de l'accord (sans tensions).
 */
export function analyserAccord(symbole) {
  const s = symbole.trim();
  const m = /^([A-G])([b#♭♯]?)(.*)$/.exec(s);
  if (!m) throw new Error(`accord illisible « ${symbole} »`);
  let fond = (BASE[m[1]] + (m[2] === 'b' || m[2] === '♭' ? -1 : m[2] ? 1 : 0) + 12) % 12;
  let reste = m[3];

  // Basse (accord renversé) : Eb/G
  let basse = fond;
  const slash = /\/([A-G])([b#♭♯]?)$/.exec(reste);
  if (slash) {
    basse = (BASE[slash[1]] + (slash[2] === 'b' || slash[2] === '♭' ? -1 : slash[2] ? 1 : 0) + 12) % 12;
    reste = reste.slice(0, slash.index);
  }

  let qualite = null, intervalles = null, tensions = [];
  for (const [re, q, iv, t] of QUALITES) {
    const mm = re.exec(reste);
    if (mm) {
      qualite = q; intervalles = [...iv]; tensions = t ? [...t] : [];
      reste = reste.slice(mm[0].length);
      break;
    }
  }
  if (qualite === null) throw new Error(`qualité d'accord inconnue dans « ${symbole} »`);

  // Altérations / tensions restantes : (b9,#11), alt, add9…
  reste = reste.replace(/[(),]/g, ' ');
  if (/alt/.test(reste)) { tensions.push('b9', '#9', 'b13'); reste = reste.replace('alt', ''); }
  reste = reste.replace(/add/g, ' ');
  for (const tok of reste.match(/[b#♭♯]?\d+/g) || []) {
    const t = tok.replace('♭', 'b').replace('♯', '#');
    if (!(t in TENSIONS)) throw new Error(`tension inconnue « ${tok} » dans « ${symbole} »`);
    // b5 / #5 modifient la quinte elle-même
    if (t === 'b5' || t === '#5') {
      intervalles = intervalles.map(i => (i === 7 ? TENSIONS[t] : i));
    } else if (!tensions.includes(t)) tensions.push(t);
  }

  const tierce = intervalles.find(i => i === 3 || i === 4 || i === 5); // sus4 : la 4te tient lieu de 3ce
  const septieme = intervalles.find(i => i === 9 || i === 10 || i === 11) ?? null;
  const notesGuides = [tierce, septieme].filter(i => i != null).map(i => (fond + i) % 12);

  return {
    symbole: s,
    fondamentale: fond,
    basse,
    qualite,
    intervalles,
    tensions,
    notesGuides,
    classes: intervalles.map(i => (fond + i) % 12),
    classesTensions: tensions.map(t => (fond + TENSIONS[t]) % 12),
  };
}

/** Affichage : b → ♭, # → ♯, maj7 → Δ7, m7b5 → ø7. */
export function joli(symbole) {
  return symbole
    .replace(/^([A-G])b/, '$1♭').replace(/^([A-G])#/, '$1♯')
    .replace(/\/([A-G])b/, '/$1♭').replace(/\/([A-G])#/, '/$1♯')
    .replace(/maj7|ma7/, 'Δ7')
    .replace(/m7b5/, 'ø7')
    .replace(/b(\d)/g, '♭$1').replace(/#(\d)/g, '♯$1');
}

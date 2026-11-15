// Moteur d'analyse d'une prise (étape 3). Fonction pure, sans DOM : testée dans Node.
// Règles et seuils : docs/adr/0004-analyse-rythmique-et-harmonique.md
// Format de la prise : docs/adr/0003-format-prise.md

import { lireGrille } from './grille.js?v=2026-11-15j';
import { NOMS } from './accords.js?v=2026-11-15j';

export const SEUILS = {
  anticipation: 0.15,   // temps : une attaque avant le changement compte pour l'accord suivant
  attaqueMs: 60,        // notes commencées à moins de 60 ms = une seule attaque
  sonne: 0.25,          // temps : durée minimale de présence pour « sonner » dans un segment
  surLeTemps: 0.15,     // temps : tolérance pour « sur le temps »
  tenue: 0.5,           // temps : durée minimale d'une note structurelle isolée
  enPlaceMs: 60,        // ms : attaque d'accord considérée en place
  // Jeu libre (rubato) : pas de temps de référence
  tenueLibreMs: 400,    // note isolée structurelle si tenue au moins 400 ms
  attaqueLibreMs: 150,  // accord roulé/arpégé : notes enchaînées à moins de 150 ms = une seule attaque
  pedaleMaxMs: 700,     // une note tenue par la pédale ne « sonne » pas plus de 0,7 s après le relâchement de la touche
  velociteMin: 8,       // en dessous : touche effleurée, inaudible, ignorée
  pedaleLongueMs: 8000, // pédale enfoncée plus de 8 s d'affilée : son brouillé ou pédale mal détectée
  sauterAccord: 3,      // pénalité d'alignement pour un accord de la grille sauté
  resterAccord: 0.2,    // pénalité légère pour rester sur le même accord (mélodie, arpège)
};

// Tensions disponibles et notes à éviter, en demi-tons au-dessus de la fondamentale
const TENSIONS = {
  maj7: { ok: [2, 6, 9], eviter: [5] },
  '6': { ok: [2, 6, 11], eviter: [5] },
  '': { ok: [2, 6, 9, 11], eviter: [5] },
  m7: { ok: [2, 5, 9], eviter: [8] },
  m6: { ok: [2, 5], eviter: [8] },
  m: { ok: [2, 5, 9, 10, 11], eviter: [8] },
  mMaj7: { ok: [2, 5, 9], eviter: [8] },
  '7': { ok: [1, 2, 3, 6, 8, 9], eviter: [5] },
  '7sus4': { ok: [2, 9, 1, 3, 8], eviter: [4] },
  sus4: { ok: [2, 9, 10], eviter: [4] },
  m7b5: { ok: [2, 5, 8], eviter: [1] },
  dim7: { ok: [2, 5, 8, 11], eviter: [] },
  dim: { ok: [2, 5, 8, 9], eviter: [] },
  aug: { ok: [2, 6, 10], eviter: [] },
};

const DEGRES = ['F', '♭9', '9', '♯9/♭3', '3', '11', '♯11/♭5', '5', '♭13/♯5', '13/6', '♭7', '7M'];

function degre(accord, intervalle) {
  const iv = accord.intervalles;
  if (intervalle === 0) return 'F';
  if (iv.includes(intervalle)) {
    // note de l'accord : nom fonctionnel
    return { 3: '3', 4: '3', 5: accord.qualite.includes('sus') ? '4' : '11', 6: '♭5', 7: '5', 8: '♯5', 9: accord.qualite === 'dim7' ? '♭♭7' : '6', 10: '7', 11: '7' }[intervalle];
  }
  // hors accord : nommer la note par rapport à ce qu'elle contredit
  if (intervalle === 4 && iv.includes(3)) return '3M (au lieu de ♭3)';
  if (intervalle === 3 && iv.includes(4)) return '♭3 (au lieu de 3)';
  if (intervalle === 11 && iv.includes(10)) return '7M (au lieu de ♭7)';
  if (intervalle === 10 && iv.includes(11)) return '♭7 (au lieu de 7M)';
  return DEGRES[intervalle];
}

/** Classe d'une note par rapport à l'accord : accord | tension | eviter | hors */
export function classerNote(accord, hauteur) {
  const pc = ((hauteur % 12) + 12) % 12;
  if (accord.classes.includes(pc)) return 'accord';
  if (accord.classesTensions.includes(pc)) return 'tension';
  const iv = (pc - accord.fondamentale + 12) % 12;
  const t = TENSIONS[accord.qualite] || { ok: [], eviter: [] };
  if (t.ok.includes(iv)) return 'tension';
  if (t.eviter.includes(iv)) return 'eviter';
  return 'hors';
}

export function nomNote(h) { return NOMS[((h % 12) + 12) % 12] + (Math.floor(h / 12) - 1); }

/** Type de voicing d'une attaque (hauteurs triées du grave à l'aigu). */
export function typeVoicing(accord, hauteurs) {
  const ivs = hauteurs.map(h => (((h % 12) + 12) % 12 - accord.fondamentale + 12) % 12);
  const degres = ivs.map(i => degre(accord, i));
  const uniq = [...new Set(degres)];
  const a = (d) => uniq.includes(d);
  const tierce = a('3') || a('4'), septieme = a('7') || a('6');
  const bas = degres[0];
  let type = 'autre';
  if (bas === 'F' && tierce && septieme && uniq.length === 3) type = degres[1] === '3' || degres[1] === '4' ? 'shell F-3-7' : 'shell F-7-3';
  else if (bas === 'F' && tierce && a('5') && septieme && uniq.length === 4) type = 'position fondamentale';
  else if (!a('F') && tierce && septieme && (bas === '3' || bas === '4')) type = 'sans fondamentale, type A (3ce en bas)';
  else if (!a('F') && tierce && septieme && (bas === '7' || bas === '6')) type = 'sans fondamentale, type B (7e en bas)';
  return { degres, type };
}

function mediane(v) {
  if (!v.length) return null;
  const s = [...v].sort((a, b) => a - b), m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function moyenne(v) { return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null; }
function ecartType(v) {
  if (v.length < 2) return null;
  const m = moyenne(v);
  return Math.sqrt(v.reduce((a, b) => a + (b - m) ** 2, 0) / (v.length - 1));
}

/**
 * Analyse une prise.
 * @param prise  objet au format piano-jazz/prise@1
 * @param seuils surcharge éventuelle des SEUILS
 */
export function analyserPrise(prise, seuils = {}) {
  const S = { ...SEUILS, ...seuils };
  if (prise.format !== 'piano-jazz/prise@1') throw new Error('format de prise inconnu : ' + prise.format);
  if (prise.mode === 'libre') return analyserPriseLibre(prise, S);
  const rythme = prise.mode !== 'accords'; // « accords » : tempo de l'accompagnement, rythme non jugé
  const grille = lireGrille(prise.grille.texte, { transposition: prise.grille.transposition || 0 });
  const cal = prise.calageMs || 0;
  const temps = prise.temps.filter(b => !b.decompte).sort((a, b) => a.t - b.t);
  if (temps.length < 2) throw new Error('prise trop courte');

  // Durée d'un temps autour d'un instant (pour convertir les seuils en ms)
  const dureeTempsA = (i) => (temps[Math.min(i + 1, temps.length - 1)].t - temps[Math.max(0, Math.min(i, temps.length - 2))].t) || 1000;
  const dernierInterv = temps.at(-1).t - temps.at(-2).t;

  // --- Segments : suites de temps qui partagent le même accord ---
  const segments = [];
  temps.forEach((b, i) => {
    const m = grille.mesures[b.mesure];
    if (!m) return;
    const k = m.accords.findLastIndex(a => a.temps <= b.temps + 1e-9);
    const accord = m.accords[k];
    const cle = `${b.tour}:${b.mesure}:${k}`;
    const dernier = segments.at(-1);
    if (dernier && dernier.cle === cle) { dernier.iFin = i; return; }
    // « / » en début de mesure prolonge l'accord précédent : même segment musical
    if (dernier && accord.prolonge && dernier.accord.symbole === accord.symbole) { dernier.iFin = i; return; }
    segments.push({ cle, tour: b.tour, mesure: b.mesure, temps: b.temps, accord, iDebut: i, iFin: i });
  });
  segments.forEach(s => { s.debut = temps[s.iDebut].t; });
  segments.forEach((s, j) => {
    s.fin = j + 1 < segments.length ? segments[j + 1].debut : temps[s.iFin].t + dernierInterv;
    s.dureeTemps = dureeTempsA(s.iDebut);
  });

  // --- Notes : calage, pédale ---
  const pedale = (prise.pedale || []).slice().sort((a, b) => a.t - b.t);
  const pedaleEnfonceeA = (t) => { let e = false; for (const p of pedale) { if (p.t > t) break; e = p.enfoncee; } return e; };
  const relachePedaleApres = (t) => pedale.find(p => p.t > t && !p.enfoncee)?.t ?? Infinity;
  const notes = prise.notes.filter(n => (n.velocite ?? 64) >= S.velociteMin).map((n, idx) => {
    const debut = n.debut - cal, fin = n.fin - cal;
    const finSonore = pedaleEnfonceeA(n.fin) ? Math.min(Math.max(fin, relachePedaleApres(n.fin) - cal), fin + S.pedaleMaxMs) : fin;
    return { idx, hauteur: n.hauteur, velocite: n.velocite, debut, fin, finSonore };
  }).sort((a, b) => a.debut - b.debut);

  // Position musicale d'un instant : index de temps décimal
  const positionA = (t) => {
    let i = temps.findLastIndex(b => b.t <= t);
    if (i < 0) return (t - temps[0].t) / (temps[1].t - temps[0].t);
    if (i >= temps.length - 1) return temps.length - 1 + (t - temps.at(-1).t) / dernierInterv;
    return i + (t - temps[i].t) / (temps[i + 1].t - temps[i].t);
  };

  // Attaques : regroupement des notes quasi simultanées
  const attaques = [];
  for (const n of notes) {
    const a = attaques.at(-1);
    if (a && n.debut - a.debut <= S.attaqueMs) a.notes.push(n);
    else attaques.push({ debut: n.debut, notes: [n] });
  }
  for (const a of attaques) {
    a.notes.sort((x, y) => x.hauteur - y.hauteur);
    for (const n of a.notes) n.attaque = a;
  }

  // Rattachement d'une note à un segment (avec anticipation)
  const segmentDe = (n) => {
    const p = positionA(n.debut) + S.anticipation;
    const i = Math.floor(p);
    if (i < 0 || i >= temps.length) return null;
    return segments.find(s => i >= s.iDebut && i <= s.iFin) || null;
  };

  const rapportSegments = segments.map(s => {
    const dt = s.dureeTemps;
    const attaquees = notes.filter(n => segmentDe(n) === s);
    const sonnantes = notes.filter(n => Math.min(n.finSonore, s.fin) - Math.max(n.debut, s.debut - S.anticipation * dt) >= S.sonne * dt);
    const r = { tour: s.tour, mesure: s.mesure + 1, temps: s.temps + 1, symbole: s.accord.symbole, nc: !!s.accord.nc };
    if (s.accord.nc) return { ...r, joue: attaquees.length > 0, notes: attaquees.length };

    const h = harmonie(s.accord, attaquees, sonnantes, n => {
      const pos = positionA(n.debut);
      const surTemps = Math.abs(pos - Math.round(pos)) <= S.surLeTemps;
      return n.attaque.notes.length >= 2 || (surTemps && (n.fin - n.debut) >= S.tenue * dt);
    }, n => +(posDansMesure(positionA(n.debut)) + 1).toFixed(2));

    // Placement de l'attaque d'accord
    const aAccord = rythme && attaques.find(a => a.notes.length >= 2 && Math.abs(a.debut - s.debut) <= 0.5 * dt && segmentDe(a.notes[0]) === s);
    const decalageMs = aAccord ? Math.round(aAccord.debut - s.debut) : null;

    return { ...r, ...h, decalageMs };

    function posDansMesure(pos) {
      const i = Math.max(0, Math.min(temps.length - 1, Math.floor(pos)));
      return temps[i].temps + (pos - i);
    }
  });

  return { segments: rapportSegments, resume: resumer(rapportSegments, S, prise, { rythme }) };
}

/** Analyse harmonique d'un segment, commune aux trois modes. */
function harmonie(acc, attaquees, sonnantes, estStructurelle, position) {
  const pcs = new Set(sonnantes.map(n => ((n.hauteur % 12) + 12) % 12));
  const iv = acc.intervalles;
  const tierce = iv.find(i => i === 3 || i === 4 || i === 5);
  const septieme = iv.find(i => i === 9 || i === 10 || i === 11);
  const attendues = [];
  if (tierce != null) attendues.push({ nom: acc.qualite.includes('sus') ? '4te' : '3ce', pc: (acc.fondamentale + tierce) % 12 });
  if (septieme != null) attendues.push({ nom: septieme === 9 ? (acc.qualite === 'dim7' ? '7e' : '6te') : '7e', pc: (acc.fondamentale + septieme) % 12 });
  const manquantes = attendues.filter(x => !pcs.has(x.pc)).map(x => x.nom);

  const fausses = [], passage = [], tensions = new Set();
  for (const n of attaquees) {
    const c = classerNote(acc, n.hauteur);
    const ivn = ((n.hauteur % 12) + 12 - acc.fondamentale) % 12;
    if (c === 'tension') tensions.add(degre(acc, ivn));
    if (c !== 'hors' && c !== 'eviter') continue;
    const info = { note: nomNote(n.hauteur), hauteur: n.hauteur, degre: degre(acc, ivn), classe: c, tempsDansMesure: position(n) };
    (estStructurelle(n) ? fausses : passage).push(info);
  }

  const voicings = [];
  const vues = new Set();
  for (const n of attaquees) {
    const a = n.attaque;
    if (vues.has(a) || a.notes.length < 2) continue;
    vues.add(a);
    voicings.push({ notes: a.notes.map(x => nomNote(x.hauteur)), ...typeVoicing(acc, a.notes.map(x => x.hauteur)) });
  }
  return {
    joue: attaquees.length > 0 || sonnantes.length > 0,
    notesJouees: [...pcs].map(pc => NOMS[pc]),
    fondamentale: pcs.has(acc.fondamentale),
    manquantes,
    tensions: [...tensions],
    fausses,
    passage: passage.length,
    voicings,
  };
}

// --- Jeu libre (rubato) ---------------------------------------------------------------

/** Suite des accords de la grille, dans l'ordre, sans N.C. ni prolongations (« / »). */
export function suiteAccords(grille, debut = 1, fin = grille.mesures.length) {
  const suite = [];
  for (let i = debut - 1; i < fin; i++) {
    for (const a of grille.mesures[i].accords) {
      if (a.nc) continue;
      const prec = suite.at(-1);
      if (a.prolonge && prec && prec.accord.symbole === a.symbole) continue;
      suite.push({ mesure: i, temps: a.temps, accord: a });
    }
  }
  return suite;
}

/**
 * Adéquation d'un ensemble de notes à un accord (plus c'est haut, mieux ça colle).
 * @param hauteurs notes qui sonnent ; @param basse note la plus grave attaquée (ou null)
 */
export function scoreHarmonique(accord, hauteurs, basse = null) {
  const pcs = new Set(hauteurs.map(h => ((h % 12) + 12) % 12));
  if (!pcs.size) return 0;
  const guides = new Set(accord.notesGuides);
  let sc = 0;
  for (const pc of pcs) {
    if (guides.has(pc)) sc += 2;
    else if (accord.classes.includes(pc)) sc += 1;
    else {
      const c = classerNote(accord, pc + 60);
      sc += c === 'tension' ? 0.3 : c === 'eviter' ? -0.8 : -1.5;
    }
  }
  if (basse != null && (((basse % 12) + 12) % 12 === accord.basse || ((basse % 12) + 12) % 12 === accord.fondamentale)) sc += 1.5;
  return sc;
}

function analyserPriseLibre(prise, S) {
  const grille = lireGrille(prise.grille.texte, { transposition: prise.grille.transposition || 0 });
  const [d, f] = prise.plage ? [prise.plage.debut, prise.plage.fin] : [1, grille.mesures.length];
  const suite = suiteAccords(grille, d, f);
  if (!suite.length) throw new Error('aucun accord dans la grille');

  const pedale = (prise.pedale || []).slice().sort((a, b) => a.t - b.t);
  const pedaleEnfonceeA = (t) => { let e = false; for (const p of pedale) { if (p.t > t) break; e = p.enfoncee; } return e; };
  const relachePedaleApres = (t) => pedale.find(p => p.t > t && !p.enfoncee)?.t ?? Infinity;
  const notes = prise.notes.filter(n => (n.velocite ?? 64) >= S.velociteMin).map(n => ({
    hauteur: n.hauteur, velocite: n.velocite, debut: n.debut, fin: n.fin,
    finSonore: pedaleEnfonceeA(n.fin) ? Math.min(Math.max(n.fin, relachePedaleApres(n.fin)), n.fin + S.pedaleMaxMs) : n.fin,
  })).sort((a, b) => a.debut - b.debut);

  // Attaques, puis fenêtres harmoniques délimitées par les attaques d'accord (≥ 2 notes).
  // En jeu libre les accords sont souvent roulés (« Play freely ») : on enchaîne les notes
  // séparées de moins de attaqueLibreMs de la précédente.
  const attaques = [];
  for (const n of notes) {
    const a = attaques.at(-1);
    if (a && (n.debut - a.debut <= S.attaqueMs || n.debut - a.derniere <= S.attaqueLibreMs)) { a.notes.push(n); a.derniere = n.debut; }
    else attaques.push({ debut: n.debut, derniere: n.debut, notes: [n] });
  }
  for (const a of attaques) { a.notes.sort((x, y) => x.hauteur - y.hauteur); for (const n of a.notes) n.attaque = a; }
  const bornes = attaques.filter(a => a.notes.length >= 2);
  const reperes = bornes.length >= 2 ? bornes : attaques; // jeu en notes isolées : chaque attaque
  const finPrise = Math.max(0, ...notes.map(n => n.finSonore));
  const fenetres = reperes.map((a, k) => {
    const debut = k === 0 ? Math.min(a.debut, notes[0]?.debut ?? a.debut) : a.debut;
    const fin = k + 1 < reperes.length ? reperes[k + 1].debut : finPrise + 1;
    const attaquees = notes.filter(n => n.debut >= debut - 1e-6 && n.debut < fin - 1e-6);
    const duree = fin - debut;
    const sonnantes = notes.filter(n => Math.min(n.finSonore, fin) - Math.max(n.debut, debut) >= Math.min(250, duree * 0.5));
    return { debut, fin, attaquees, sonnantes, basse: a.notes[0].hauteur };
  });
  if (!fenetres.length) throw new Error('aucune note jouée');

  // Alignement monotone fenêtres → accords (programmation dynamique)
  const W = fenetres.length, N = suite.length, MOINS = -1e9;
  const sc = fenetres.map(fw => suite.map(s => scoreHarmonique(s.accord, fw.sonnantes.map(n => n.hauteur), fw.basse)));
  const dp = Array.from({ length: W }, () => new Float64Array(N).fill(MOINS));
  const prec = Array.from({ length: W }, () => new Int32Array(N).fill(-1));
  for (let j = 0; j < N; j++) dp[0][j] = sc[0][j] - S.sauterAccord * j;
  for (let w = 1; w < W; w++) {
    for (let j = 0; j < N; j++) {
      let best = MOINS, arg = -1;
      for (let k = 0; k <= j; k++) {
        const pen = k === j ? S.resterAccord : (j - k - 1) * S.sauterAccord;
        const v = dp[w - 1][k] - pen;
        if (v > best) { best = v; arg = k; }
      }
      dp[w][j] = best + sc[w][j];
      prec[w][j] = arg;
    }
  }
  let j = 0;
  for (let k = 1; k < N; k++) if (dp[W - 1][k] > dp[W - 1][j]) j = k;
  const affect = new Array(W);
  for (let w = W - 1; w >= 0; w--) { affect[w] = j; j = prec[w][j]; }
  const dernierJoue = affect[W - 1];

  // Rapport par accord de la grille (jusqu'au dernier accord atteint)
  const segments = suite.slice(0, dernierJoue + 1).map((s, idx) => {
    const fw = fenetres.filter((_, w) => affect[w] === idx);
    const attaquees = fw.flatMap(x => x.attaquees);
    const sonnantes = [...new Set(fw.flatMap(x => x.sonnantes))];
    const r = { tour: 0, mesure: s.mesure + 1, temps: s.temps + 1, symbole: s.accord.symbole, nc: false };
    if (!fw.length) return { ...r, joue: false, notesJouees: [], fondamentale: false, manquantes: [], tensions: [], fausses: [], passage: 0, voicings: [], decalageMs: null };
    const h = harmonie(s.accord, attaquees, sonnantes, n => n.attaque.notes.length >= 2 || (n.fin - n.debut) >= S.tenueLibreMs, () => null);
    return { ...r, ...h, decalageMs: null };
  });
  const resume = resumer(segments, S, prise, { rythme: false });
  resume.libre = true;
  resume.accordsGrille = suite.length;
  resume.arreteMesure = segments.at(-1)?.mesure ?? null;
  return { segments, resume };
}

function resumer(segs, S, prise, { rythme = true } = {}) {
  const harmo = segs.filter(s => !s.nc);
  const joues = harmo.filter(s => s.joue);
  const avecGuides = joues.filter(s => s.manquantes.length === 0);
  const decalages = joues.map(s => s.decalageMs).filter(d => d != null);
  const fausses = joues.flatMap(s => s.fausses.map(f => ({ mesure: s.mesure, tour: s.tour, symbole: s.symbole, ...f })));
  const manques = {};
  for (const s of joues) for (const m of s.manquantes) manques[m] = (manques[m] || 0) + 1;
  const types = {};
  for (const s of joues) for (const v of s.voicings) types[v.type] = (types[v.type] || 0) + 1;

  // Mesures à travailler : notes guides manquantes, fausses notes, attaques hors place
  const parMesure = {};
  for (const s of harmo) {
    const k = s.mesure;
    const p = (parMesure[k] ??= { mesure: k, score: 0, raisons: new Set() });
    if (!s.joue) { p.score += 2; p.raisons.add('accord non joué'); continue; }
    if (s.manquantes.length) { p.score += s.manquantes.length; p.raisons.add(`${s.symbole} : ${s.manquantes.join(' et ')} manquante${s.manquantes.length > 1 ? 's' : ''}`); }
    if (s.fausses.length) { p.score += 2 * s.fausses.length; p.raisons.add(`${s.symbole} : ${s.fausses.map(f => f.note.replace(/\d+$/, '')).join(', ')} hors accord`); }
    if (rythme && s.decalageMs != null && Math.abs(s.decalageMs) > 2 * S.enPlaceMs) { p.score += 1; p.raisons.add(`${s.symbole} : attaque ${s.decalageMs > 0 ? 'en retard' : 'en avance'} de ${Math.abs(s.decalageMs)} ms`); }
  }
  const aTravailler = Object.values(parMesure).filter(p => p.score > 0)
    .sort((a, b) => b.score - a.score || a.mesure - b.mesure).slice(0, 5)
    .map(p => ({ mesure: p.mesure, score: p.score, raisons: [...p.raisons] }));

  const r1 = (x) => x == null ? null : Math.round(x);
  return {
    titre: prise.grille.titre,
    tempo: prise.tempo,
    accords: harmo.length,
    accordsJoues: joues.length,
    notesGuidesCompletes: joues.length ? Math.round(100 * avecGuides.length / joues.length) : null, // %
    manquesParType: manques,
    faussesNotes: fausses.length,
    detailFausses: fausses.slice(0, 20),
    notesDePassage: joues.reduce((a, s) => a + s.passage, 0),
    voicings: types,
    mode: prise.mode || 'mesure',
    rythme: !rythme ? null : {
      attaquesMesurees: decalages.length,
      decalageMoyenMs: r1(moyenne(decalages)),
      decalageMedianMs: r1(mediane(decalages)),
      ecartTypeMs: r1(ecartType(decalages)),
      enPlace: decalages.length ? Math.round(100 * decalages.filter(d => Math.abs(d) <= S.enPlaceMs).length / decalages.length) : null, // %
    },
    aTravailler,
    pedale: statsPedale(prise, segs, S),
  };
}

/**
 * Indicateur de pédale de sustain : appuis, part du temps enfoncée, plus long appui d'affilée.
 * Durée de référence : de la première note à la fin de la dernière.
 */
export function statsPedale(prise, segs, S = SEUILS) {
  const notes = prise.notes || [];
  if (!notes.length) return null;
  const debut = Math.min(...notes.map(n => n.debut)), fin = Math.max(...notes.map(n => n.fin));
  const duree = Math.max(1, fin - debut);
  const ev = (prise.pedale || []).slice().sort((a, b) => a.t - b.t);
  const appuis = [];
  let depuis = null;
  for (const e of ev) {
    if (e.enfoncee && depuis == null) depuis = e.t;
    else if (!e.enfoncee && depuis != null) { appuis.push([depuis, e.t]); depuis = null; }
  }
  if (depuis != null) appuis.push([depuis, Math.max(depuis, fin)]); // jamais relevée avant la fin
  const dans = appuis.map(([a, b]) => [Math.max(a, debut), Math.min(b, fin)]).filter(([a, b]) => b > a);
  const total = dans.reduce((x, [a, b]) => x + (b - a), 0);
  const plusLong = dans.reduce((x, [a, b]) => Math.max(x, b - a), 0);
  const accords = segs.filter(s => !s.nc && s.joue).length;
  let alerte = null;
  if (plusLong >= S.pedaleLongueMs) {
    alerte = `Pédale enfoncée ${Math.round(plusLong / 1000)} s d'affilée : les accords se mélangent. ` +
      `Relève-la à chaque changement d'accord ; si tu l'as bien relevée, ton piano transmet mal la pédale (signale-le).`;
  }
  return {
    utilisee: dans.length > 0,
    appuis: dans.length,
    partEnfoncee: Math.round(100 * total / duree),   // %
    plusLongMs: Math.round(plusLong),
    dureeMoyenneMs: dans.length ? Math.round(total / dans.length) : 0,
    appuisParAccord: accords ? Math.round(100 * dans.length / accords) / 100 : null,
    alerte,
  };
}

/** Calibration : médiane des écarts entre chaque note et le temps le plus proche. */
export function calculerCalage(temps, debutsNotes) {
  const ts = temps.map(b => b.t).sort((a, b) => a - b);
  const ecarts = debutsNotes.map(t => {
    let best = Infinity;
    for (const b of ts) if (Math.abs(t - b) < Math.abs(best)) best = t - b;
    return best;
  }).filter(e => Number.isFinite(e) && Math.abs(e) < 300);
  return { calageMs: ecarts.length >= 4 ? Math.round(mediane(ecarts)) : null, ecarts, dispersionMs: ecartType(ecarts) };
}

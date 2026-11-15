// Lecture des notes écrites d'un MusicXML (partwise, non compressé), sans DOM : utilisable dans Node.
// Sert à comparer une prise aux notes de la partition (ADR-0005). Ne gère pas le .mxl (zip).

const PAS = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

const balise = (bloc, nom) => {
  const m = new RegExp(`<${nom}(?:\\s[^>]*)?>([\\s\\S]*?)</${nom}>`).exec(bloc);
  return m ? m[1].trim() : null;
};

/**
 * @returns {{ mesures: number, notes: Array<{mesure, temps, duree, hauteur, portee}> }}
 *   mesure : index 0-based ; temps, duree : en noires depuis le début de la mesure.
 *   Les notes liées (suite d'une liaison) et les notes d'ornement sont ignorées.
 */
export function lireNotesMusicXML(texte) {
  if (!/<score-partwise/.test(texte)) throw new Error('MusicXML « partwise » attendu');
  const partie = /<part\s[^>]*>([\s\S]*?)<\/part>/.exec(texte);
  if (!partie) throw new Error('aucune partie dans le MusicXML');
  const mesures = [...partie[1].matchAll(/<measure\b[^>]*>([\s\S]*?)<\/measure>/g)].map(m => m[1]);
  let divisions = 1;
  const notes = [];
  mesures.forEach((m, i) => {
    let pos = 0, dernierDebut = 0;
    for (const el of m.matchAll(/<(note|backup|forward|attributes)\b[^>]*>([\s\S]*?)<\/\1>/g)) {
      const [, type, corps] = el;
      if (type === 'attributes') { const d = balise(corps, 'divisions'); if (d) divisions = +d; continue; }
      const duree = +(balise(corps, 'duration') || 0);
      if (type === 'backup') { pos -= duree; continue; }
      if (type === 'forward') { pos += duree; continue; }
      if (/<grace\b/.test(corps)) continue;
      const accord = /<chord\s*\/>/.test(corps);
      const debut = accord ? dernierDebut : pos;
      if (!accord) { dernierDebut = pos; pos += duree; }
      if (/<rest\b/.test(corps)) continue;
      const pitch = balise(corps, 'pitch');
      if (!pitch) continue;
      // suite d'une liaison : la note ne se rejoue pas
      if (/<tie\s+type="stop"/.test(corps) && !/<tie\s+type="start"/.test(corps)) continue;
      const hauteur = 12 * (+balise(pitch, 'octave') + 1) + PAS[balise(pitch, 'step')] + Math.round(+(balise(pitch, 'alter') || 0));
      notes.push({ mesure: i, temps: debut / divisions, duree: duree / divisions, hauteur, portee: +(balise(corps, 'staff') || 1) });
    }
  });
  return { mesures: mesures.length, notes };
}

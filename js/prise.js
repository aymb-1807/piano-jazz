// Enregistrement d'une prise : notes MIDI + temps entendus de l'accompagnement.
// Tout est stocké brut (repère performance.now()) puis converti à l'arrêt (ADR-0003).

export class EntreeMidi {
  constructor() { this.acces = null; this.ecouteurs = new Set(); this.noms = []; }

  get disponible() { return !!navigator.requestMIDIAccess; }

  async connecter() {
    if (!navigator.requestMIDIAccess) throw new Error('Web MIDI indisponible : ouvre la page dans Chrome');
    this.acces = await navigator.requestMIDIAccess({ sysex: false });
    const brancher = () => {
      const ins = [...this.acces.inputs.values()];
      ins.forEach(i => { i.onmidimessage = e => this.ecouteurs.forEach(f => f(e.data, e.timeStamp)); });
      this.noms = ins.map(i => i.name || 'entrée MIDI');
      this.surEtat?.(this.noms);
    };
    this.acces.onstatechange = brancher;
    brancher();
    return this.noms;
  }

  ecouter(f) { this.ecouteurs.add(f); return () => this.ecouteurs.delete(f); }
}

export class Enregistreur {
  constructor() { this.actif = false; }

  demarrer(contexte) {
    this.contexte = contexte;   // { grille: {id, titre, texte, transposition}, tempo, calageMs }
    this.temps = [];            // { tour, mesure, temps, decompte, tPerf }
    this.notes = [];            // { hauteur, debut, fin, velocite } en tPerf
    this.ouvertes = new Map();  // hauteur -> note en cours
    this.pedale = [];
    this.tour = 0;
    this.derniereMesure = null;
    this.actif = true;
  }

  /** Événement de l'accompagnement (au moment où il est entendu). */
  surTemps(e) {
    if (!this.actif) return;
    if (!e.decompte) {
      if (this.derniereMesure != null && e.mesure < this.derniereMesure) this.tour++; // retour au début de la boucle
      this.derniereMesure = e.mesure;
    }
    this.temps.push({ tour: this.tour, mesure: e.mesure, temps: e.temps, decompte: !!e.decompte, tPerf: e.tPerf });
  }

  /** Message MIDI brut avec son horodatage (performance.now()). */
  surMidi(data, t) {
    if (!this.actif) return;
    const [st, d1, d2] = data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) {
      this.fermer(d1, t);
      const n = { hauteur: d1, debut: t, fin: null, velocite: d2 };
      this.notes.push(n); this.ouvertes.set(d1, n);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      this.fermer(d1, t);
    } else if (cmd === 0xb0 && d1 === 64) {
      const enfoncee = d2 >= 64;
      if (this.pedale.at(-1)?.enfoncee !== enfoncee) this.pedale.push({ t, enfoncee });
    }
  }

  fermer(h, t) { const n = this.ouvertes.get(h); if (n) { n.fin = t; this.ouvertes.delete(h); } }

  /** Termine et renvoie la prise au format piano-jazz/prise@1, ou null si rien d'exploitable. */
  arreter() {
    if (!this.actif) return null;
    this.actif = false;
    const fin = performance.now();
    for (const h of [...this.ouvertes.keys()]) this.fermer(h, fin);
    const premier = this.temps.find(b => !b.decompte);
    if (!premier || this.temps.filter(b => !b.decompte).length < 2) return null;
    const t0 = premier.tPerf;
    const r = (x) => Math.round((x - t0) * 10) / 10;
    return {
      format: 'piano-jazz/prise@1',
      date: new Date().toISOString(),
      grille: this.contexte.grille,
      tempo: this.contexte.tempo,
      calageMs: this.contexte.calageMs || 0,
      temps: this.temps.map(b => ({ tour: b.tour, mesure: b.mesure, temps: b.temps, ...(b.decompte ? { decompte: true } : {}), t: r(b.tPerf) })),
      notes: this.notes.map(n => ({ hauteur: n.hauteur, debut: r(n.debut), fin: r(n.fin), velocite: n.velocite })),
      pedale: this.pedale.map(p => ({ t: r(p.t), enfoncee: p.enfoncee })),
    };
  }
}

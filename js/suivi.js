// Suivi en temps réel de la position dans la grille, en jeu libre (rubato), d'après les accords joués.
// Utilisé seulement pour l'affichage (accord en cours, curseur) : l'analyse finale refait un
// alignement complet de la prise (analyse.js, analyserPriseLibre).

import { suiteAccords, scoreHarmonique } from './analyse.js?v=2026-11-15k';

const REGROUPEMENT_MS = 170;  // attendre la fin d'un accord (plaqué ou roulé) avant d'évaluer
const MARGE = 1.0;            // avance seulement si l'accord suivant colle nettement mieux
const SAUT = 3;               // pénalité pour sauter un accord (comme l'alignement final)

export class SuiveurHarmonique {
  constructor(grille, debut, fin) {
    this.suite = suiteAccords(grille, debut, fin);
    this.pos = 0;
    this.tenues = new Set();      // notes enfoncées
    this.soutenues = new Set();   // notes relâchées mais tenues par la pédale
    this.pedale = false;
    this.recentes = [];           // attaques récentes : { hauteur, t }
    this.minuterie = null;
    this.surChangement = null;    // callback(element de la suite, index)
  }

  get courant() { return this.suite[this.pos]; }

  surMidi(data, t = performance.now()) {
    const [st, d1, d2] = data, cmd = st & 0xf0;
    if (cmd === 0x90 && d2 > 0) {
      this.tenues.add(d1); this.soutenues.delete(d1);
      this.recentes.push({ hauteur: d1, t });
      clearTimeout(this.minuterie);
      this.minuterie = setTimeout(() => this.evaluer(), REGROUPEMENT_MS);
    } else if (cmd === 0x80 || (cmd === 0x90 && d2 === 0)) {
      this.tenues.delete(d1);
      if (this.pedale) this.soutenues.add(d1);
    } else if (cmd === 0xb0 && d1 === 64) {
      this.pedale = d2 >= 64;
      if (!this.pedale) this.soutenues.clear();
    }
  }

  evaluer() {
    const maintenant = performance.now();
    // notes enchaînées à moins de 170 ms l'une de l'autre = un même accord (éventuellement roulé)
    const rec = this.recentes.filter(r => maintenant - r.t <= 1500).sort((a, b) => a.t - b.t);
    let k = rec.length - 1;
    while (k > 0 && rec[k].t - rec[k - 1].t <= REGROUPEMENT_MS) k--;
    const attaque = rec.slice(k);
    this.recentes = attaque;
    // une note isolée (mélodie) ne fait pas changer d'accord ; un accord plaqué, si
    if (attaque.length < 2) return;
    const sonnent = [...new Set([...this.tenues, ...this.soutenues])];
    const basse = Math.min(...attaque.map(a => a.hauteur));
    const score = (j) => scoreHarmonique(this.suite[j].accord, sonnent, basse);
    const actuel = score(this.pos);
    let meilleur = this.pos, meilleurScore = actuel + MARGE;
    for (let k = 1; k <= 2 && this.pos + k < this.suite.length; k++) {
      const v = score(this.pos + k) - SAUT * (k - 1);
      if (v > meilleurScore) { meilleur = this.pos + k; meilleurScore = v; }
    }
    if (meilleur !== this.pos) {
      this.pos = meilleur;
      this.surChangement?.(this.courant, this.pos);
    }
  }

  arreter() { clearTimeout(this.minuterie); }
}

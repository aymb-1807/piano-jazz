// Accompagnement Web Audio : contrebasse + batterie aux balais (ballade), ou métronome.
// Ordonnanceur à anticipation (horloge AudioContext) pour un placement précis
// même à 50 BPM. Chaque temps joué est horodaté dans le repère performance.now()
// – le même que les horodatages MIDI – pour l'analyse rythmique de l'étape 3.

import { accordA } from './grille.js?v=2026-11-15g';

const ANTICIPATION = 0.15; // s d'audio programmé à l'avance
const PERIODE = 25;        // ms entre deux passages de l'ordonnanceur

export class Accompagnement {
  constructor() {
    this.ctx = null;
    this.enCours = false;
    this.reglages = {
      tempo: 60,
      mode: 'accomp',        // 'accomp' (balais, ballade) | 'swing' (ride) | 'metro'
      basse: 'deux',         // 'deux' (2 temps, ballade) | 'walking'
      metro: 'tous',         // 'tous' | '24' (temps 2 et 4)
      decompte: 1,           // mesures de décompte : 0, 1, 2
      volBasse: 0.8, volBatterie: 0.6, volMetro: 0.7,
    };
    this.surTemps = null;    // callback(evt) au moment où le temps est entendu
    this.surFin = null;
    this.chronologie = [];   // [{ mesure, temps, decompte, tAudio, tPerf }]
  }

  async initialiser() {
    if (this.ctx) { if (this.ctx.state !== 'running') await this.ctx.resume(); return; }
    this.ctx = new AudioContext({ latencyHint: 'interactive' });
    const c = this.ctx;
    this.sortie = c.createDynamicsCompressor();
    this.sortie.threshold.value = -14; this.sortie.ratio.value = 3;
    this.sortie.connect(c.destination);
    this.busBasse = gain(c, this.reglages.volBasse, this.sortie);
    this.busBatterie = gain(c, this.reglages.volBatterie, this.sortie);
    this.busMetro = gain(c, this.reglages.volMetro, this.sortie);
    // bruit blanc partagé (balais, charleston)
    const len = c.sampleRate * 2;
    this.bruit = c.createBuffer(1, len, c.sampleRate);
    const d = this.bruit.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
  }

  regler(cle, val) {
    this.reglages[cle] = val;
    if (!this.ctx) return;
    const t = this.ctx.currentTime;
    if (cle === 'volBasse') this.busBasse.gain.setTargetAtTime(val, t, 0.03);
    if (cle === 'volBatterie') this.busBatterie.gain.setTargetAtTime(val, t, 0.03);
    if (cle === 'volMetro') this.busMetro.gain.setTargetAtTime(val, t, 0.03);
  }

  /**
   * @param grille  résultat de lireGrille()
   * @param opts    { debut, fin } : mesures 1-based incluses ; { boucle }
   */
  async demarrer(grille, { debut = 1, fin = grille.mesures.length, boucle = false } = {}) {
    await this.initialiser();
    this.arreter();
    this.grille = grille;
    this.debut = debut - 1; this.fin = fin - 1; this.boucle = boucle;
    this.tpm = grille.mesures[0].tempsParMesure;
    this.ligneBasse = construireBasse(grille, this.debut, this.fin, this.reglages.basse, boucle);
    this.chronologie = [];
    this.file = [];
    this.dernierEntendu = null;
    // position : décompte puis grille
    this.nbDecompte = this.reglages.decompte * this.tpm;
    this.pos = { decompte: 0, mesure: this.debut, temps: 0 };
    this.prochain = this.ctx.currentTime + 0.12;
    this.enCours = true;
    this.minuterie = setInterval(() => this.ordonnancer(), PERIODE);
    this.ordonnancer();
    this.boucleAffichage();
  }

  arreter() {
    if (!this.enCours) return;
    this.enCours = false;
    clearInterval(this.minuterie);
    cancelAnimationFrame(this.raf);
    // coupe ce qui est déjà programmé
    const t = this.ctx.currentTime;
    for (const bus of [this.busBasse, this.busBatterie, this.busMetro]) {
      bus.gain.cancelScheduledValues(t);
      bus.gain.setValueAtTime(bus.gain.value, t);
      bus.gain.linearRampToValueAtTime(0, t + 0.05);
      bus.gain.setValueAtTime(0, t + 0.06);
    }
    setTimeout(() => {
      this.busBasse.gain.value = this.reglages.volBasse;
      this.busBatterie.gain.value = this.reglages.volBatterie;
      this.busMetro.gain.value = this.reglages.volMetro;
    }, 80);
  }

  dureeTemps() { return 60 / this.reglages.tempo; }

  ordonnancer() {
    if (!this.enCours) return;
    while (this.prochain < this.ctx.currentTime + ANTICIPATION) {
      const t = this.prochain;
      const p = this.pos;
      let evt;
      if (p.decompte < this.nbDecompte) {
        const temps = p.decompte % this.tpm;
        const mesureDecompte = Math.floor(p.decompte / this.tpm);
        // décompte jazz sur 2 mesures : « 1 – 2 – | 1 2 3 4 »
        const jazz2 = this.reglages.decompte === 2 && mesureDecompte === 0;
        const audible = !jazz2 || temps % 2 === 0;
        if (audible) this.clic(t, temps === 0 ? 1 : 0.6, temps === 0);
        const libelle = jazz2 ? (temps % 2 === 0 ? String(temps / 2 + 1) : '') : String(temps + 1);
        evt = { decompte: true, libelle, temps, mesure: null, tAudio: t };
        p.decompte++;
      } else {
        this.jouerTemps(t, p.mesure, p.temps);
        evt = { decompte: false, mesure: p.mesure, temps: p.temps, tAudio: t };
        p.temps++;
        if (p.temps >= this.tpm) {
          p.temps = 0; p.mesure++;
          if (p.mesure > this.fin) {
            if (this.boucle) p.mesure = this.debut;
            else { evt.dernier = true; this.prochain = Infinity; }
          }
        }
      }
      this.file.push(evt);
      this.chronologie.push(evt);
      if (evt.dernier) this.file.push({ finGrille: true, tAudio: t + this.dureeTemps() });
      if (this.prochain !== Infinity) this.prochain += this.dureeTemps();
    }
  }

  // Conversion temps audio → performance.now() (tient compte de la latence de sortie).
  versPerf(tAudio) {
    const ts = this.ctx.getOutputTimestamp?.();
    if (ts && ts.performanceTime) return ts.performanceTime + (tAudio - ts.contextTime) * 1000;
    const lat = (this.ctx.outputLatency || this.ctx.baseLatency || 0);
    return performance.now() + (tAudio - this.ctx.currentTime + lat) * 1000;
  }

  // Synchronise l'affichage sur ce qui est réellement entendu.
  boucleAffichage() {
    const tick = () => {
      if (!this.enCours) return;
      const ts = this.ctx.getOutputTimestamp?.();
      const entendu = ts && ts.contextTime ? ts.contextTime : this.ctx.currentTime - (this.ctx.outputLatency || 0);
      while (this.file.length && this.file[0].tAudio <= entendu) {
        const e = this.file.shift();
        e.tPerf = this.versPerf(e.tAudio);
        if (e.finGrille) { this.arreter(); this.surFin?.(); return; }
        this.dernierEntendu = e;
        this.surTemps?.(e);
      }
      // position continue (temps décimal) pour un curseur fluide sur la partition
      const d = this.dernierEntendu;
      if (d && !d.decompte && this.surImage) {
        const frac = Math.min(0.999, Math.max(0, (entendu - d.tAudio) / this.dureeTemps()));
        this.surImage(d.mesure, d.temps + frac);
      }
      this.raf = requestAnimationFrame(tick);
    };
    this.raf = requestAnimationFrame(tick);
  }

  jouerTemps(t, iMesure, temps) {
    const r = this.reglages;
    if (r.mode === 'metro') {
      if (r.metro === 'tous' || temps % 2 === 1) this.clic(t, temps === 0 ? 1 : 0.6, temps === 0 && r.metro === 'tous');
      return;
    }
    if (accordA(this.grille, iMesure, temps)?.nc) { this.clic(t, temps === 0 ? 1 : 0.6, temps === 0); return; }
    if (r.mode === 'swing') this.ride(t, temps); else this.batterie(t, temps);
    for (const n of this.ligneBasse[iMesure] || []) {
      if (Math.abs(n.temps - temps) < 1e-6) this.noteBasse(t, n.midi, n.duree * this.dureeTemps());
      // notes hors temps (non utilisées pour l'instant, prévu pour des croches d'approche)
      else if (n.temps > temps && n.temps < temps + 1) this.noteBasse(t + (n.temps - temps) * this.dureeTemps(), n.midi, n.duree * this.dureeTemps());
    }
  }

  // --- Sons ---------------------------------------------------------------

  clic(t, vel, aigu) {
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.value = aigu ? 1760 : 1200;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.5 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.06);
    o.connect(g).connect(this.busMetro);
    o.start(t); o.stop(t + 0.08);
  }

  noteBasse(t, midi, duree) {
    const c = this.ctx, f = 440 * 2 ** ((midi - 69) / 12);
    const o1 = c.createOscillator(), o2 = c.createOscillator();
    o1.type = 'triangle'; o1.frequency.value = f;
    o2.type = 'sine'; o2.frequency.value = f;
    const filtre = c.createBiquadFilter();
    filtre.type = 'lowpass'; filtre.Q.value = 1.2;
    filtre.frequency.setValueAtTime(1400, t);
    filtre.frequency.exponentialRampToValueAtTime(380, t + 0.25);
    const g = c.createGain();
    const tenue = Math.max(0.15, duree * 0.9);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.55, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.28, t + 0.3);
    g.gain.exponentialRampToValueAtTime(0.12, t + tenue);
    g.gain.linearRampToValueAtTime(0, t + tenue + 0.08);
    const g2 = c.createGain(); g2.gain.value = 0.6;
    o1.connect(filtre); o2.connect(g2).connect(filtre);
    filtre.connect(g).connect(this.busBasse);
    // attaque du doigt sur la corde
    this.bruitFiltre(t, 'bandpass', 900, 0.08, 0.02, this.busBasse, 1.5);
    for (const o of [o1, o2]) { o.start(t); o.stop(t + tenue + 0.1); }
  }

  // Batterie swing : ride « ding, ding-ga, ding, ding-ga », charleston au pied sur 2 et 4.
  ride(t, temps) {
    const d = this.dureeTemps();
    this.coupRide(t, temps % 2 === 0 ? 0.55 : 0.45);
    if (temps % 2 === 1) {
      this.coupRide(t + d * 2 / 3, 0.3);                                  // croche swinguée (ternaire)
      this.bruitFiltre(t, 'highpass', 7500, 0.05, 0.14, this.busBatterie); // charleston au pied
    }
    // grosse caisse « plume » sur les 4 temps, à peine audible
    const c = this.ctx, o = c.createOscillator(), g = c.createGain();
    o.frequency.setValueAtTime(80, t);
    o.frequency.exponentialRampToValueAtTime(45, t + 0.1);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.12, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
    o.connect(g).connect(this.busBatterie);
    o.start(t); o.stop(t + 0.2);
  }

  // Cymbale ride : oscillateurs carrés inharmoniques + bruit, filtrés dans l'aigu.
  coupRide(t, vel) {
    const c = this.ctx;
    const passeHaut = c.createBiquadFilter(); passeHaut.type = 'highpass'; passeHaut.frequency.value = 6000;
    const bande = c.createBiquadFilter(); bande.type = 'bandpass'; bande.frequency.value = 9000; bande.Q.value = 0.8;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(0.11 * vel, t + 0.002);
    g.gain.exponentialRampToValueAtTime(0.03 * vel, t + 0.12);
    g.gain.exponentialRampToValueAtTime(0.001, t + 0.9);
    bande.connect(passeHaut).connect(g).connect(this.busBatterie);
    for (const r of [2, 3, 4.16, 5.43, 6.79, 8.21]) {
      const o = c.createOscillator(); o.type = 'square'; o.frequency.value = 205 * r;
      o.connect(bande); o.start(t); o.stop(t + 0.95);
    }
    this.bruitFiltre(t, 'highpass', 8000, 0.25, 0.05 * vel, this.busBatterie);
  }

  batterie(t, temps) {
    const d = this.dureeTemps();
    // balai gauche : balayage circulaire continu, un geste par demi-mesure
    if (temps % 2 === 0) this.balayage(t, 2 * d);
    // balai droit : frappe sur 2 et 4 ; charleston au pied sur 2 et 4
    if (temps % 2 === 1) {
      this.bruitFiltre(t, 'bandpass', 2800, 0.16, 0.18, this.busBatterie, 0.8);
      this.bruitFiltre(t, 'highpass', 7000, 0.05, 0.12, this.busBatterie);
    }
    // grosse caisse « plume » sur 1 et 3, très discrète
    if (temps % 2 === 0) {
      const c = this.ctx, o = c.createOscillator(), g = c.createGain();
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(temps === 0 ? 0.35 : 0.22, t + 0.005);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.25);
      o.connect(g).connect(this.busBatterie);
      o.start(t); o.stop(t + 0.3);
    }
  }

  balayage(t, duree) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = this.bruit;
    s.loop = true;
    const f = c.createBiquadFilter();
    f.type = 'bandpass'; f.Q.value = 0.6;
    f.frequency.setValueAtTime(1800, t);
    f.frequency.linearRampToValueAtTime(3200, t + duree * 0.5);
    f.frequency.linearRampToValueAtTime(1800, t + duree);
    const g = c.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(0.06, t + duree * 0.35);
    g.gain.linearRampToValueAtTime(0.035, t + duree * 0.8);
    g.gain.linearRampToValueAtTime(0.0001, t + duree);
    s.connect(f).connect(g).connect(this.busBatterie);
    s.start(t, Math.random()); s.stop(t + duree + 0.02);
  }

  bruitFiltre(t, type, freq, duree, niveau, dest, q = 0.7) {
    const c = this.ctx, s = c.createBufferSource();
    s.buffer = this.bruit;
    const f = c.createBiquadFilter();
    f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = c.createGain();
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(niveau, t + 0.004);
    g.gain.exponentialRampToValueAtTime(0.001, t + duree);
    s.connect(f).connect(g).connect(dest);
    s.start(t, Math.random()); s.stop(t + duree + 0.02);
  }
}

function gain(c, v, dest) { const g = c.createGain(); g.gain.value = v; g.connect(dest); return g; }

// ---------------------------------------------------------------------------
// Ligne de basse

const BAS = 28, HAUT = 50, CENTRE = 38; // E1 – D3, centre D2

function plusProche(pc, ref) {
  // note de classe pc la plus proche de ref, dans la tessiture
  let best = null;
  for (let m = BAS; m <= HAUT; m++) {
    if (m % 12 !== pc) continue;
    const score = Math.abs(m - ref) + Math.abs(m - CENTRE) * 0.25;
    if (!best || score < best.s) best = { m, s: score };
  }
  return best.m;
}

/**
 * Construit la ligne de basse pour les mesures [debut, fin] (0-based).
 * @returns {Object<number, Array<{temps, midi, duree}>>} indexé par mesure.
 */
export function construireBasse(grille, debut, fin, style, boucle) {
  // segments : accord + durée, à plat
  const segs = [];
  for (let i = debut; i <= fin; i++) {
    for (const a of grille.mesures[i].accords) segs.push({ mesure: i, ...a });
  }
  // fusionne les « / » de début de mesure qui prolongent l'accord précédent
  const out = {};
  let prec = CENTRE;
  segs.forEach((s, k) => {
    let suiv = segs[k + 1] || (boucle ? segs[0] : null);
    if (suiv?.nc) suiv = null;
    const notes = (out[s.mesure] ??= []);
    if (s.nc) return;
    if (s.prolonge && style === 'deux') return; // la note précédente tient
    const racine = s.prolonge ? prec : plusProche(s.basse, prec);
    const quinte = plusProche((s.fondamentale + (s.intervalles.includes(6) && !s.intervalles.includes(7) ? 6 : s.intervalles.includes(8) ? 8 : 7)) % 12, racine);
    const tierce = plusProche((s.fondamentale + (s.intervalles.find(i => i >= 3 && i <= 5) ?? 4)) % 12, racine);
    const cible = suiv ? plusProche(suiv.basse, racine) : racine;
    // demi-ton vers l'accord suivant, côté opposé à la note qu'on quitte
    let approche = cible + (cible > racine ? -1 : 1);
    if (approche === racine) approche = cible + (cible > racine ? 1 : -1);

    if (style === 'walking') {
      const n = Math.round(s.duree);
      // 3e temps : note de l'accord la plus proche de l'approche, sans la répéter
      const septieme = s.intervalles.find(i => i >= 9) != null ? plusProche((s.fondamentale + s.intervalles.find(i => i >= 9)) % 12, racine) : null;
      const cands = [quinte, quinte + 12, quinte - 12, tierce, tierce + 12, tierce - 12, septieme, racine + 12, racine - 12]
        .filter(m => m != null && m >= BAS && m <= HAUT && m !== approche && m !== tierce && m !== racine);
      const t3 = cands.sort((a, b) => Math.abs(a - approche) - Math.abs(b - approche))[0] ?? quinte;
      const choix = n >= 4 ? [racine, tierce, t3, approche]
        : n === 3 ? [racine, quinte, approche]
        : n === 2 ? [racine, suiv && suiv.basse !== s.basse ? approche : quinte]
        : [racine];
      choix.forEach((m, j) => notes.push({ temps: s.temps + j, midi: m, duree: 1 }));
      prec = choix.at(-1);
    } else {
      // 2 temps (ballade) : blanches, fondamentale puis quinte ou approche chromatique
      if (s.duree >= 4) {
        const changeEnsuite = suiv && suiv.basse !== s.basse;
        const deuxieme = changeEnsuite && s.mesure % 2 === 1 ? approche : quinte;
        notes.push({ temps: s.temps, midi: racine, duree: 2 });
        notes.push({ temps: s.temps + 2, midi: deuxieme, duree: s.duree - 2 });
        prec = deuxieme;
      } else {
        notes.push({ temps: s.temps, midi: racine, duree: s.duree });
        prec = racine;
      }
    }
  });
  return out;
}

export { accordA };

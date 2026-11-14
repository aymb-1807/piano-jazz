// Partition importée (MusicXML / MXL) : stockage local et affichage avec curseur synchronisé.
// Le fichier reste sur l'appareil (IndexedDB) : il n'est jamais envoyé ni versionné (droits d'auteur).
// Voir docs/adr/0002-affichage-partition.md.

const SCRIPT_OSMD = 'vendor/osmd/opensheetmusicdisplay.min.js';
let chargementOSMD = null;

function chargerOSMD() {
  return (chargementOSMD ??= new Promise((ok, ko) => {
    if (window.opensheetmusicdisplay) return ok();
    const s = document.createElement('script');
    s.src = SCRIPT_OSMD;
    s.onload = () => ok();
    s.onerror = () => { chargementOSMD = null; ko(new Error('bibliothèque de partition introuvable')); };
    document.head.appendChild(s);
  }));
}

// --- Stockage local ----------------------------------------------------------

const BASE = 'piano-jazz', MAGASIN = 'partitions';

function ouvrirBase() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 1);
    r.onupgradeneeded = () => r.result.createObjectStore(MAGASIN);
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function transaction(mode, action) {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const tx = db.transaction(MAGASIN, mode);
    const req = action(tx.objectStore(MAGASIN));
    tx.oncomplete = () => { ok(req?.result); db.close(); };
    tx.onerror = () => { ko(tx.error); db.close(); };
  });
}

/** Enregistre le fichier choisi par l'utilisateur pour une grille donnée. */
export function enregistrerPartition(idGrille, fichier) {
  return transaction('readwrite', st => st.put({ nom: fichier.name, blob: fichier, date: Date.now() }, idGrille));
}
/** @returns {Promise<{nom, blob, date} | undefined>} */
export function lirePartition(idGrille) {
  return transaction('readonly', st => st.get(idGrille)).catch(() => undefined);
}
export function supprimerPartition(idGrille) {
  return transaction('readwrite', st => st.delete(idGrille));
}

// --- Affichage ---------------------------------------------------------------

export class VuePartition {
  constructor(conteneur) {
    this.conteneur = conteneur;
    this.osmd = null;
    this.debuts = [];   // début de chaque mesure, en rondes depuis le début
    this.zoom = 1;
  }

  /** @param source Blob (fichier importé) ou URL d'un fichier du dépôt */
  async charger(source) {
    await chargerOSMD();
    this.conteneur.innerHTML = '';
    const OSMD = window.opensheetmusicdisplay.OpenSheetMusicDisplay;
    this.osmd = new OSMD(this.conteneur, {
      autoResize: true,
      backend: 'svg',
      drawTitle: true,
      drawComposer: true,
      drawPartNames: false,
      followCursor: true,       // fait défiler la page pour garder le curseur visible
      pageBackgroundColor: '#fbf8f1',
    });
    await this.osmd.load(source);
    this.osmd.zoom = this.zoom;
    this.osmd.render();
    this.debuts = this.osmd.Sheet.SourceMeasures.map(m => m.AbsoluteTimestamp.RealValue);
    this.osmd.cursor.show();
    this.cible = -1;
    return { mesures: this.debuts.length, titre: this.osmd.Sheet.TitleString || '' };
  }

  get nbMesures() { return this.debuts.length; }

  regler(zoom) {
    this.zoom = zoom;
    if (!this.osmd) return;
    this.osmd.zoom = zoom;
    this.osmd.render();
    const c = this.cible; this.cible = -1;
    this.osmd.cursor.reset();
    if (c >= 0) this.allerA(c);
  }

  /**
   * Place le curseur sur la dernière note commencée à cette position.
   * @param iMesure  index de mesure (0-based) – même numérotation que la grille
   * @param temps    temps décimal dans la mesure (0 = premier temps)
   * @param denominateur  unité de temps (4 = noire)
   */
  placer(iMesure, temps, denominateur = 4) {
    if (!this.osmd || iMesure >= this.debuts.length) return;
    this.allerA(this.debuts[iMesure] + temps / denominateur);
  }

  allerA(cible) {
    if (Math.abs(cible - this.cible) < 1e-4) return;
    const cur = this.osmd.cursor;
    const eps = 1e-6;
    if (cur.Iterator.CurrentSourceTimestamp.RealValue > cible + eps) cur.reset();
    for (let garde = 0; garde < 2000; garde++) {
      const suivant = cur.Iterator.clone();
      suivant.moveToNext();
      if (suivant.EndReached || suivant.CurrentSourceTimestamp.RealValue > cible + eps) break;
      cur.next();
    }
    this.cible = cible;
  }

  revenirAuDebut() {
    if (!this.osmd) return;
    this.osmd.cursor.reset();
    this.cible = -1;
    this.conteneur.scrollTop = 0;
  }
}

// Partition importée (MusicXML / MXL) : stockage local et affichage avec curseur synchronisé.
// Le fichier reste sur l'appareil (IndexedDB) : il n'est jamais envoyé ni versionné (droits d'auteur).
// Voir docs/adr/0002-affichage-partition.md.

const SCRIPT_OSMD = 'vendor/osmd/opensheetmusicdisplay.min.js?v=2.2.1';
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

// Base locale commune : partitions importées (clé = id de grille) et prises enregistrées (étape 3).
const BASE = 'piano-jazz', MAGASIN = 'partitions', PRISES = 'prises';

function ouvrirBase() {
  return new Promise((ok, ko) => {
    const r = indexedDB.open(BASE, 2);
    r.onupgradeneeded = () => {
      const db = r.result;
      if (!db.objectStoreNames.contains(MAGASIN)) db.createObjectStore(MAGASIN);
      if (!db.objectStoreNames.contains(PRISES)) db.createObjectStore(PRISES, { autoIncrement: true });
    };
    r.onsuccess = () => ok(r.result);
    r.onerror = () => ko(r.error);
  });
}

async function transaction(mode, action, magasin = MAGASIN) {
  const db = await ouvrirBase();
  return new Promise((ok, ko) => {
    const tx = db.transaction(magasin, mode);
    const req = action(tx.objectStore(magasin));
    tx.oncomplete = () => { ok(req?.result); db.close(); };
    tx.onerror = () => { ko(tx.error); db.close(); };
  });
}

/** Conserve une prise (format piano-jazz/prise@1) pour le suivi de progression. */
export function enregistrerPrise(prise) {
  return transaction('readwrite', st => st.add(prise), PRISES);
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

// --- Réparation d'un MusicXML « emballé » ------------------------------------------
// Certains outils (tableur, export de données) enveloppent chaque ligne du fichier dans
// <root><row><colonne>…texte échappé…</colonne></row>…</root>. On reconstitue l'original.

const ENTITES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
function desechapper(t) {
  return t.replace(/&(#x[0-9a-f]+|#\d+|lt|gt|amp|quot|apos);/gi, (m, e) =>
    e[0] === '#' ? String.fromCodePoint(e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : ENTITES[e.toLowerCase()]);
}

/** @returns {string|null} le MusicXML reconstitué, ou null si le texte n'est pas emballé. */
export function deballerMusicXML(texte) {
  if (!/<root>\s*<row>/.test(texte.slice(0, 2000)) || !/score-(partwise|timewise)/.test(texte.slice(0, 5000))) return null;
  const lignes = [];
  const re = /<row>([\s\S]*?)<\/row>/g;
  let m;
  while ((m = re.exec(texte))) {
    const cellules = [...m[1].matchAll(/<([A-Za-z_][\w.-]*)>([\s\S]*?)<\/\1>/g)].map(c => desechapper(c[2]));
    lignes.push(cellules.join(''));
  }
  if (!lignes.length) return null;
  const corps = lignes.join('\n');
  return (corps.startsWith('<?xml') ? '' : '<?xml version="1.0" encoding="UTF-8"?>\n') + corps + '\n';
}

/** Si le fichier est un MusicXML emballé, renvoie un Blob réparé ; sinon le fichier tel quel. */
export async function reparerSiBesoin(fichier) {
  if (!(fichier instanceof Blob)) return { fichier, repare: false };
  const debut = new Uint8Array(await fichier.slice(0, 2).arrayBuffer());
  if (debut[0] === 0x50 && debut[1] === 0x4b) return { fichier, repare: false }; // .mxl (zip)
  const texte = await fichier.text();
  const repare = deballerMusicXML(texte);
  if (!repare) return { fichier, repare: false };
  const nom = (fichier.name || 'partition').replace(/\.xml$/i, '') + '.musicxml';
  return { fichier: new File([repare], nom, { type: 'application/vnd.recordare.musicxml+xml' }), repare: true };
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
      // pas de pageBackgroundColor : un fond opaque dans le SVG recouvre le curseur après un nouveau rendu
      // (redimensionnement, barre d'adresse Android) ; le fond est donné par le CSS du conteneur.
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

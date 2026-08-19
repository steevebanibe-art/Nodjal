// Generateur PDF minimal, sans dependance.
//
// Le certificat doit etre un fichier PDF reel : ouvrable partout, imprimable,
// archivable, et surtout hachable en un condensat stable. Une capture d'ecran ne
// remplit aucune de ces conditions.
//
// Le sous-ensemble implemente couvre exactement le besoin : polices de base
// (Helvetica et Courier, aucune police a embarquer), texte, traits, rectangles,
// couleurs, plusieurs pages. Encodage WinAnsi, ce qui donne les accents
// francais sans table de glyphes.

const A4 = { largeur: 595.28, hauteur: 841.89 };

const POLICES = {
  regulier: 'Helvetica',
  gras: 'Helvetica-Bold',
  italique: 'Helvetica-Oblique',
  mono: 'Courier',
  monoGras: 'Courier-Bold',
};

// Largeurs des glyphes Helvetica en millieme de cadratin. Table partielle :
// ASCII imprimable plus les caracteres accentues francais courants. Sert au
// retour a la ligne et au centrage.
const LARGEURS = (() => {
  const t = new Array(256).fill(556);
  const poser = (chaine, largeur) => { for (const c of chaine) t[c.charCodeAt(0)] = largeur; };
  poser(' !"#$%&\'()*+,-./', 278);
  poser('0123456789', 556);
  poser(':;', 278);
  poser('<=>', 584);
  poser('?', 556);
  poser('@', 1015);
  poser('ABCDEFGHIJKLMNOPQRSTUVWXYZ', 667);
  poser('IJ', 278);
  poser('MW', 833);
  poser('[\\]', 278);
  poser('^_`', 469);
  poser('abcdefghijklmnopqrstuvwxyz', 556);
  poser('fijlt', 278);
  poser('r', 333);
  poser('mw', 833);
  poser('{|}~', 334);
  poser('éèêëàâäùûüôöîïçÉÈÊÀÂÙÔÎÏÇ«»°', 556);
  t[32] = 278;
  return t;
})();

/** Largeur d'une chaine en points, pour une police donnee. */
export function largeurTexte(texte, taille, mono = false) {
  if (mono) return String(texte).length * taille * 0.6;
  let m = 0;
  for (const c of String(texte)) m += LARGEURS[c.charCodeAt(0) & 0xff] || 556;
  return (m / 1000) * taille;
}

/** Coupe un texte a une largeur donnee, en respectant les mots. */
export function decouper(texte, largeurMax, taille, mono = false) {
  const lignes = [];
  for (const paragraphe of String(texte).split('\n')) {
    let courante = '';
    for (const mot of paragraphe.split(/\s+/)) {
      const essai = courante ? `${courante} ${mot}` : mot;
      if (largeurTexte(essai, taille, mono) <= largeurMax || !courante) courante = essai;
      else { lignes.push(courante); courante = mot; }
    }
    lignes.push(courante);
  }
  return lignes;
}

const echapper = (s) => String(s).replace(/\\/g, '\\\\').replace(/\(/g, '\\(').replace(/\)/g, '\\)');

export class Document {
  constructor({ titre = 'Document', auteur = 'Nodjal', sujet = '', mots = [] } = {}) {
    this.meta = { titre, auteur, sujet, mots };
    this.pages = [];
    this.nouvellePage();
  }

  nouvellePage(marge = 56) {
    this.page = { flux: [], marge, y: A4.hauteur - marge };
    this.pages.push(this.page);
    return this.page;
  }

  get largeurUtile() { return A4.largeur - this.page.marge * 2; }
  get x0() { return this.page.marge; }

  /** Reserve de la place ; ouvre une page si le bloc ne tient pas. */
  reserver(hauteur) {
    if (this.page.y - hauteur < this.page.marge + 40) this.nouvellePage(this.page.marge);
    return this.page.y;
  }

  couleur(hex, trait = false) {
    const n = parseInt(hex.replace('#', ''), 16);
    const r = ((n >> 16) & 255) / 255;
    const v = ((n >> 8) & 255) / 255;
    const b = (n & 255) / 255;
    this.page.flux.push(`${r.toFixed(3)} ${v.toFixed(3)} ${b.toFixed(3)} ${trait ? 'RG' : 'rg'}`);
    return this;
  }

  texte(contenu, { x = null, y = null, taille = 10, police = 'regulier', couleur = '#111111', interligne = 1.45, largeur = null, aligne = 'gauche' } = {}) {
    const mono = police === 'mono' || police === 'monoGras';
    const px = x ?? this.x0;
    const lmax = largeur ?? this.largeurUtile - (px - this.x0);
    const lignes = decouper(contenu, lmax, taille, mono);
    const hauteurLigne = taille * interligne;
    let py = y ?? this.reserver(lignes.length * hauteurLigne);
    this.couleur(couleur);
    for (const ligne of lignes) {
      let lx = px;
      if (aligne === 'droite') lx = px + lmax - largeurTexte(ligne, taille, mono);
      else if (aligne === 'centre') lx = px + (lmax - largeurTexte(ligne, taille, mono)) / 2;
      this.page.flux.push(
        `BT /${police} ${taille} Tf 1 0 0 1 ${lx.toFixed(2)} ${(py - taille).toFixed(2)} Tm (${echapper(ligne)}) Tj ET`,
      );
      py -= hauteurLigne;
    }
    if (y === null) this.page.y = py;
    return this;
  }

  trait(x1, y1, x2, y2, { epaisseur = 0.6, couleur = '#D8D2C6' } = {}) {
    this.couleur(couleur, true);
    this.page.flux.push(`${epaisseur} w ${x1.toFixed(2)} ${y1.toFixed(2)} m ${x2.toFixed(2)} ${y2.toFixed(2)} l S`);
    return this;
  }

  separateur(marge = 12) {
    const y = this.reserver(marge * 2) - marge;
    this.trait(this.x0, y, this.x0 + this.largeurUtile, y);
    this.page.y = y - marge;
    return this;
  }

  rectangle(x, y, largeur, hauteur, { remplissage = null, contour = null, epaisseur = 0.6 } = {}) {
    if (remplissage) {
      this.couleur(remplissage);
      this.page.flux.push(`${x.toFixed(2)} ${y.toFixed(2)} ${largeur.toFixed(2)} ${hauteur.toFixed(2)} re f`);
    }
    if (contour) {
      this.couleur(contour, true);
      this.page.flux.push(`${epaisseur} w ${x.toFixed(2)} ${y.toFixed(2)} ${largeur.toFixed(2)} ${hauteur.toFixed(2)} re S`);
    }
    return this;
  }

  espace(h = 10) { this.page.y -= h; return this; }

  /** Bloc encadre, pour un verdict ou un avertissement. */
  encadre(lignes, { fond = '#F6F3EC', bord = '#D8D2C6', taille = 9.5, padding = 12 } = {}) {
    const contenu = Array.isArray(lignes) ? lignes : [lignes];
    const rendus = contenu.flatMap((l) =>
      decouper(l.texte ?? l, this.largeurUtile - padding * 2, l.taille ?? taille).map((t) => ({
        texte: t, taille: l.taille ?? taille, police: l.police ?? 'regulier', couleur: l.couleur ?? '#3C3831',
      })),
    );
    const hauteur = rendus.reduce((s, r) => s + r.taille * 1.5, 0) + padding * 2;
    const haut = this.reserver(hauteur + 8);
    this.rectangle(this.x0, haut - hauteur, this.largeurUtile, hauteur, { remplissage: fond, contour: bord });
    let y = haut - padding;
    for (const r of rendus) {
      this.texte(r.texte, { x: this.x0 + padding, y, taille: r.taille, police: r.police, couleur: r.couleur, largeur: this.largeurUtile - padding * 2 });
      y -= r.taille * 1.5;
    }
    this.page.y = haut - hauteur - 12;
    return this;
  }

  /** Tableau a colonnes fixes. colonnes : [{ titre, largeur, aligne, police }] */
  tableau(colonnes, rangs, { taille = 8.6, hauteurRang = 15 } = {}) {
    const total = colonnes.reduce((s, c) => s + c.largeur, 0);
    const echelle = this.largeurUtile / total;
    const dessinerEntete = () => {
      const y = this.reserver(hauteurRang + 6);
      this.rectangle(this.x0, y - hauteurRang, this.largeurUtile, hauteurRang, { remplissage: '#EFEBE2' });
      let x = this.x0;
      for (const c of colonnes) {
        const l = c.largeur * echelle;
        this.texte(c.titre, { x: x + 5, y: y - 3.5, taille: taille - 0.4, police: 'gras', couleur: '#5C564C', largeur: l - 10, aligne: c.aligne || 'gauche' });
        x += l;
      }
      this.page.y = y - hauteurRang;
    };
    dessinerEntete();
    for (const rang of rangs) {
      if (this.page.y - hauteurRang < this.page.marge + 40) { this.nouvellePage(this.page.marge); dessinerEntete(); }
      const y = this.page.y;
      let x = this.x0;
      for (const c of colonnes) {
        const l = c.largeur * echelle;
        const v = rang[c.cle];
        this.texte(v ?? '', {
          x: x + 5, y: y - 3, taille, police: c.police || 'regulier',
          couleur: rang._couleur || '#2A2721', largeur: l - 10, aligne: c.aligne || 'gauche',
        });
        x += l;
      }
      this.trait(this.x0, y - hauteurRang, this.x0 + this.largeurUtile, y - hauteurRang, { epaisseur: 0.4, couleur: '#E6E1D6' });
      this.page.y = y - hauteurRang;
    }
    this.espace(8);
    return this;
  }

  /** Pied de page repete sur chaque page, avec numerotation. */
  pied(texte) {
    this.piedDePage = texte;
    return this;
  }

  rendre() {
    const objets = [];
    const ajouter = (contenu) => { objets.push(contenu); return objets.length; };

    const polices = {};
    for (const [alias, nom] of Object.entries(POLICES)) {
      polices[alias] = ajouter(`<< /Type /Font /Subtype /Type1 /BaseFont /${nom} /Encoding /WinAnsiEncoding >>`);
    }

    const idPages = objets.length + 1 + this.pages.length * 2;
    const idsPage = [];

    for (let i = 0; i < this.pages.length; i++) {
      const page = this.pages[i];
      const flux = [...page.flux];
      if (this.piedDePage) {
        flux.push('0.545 0.522 0.478 rg');
        flux.push(`BT /regulier 7.5 Tf 1 0 0 1 ${page.marge} 30 Tm (${echapper(this.piedDePage)}) Tj ET`);
        const num = `${i + 1} / ${this.pages.length}`;
        const lx = A4.largeur - page.marge - largeurTexte(num, 7.5);
        flux.push(`BT /regulier 7.5 Tf 1 0 0 1 ${lx.toFixed(2)} 30 Tm (${echapper(num)}) Tj ET`);
      }
      const corps = flux.join('\n');
      const idFlux = ajouter(`<< /Length ${Buffer.byteLength(corps, 'latin1')} >>\nstream\n${corps}\nendstream`);
      const ressources = Object.entries(polices).map(([a, id]) => `/${a} ${id} 0 R`).join(' ');
      idsPage.push(
        ajouter(
          `<< /Type /Page /Parent ${idPages} 0 R /MediaBox [0 0 ${A4.largeur} ${A4.hauteur}] ` +
          `/Resources << /Font << ${ressources} >> >> /Contents ${idFlux} 0 R >>`,
        ),
      );
    }

    ajouter(`<< /Type /Pages /Kids [${idsPage.map((i) => `${i} 0 R`).join(' ')}] /Count ${idsPage.length} >>`);
    const idCatalogue = ajouter(`<< /Type /Catalog /Pages ${idPages} 0 R >>`);
    const idInfo = ajouter(
      `<< /Title (${echapper(this.meta.titre)}) /Author (${echapper(this.meta.auteur)}) ` +
      `/Subject (${echapper(this.meta.sujet)}) /Keywords (${echapper(this.meta.mots.join(', '))}) ` +
      `/Producer (Nodjal) /Creator (Nodjal) >>`,
    );

    const morceaux = [Buffer.from('%PDF-1.7\n%\xE2\xE3\xCF\xD3\n', 'latin1')];
    let offset = morceaux[0].length;
    const offsets = [0];
    for (let i = 0; i < objets.length; i++) {
      const b = Buffer.from(`${i + 1} 0 obj\n${objets[i]}\nendobj\n`, 'latin1');
      offsets.push(offset);
      offset += b.length;
      morceaux.push(b);
    }
    const debutXref = offset;
    let xref = `xref\n0 ${objets.length + 1}\n0000000000 65535 f \n`;
    for (let i = 1; i <= objets.length; i++) {
      xref += `${String(offsets[i]).padStart(10, '0')} 00000 n \n`;
    }
    xref += `trailer\n<< /Size ${objets.length + 1} /Root ${idCatalogue} 0 R /Info ${idInfo} 0 R >>\n`;
    xref += `startxref\n${debutXref}\n%%EOF\n`;
    morceaux.push(Buffer.from(xref, 'latin1'));
    return Buffer.concat(morceaux);
  }
}

export const PAGE = A4;

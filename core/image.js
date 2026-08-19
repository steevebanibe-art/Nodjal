// Extraction de luminance, sans aucune dependance.
//
// Pourquoi ecrire un decodeur plutot que d'installer une bibliotheque : le
// hachage perceptuel est le pivot de la contre-mesure T3 (photo rejouee). Une
// dependance de traitement d'image tire des binaires natifs, complique le
// deploiement en Edge Function, et nous rend tributaires d'un tiers sur la
// brique la plus sensible du produit. Le besoin reel tient en une ligne :
// obtenir une vignette de luminance. Nous la produisons directement.
//
// Le raccourci qui rend l'operation quasi gratuite en JPEG :
//   le coefficient DC de chaque bloc 8x8 EST la moyenne du bloc.
// Une image JPEG contient donc deja, gratuitement, sa propre vignette au
// huitieme de la resolution. On decode le flux d'entropie, on lit les DC du
// canal de luminance, on ignore tout le reste. Pas de transformee inverse, pas
// de sous-echantillonnage chromatique, pas de conversion colorimetrique.
//
// Limite assumee : le JPEG progressif n'est pas gere. Il est rare en sortie
// d'appareil photo mobile. Le decodeur le detecte et le dit, il ne devine pas.

import { inflateSync } from 'node:zlib';

const ZIGZAG = new Int32Array([
   0,  1,  8, 16,  9,  2,  3, 10,
  17, 24, 32, 25, 18, 11,  4,  5,
  12, 19, 26, 33, 40, 48, 41, 34,
  27, 20, 13,  6,  7, 14, 21, 28,
  35, 42, 49, 56, 57, 50, 43, 36,
  29, 22, 15, 23, 30, 37, 44, 51,
  58, 59, 52, 45, 38, 31, 39, 46,
  53, 60, 61, 54, 47, 55, 62, 63,
]);

export class ImageNonSupportee extends Error {}

/**
 * Rend {largeur, hauteur, luma} ou luma est un Float32Array de la vignette de
 * luminance, en balayage ligne par ligne, valeurs dans [0, 255].
 */
export function luminance(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return lumaJpeg(buf);
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return lumaPng(buf);
  throw new ImageNonSupportee('format non reconnu (attendu : JPEG ou PNG)');
}

/** Format de l'image, sans la decoder. */
export function format(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8) return 'image/jpeg';
  if (buf.length >= 8 && buf.readUInt32BE(0) === 0x89504e47) return 'image/png';
  return null;
}

// ---------------------------------------------------------------- JPEG

function lumaJpeg(buf) {
  const quant = new Array(4);
  const huffDC = new Array(4);
  const huffAC = new Array(4);
  let trame = null;
  let intervalleReprise = 0;
  let p = 2;

  while (p < buf.length) {
    if (buf[p] !== 0xff) { p++; continue; }
    let marqueur = buf[p + 1];
    while (marqueur === 0xff) { p++; marqueur = buf[p + 1]; }
    p += 2;
    if (marqueur === 0xd8 || marqueur === 0xd9 || (marqueur >= 0xd0 && marqueur <= 0xd7)) continue;
    if (marqueur === 0x01) continue;

    const longueur = buf.readUInt16BE(p);
    const bloc = buf.subarray(p + 2, p + longueur);

    switch (marqueur) {
      case 0xdb: lireQuant(bloc, quant); break;
      case 0xc4: lireHuffman(bloc, huffDC, huffAC); break;
      case 0xdd: intervalleReprise = bloc.readUInt16BE(0); break;

      case 0xc0: case 0xc1:
        trame = lireTrame(bloc);
        break;

      case 0xc2:
        throw new ImageNonSupportee('JPEG progressif : decodage non implemente');
      case 0xc3: case 0xc5: case 0xc6: case 0xc7:
      case 0xc9: case 0xca: case 0xcb: case 0xcd: case 0xce: case 0xcf:
        throw new ImageNonSupportee(`JPEG variante 0x${marqueur.toString(16)} non geree`);

      case 0xda: {
        if (!trame) throw new ImageNonSupportee('balayage rencontre avant l\'en-tete de trame');
        lireBalayage(bloc, trame);
        return decoderDC(buf, p + longueur, trame, quant, huffDC, huffAC, intervalleReprise);
      }
    }
    p += longueur;
  }
  throw new ImageNonSupportee('aucun balayage trouve dans le fichier JPEG');
}

function lireQuant(bloc, quant) {
  let i = 0;
  while (i < bloc.length) {
    const precision = bloc[i] >> 4;
    const id = bloc[i] & 15;
    i++;
    const table = new Int32Array(64);
    for (let k = 0; k < 64; k++) {
      table[ZIGZAG[k]] = precision ? bloc.readUInt16BE(i + k * 2) : bloc[i + k];
    }
    i += precision ? 128 : 64;
    quant[id] = table;
  }
}

function lireHuffman(bloc, huffDC, huffAC) {
  let i = 0;
  while (i < bloc.length) {
    const classe = bloc[i] >> 4;
    const id = bloc[i] & 15;
    i++;
    const comptes = bloc.subarray(i, i + 16);
    i += 16;
    let total = 0;
    for (const c of comptes) total += c;
    const symboles = bloc.subarray(i, i + total);
    i += total;
    const table = construireHuffman(comptes, symboles);
    if (classe === 0) huffDC[id] = table; else huffAC[id] = table;
  }
}

/**
 * Table de Huffman canonique : les codes se deduisent des seuls comptes par
 * longueur. On indexe par (longueur << 16) | code, ce qui evite un arbre.
 */
function construireHuffman(comptes, symboles) {
  const table = new Map();
  let code = 0;
  let k = 0;
  for (let longueur = 1; longueur <= 16; longueur++) {
    for (let n = 0; n < comptes[longueur - 1]; n++) {
      table.set((longueur << 16) | code, symboles[k++]);
      code++;
    }
    code <<= 1;
  }
  return table;
}

function lireTrame(bloc) {
  const hauteur = bloc.readUInt16BE(1);
  const largeur = bloc.readUInt16BE(3);
  const n = bloc[5];
  const composantes = [];
  let hMax = 1;
  let vMax = 1;
  for (let i = 0; i < n; i++) {
    const o = 6 + i * 3;
    const c = { id: bloc[o], h: bloc[o + 1] >> 4, v: bloc[o + 1] & 15, quant: bloc[o + 2] };
    hMax = Math.max(hMax, c.h);
    vMax = Math.max(vMax, c.v);
    composantes.push(c);
  }
  const mcuX = Math.ceil(largeur / (8 * hMax));
  const mcuY = Math.ceil(hauteur / (8 * vMax));
  for (const c of composantes) {
    c.blocsParLigne = mcuX * c.h;
    c.blocsParColonne = mcuY * c.v;
  }
  return { largeur, hauteur, composantes, hMax, vMax, mcuX, mcuY };
}

function lireBalayage(bloc, trame) {
  const n = bloc[0];
  for (let i = 0; i < n; i++) {
    const id = bloc[1 + i * 2];
    const tables = bloc[2 + i * 2];
    const c = trame.composantes.find((x) => x.id === id);
    if (!c) throw new ImageNonSupportee('balayage referencant une composante inconnue');
    c.huffDC = tables >> 4;
    c.huffAC = tables & 15;
  }
}

/**
 * Parcourt le flux d'entropie et ne retient que les coefficients DC de la
 * composante de luminance. Les coefficients AC et les composantes chromatiques
 * sont decodes puis jetes : on ne peut pas les sauter, le flux est a longueur
 * variable, mais on n'a aucune raison de les conserver.
 */
function decoderDC(buf, debut, trame, quant, huffDC, huffAC, intervalleReprise) {
  const lecteur = new LecteurBits(buf, debut);
  const y = trame.composantes[0];
  const qt = quant[y.quant];
  if (!qt) throw new ImageNonSupportee('table de quantification absente pour la luminance');

  const largeur = y.blocsParLigne;
  const hauteur = y.blocsParColonne;
  const luma = new Float32Array(largeur * hauteur);
  const precedent = new Int32Array(trame.composantes.length);
  const facteur = qt[0] / 8;
  let mcusDepuisReprise = 0;

  for (let my = 0; my < trame.mcuY; my++) {
    for (let mx = 0; mx < trame.mcuX; mx++) {
      if (intervalleReprise && mcusDepuisReprise === intervalleReprise) {
        lecteur.reprise();
        precedent.fill(0);
        mcusDepuisReprise = 0;
      }
      for (let ci = 0; ci < trame.composantes.length; ci++) {
        const c = trame.composantes[ci];
        for (let by = 0; by < c.v; by++) {
          for (let bx = 0; bx < c.h; bx++) {
            const dc = decoderBloc(lecteur, huffDC[c.huffDC], huffAC[c.huffAC]);
            precedent[ci] += dc;
            if (ci !== 0) continue;
            const col = mx * c.h + bx;
            const lig = my * c.v + by;
            if (col < largeur && lig < hauteur) {
              // Moyenne du bloc : DC dequantifie / 8, recentre sur [0, 255].
              const v = precedent[0] * facteur + 128;
              luma[lig * largeur + col] = v < 0 ? 0 : v > 255 ? 255 : v;
            }
          }
        }
      }
      mcusDepuisReprise++;
    }
  }
  return { largeur, hauteur, luma };
}

/** Decode un bloc 8x8 et rend le differentiel DC. Les AC sont consommes puis jetes. */
function decoderBloc(lecteur, tableDC, tableAC) {
  if (!tableDC || !tableAC) throw new ImageNonSupportee('table de Huffman manquante');
  const t = lecteur.symbole(tableDC);
  const dc = t === 0 ? 0 : lecteur.recevoirEtendre(t);
  for (let k = 1; k < 64; ) {
    const rs = lecteur.symbole(tableAC);
    const zeros = rs >> 4;
    const taille = rs & 15;
    if (taille === 0) {
      if (zeros !== 15) break; // fin de bloc
      k += 16;
      continue;
    }
    k += zeros + 1;
    lecteur.recevoirEtendre(taille);
  }
  return dc;
}

class LecteurBits {
  constructor(buf, position) {
    this.buf = buf;
    this.p = position;
    this.tampon = 0;
    this.disponibles = 0;
  }
  bit() {
    if (this.disponibles === 0) {
      if (this.p >= this.buf.length) return 0; // flux tronque : on rend des zeros
      let octet = this.buf[this.p++];
      if (octet === 0xff) {
        const suivant = this.buf[this.p];
        if (suivant === 0x00) this.p++;
        else if (suivant >= 0xd0 && suivant <= 0xd7) { this.p++; octet = this.buf[this.p++] ?? 0; }
        else return 0;
      }
      this.tampon = octet;
      this.disponibles = 8;
    }
    this.disponibles--;
    return (this.tampon >> this.disponibles) & 1;
  }
  symbole(table) {
    let code = 0;
    for (let longueur = 1; longueur <= 16; longueur++) {
      code = (code << 1) | this.bit();
      const s = table.get((longueur << 16) | code);
      if (s !== undefined) return s;
    }
    throw new ImageNonSupportee('code de Huffman invalide');
  }
  recevoirEtendre(taille) {
    let v = 0;
    for (let i = 0; i < taille; i++) v = (v << 1) | this.bit();
    return v < 1 << (taille - 1) ? v - (1 << taille) + 1 : v;
  }
  /** Realigne sur l'octet et consomme le marqueur de reprise RSTn. */
  reprise() {
    this.disponibles = 0;
    while (this.p < this.buf.length - 1) {
      if (this.buf[this.p] === 0xff && this.buf[this.p + 1] >= 0xd0 && this.buf[this.p + 1] <= 0xd7) {
        this.p += 2;
        return;
      }
      this.p++;
    }
  }
}

// ---------------------------------------------------------------- PNG

function lumaPng(buf) {
  let p = 8;
  let ihdr = null;
  const donnees = [];
  let palette = null;
  while (p + 8 <= buf.length) {
    const longueur = buf.readUInt32BE(p);
    const type = buf.toString('ascii', p + 4, p + 8);
    const corps = buf.subarray(p + 8, p + 8 + longueur);
    if (type === 'IHDR') {
      ihdr = {
        largeur: corps.readUInt32BE(0),
        hauteur: corps.readUInt32BE(4),
        profondeur: corps[8],
        couleur: corps[9],
        entrelacement: corps[12],
      };
    } else if (type === 'PLTE') palette = Buffer.from(corps);
    else if (type === 'IDAT') donnees.push(Buffer.from(corps));
    else if (type === 'IEND') break;
    p += 12 + longueur;
  }
  if (!ihdr) throw new ImageNonSupportee('PNG sans en-tete IHDR');
  if (ihdr.entrelacement) throw new ImageNonSupportee('PNG entrelace (Adam7) non gere');
  if (ihdr.profondeur !== 8) throw new ImageNonSupportee(`PNG ${ihdr.profondeur} bits non gere`);

  const canaux = { 0: 1, 2: 3, 3: 1, 4: 2, 6: 4 }[ihdr.couleur];
  if (!canaux) throw new ImageNonSupportee(`type de couleur PNG ${ihdr.couleur} non gere`);

  const brut = inflateSync(Buffer.concat(donnees));
  const { largeur, hauteur } = ihdr;
  const pas = largeur * canaux;
  const pixels = Buffer.alloc(pas * hauteur);
  let src = 0;
  for (let y = 0; y < hauteur; y++) {
    const filtre = brut[src++];
    const ligne = brut.subarray(src, src + pas);
    src += pas;
    const sortie = pixels.subarray(y * pas, (y + 1) * pas);
    const dessus = y > 0 ? pixels.subarray((y - 1) * pas, y * pas) : null;
    defiltrer(filtre, ligne, sortie, dessus, canaux);
  }

  const luma = new Float32Array(largeur * hauteur);
  for (let i = 0; i < largeur * hauteur; i++) {
    const o = i * canaux;
    if (ihdr.couleur === 3 && palette) {
      const j = pixels[o] * 3;
      luma[i] = 0.299 * palette[j] + 0.587 * palette[j + 1] + 0.114 * palette[j + 2];
    } else if (canaux >= 3) {
      luma[i] = 0.299 * pixels[o] + 0.587 * pixels[o + 1] + 0.114 * pixels[o + 2];
    } else {
      luma[i] = pixels[o];
    }
  }
  return { largeur, hauteur, luma };
}

function defiltrer(type, ligne, sortie, dessus, bpp) {
  const n = ligne.length;
  for (let i = 0; i < n; i++) {
    const a = i >= bpp ? sortie[i - bpp] : 0;
    const b = dessus ? dessus[i] : 0;
    const c = dessus && i >= bpp ? dessus[i - bpp] : 0;
    let v = ligne[i];
    switch (type) {
      case 0: break;
      case 1: v += a; break;
      case 2: v += b; break;
      case 3: v += (a + b) >> 1; break;
      case 4: {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        break;
      }
      default: throw new ImageNonSupportee(`filtre PNG ${type} inconnu`);
    }
    sortie[i] = v & 0xff;
  }
}

// ---------------------------------------------------------------- vignette

/**
 * Reechantillonne une carte de luminance vers largeurCible x hauteurCible,
 * par moyenne de boite. Robuste a une reduction de facteur quelconque, ce que
 * l'interpolation bilineaire n'est pas.
 */
export function vignette(source, largeurCible, hauteurCible) {
  const { largeur, hauteur, luma } = source;
  const sortie = new Float32Array(largeurCible * hauteurCible);
  for (let y = 0; y < hauteurCible; y++) {
    const y0 = Math.floor((y * hauteur) / hauteurCible);
    const y1 = Math.max(y0 + 1, Math.floor(((y + 1) * hauteur) / hauteurCible));
    for (let x = 0; x < largeurCible; x++) {
      const x0 = Math.floor((x * largeur) / largeurCible);
      const x1 = Math.max(x0 + 1, Math.floor(((x + 1) * largeur) / largeurCible));
      let somme = 0;
      let n = 0;
      for (let j = y0; j < y1 && j < hauteur; j++) {
        for (let i = x0; i < x1 && i < largeur; i++) {
          somme += luma[j * largeur + i];
          n++;
        }
      }
      sortie[y * largeurCible + x] = n ? somme / n : 0;
    }
  }
  return sortie;
}

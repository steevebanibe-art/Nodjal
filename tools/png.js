// Encodeur PNG — outillage, pas produit.
//
// Sert a fabriquer les images des tests et du jeu de demonstration. Aucun
// fichier binaire n'est versionne : tout se regenere a partir d'une graine, ce
// qui garde le depot leger et les tests reproductibles.
//
// Consequence a dire au jury si la question vient : les cliches du jeu de
// demonstration sont SYNTHETIQUES et l'interface le signale. Nous ne faisons
// jamais passer une image fabriquee pour une photo de chantier.

import { deflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';

function crc32(buf) {
  let c = ~0;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) c = (c >>> 1) ^ (0xedb88320 & -(c & 1));
  }
  return ~c >>> 0;
}

function morceau(type, donnees) {
  const t = Buffer.from(type, 'ascii');
  const longueur = Buffer.alloc(4);
  longueur.writeUInt32BE(donnees.length);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, donnees])));
  return Buffer.concat([longueur, t, donnees, crc]);
}

/** Encode un buffer RGB (3 octets par pixel) en PNG. */
export function encoderPng(largeur, hauteur, rgb) {
  const pas = largeur * 3;
  const brut = Buffer.alloc((pas + 1) * hauteur);
  for (let y = 0; y < hauteur; y++) {
    brut[y * (pas + 1)] = 0; // filtre « aucun »
    rgb.copy(brut, y * (pas + 1) + 1, y * pas, (y + 1) * pas);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(largeur, 0);
  ihdr.writeUInt32BE(hauteur, 4);
  ihdr[8] = 8;  // profondeur
  ihdr[9] = 2;  // couleur RGB
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    morceau('IHDR', ihdr),
    morceau('IDAT', deflateSync(brut, { level: 6 })),
    morceau('IEND', Buffer.alloc(0)),
  ]);
}

/** Generateur pseudo-aleatoire deterministe, pour que les images soient rejouables. */
export function alea(graine) {
  let e = 0;
  for (const c of String(graine)) e = (e * 31 + c.charCodeAt(0)) >>> 0;
  return () => {
    e ^= e << 13; e >>>= 0;
    e ^= e >> 17;
    e ^= e << 5; e >>>= 0;
    return e / 4294967296;
  };
}

/**
 * Fabrique un cliche de chantier synthetique.
 * scene : 'terrain' | 'fondations' | 'elevation' | 'toiture' | 'ecran' | 'uniforme'
 */
export function clicheChantier({ largeur = 320, hauteur = 240, scene = 'elevation', graine = 'nodjal' } = {}) {
  const r = alea(graine + scene);
  const rgb = Buffer.alloc(largeur * hauteur * 3);
  const horizon = Math.floor(hauteur * 0.42);

  const poser = (x, y, [rr, vv, bb]) => {
    if (x < 0 || y < 0 || x >= largeur || y >= hauteur) return;
    const o = (y * largeur + x) * 3;
    rgb[o] = Math.max(0, Math.min(255, rr));
    rgb[o + 1] = Math.max(0, Math.min(255, vv));
    rgb[o + 2] = Math.max(0, Math.min(255, bb));
  };

  if (scene === 'uniforme') {
    for (let y = 0; y < hauteur; y++) for (let x = 0; x < largeur; x++) poser(x, y, [126 + r() * 3, 124 + r() * 3, 120 + r() * 3]);
    return encoderPng(largeur, hauteur, rgb);
  }

  // Ciel, puis sol lateritique — le rouge de Douala.
  for (let y = 0; y < hauteur; y++) {
    for (let x = 0; x < largeur; x++) {
      if (y < horizon) {
        const t = y / horizon;
        poser(x, y, [150 + t * 60 + r() * 8, 175 + t * 50 + r() * 8, 205 + t * 30 + r() * 8]);
      } else {
        const t = (y - horizon) / (hauteur - horizon);
        poser(x, y, [132 + t * 34 + r() * 22, 82 + t * 24 + r() * 18, 58 + t * 16 + r() * 14]);
      }
    }
  }

  if (scene === 'terrain') return encoderPng(largeur, hauteur, rgb);

  // Emprise : rectangle de fouille ou de dalle.
  const gx = Math.floor(largeur * 0.16);
  const gd = Math.floor(largeur * 0.84);
  const gy = horizon + Math.floor((hauteur - horizon) * 0.18);
  const gb = horizon + Math.floor((hauteur - horizon) * 0.78);
  for (let y = gy; y < gb; y++) {
    for (let x = gx; x < gd; x++) {
      const bord = x < gx + 5 || x > gd - 5 || y < gy + 5 || y > gb - 5;
      poser(x, y, bord ? [92, 88, 84] : [168 + r() * 16, 164 + r() * 14, 156 + r() * 12]);
    }
  }

  if (scene === 'fondations') return encoderPng(largeur, hauteur, rgb);

  // Elevation : parpaings en appareil decale.
  const hBloc = 11;
  const lBloc = 23;
  const sommet = scene === 'toiture' ? horizon - Math.floor(hauteur * 0.3) : gy - Math.floor(hauteur * 0.22);
  for (let y = gy; y > sommet; y -= hBloc) {
    const decalage = ((gy - y) / hBloc) % 2 ? lBloc / 2 : 0;
    for (let x = gx + decalage; x < gd; x += lBloc) {
      const ton = 176 + r() * 26;
      for (let by = 0; by < hBloc - 2; by++) {
        for (let bx = 0; bx < lBloc - 2 && x + bx < gd; bx++) {
          poser(Math.floor(x + bx), y - by, [ton, ton - 8 + r() * 6, ton - 20 + r() * 6]);
        }
      }
    }
  }

  if (scene === 'toiture') {
    // Charpente : pannes obliques, tole sombre.
    for (let i = 0; i < 22; i++) {
      const x0 = gx + (i * (gd - gx)) / 22;
      for (let t = 0; t < 1; t += 0.004) {
        const x = Math.floor(x0 + t * 26);
        const y = Math.floor(sommet - t * 34);
        for (let e = 0; e < 3; e++) poser(x, y + e, [72 + r() * 14, 68 + r() * 12, 66 + r() * 12]);
      }
    }
  }

  if (scene === 'ecran') {
    // Signature d'une photo d'ecran : moire reguliere et bord rectangulaire net.
    for (let y = 0; y < hauteur; y++) {
      for (let x = 0; x < largeur; x++) {
        const o = (y * largeur + x) * 3;
        const m = ((x % 3 === 0 ? 12 : 0) + (y % 3 === 0 ? 10 : 0)) - 8;
        rgb[o] = Math.max(0, Math.min(255, rgb[o] + m));
        rgb[o + 1] = Math.max(0, Math.min(255, rgb[o + 1] + m));
        rgb[o + 2] = Math.max(0, Math.min(255, rgb[o + 2] + m));
      }
    }
    for (let x = 0; x < largeur; x++) {
      for (let e = 0; e < 6; e++) { poser(x, e, [14, 14, 16]); poser(x, hauteur - 1 - e, [14, 14, 16]); }
    }
  }

  return encoderPng(largeur, hauteur, rgb);
}

/** Variante legerement recompressee : simule un renvoi du meme cliche. */
export function variante(png, decalage = 2) {
  const graine = createHash('sha256').update(png).digest('hex').slice(0, 8);
  return { graine, decalage };
}

/**
 * Reencode un PNG en y inserant un bloc de commentaire.
 * Les pixels ne bougent pas ; les octets, si. C'est exactement ce que produit
 * un renvoi de la meme photo sous un autre nom de fichier, ou un passage par
 * une messagerie : le SHA-256 change, l'image non. Le condensat classique ne
 * voit rien, le hachage perceptuel voit tout.
 */
export function reencoder(png, commentaire = 'renvoi') {
  const buf = Buffer.isBuffer(png) ? png : Buffer.from(png);
  const texte = Buffer.concat([
    Buffer.from('Comment\0', 'latin1'),
    Buffer.from(commentaire, 'latin1'),
  ]);
  const bloc = morceau('tEXt', texte);
  // Insertion juste apres l'en-tete IHDR (8 octets de signature + 25 d'IHDR).
  return Buffer.concat([buf.subarray(0, 33), bloc, buf.subarray(33)]);
}

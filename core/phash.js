// Hachage perceptuel — contre-mesure T3 (photo ancienne rejouee, ou renvoyee
// deux fois sous un autre nom de fichier).
//
// Un SHA-256 ne sert a rien ici : reenregistrer la meme photo change un octet et
// change l'empreinte. Le hachage perceptuel decrit l'image, pas le fichier. Deux
// versions de la meme scene se ressemblent, deux scenes differentes non.
//
// Choix : dHash sur 8x8 (gradient horizontal) plutot que pHash par DCT.
// La transformee cosinus donnerait un hachage marginalement plus robuste a la
// rotation, mais nous n'avons pas besoin de robustesse a la rotation — nous
// avons besoin de detecter une reutilisation, et le dHash le fait avec un tiers
// du code et sans zone d'ombre sur son comportement.
//
// Ce que le dHash detecte : recompression, recadrage leger, redimensionnement,
// changement de qualite, capture d'ecran d'une photo.
// Ce qu'il ne detecte pas : une nouvelle photo du meme mur prise dix minutes
// plus tard. C'est voulu — deux photos legitimes du meme jalon se ressemblent.
// Le seuil est donc un signal a instruire, jamais une accusation.

import { luminance, vignette } from './image.js';

export const SEUIL_IDENTIQUE = 4;   // en deca : quasi certainement le meme fichier
export const SEUIL_PROCHE = 12;     // en deca : meme scene, a instruire

/** Rend le dHash 64 bits d'une image, en hexadecimal (16 caracteres). */
export function phash(buffer) {
  const source = luminance(buffer);
  const v = vignette(source, 9, 8);
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let octet = 0;
    for (let x = 0; x < 8; x++) {
      octet = (octet << 1) | (v[y * 9 + x] > v[y * 9 + x + 1] ? 1 : 0);
    }
    hex += octet.toString(16).padStart(2, '0');
  }
  return hex;
}

/** Distance de Hamming entre deux dHash hexadecimaux. Rend 64 si incomparables. */
export function distance(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return 64;
  let d = 0;
  for (let i = 0; i < a.length; i += 2) {
    let x = parseInt(a.slice(i, i + 2), 16) ^ parseInt(b.slice(i, i + 2), 16);
    while (x) { d += x & 1; x >>= 1; }
  }
  return d;
}

/**
 * Compare une empreinte a l'historique du projet.
 * Rend le plus proche voisin et sa qualification, ou null si rien ne s'en
 * approche. `historique` : [{ id, phash, jalonId, deposeeLe }].
 */
export function chercherDoublon(empreinte, historique) {
  let meilleur = null;
  for (const p of historique) {
    if (!p.phash) continue;
    const d = distance(empreinte, p.phash);
    if (!meilleur || d < meilleur.distance) meilleur = { ...p, distance: d };
  }
  if (!meilleur || meilleur.distance > SEUIL_PROCHE) return null;
  return {
    ...meilleur,
    qualification: meilleur.distance <= SEUIL_IDENTIQUE ? 'identique' : 'proche',
  };
}

/**
 * Mesure d'uniformite, dans [0, 1].
 * Une image quasi uniforme (objectif obstrue, photo du ciel, mur nu cadre de
 * trop pres) produit un dHash pauvre et peu discriminant. Le signaler evite de
 * valider un jalon sur une preuve qui ne montre rien.
 */
export function uniformite(buffer) {
  const source = luminance(buffer);
  const v = vignette(source, 16, 16);
  const moyenne = v.reduce((s, x) => s + x, 0) / v.length;
  const variance = v.reduce((s, x) => s + (x - moyenne) ** 2, 0) / v.length;
  const ecartType = Math.sqrt(variance);
  return Math.max(0, 1 - ecartType / 48);
}

// Identifiants.
//
// Prefixes lisibles a l'oeil : dans un journal d'audit, on doit pouvoir dire de
// quoi on parle sans ouvrir la base. Corps en base32 sans voyelles, ce qui evite
// de fabriquer un mot involontaire dans un identifiant imprime sur un contrat.

import { randomBytes } from 'node:crypto';

const ALPHABET = '0123456789BCDFGHJKLMNPQRSTVWXZ';

export const PREFIXES = {
  projet: 'prj',
  jalon: 'jln',
  preuve: 'prv',
  certificat: 'crt',
  executant: 'exe',
  inspecteur: 'ins',
  facture: 'fct',
  fournisseur: 'frn',
  donneurOrdre: 'don',
  evenement: 'evt',
  session: 'ses',
};

export function identifiant(type, longueur = 10) {
  const prefixe = PREFIXES[type] || String(type).slice(0, 3);
  const octets = randomBytes(longueur);
  let corps = '';
  for (const o of octets) corps += ALPHABET[o % ALPHABET.length];
  return `${prefixe}_${corps}`;
}

/** Suite deterministe, pour les jeux de donnees rejouables (seed, tests). */
export function suiteDeterministe(graine) {
  let etat = 0;
  for (const c of String(graine)) etat = (etat * 31 + c.charCodeAt(0)) >>> 0;
  return (type, longueur = 10) => {
    const prefixe = PREFIXES[type] || String(type).slice(0, 3);
    let corps = '';
    for (let i = 0; i < longueur; i++) {
      etat = (etat * 1664525 + 1013904223) >>> 0;
      corps += ALPHABET[etat % ALPHABET.length];
    }
    return `${prefixe}_${corps}`;
  };
}

/** Reference humaine d'un certificat : NDJ-2026-000123. */
export function referenceCertificat(annee, numero) {
  return `NDJ-${annee}-${String(numero).padStart(6, '0')}`;
}

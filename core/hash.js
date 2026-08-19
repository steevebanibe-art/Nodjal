// Empreintes et chainage.
//
// Deux regles gravees ici, et nulle part ailleurs :
//   1. Le hash d'une preuve est calcule a la reception, cote serveur, sur les
//      octets recus. Jamais fourni par le client.
//   2. Le journal est chaine : chaque entree scelle la precedente. Retirer ou
//      modifier une entree casse toutes les suivantes, et ca se voit.

import { createHash, createHmac, timingSafeEqual } from 'node:crypto';

/** SHA-256 hexadecimal d'un Buffer, d'une chaine ou d'un Uint8Array. */
export function sha256(data) {
  return createHash('sha256').update(toBuf(data)).digest('hex');
}

/** SHA-256 en base64url, pour les identifiants courts. */
export function sha256url(data) {
  return createHash('sha256').update(toBuf(data)).digest('base64url');
}

/**
 * Empreinte canonique d'un objet JSON.
 * Les cles sont triees recursivement : deux objets egaux donnent le meme hash,
 * quel que soit l'ordre d'ecriture. Sans ca, le chainage serait illusoire.
 */
export function hashObject(obj) {
  return sha256(canonical(obj));
}

export function canonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
  const keys = Object.keys(value).filter((k) => value[k] !== undefined).sort();
  return '{' + keys.map((k) => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
}

/**
 * Maillon du journal.
 * prev = hash du maillon precedent (chaine vide pour le premier).
 */
export function chain(prev, payload) {
  return sha256(`${prev || 'genese'}\n${hashObject(payload)}`);
}

/**
 * Verifie une chaine complete. Rend l'index du premier maillon casse, ou -1.
 * C'est la fonction qu'un auditeur externe execute pour controler un dossier.
 */
export function verifyChain(entries) {
  let prev = '';
  for (let i = 0; i < entries.length; i++) {
    const expected = chain(prev, entries[i].payload);
    if (entries[i].hash !== expected) return i;
    prev = entries[i].hash;
  }
  return -1;
}

/** HMAC-SHA256 sale. Sert aux identifiants derives (telephone, appareil). */
export function hmac(secret, data) {
  return createHmac('sha256', secret).update(toBuf(data)).digest('hex');
}

/** Comparaison a temps constant de deux empreintes hexadecimales. */
export function equalHash(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function toBuf(data) {
  if (Buffer.isBuffer(data)) return data;
  if (data instanceof Uint8Array) return Buffer.from(data);
  return Buffer.from(String(data), 'utf8');
}

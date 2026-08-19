// Horodatage qualifie RFC 3161.
//
// Ce que cela apporte, exactement : une preuve d'ANTERIORITE non repudiable. Un
// tiers qualifie atteste qu'un condensat donne existait a une date donnee.
// Personne ne peut soutenir apres coup que la photo a ete prise plus tard, ni
// qu'elle a ete retouchee depuis.
//
// Ce que cela n'apporte pas : la valeur juridique du contenu. Un document n'est
// pas « opposable » parce qu'il est horodate. Nous ecrivons donc, partout et
// sans exception, « faisceau de preuves horodatees et non repudiables ». C'est
// exact, et c'est plus solide devant un avocat que le mot qu'on serait tente
// d'employer.
//
// Sans NODJAL_TSA_URL configure, ce module est DORMANT : le certificat porte la
// mention « horodatage qualifie non configure », en toutes lettres. Il ne
// simule jamais un jeton.

import { createHash } from 'node:crypto';
import { request as requeteHttps } from 'node:https';
import { request as requeteHttp } from 'node:http';

// --- ASN.1 DER, sous-ensemble strictement necessaire.

const der = {
  longueur(n) {
    if (n < 0x80) return Buffer.from([n]);
    const octets = [];
    let v = n;
    while (v > 0) { octets.unshift(v & 0xff); v >>= 8; }
    return Buffer.from([0x80 | octets.length, ...octets]);
  },
  bloc(tag, contenu) {
    return Buffer.concat([Buffer.from([tag]), der.longueur(contenu.length), contenu]);
  },
  entier(n) {
    const octets = [];
    let v = BigInt(n);
    if (v === 0n) octets.push(0);
    while (v > 0n) { octets.unshift(Number(v & 0xffn)); v >>= 8n; }
    if (octets[0] & 0x80) octets.unshift(0);
    return der.bloc(0x02, Buffer.from(octets));
  },
  booleen(b) { return der.bloc(0x01, Buffer.from([b ? 0xff : 0x00])); },
  octets(buf) { return der.bloc(0x04, buf); },
  nul() { return Buffer.from([0x05, 0x00]); },
  sequence(...parties) { return der.bloc(0x30, Buffer.concat(parties)); },
  oid(chaine) {
    const n = chaine.split('.').map(Number);
    const octets = [n[0] * 40 + n[1]];
    for (const v of n.slice(2)) {
      const pile = [v & 0x7f];
      let r = v >> 7;
      while (r > 0) { pile.unshift((r & 0x7f) | 0x80); r >>= 7; }
      octets.push(...pile);
    }
    return der.bloc(0x06, Buffer.from(octets));
  },
};

const OID_SHA256 = '2.16.840.1.101.3.4.2.1';

/**
 * Construit une TimeStampReq RFC 3161 pour un condensat SHA-256.
 * empreinteHex : 64 caracteres hexadecimaux.
 */
export function construireRequete(empreinteHex, { nonce = null, demanderCertificat = true } = {}) {
  const empreinte = Buffer.from(empreinteHex, 'hex');
  if (empreinte.length !== 32) throw new Error('empreinte SHA-256 attendue (32 octets)');
  const algorithme = der.sequence(der.oid(OID_SHA256), der.nul());
  const messageImprint = der.sequence(algorithme, der.octets(empreinte));
  const parties = [der.entier(1), messageImprint];
  if (nonce !== null) parties.push(der.entier(nonce));
  parties.push(der.booleen(demanderCertificat));
  return der.sequence(...parties);
}

// --- Lecture minimale de la reponse.

function lireTlv(buf, position) {
  const tag = buf[position];
  let p = position + 1;
  let longueur = buf[p++];
  if (longueur & 0x80) {
    const n = longueur & 0x7f;
    longueur = 0;
    for (let i = 0; i < n; i++) longueur = (longueur << 8) | buf[p++];
  }
  return { tag, debut: position, entete: p - position, longueur, contenu: buf.subarray(p, p + longueur), fin: p + longueur };
}

/**
 * Extrait ce qui est utile d'une TimeStampResp : le statut, et la date
 * generale (GeneralizedTime) inscrite dans le jeton.
 * Ne verifie PAS la signature — cela demande la chaine de certification du
 * prestataire. Le dire, plutot que de laisser croire le contraire.
 */
export function lireReponse(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const racine = lireTlv(buf, 0);
  if (racine.tag !== 0x30) throw new Error('reponse RFC 3161 malformee');
  const statut = lireTlv(racine.contenu, 0);
  const valeurStatut = statut.tag === 0x30 ? lireTlv(statut.contenu, 0).contenu[0] : null;

  // GeneralizedTime : tag 0x18, format YYYYMMDDHHMMSS[.fff]Z
  let date = null;
  for (let p = 0; p < buf.length - 2; p++) {
    if (buf[p] !== 0x18) continue;
    const longueur = buf[p + 1];
    if (longueur < 13 || longueur > 24) continue;
    const s = buf.toString('ascii', p + 2, p + 2 + longueur);
    const m = s.match(/^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})/);
    if (m) { date = `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`; break; }
  }

  return {
    statut: valeurStatut,
    accepte: valeurStatut === 0 || valeurStatut === 1,
    date,
    jetonBase64: buf.toString('base64'),
    empreinteJeton: createHash('sha256').update(buf).digest('hex'),
    verificationSignature: 'non effectuee — necessite la chaine de certification du prestataire',
  };
}

/** Le module est-il actif ? */
export function configure() {
  return Boolean(process.env.NODJAL_TSA_URL);
}

/**
 * Demande un jeton d'horodatage.
 * Rend { actif: false, motif } si aucun prestataire n'est configure. Ne simule
 * jamais, ne bricole jamais une date locale.
 */
export async function horodater(empreinteHex, { url = process.env.NODJAL_TSA_URL, delaiMs = 8000 } = {}) {
  if (!url) {
    return {
      actif: false,
      motif: 'horodatage qualifie non configure (NODJAL_TSA_URL absent)',
      empreinte: empreinteHex,
      remplacement: "horodatage serveur seul, sans attestation d'un tiers qualifie",
    };
  }
  const nonce = Number(BigInt('0x' + createHash('sha256').update(empreinteHex + Date.now()).digest('hex').slice(0, 12)));
  const corps = construireRequete(empreinteHex, { nonce });
  const cible = new URL(url);
  const transport = cible.protocol === 'https:' ? requeteHttps : requeteHttp;

  const reponse = await new Promise((resoudre, rejeter) => {
    const req = transport(
      {
        hostname: cible.hostname,
        port: cible.port || (cible.protocol === 'https:' ? 443 : 80),
        path: cible.pathname + cible.search,
        method: 'POST',
        headers: { 'content-type': 'application/timestamp-query', 'content-length': corps.length },
        timeout: delaiMs,
      },
      (res) => {
        const morceaux = [];
        res.on('data', (m) => morceaux.push(m));
        res.on('end', () => resoudre({ code: res.statusCode, corps: Buffer.concat(morceaux) }));
      },
    );
    req.on('timeout', () => { req.destroy(new Error(`delai depasse (${delaiMs} ms)`)); });
    req.on('error', rejeter);
    req.end(corps);
  }).catch((e) => ({ erreur: e.message }));

  if (reponse.erreur) {
    return { actif: false, motif: `prestataire injoignable : ${reponse.erreur}`, empreinte: empreinteHex };
  }
  if (reponse.code !== 200) {
    return { actif: false, motif: `prestataire a repondu ${reponse.code}`, empreinte: empreinteHex };
  }
  try {
    const jeton = lireReponse(reponse.corps);
    return { actif: true, empreinte: empreinteHex, prestataire: cible.hostname, ...jeton };
  } catch (e) {
    return { actif: false, motif: `reponse illisible : ${e.message}`, empreinte: empreinteHex };
  }
}

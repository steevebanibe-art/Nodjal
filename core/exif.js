// Lecture des metadonnees EXIF.
//
// Ce que l'EXIF apporte au modele de menace : il est declaratif, donc falsifiable,
// donc il ne prouve rien seul. Il sert a produire des ECARTS. Un ecart entre
// l'heure declaree par l'appareil et l'heure serveur, entre la position EXIF et
// la position transmise par l'application, entre un fabricant annonce et un
// champ logiciel de retouche : chacun est un signal a instruire.
//
// L'absence totale d'EXIF est elle-meme un signal. Une photo prise par un
// telephone en porte toujours. Une capture d'ecran, une image passee par une
// messagerie ou reencodee n'en porte plus.

const EDITEURS = [
  'photoshop', 'lightroom', 'gimp', 'snapseed', 'picsart', 'facetune',
  'affinity', 'pixlr', 'paint.net', 'canva', 'remini', 'inshot',
];

const TAILLES = { 1: 1, 2: 1, 3: 2, 4: 4, 5: 8, 6: 1, 7: 1, 8: 2, 9: 4, 10: 8, 11: 4, 12: 8 };

/**
 * Rend un objet de metadonnees, avec `present: false` si le fichier n'en porte
 * pas. Ne leve jamais : un EXIF illisible est une information, pas une panne.
 */
export function lireExif(buffer) {
  const buf = Buffer.isBuffer(buffer) ? buffer : Buffer.from(buffer);
  const vide = { present: false, champs: {}, gps: null, anomalies: ['exif_absent'] };
  try {
    const segment = trouverApp1(buf);
    if (!segment) return vide;
    return analyserTiff(segment);
  } catch {
    return { present: false, champs: {}, gps: null, anomalies: ['exif_illisible'] };
  }
}

function trouverApp1(buf) {
  if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  let p = 2;
  while (p + 4 <= buf.length) {
    if (buf[p] !== 0xff) break;
    const marqueur = buf[p + 1];
    if (marqueur === 0xda || marqueur === 0xd9) break;
    const longueur = buf.readUInt16BE(p + 2);
    if (marqueur === 0xe1 && buf.toString('ascii', p + 4, p + 10) === 'Exif\0\0') {
      return buf.subarray(p + 10, p + 2 + longueur);
    }
    p += 2 + longueur;
  }
  return null;
}

function analyserTiff(tiff) {
  const gros = tiff.toString('ascii', 0, 2) === 'MM';
  const u16 = (o) => (gros ? tiff.readUInt16BE(o) : tiff.readUInt16LE(o));
  const u32 = (o) => (gros ? tiff.readUInt32BE(o) : tiff.readUInt32LE(o));
  const i32 = (o) => (gros ? tiff.readInt32BE(o) : tiff.readInt32LE(o));

  const champs = {};
  const gpsBrut = {};
  const anomalies = [];

  function lireIfd(offset, cible) {
    if (offset <= 0 || offset + 2 > tiff.length) return 0;
    const n = u16(offset);
    for (let i = 0; i < n; i++) {
      const e = offset + 2 + i * 12;
      if (e + 12 > tiff.length) break;
      const tag = u16(e);
      const type = u16(e + 2);
      const compte = u32(e + 4);
      const taille = (TAILLES[type] || 0) * compte;
      if (!taille) continue;
      const source = taille <= 4 ? e + 8 : u32(e + 8);
      if (source + taille > tiff.length) continue;
      cible[tag] = lireValeur(type, compte, source);
    }
    return offset + 2 + n * 12 + 4 <= tiff.length ? u32(offset + 2 + n * 12) : 0;
  }

  function lireValeur(type, compte, o) {
    if (type === 2) return tiff.toString('ascii', o, o + compte).replace(/\0.*$/, '').trim();
    if (type === 7 || type === 1) return tiff.subarray(o, o + compte);
    const out = [];
    for (let i = 0; i < compte; i++) {
      if (type === 3) out.push(u16(o + i * 2));
      else if (type === 4) out.push(u32(o + i * 4));
      else if (type === 9) out.push(i32(o + i * 4));
      else if (type === 5) out.push(u32(o + i * 8) / (u32(o + i * 8 + 4) || 1));
      else if (type === 10) out.push(i32(o + i * 8) / (i32(o + i * 8 + 4) || 1));
    }
    return compte === 1 ? out[0] : out;
  }

  const ifd0 = {};
  lireIfd(u32(4), ifd0);
  const exif = {};
  if (ifd0[0x8769]) lireIfd(ifd0[0x8769], exif);
  if (ifd0[0x8825]) lireIfd(ifd0[0x8825], gpsBrut);

  champs.fabricant = ifd0[0x010f] || null;
  champs.modele = ifd0[0x0110] || null;
  champs.logiciel = ifd0[0x0131] || null;
  champs.orientation = ifd0[0x0112] ?? null;
  champs.dateFichier = normaliserDate(ifd0[0x0132]);
  champs.dateOriginale = normaliserDate(exif[0x9003]);
  champs.dateNumerisation = normaliserDate(exif[0x9004]);
  champs.tempsExposition = exif[0x829a] ?? null;
  champs.ouverture = exif[0x829d] ?? null;
  champs.iso = exif[0x8827] ?? null;
  champs.largeurPixels = exif[0xa002] ?? null;
  champs.hauteurPixels = exif[0xa003] ?? null;

  const gps = construireGps(gpsBrut);

  if (!champs.fabricant && !champs.modele) anomalies.push('appareil_non_declare');
  if (champs.logiciel && EDITEURS.some((e) => champs.logiciel.toLowerCase().includes(e))) {
    anomalies.push('logiciel_de_retouche');
  }
  if (!champs.dateOriginale) anomalies.push('date_de_prise_absente');
  if (!gps) anomalies.push('gps_exif_absent');

  return { present: true, champs, gps, anomalies };
}

function construireGps(g) {
  if (!g[0x0002] || !g[0x0004]) return null;
  const lat = sexagesimal(g[0x0002]) * (g[0x0001] === 'S' ? -1 : 1);
  const lng = sexagesimal(g[0x0004]) * (g[0x0003] === 'W' ? -1 : 1);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return {
    lat,
    lng,
    altitude: typeof g[0x0006] === 'number' ? g[0x0006] * (g[0x0005] === 1 ? -1 : 1) : null,
    dop: typeof g[0x000b] === 'number' ? g[0x000b] : null,
    cap: typeof g[0x0011] === 'number' ? g[0x0011] : null,
    capReference: g[0x0010] === 'M' ? 'magnetique' : g[0x0010] === 'T' ? 'vrai' : null,
    horodatageUtc: horodatageGps(g[0x001d], g[0x0007]),
  };
}

function sexagesimal(v) {
  if (!Array.isArray(v) || v.length < 3) return NaN;
  return v[0] + v[1] / 60 + v[2] / 3600;
}

function horodatageGps(date, heure) {
  if (typeof date !== 'string' || !Array.isArray(heure)) return null;
  const [a, m, j] = date.split(':').map(Number);
  if (!a || !m || !j) return null;
  const [h = 0, mi = 0, s = 0] = heure;
  return new Date(Date.UTC(a, m - 1, j, h, mi, Math.round(s))).toISOString();
}

/** « 2026:08:17 14:32:05 » (format EXIF) vers ISO 8601, heure locale non datee. */
function normaliserDate(v) {
  if (typeof v !== 'string') return null;
  const m = v.match(/^(\d{4}):(\d{2}):(\d{2})[ T](\d{2}):(\d{2}):(\d{2})/);
  if (!m) return null;
  return `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}`;
}

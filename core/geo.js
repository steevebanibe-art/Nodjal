// Geometrie de terrain.
//
// Tout se joue sur une parcelle de quelques centaines de metres carres. A cette
// echelle, une projection locale plane vaut la geodesie complete et coute mille
// fois moins cher. On garde la haversine pour les distances de controle.

const R_TERRE = 6371008.8; // rayon moyen WGS84, en metres

const rad = (d) => (d * Math.PI) / 180;
const deg = (r) => (r * 180) / Math.PI;

/** Distance en metres entre deux points {lat, lng}. */
export function haversine(a, b) {
  const dLat = rad(b.lat - a.lat);
  const dLng = rad(b.lng - a.lng);
  const lat1 = rad(a.lat);
  const lat2 = rad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLng / 2) ** 2;
  return 2 * R_TERRE * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Cap en degres (0 = nord, sens horaire) du point a vers le point b. */
export function cap(a, b) {
  const y = Math.sin(rad(b.lng - a.lng)) * Math.cos(rad(b.lat));
  const x =
    Math.cos(rad(a.lat)) * Math.sin(rad(b.lat)) -
    Math.sin(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.cos(rad(b.lng - a.lng));
  return (deg(Math.atan2(y, x)) + 360) % 360;
}

/** Ecart angulaire minimal entre deux caps, dans [0, 180]. */
export function ecartCap(a, b) {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

/**
 * Point dans polygone, par lancer de rayon.
 * polygone : tableau de {lat, lng}, ferme implicitement.
 */
export function dansPolygone(p, polygone) {
  let dedans = false;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    const a = polygone[i];
    const b = polygone[j];
    const traverse = a.lat > p.lat !== b.lat > p.lat;
    if (!traverse) continue;
    const x = ((b.lng - a.lng) * (p.lat - a.lat)) / (b.lat - a.lat) + a.lng;
    if (p.lng < x) dedans = !dedans;
  }
  return dedans;
}

/**
 * Distance signee au polygone, en metres.
 * Negative a l'interieur, positive a l'exterieur. C'est cette valeur qui est
 * inscrite au certificat : « 4,20 m a l'interieur » se verifie, « conforme » non.
 */
export function distancePolygone(p, polygone) {
  let min = Infinity;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    min = Math.min(min, distanceSegment(p, polygone[j], polygone[i]));
  }
  return dansPolygone(p, polygone) ? -min : min;
}

function distanceSegment(p, a, b) {
  // Projection plane locale : x vers l'est, y vers le nord, origine en a.
  const mLat = 111132.0;
  const mLng = 111320.0 * Math.cos(rad(a.lat));
  const px = (p.lng - a.lng) * mLng;
  const py = (p.lat - a.lat) * mLat;
  const bx = (b.lng - a.lng) * mLng;
  const by = (b.lat - a.lat) * mLat;
  const len2 = bx * bx + by * by;
  if (len2 === 0) return Math.hypot(px, py);
  let t = (px * bx + py * by) / len2;
  t = Math.max(0, Math.min(1, t));
  return Math.hypot(px - t * bx, py - t * by);
}

/** Centre de gravite d'un polygone (moyenne des sommets, suffisant ici). */
export function centre(polygone) {
  const n = polygone.length;
  return {
    lat: polygone.reduce((s, p) => s + p.lat, 0) / n,
    lng: polygone.reduce((s, p) => s + p.lng, 0) / n,
  };
}

/** Aire approchee du polygone en metres carres (formule du lacet, projection locale). */
export function aire(polygone) {
  const o = centre(polygone);
  const mLat = 111132.0;
  const mLng = 111320.0 * Math.cos(rad(o.lat));
  let s = 0;
  for (let i = 0, j = polygone.length - 1; i < polygone.length; j = i++) {
    const xi = (polygone[i].lng - o.lng) * mLng;
    const yi = (polygone[i].lat - o.lat) * mLat;
    const xj = (polygone[j].lng - o.lng) * mLng;
    const yj = (polygone[j].lat - o.lat) * mLat;
    s += xj * yi - xi * yj;
  }
  return Math.abs(s / 2);
}

/** Cadre englobant, utile pour la carte et pour la requete satellite. */
export function cadre(polygone) {
  const lats = polygone.map((p) => p.lat);
  const lngs = polygone.map((p) => p.lng);
  return {
    sud: Math.min(...lats),
    nord: Math.max(...lats),
    ouest: Math.min(...lngs),
    est: Math.max(...lngs),
  };
}

/** Formatage lisible d'une position, en degres decimaux a 6 chiffres (~11 cm). */
export function formatPosition(p) {
  return `${p.lat.toFixed(6)}, ${p.lng.toFixed(6)}`;
}

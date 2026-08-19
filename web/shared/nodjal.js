// Utilitaires partagés par les trois surfaces. Aucun cadre, aucune dépendance.

export const $  = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

/** Fabrique un élément. Le contenu est posé en texte : jamais d'injection HTML. */
export function el(balise, attributs = {}, enfants = []) {
  const n = document.createElement(balise);
  for (const [cle, valeur] of Object.entries(attributs)) {
    if (valeur === null || valeur === undefined || valeur === false) continue;
    if (cle === 'class') n.className = valeur;
    else if (cle === 'texte') n.textContent = valeur;
    else if (cle === 'html') n.innerHTML = valeur;
    else if (cle.startsWith('on')) n.addEventListener(cle.slice(2).toLowerCase(), valeur);
    else n.setAttribute(cle, valeur === true ? '' : valeur);
  }
  for (const e of [].concat(enfants)) {
    if (e === null || e === undefined || e === false) continue;
    n.append(e instanceof Node ? e : document.createTextNode(String(e)));
  }
  return n;
}

export function vider(n) { while (n.firstChild) n.removeChild(n.firstChild); return n; }

export async function api(chemin, options = {}) {
  const reponse = await fetch(`/api${chemin}`, {
    ...options,
    headers: { 'content-type': 'application/json', ...(options.headers || {}) },
    body: options.corps ? JSON.stringify(options.corps) : options.body,
  });
  const texte = await reponse.text();
  let donnees = null;
  try { donnees = texte ? JSON.parse(texte) : null; } catch { donnees = { brut: texte }; }
  if (!reponse.ok) {
    const e = new Error(donnees?.erreur || `HTTP ${reponse.status}`);
    e.statut = reponse.status;
    e.donnees = donnees;
    throw e;
  }
  return donnees;
}

// ---------------------------------------------------------------- formats

const NBSP = ' '; // espace fine insécable, la bonne pour les milliers en français

export const fcfa = (n) =>
  `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, NBSP)}${NBSP}FCFA`;

export const euros = (n) =>
  `${Math.round(n).toLocaleString('fr-FR').replace(/\s/g, NBSP)}${NBSP}€`;

export const pourcent = (x, decimales = 0) =>
  `${(x * 100).toFixed(decimales).replace('.', ',')}${NBSP}%`;

export function dateFr(iso, avecHeure = true) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  const jour = `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()}`;
  return avecHeure ? `${jour} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC` : jour;
}

export function ilYA(iso) {
  const secondes = (Date.now() - new Date(iso)) / 1000;
  if (secondes < 60) return "à l'instant";
  if (secondes < 3600) return `il y a ${Math.floor(secondes / 60)} min`;
  if (secondes < 86400) return `il y a ${Math.floor(secondes / 3600)} h`;
  return `il y a ${Math.floor(secondes / 86400)} j`;
}

export const CLASSE_VERDICT = { conforme: 'ok', a_instruire: 'instruire', rejete: 'rejet' };
export const MOT_VERDICT = { conforme: 'Conforme', a_instruire: 'À instruire', rejete: 'Rejeté' };
export const MOT_GRAVITE = { info: 'Contrôle', attention: 'Attention', alerte: 'Alerte', blocage: 'Bloquant' };

// ------------------------------------------------------------------- plan

/**
 * Trace un plan cadastral : la parcelle, sa marge tolérée, et les points de
 * prise de vue. Pas de tuile, pas de service tiers — c'est un document.
 */
export function tracerPlan(svg, { parcelle, points = [], margeM = 25 }) {
  const L = 400, H = 300, PAD = 34;
  const lats = parcelle.map((p) => p.lat), lngs = parcelle.map((p) => p.lng);
  const tous = [...parcelle, ...points.filter((p) => typeof p.lat === 'number')];
  const bLat = [Math.min(...tous.map((p) => p.lat)), Math.max(...tous.map((p) => p.lat))];
  const bLng = [Math.min(...tous.map((p) => p.lng)), Math.max(...tous.map((p) => p.lng))];
  const etendue = Math.max(bLat[1] - bLat[0], bLng[1] - bLng[0]) * 1.35 || 0.0004;
  const cLat = (bLat[0] + bLat[1]) / 2, cLng = (bLng[0] + bLng[1]) / 2;

  const X = (lng) => PAD + ((lng - cLng) / etendue + 0.5) * (L - PAD * 2);
  const Y = (lat) => PAD + (0.5 - (lat - cLat) / etendue) * (H - PAD * 2);

  svg.setAttribute('viewBox', `0 0 ${L} ${H}`);
  svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', 'Plan de la parcelle et des points de prise de vue');
  vider(svg);

  const ns = 'http://www.w3.org/2000/svg';
  const noeud = (t, a) => {
    const n = document.createElementNS(ns, t);
    for (const [k, v] of Object.entries(a)) n.setAttribute(k, v);
    return n;
  };

  // Trame de fond : quadrillage discret, comme un fond de plan.
  for (let i = 1; i < 8; i++) {
    svg.append(noeud('line', { x1: (L / 8) * i, y1: 0, x2: (L / 8) * i, y2: H, stroke: 'currentColor', 'stroke-width': .3, opacity: .07 }));
    svg.append(noeud('line', { x1: 0, y1: (H / 6) * i, x2: L, y2: (H / 6) * i, stroke: 'currentColor', 'stroke-width': .3, opacity: .07 }));
  }

  const contour = parcelle.map((p) => `${X(p.lng).toFixed(1)},${Y(p.lat).toFixed(1)}`).join(' ');
  // Marge tolérée : le polygone dilaté approximativement, en pointillés.
  const mLat = margeM / 111132, mLng = margeM / (111320 * Math.cos((cLat * Math.PI) / 180));
  const cx = parcelle.reduce((s, p) => s + p.lng, 0) / parcelle.length;
  const cy = parcelle.reduce((s, p) => s + p.lat, 0) / parcelle.length;
  const marge = parcelle
    .map((p) => {
      const dx = p.lng - cx, dy = p.lat - cy;
      const n = Math.hypot(dx, dy) || 1;
      return `${X(p.lng + (dx / n) * mLng).toFixed(1)},${Y(p.lat + (dy / n) * mLat).toFixed(1)}`;
    })
    .join(' ');

  svg.append(noeud('polygon', { points: marge, class: 'marge' }));
  svg.append(noeud('polygon', { points: contour, class: 'parcelle' }));

  points.forEach((p, i) => {
    if (typeof p.lat !== 'number') return;
    const x = X(p.lng), y = Y(p.lat);
    if (typeof p.cap === 'number') {
      const a = ((p.cap - 90) * Math.PI) / 180;
      svg.append(noeud('line', { x1: x, y1: y, x2: x + Math.cos(a) * 26, y2: y + Math.sin(a) * 26, class: 'visee' }));
    }
    svg.append(noeud('circle', { cx: x, cy: y, r: 4.6, class: `point${p.hors ? ' point--hors' : ''}` }));
    const t = noeud('text', { x: x + 8, y: y + 3 });
    t.textContent = p.etiquette || String(i + 1);
    svg.append(t);
  });

  const echelle = noeud('text', { x: PAD, y: H - 12 });
  echelle.textContent = `parcelle ${parcelle.length} sommets · marge tolérée ${margeM} m`;
  svg.append(echelle);
}

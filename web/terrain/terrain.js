// Application de terrain — version navigateur.
//
// Cette page est un REPLI DE DÉMONSTRATION, et elle le dit à l'écran. Un
// navigateur ne peut pas savoir si la position lui est fournie par le matériel
// ou par une application de position fictive. Android l'expose, le web non.
// C'est la raison d'être de la version native, pas un détail d'implémentation :
// sans ce drapeau, la contre-mesure T2 n'existe pas.
//
// Ce que cette version démontre pour de vrai :
//   — la file d'attente hors ligne, écrite dès le premier jour parce qu'elle
//     s'ajoute mal après coup ;
//   — les prises de vue imposées avec cap boussole ;
//   — le fait que le condensat et l'horodatage qui font foi sont produits par
//     le serveur, jamais par l'appareil.

import { $, el, vider, api, dateFr } from '/shared/nodjal.js';

const CLE_FILE = 'nodjal.file.attente';
const etat = {
  projet: null, jalon: null, prises: [], faites: new Map(),
  position: null, cap: null, session: `ses_${Date.now().toString(36)}`,
  priseEnCours: null,
};

// ------------------------------------------------------- file hors ligne

const lireFile = () => {
  try { return JSON.parse(localStorage.getItem(CLE_FILE) || '[]'); } catch { return []; }
};
const ecrireFile = (f) => localStorage.setItem(CLE_FILE, JSON.stringify(f));

function empiler(entree) {
  const f = lireFile();
  f.push({ ...entree, empileeLe: new Date().toISOString() });
  ecrireFile(f);
  peindre();
}

/**
 * Vide la file. Une entrée n'est retirée qu'après acquittement du serveur :
 * couper le réseau au milieu ne perd rien, et ne dédouble rien non plus, le
 * serveur reconnaissant un fichier déjà reçu à son condensat.
 */
async function vidangerFile() {
  if (!navigator.onLine) return;
  let f = lireFile();
  while (f.length) {
    const entree = f[0];
    try {
      await api(`/jalons/${entree.jalonId}/preuves`, { method: 'POST', corps: entree.charge });
      f = lireFile().slice(1);
      ecrireFile(f);
      peindre();
    } catch (e) {
      if (e.statut && e.statut >= 400 && e.statut < 500 && e.statut !== 429) {
        // Refus définitif du serveur : on retire l'entrée et on le signale,
        // plutôt que de boucler indéfiniment sur une preuve qu'il n'acceptera
        // jamais.
        f = lireFile().slice(1);
        ecrireFile(f);
        signaler(`Preuve refusée par le serveur : ${e.message}`);
        peindre();
        continue;
      }
      return; // panne réseau : on réessaiera
    }
  }
  await charger();
}

// ------------------------------------------------------------- capteurs

function suivrePosition() {
  if (!navigator.geolocation) return;
  navigator.geolocation.watchPosition(
    (p) => {
      etat.position = {
        lat: p.coords.latitude,
        lng: p.coords.longitude,
        precisionM: p.coords.accuracy,
        obtenueLe: new Date().toISOString(),
      };
      peindre();
    },
    () => { etat.position = null; peindre(); },
    { enableHighAccuracy: true, maximumAge: 5000, timeout: 12000 },
  );
}

function suivreCap() {
  const traiter = (e) => {
    const v = e.webkitCompassHeading ?? (typeof e.alpha === 'number' ? 360 - e.alpha : null);
    if (typeof v === 'number' && !Number.isNaN(v)) { etat.cap = (v + 360) % 360; peindre(); }
  };
  if (typeof DeviceOrientationEvent?.requestPermission === 'function') {
    // iOS exige un geste utilisateur : on branche à la première interaction.
    document.addEventListener('click', async function une() {
      document.removeEventListener('click', une);
      try {
        if ((await DeviceOrientationEvent.requestPermission()) === 'granted') {
          window.addEventListener('deviceorientation', traiter, true);
        }
      } catch { /* refus : le cap reste indisponible, et l'écran le montre */ }
    });
  } else {
    window.addEventListener('deviceorientationabsolute', traiter, true);
    window.addEventListener('deviceorientation', traiter, true);
  }
}

// ------------------------------------------------------------ chargement

async function charger() {
  const { projets } = await api('/projets');
  if (!projets.length) return;
  const p = await api(`/projets/${projets[0].id}`);
  etat.projet = p.projet;
  const jalon = p.jalons.find((j) => !['paye', 'annule'].includes(j.statut)) || p.jalons.at(-1);
  const d = await api(`/jalons/${jalon.id}`);
  etat.jalon = d.jalon;
  etat.prises = d.jalon.prisesRequises || [];
  etat.faites = new Map(d.preuves.filter((x) => x.priseDeVue).map((x) => [x.priseDeVue, x]));
  peindre();
}

// ---------------------------------------------------------------- rendu

function peindre() {
  const corps = vider($('#corps'));
  if (!etat.jalon) { corps.append(el('p', { class: 'mention', texte: 'Chargement…' })); return; }

  $('#reseau').textContent = navigator.onLine ? 'EN LIGNE' : 'HORS LIGNE';
  $('#reseau').className = `barre__etat ${navigator.onLine ? 'en-ligne' : 'hors-ligne'}`;

  const file = lireFile();

  corps.append(
    el('div', {}, [
      el('p', { class: 'chapeau chapeau--seul', style: 'color:rgba(246,243,236,.42)', texte: `${etat.projet.libelle} · ${etat.projet.ville}` }),
      el('h2', { style: 'font-size:1.3rem;color:var(--papier);margin-top:.25rem', texte: `Jalon ${etat.jalon.ordre} — ${etat.jalon.libelle}` }),
    ]),

    el('div', { class: 'avertissement' }, [
      'Surface web : le drapeau de position fictive n\'est pas lisible ici. ',
      'Toute preuve déposée depuis ce navigateur portera le signal ',
      el('span', { class: 'machine', texte: '« origine de la position inconnue »' }),
      '. C\'est voulu — le système ne prétend pas savoir ce qu\'il ne peut pas savoir.',
    ]),

    el('div', { class: 'capteurs' }, [
      capteur('Position', etat.position ? `${etat.position.lat.toFixed(5)}\n${etat.position.lng.toFixed(5)}` : 'indisponible'),
      capteur('Précision', etat.position ? `± ${Math.round(etat.position.precisionM)} m` : '—'),
      capteur('Cap', typeof etat.cap === 'number' ? `${Math.round(etat.cap)}°` : 'indisponible'),
    ]),

    boussole(),

    ...etat.prises.map(blocPrise),

    file.length
      ? el('div', { class: 'file' }, [
          el('p', { class: 'chapeau chapeau--seul', style: 'color:#D9A34E', texte: `File d'attente — ${file.length} pièce(s)` }),
          el('ul', { style: 'list-style:none;padding:0;margin:.5rem 0 .8rem' }, file.map((f) =>
            el('li', {}, [
              el('span', { texte: f.charge.priseDeVue || 'pièce' }),
              el('span', { style: 'color:rgba(246,243,236,.4)', texte: dateFr(f.empileeLe).slice(11) }),
            ]),
          )),
          el('button', {
            class: 'bouton bouton--fantome',
            disabled: !navigator.onLine,
            texte: navigator.onLine ? 'Synchroniser maintenant' : 'En attente de réseau',
            onclick: vidangerFile,
          }),
        ])
      : el('p', { class: 'mention', style: 'color:rgba(246,243,236,.4)', texte: 'File d\'attente vide. Coupez le réseau, prenez une photo, rallumez : elle part toute seule.' }),

    el('p', { id: 'message', class: 'mention', role: 'status', 'aria-live': 'polite', style: 'color:#D9A34E' }),
  );
}

const capteur = (titre, valeur) =>
  el('div', { class: 'capteur' }, [el('span', { texte: titre }), el('strong', { style: 'white-space:pre-line', texte: valeur })]);

function boussole() {
  const ns = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(ns, 'svg');
  svg.setAttribute('class', 'boussole');
  svg.setAttribute('viewBox', '0 0 300 100');
  const n = (t, a, texte) => {
    const x = document.createElementNS(ns, t);
    for (const [k, v] of Object.entries(a)) x.setAttribute(k, v);
    if (texte) x.textContent = texte;
    return x;
  };
  svg.append(n('line', { x1: 0, y1: 62, x2: 300, y2: 62, stroke: 'rgba(246,243,236,.16)', 'stroke-width': 1 }));
  const cap = typeof etat.cap === 'number' ? etat.cap : null;
  for (let d = 0; d < 360; d += 15) {
    const delta = cap === null ? d - 180 : ((d - cap + 540) % 360) - 180;
    if (Math.abs(delta) > 70) continue;
    const x = 150 + (delta / 70) * 148;
    const majeur = d % 90 === 0;
    svg.append(n('line', { x1: x, y1: majeur ? 44 : 54, x2: x, y2: 62, stroke: majeur ? 'rgba(246,243,236,.6)' : 'rgba(246,243,236,.22)', 'stroke-width': 1 }));
    if (majeur) svg.append(n('text', { x, y: 38, 'text-anchor': 'middle', fill: 'rgba(246,243,236,.55)', 'font-family': 'var(--machine)', 'font-size': 10 }, ['N', 'E', 'S', 'O'][d / 90]));
  }
  const attendu = etat.priseEnCours?.capAttendu;
  if (typeof attendu === 'number' && cap !== null) {
    const delta = ((attendu - cap + 540) % 360) - 180;
    if (Math.abs(delta) <= 70) {
      const x = 150 + (delta / 70) * 148;
      svg.append(n('line', { x1: x, y1: 30, x2: x, y2: 70, stroke: '#8FC6A8', 'stroke-width': 2, 'stroke-dasharray': '3 2' }));
      svg.append(n('text', { x, y: 84, 'text-anchor': 'middle', fill: '#8FC6A8', 'font-family': 'var(--machine)', 'font-size': 9 }, 'visée'));
    }
  }
  svg.append(n('polygon', { points: '150,66 145,78 155,78', fill: cap === null ? 'rgba(246,243,236,.3)' : '#F6F3EC' }));
  if (cap === null) svg.append(n('text', { x: 150, y: 22, 'text-anchor': 'middle', fill: 'rgba(246,243,236,.35)', 'font-family': 'var(--machine)', 'font-size': 9 }, 'boussole indisponible'));
  return svg;
}

function blocPrise(prise) {
  const faite = etat.faites.get(prise.code);
  const enFile = lireFile().some((f) => f.charge.priseDeVue === prise.code);
  const ecart = typeof etat.cap === 'number' && typeof prise.capAttendu === 'number'
    ? Math.min(Math.abs(etat.cap - prise.capAttendu), 360 - Math.abs(etat.cap - prise.capAttendu))
    : null;

  return el('div', { class: `prise${faite || enFile ? ' prise--faite' : ''}` }, [
    el('div', { class: 'prise__tete' }, [
      el('span', { class: 'prise__nom', texte: prise.libelle }),
      el('span', { class: 'prise__cap', texte: typeof prise.capAttendu === 'number' ? `cap ${prise.capAttendu}°` : 'cap libre' }),
    ]),
    faite
      ? el('img', { class: 'prise__apercu', src: `/api/preuves/${faite.id}`, alt: prise.libelle, loading: 'lazy' })
      : null,
    faite
      ? el('p', { class: 'mention', style: 'color:rgba(143,198,168,.8);font-size:.72rem', texte: `Déposée · heure serveur ${dateFr(faite.horodatageServeur)} · ${faite.sha256.slice(0, 16)}…` })
      : enFile
        ? el('p', { class: 'mention', style: 'color:#D9A34E;font-size:.72rem', texte: 'En file d\'attente. Partira dès le retour du réseau.' })
        : el('button', {
            class: 'bouton bouton--terrain',
            disabled: ecart !== null && ecart > 35,
            onclick: () => declencher(prise),
          }, [
            ecart !== null && ecart > 35
              ? `Pivotez de ${Math.round(ecart)}° vers la visée`
              : 'Prendre la photo',
          ]),
  ]);
}

// --------------------------------------------------------------- capture

function declencher(prise) {
  etat.priseEnCours = prise;
  peindre();
  $('#fichier').click();
}

$('#fichier').addEventListener('change', async (e) => {
  const fichier = e.target.files?.[0];
  e.target.value = '';
  if (!fichier || !etat.priseEnCours) return;

  const contenuBase64 = await new Promise((resoudre) => {
    const l = new FileReader();
    l.onload = () => resoudre(String(l.result).split(',')[1]);
    l.readAsDataURL(fichier);
  });

  const charge = {
    contenuBase64,
    type: 'photo',
    priseDeVue: etat.priseEnCours.code,
    sessionId: etat.session,
    surface: 'web',
    gpsLat: etat.position?.lat ?? null,
    gpsLng: etat.position?.lng ?? null,
    precisionM: etat.position?.precisionM ?? null,
    // Volontairement absent : le web ne peut pas se prononcer. Envoyer « false »
    // serait une affirmation que le navigateur n'a pas les moyens de faire.
    cap: typeof etat.cap === 'number' ? Math.round(etat.cap) : null,
    horodatageAppareil: new Date().toISOString(),
    appareilModele: navigator.userAgent.slice(0, 90),
  };

  const jalonId = etat.jalon.id;
  etat.priseEnCours = null;

  if (!navigator.onLine) {
    empiler({ jalonId, charge });
    signaler('Hors ligne. La pièce est en file d\'attente et partira au retour du réseau.');
    return;
  }
  try {
    await api(`/jalons/${jalonId}/preuves`, { method: 'POST', corps: charge });
    await charger();
    signaler('Pièce déposée. Le condensat et l\'heure qui font foi ont été produits par le serveur.');
  } catch (err) {
    empiler({ jalonId, charge });
    signaler(`Dépôt différé (${err.message}). La pièce est en file d'attente.`);
  }
});

function signaler(texte) {
  const n = $('#message');
  if (n) n.textContent = texte;
}

window.addEventListener('online', () => { peindre(); vidangerFile(); });
window.addEventListener('offline', peindre);

suivrePosition();
suivreCap();
charger().then(vidangerFile).catch((e) => {
  vider($('#corps')).append(el('p', { class: 'mention', style: 'color:#D9A34E', texte: `Serveur injoignable : ${e.message}` }));
});

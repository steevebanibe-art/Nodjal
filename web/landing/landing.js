// Cablage de la page publique. Rien ici ne fabrique de contenu : tout le texte
// est dans le HTML, et la page reste entierement lisible si ce fichier ne se
// charge jamais. Le JavaScript ajoute le mouvement, pas le sens.

import { api, $ } from '/shared/nodjal.js';
import {
  decouper, piloterHero, animerEntrees, suspendreHorsVue,
  animerChiffres, dessinerTraits, figeExige,
} from './moteur.js';
import { installerLiberation } from './liberer.js';

/* ------------------------------------------------------------- l'ouverture */

const hero = document.querySelector('.hero');
const etage = document.querySelector('.etage');

// Chaque titre de bande recoit le decoupage que reclame son entree. Les graines
// sont fixes : la page se recompose a l'identique a chaque visite.
const DECOUPES = {
  net:        { sens: 'lecture',   spread: .30, seed: 11 },
  descend:    { sens: 'lecture',   spread: .46, seed: 23 },
  eparpille:  { sens: 'aleatoire', spread: .52, seed: 37 },
  frappe:     { sens: 'lecture',   spread: .40, seed: 51 },
  leve:       { sens: 'lecture',   spread: .44, seed: 67 },
};

document.querySelectorAll('[data-decoupe]').forEach((el) => {
  const nom = el.dataset.decoupe;
  decouper(el, DECOUPES[nom] || {});
  // La mise au point empile deux copies : une floue en permanence, une nette.
  // On n'anime jamais le filtre lui meme, qui n'est pas confie au compositeur.
  if (nom === 'net') {
    const flou = el.querySelector('.decoupe').cloneNode(true);
    flou.classList.add('flou');
    flou.setAttribute('aria-hidden', 'true');
    el.appendChild(flou);
  }
  if (nom === 'frappe') {
    const mots = el.querySelectorAll('.mot');
    mots[mots.length - 1]?.classList.add('fort');
  }
});

// Une seule ecriture DOM par image : la progression va dans --p, et tout le
// dessin en decoule par calcul CSS.
let dernierP = -1;
function dessiner(p) {
  const arrondi = Math.round(p * 500) / 500;
  if (arrondi === dernierP) return;
  dernierP = arrondi;
  etage?.style.setProperty('--p', arrondi);
}

piloterHero({
  hero,
  bandes: [...document.querySelectorAll('.bande')],
  dessiner,
});

/* ------------------------------------------------- le reste de la page */

animerEntrees();
suspendreHorsVue();
animerChiffres();
dessinerTraits();
installerLiberation(document.querySelector('[data-liberation]'));

/* ------------------------------------------------------ le verificateur

   Il tape la vraie API du serveur. Le jury peut coller une reference et voir
   le recalcul se faire, sans compte et sans nous croire sur parole. */

const formVerif = document.querySelector('[data-verif]');
const champRef = document.querySelector('[data-ref-input]');
const sortie = document.querySelector('[data-verif-sortie]');

const echapper = (s) => String(s).replace(/[&<>"]/g, (c) =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// Preremplit avec une reference reelle du chantier pilote, pour que le premier
// essai reussisse sans que le visiteur ait a chercher quoi que ce soit.
(async () => {
  if (!champRef) return;
  try {
    const { projet, jalons } = await api('/projets/prj_BONABERI');
    const paye = (jalons || []).find((j) => j.certificatReference);
    if (paye) champRef.value = paye.certificatReference;
    if (projet) champRef.setAttribute('aria-describedby', 'consigne-verif');
  } catch { /* le serveur dort : le champ garde son exemple */ }
})();

formVerif?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const ref = champRef.value.trim();
  if (!ref) return;
  const bouton = formVerif.querySelector('button');
  bouton.disabled = true;
  sortie.className = 'verif__sortie verif__sortie--attente';
  sortie.textContent = 'Recalcul des empreintes…';

  try {
    const [cert, verdict] = await Promise.all([
      api(`/certificats/${encodeURIComponent(ref)}`),
      api(`/certificats/${encodeURIComponent(ref)}/verifier`, { method: 'POST' }),
    ]);

    const ok = verdict.conforme !== false && verdict.valide !== false;
    const pieces = cert.manifeste?.preuves?.length ?? 0;
    sortie.className = 'verif__sortie ' + (ok ? 'verif__sortie--ok' : 'verif__sortie--non');
    sortie.innerHTML = `
      <p class="verif__verdict">${ok ? 'Concordance complète.' : 'Écart détecté.'}</p>
      <dl class="verif__faits">
        <div><dt>Référence</dt><dd class="machine">${echapper(cert.reference)}</dd></div>
        <div><dt>Émis le</dt><dd>${echapper((cert.emisLe || '').slice(0, 10) || 'non daté')}</dd></div>
        <div><dt>Pièces recalculées</dt><dd>${pieces}</dd></div>
        <div><dt>Empreinte du manifeste</dt><dd class="machine verif__hash">${echapper(cert.empreinteManifeste || '')}</dd></div>
        <div><dt>Chaîné au certificat</dt><dd class="machine">${echapper(cert.manifeste?.precedent || 'aucun, premier jalon')}</dd></div>
      </dl>
      <p class="mention">L'horodatage est celui du serveur. Sans prestataire eIDAS
      configuré, ce certificat ne porte pas encore d'horodatage qualifié, et il le dit.</p>`;
  } catch (err) {
    sortie.className = 'verif__sortie verif__sortie--non';
    sortie.textContent = `Référence introuvable ou serveur indisponible : ${err.message}`;
  } finally {
    bouton.disabled = false;
  }
});

/* -------------------------------------------------------- la liste d'attente */

$('#formulaire')?.addEventListener('submit', async (e) => {
  e.preventDefault();
  const bouton = e.target.querySelector('button');
  const retour = $('#retour');
  const donnees = Object.fromEntries(new FormData(e.target));
  bouton.disabled = true;
  retour.textContent = 'Enregistrement…';
  try {
    const r = await api('/liste-attente', { method: 'POST', corps: { ...donnees, source: 'landing' } });
    e.target.reset();
    retour.textContent = `Inscrit. Vous êtes la ${r.total}ᵉ inscription. Nous revenons vers vous à l'ouverture du corridor.`;
  } catch (err) {
    retour.textContent = `Échec de l'enregistrement : ${err.message}`;
  } finally {
    bouton.disabled = false;
  }
});

// Trace utile au diagnostic : quel mode d'ouverture a ete retenu.
if (figeExige()) document.documentElement.dataset.ouverture = 'figee';

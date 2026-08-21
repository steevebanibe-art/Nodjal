// Le moment interactif de la page. Un seul, et il enacte la regle du produit.
//
// Le visiteur maintient le bouton de liberation. L'argent ne se libere pas
// parce qu'il appuie : il se libere parce que les preuves se posent, une par
// une, et le montant suit. S'il lache avant la fin, la progression redescend
// doucement. Rien ne claque, rien ne triche.
//
// Les six controles et le montant sont ceux du VRAI jeu de demonstration servi
// par la console (jalon 3, elevation des murs, 5 200 000 XAF). Le site et le
// produit racontent le meme chantier.

import { RM, borne } from './moteur.js';

const CONTROLES = [
  { seuil: .13, code: 'T1', titre: 'Geofence',      detail: 'La prise de vue tombe dans le polygone de la parcelle.' },
  { seuil: .29, code: 'T1', titre: 'Cap boussole',  detail: 'L\'angle impose pour cette prise est respecte a 7 degres pres.' },
  { seuil: .45, code: 'T3', titre: 'Empreinte',     detail: 'Aucune correspondance avec l\'historique : la photo n\'a pas ete rejouee.' },
  { seuil: .61, code: 'T3', titre: 'Horodatage',    detail: 'L\'heure qui fait foi est celle du serveur, jamais celle de l\'appareil.' },
  { seuil: .77, code: 'T6', titre: 'Facture',       detail: '98 sacs de ciment factures pour 96 au devis. Ecart de 2 %, dans la tolerance.' },
  { seuil: .93, code: 'T5', titre: 'Inspecteur',    detail: 'Clarisse Manga, metreuse, tiree au sort. Elle n\'a jamais vu ce chantier.' },
];

const MONTANT = 5_200_000;
const espacer = (n) => Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ');

export function installerLiberation(racine) {
  if (!racine) return;

  const bouton   = racine.querySelector('[data-tenir]');
  const jauge    = bouton;   // la jauge est la surface du bouton lui meme
  const somme    = racine.querySelector('[data-somme]');
  const lignes   = [...racine.querySelectorAll('[data-controle]')];
  const verdict  = racine.querySelector('[data-verdict]');
  const consigne = racine.querySelector('[data-consigne]');
  const etat     = racine.querySelector('[data-etat]');
  const libelle  = racine.querySelector('[data-libelle]');
  if (!bouton || !somme) return;

  let p = 0, cible = 0, raf = null, scelle = false;
  let dernier = 0, dernierEcrit = -1, derniereSomme = '';

  function peindre() {
    // Deux gardes sur l'ecriture : le pas de la jauge, puis le changement reel
    // de la chaine. Une seule des deux ne suffit pas.
    const pas = Math.round(p * 200);
    if (pas !== dernierEcrit) {
      dernierEcrit = pas;
      jauge.style.setProperty('--remplie', p.toFixed(3));
    }

    const s = espacer(MONTANT * p);
    if (s !== derniereSomme) { derniereSomme = s; somme.textContent = s; }

    lignes.forEach((el, i) => {
      const ok = p >= CONTROLES[i].seuil;
      if (el.dataset.ok === String(ok)) return;
      el.dataset.ok = String(ok);
      el.classList.toggle('controle--ok', ok);
    });

    if (p >= 1 && !scelle) sceller();
  }

  function sceller() {
    scelle = true;
    racine.classList.add('liberation--scellee');
    bouton.setAttribute('aria-pressed', 'true');
    bouton.disabled = true;
    if (verdict) verdict.hidden = false;
    if (libelle) libelle.textContent = 'Versement autorisé';
    if (etat) {
      etat.classList.replace('pastille--instruire', 'pastille--ok');
      etat.textContent = 'Jalon certifié';
    }
    if (consigne) consigne.textContent = 'Certificat NDJ-2026-0003 émis. Le versement est autorisé.';
  }

  function battre(now) {
    const dt = Math.min(64, now - (dernier || now));
    dernier = now;
    // La montee demande environ 2,4 secondes de maintien. La descente est plus
    // lente que l'instantane et plus rapide que la montee : lacher est un
    // renoncement, pas une punition.
    const vitesse = cible > p ? dt / 2400 : -(dt / 1500);
    p = borne(p + vitesse, 0, 1);
    peindre();

    const stable = (cible === 1 && p === 1) || (cible === 0 && p === 0);
    if (stable) { raf = null; dernier = 0; } else raf = requestAnimationFrame(battre);
  }

  function relancer() {
    if (raf === null && !scelle) { dernier = 0; raf = requestAnimationFrame(battre); }
  }

  const prendre = (e) => {
    if (scelle) return;
    e.preventDefault();
    try { bouton.setPointerCapture?.(e.pointerId); } catch { /* pointeur deja parti */ }
    racine.classList.add('liberation--tenue');
    cible = 1; relancer();
  };
  const lacher = () => {
    if (scelle) return;
    racine.classList.remove('liberation--tenue');
    cible = 0; relancer();
  };

  bouton.addEventListener('pointerdown', prendre);
  bouton.addEventListener('pointerup', lacher);
  bouton.addEventListener('pointercancel', lacher);
  bouton.addEventListener('pointerleave', lacher);
  bouton.addEventListener('contextmenu', (e) => e.preventDefault());

  // Le clavier : maintenir Entree ou Espace produit le meme geste. Le
  // relachement de la touche relache le bouton, comme le doigt.
  bouton.addEventListener('keydown', (e) => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat || scelle) return;
    racine.classList.add('liberation--tenue');
    cible = 1; relancer();
  });
  bouton.addEventListener('keyup', (e) => {
    if (e.key === ' ' || e.key === 'Enter') lacher();
  });
  bouton.addEventListener('blur', lacher);

  // Mouvement reduit : l'etat final, tout de suite, sans rien a maintenir.
  function poserFinal() {
    p = 1; cible = 1;
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    peindre();
    if (consigne) consigne.textContent = 'Certificat NDJ-2026-0003 émis. Le versement est autorisé.';
  }

  if (RM.matches) poserFinal();
  RM.addEventListener('change', (e) => { if (e.matches && !scelle) poserFinal(); });

  peindre();
}

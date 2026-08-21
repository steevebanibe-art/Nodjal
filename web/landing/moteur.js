// Moteur de defilement de la page publique.
//
// Aucune dependance. Aucune video. La sequence d'ouverture est DESSINEE, pilotee
// par la progression du defilement dans un hero epingle. Ce choix n'est pas une
// economie : le produit affirme ne jamais faire passer une image fabriquee pour
// une preuve, donc son site ne peut pas s'ouvrir sur une image fabriquee.
//
// Consequence heureuse : le fond est dessine, donc le contraste du texte est
// garanti par construction et n'a pas a etre audite image par image.
//
// Trois responsabilites, separees :
//   1. la progression du hero, lissee, qui pilote la scene et les bandes ;
//   2. les entrees des sections, chorégraphiées a l'observation ;
//   3. les gardes : mouvement reduit, onglet cache, hors ecran.

const RM = matchMedia('(prefers-reduced-motion: reduce)');

// Les cinq gardes de l'ouverture figee. Ces chaines sont recopiees CARACTERE
// POUR CARACTERE dans landing.css : si les deux cotes divergent, l'un montre
// une scene que l'autre n'anime pas.
//
// La garde est relue a chaque changement, jamais une seule fois au chargement.
// Une tablette qu'on fait pivoter, une fenetre qu'on agrandit, une preference
// systeme qu'on modifie en cours de visite : le CSS reagit tout de suite, et
// sans ces ecouteurs le JavaScript resterait sur sa decision d'origine.
const GARDES = [
  '(max-width: 720px)',
  '(orientation: portrait) and (max-width: 1024px)',
  '(orientation: portrait) and (pointer: coarse)',
  '(orientation: landscape) and (pointer: coarse) and (max-height: 560px)',
  '(prefers-reduced-motion: reduce)',
];
// On garde les listes referencees : des listes non retenues ont
// historiquement perdu leurs ecouteurs sur d'anciens navigateurs.
const MQ = GARDES.map((q) => matchMedia(q));
const figeExige = () => MQ.some((m) => m.matches);

const borne = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const adoucir = (p, e0, e1) => {
  const t = borne((p - e0) / (e1 - e0), 0, 1);
  return t * t * (3 - 2 * t);
};

// Generateur pseudo-aleatoire a graine : les decalages « aleatoires » des
// caracteres sont identiques a chaque chargement. Un site qui se recompose
// differemment a chaque visite n'a pas ete dessine, il a ete lance.
export function graine(n) {
  let s = n >>> 0;
  return () => (s = (s * 1664525 + 1013904223) >>> 0) / 4294967296;
}

/* ========================================================== decoupage du texte

   Chaque titre de bande est decoupe en mots puis en caracteres, une seule fois
   au chargement. Une copie lisible par les lecteurs d'ecran porte la phrase
   entiere ; la copie visuelle, purement decorative, porte les spans animes. */

export function decouper(el, { spread = 0.42, sens = 'aleatoire', seed = 7 } = {}) {
  const phrase = el.textContent.trim();
  const rnd = graine(seed);
  el.textContent = '';

  const lecture = document.createElement('span');
  lecture.className = 'lecteur-seul';
  lecture.textContent = phrase;
  el.appendChild(lecture);

  const visuel = document.createElement('span');
  visuel.setAttribute('aria-hidden', 'true');
  visuel.className = 'decoupe';

  const mots = phrase.split(' ');
  const total = phrase.replace(/ /g, '').length;
  let rang = 0;

  mots.forEach((mot, im) => {
    const m = document.createElement('span');
    m.className = 'mot';
    m.style.setProperty('--tm', (im / Math.max(1, mots.length - 1) * spread).toFixed(3));

    for (const c of mot) {
      const s = document.createElement('span');
      s.className = 'car';
      const seuil = sens === 'lecture'
        ? (rang / Math.max(1, total - 1)) * spread + rnd() * 0.05
        : rnd() * spread;
      s.style.setProperty('--ts', seuil.toFixed(3));
      s.style.setProperty('--dx', ((rnd() - 0.5) * 52).toFixed(1) + 'px');
      s.style.setProperty('--dy', ((rnd() - 0.5) * 40).toFixed(1) + 'px');
      s.style.setProperty('--dr', ((rnd() - 0.5) * 14).toFixed(1) + 'deg');
      s.textContent = c;
      m.appendChild(s);
      rang++;
    }
    visuel.appendChild(m);
    if (im < mots.length - 1) visuel.appendChild(document.createTextNode(' '));
  });

  el.appendChild(visuel);
}

/* ============================================================== le hero epingle

   Le hero est une zone haute contenant une scene collante en plein ecran. La
   progression du defilement a travers cette zone se projette sur 0..1, et cette
   valeur pilote tout : le dessin, les bandes, l'assemblage des caracteres.

   Le temps affiche n'est jamais la position brute du defilement : il tend vers
   elle. La normalisation par dt rend le lissage independant de la frequence de
   l'ecran, sans quoi le site n'a pas le meme toucher a 60 et a 120 hertz. */

export function piloterHero({ hero, bandes, dessiner, lissage = 0.16 }) {
  if (!hero) return null;

  const etats = bandes.map((el) => ({
    el,
    a: parseFloat(el.dataset.de),
    b: parseFloat(el.dataset.a),
    rampe: el.dataset.rampe ? parseFloat(el.dataset.rampe) : null,
    premiere: false,
    derniere: false,
    op: -1,
    k: -1,
  }));
  if (etats.length) {
    etats[0].premiere = true;
    etats[etats.length - 1].derniere = true;
  }

  let cible = 0, montre = 0, raf = null, dernier = 0;
  let visible = true, arme = false;
  let kCharge = 0, departCharge = 0;

  const progression = () => {
    const r = hero.getBoundingClientRect();
    const course = hero.offsetHeight - innerHeight;
    return course <= 0 ? 0 : borne(-r.top / course, 0, 1);
  };

  function peindre(p) {
    for (const e of etats) {
      const f = Math.min(0.02, (e.b - e.a) / 3);
      const entree = e.premiere ? 1 : adoucir(p, e.a, e.a + f);
      const sortie = e.derniere ? 0 : adoucir(p, e.b - f, e.b);
      const op = +(entree * (1 - sortie)).toFixed(3);

      if (op !== e.op) {
        e.op = op;
        e.el.style.opacity = op;
        // Une bande eteinte ne doit pas intercepter la souris ni le clavier.
        e.el.style.visibility = op < 0.01 ? 'hidden' : '';
      }

      const largeur = e.rampe || Math.min(0.025, (e.b - e.a) * 0.35);
      let k = borne((p - e.a) / largeur, 0, 1);
      // La premiere bande s'ouvre deja assemblee : il n'y a rien au dessus
      // d'elle vers quoi remonter, donc une rampe temporelle prend le relais.
      if (e.premiere) k = Math.max(k, kCharge);

      const kr = Math.round(k * 125) / 125;   // delta-gate a 0.008
      if (kr !== e.k) {
        e.k = kr;
        e.el.style.setProperty('--k', kr);
      }
    }
    if (dessiner) dessiner(p);
  }

  function battre(now) {
    const dt = Math.min(100, now - (dernier || now));
    dernier = now;

    if (kCharge < 1 && departCharge) {
      kCharge = borne((now - departCharge) / 900, 0, 1);
    }

    montre += (cible - montre) * (1 - Math.pow(1 - lissage, dt / 16.667));
    const fini = Math.abs(cible - montre) < 0.0005 && kCharge >= 1;
    if (fini) { montre = cible; raf = null; dernier = 0; }
    else raf = requestAnimationFrame(battre);

    peindre(montre);
  }

  function relancer() {
    if (raf === null && visible && arme) { dernier = 0; raf = requestAnimationFrame(battre); }
  }
  const auDefilement = () => { cible = progression(); relancer(); };

  const oeil = new IntersectionObserver(([e]) => {
    visible = e.isIntersecting;
    if (visible) relancer();
    else if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
  }, { rootMargin: '10% 0px' });

  // --- l'etat fige, pour le mouvement reduit et pour l'impression papier
  function figer() {
    if (raf !== null) { cancelAnimationFrame(raf); raf = null; }
    removeEventListener('scroll', auDefilement);
    arme = false;
    hero.classList.add('hero--fige');
    for (const e of etats) {
      e.op = -1; e.k = -1;
      e.el.style.opacity = '';
      e.el.style.visibility = '';
      e.el.style.removeProperty('--k');
    }
    if (dessiner) dessiner(1, { fige: true });
  }

  function armer() {
    if (arme) return;
    arme = true;
    hero.classList.remove('hero--fige');
    for (const e of etats) { e.op = -1; e.k = -1; }
    kCharge = 0;
    departCharge = performance.now();
    addEventListener('scroll', auDefilement, { passive: true });
    addEventListener('resize', auDefilement, { passive: true });
    oeil.observe(hero);
    cible = progression();
    peindre(cible);
    relancer();
  }

  function appliquer() {
    if (figeExige()) figer();
    else armer();
  }

  MQ.forEach((m) => m.addEventListener('change', appliquer));
  appliquer();

  return { armer, figer, appliquer, progression };
}

/* =============================================================== les entrees

   Chaque bloc entre en scene une fois, avec un decalage entre ses enfants. Le
   decalage est ensuite RETIRE : sans cela, chaque survol des elements suivants
   traine indefiniment du retard de leur entree. La regle de nettoyage doit
   battre en specificite celle qui a pose le retard, d'ou le :nth-child repete
   dans la feuille de style. */

export function animerEntrees(selecteur = '[data-entree]') {
  const cibles = document.querySelectorAll(selecteur);
  if (RM.matches) { cibles.forEach((c) => c.classList.add('dedans', 'retiree')); return; }

  const oeil = new IntersectionObserver((entrees, obs) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      e.target.classList.add('dedans');
      obs.unobserve(e.target);
      const n = e.target.children.length;
      setTimeout(() => e.target.classList.add('retiree'), 420 + n * 90);
    }
  }, { rootMargin: '0px 0px -12% 0px', threshold: 0.12 });

  cibles.forEach((c) => oeil.observe(c));
}

/* ============================================================== les vivants

   Un element vivant par section, au niveau du murmure. Les boucles sont mises
   en pause hors ecran et sur onglet cache. animation-play-state ne s'herite
   pas : la regle doit toucher chaque element et chaque pseudo-element, d'ou la
   forme « body.suspendu *, body.suspendu *::before ». */

export function suspendreHorsVue() {
  document.addEventListener('visibilitychange', () => {
    document.body.classList.toggle('suspendu', document.hidden);
  });

  const oeil = new IntersectionObserver((entrees) => {
    for (const e of entrees) e.target.classList.toggle('en-vue', e.isIntersecting);
  }, { rootMargin: '15% 0px' });

  document.querySelectorAll('[data-vivant]').forEach((el) => oeil.observe(el));
}

/* ============================================================ un compteur sobre

   Les chiffres montent une fois, a l'entree, et seulement si le mouvement est
   accepte. L'ecriture est limitee a environ dix fois par seconde ET au
   changement reel de la chaine : deux gardes, parce qu'une seule ne suffit pas. */

export function animerChiffres(selecteur = '[data-compte]') {
  const cibles = [...document.querySelectorAll(selecteur)];
  const poser = (el) => { el.textContent = el.dataset.compte; };
  if (RM.matches) { cibles.forEach(poser); return; }

  const oeil = new IntersectionObserver((entrees, obs) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      const el = e.target;
      const fin = parseFloat(el.dataset.compte.replace(',', '.'));
      const decimales = (el.dataset.compte.split(',')[1] || '').length;
      const duree = 1100;
      let t0 = 0, derniereEcriture = 0, derniereChaine = '';

      const pas = (now) => {
        if (!t0) t0 = now;
        const p = borne((now - t0) / duree, 0, 1);
        const eased = 1 - Math.pow(1 - p, 3);
        if (now - derniereEcriture > 100 || p === 1) {
          derniereEcriture = now;
          const s = (fin * eased).toFixed(decimales).replace('.', ',');
          if (s !== derniereChaine) { derniereChaine = s; el.textContent = s; }
        }
        if (p < 1) requestAnimationFrame(pas);
        else poser(el);
      };
      requestAnimationFrame(pas);
    }
  }, { threshold: 0.5 });

  cibles.forEach((c) => oeil.observe(c));
}

/* ====================================================== traits qui se dessinent

   Un trait SVG se dessine a mesure qu'il entre. En mouvement reduit il est
   simplement deja dessine. */

export function dessinerTraits(selecteur = '[data-trait]') {
  const traits = [...document.querySelectorAll(selecteur)];
  const poser = (el) => { el.style.strokeDashoffset = '0'; };
  if (RM.matches) { traits.forEach(poser); return; }

  const oeil = new IntersectionObserver((entrees, obs) => {
    for (const e of entrees) {
      if (!e.isIntersecting) continue;
      obs.unobserve(e.target);
      const el = e.target;
      const L = el.getTotalLength();
      el.style.strokeDasharray = L;
      el.style.strokeDashoffset = L;
      el.getBoundingClientRect();          // force le calcul avant la transition
      el.style.transition = `stroke-dashoffset ${el.dataset.trait || 1400}ms cubic-bezier(.22,.61,.36,1)`;
      el.style.strokeDashoffset = '0';
    }
  }, { threshold: 0.25 });

  traits.forEach((t) => oeil.observe(t));
}

export { RM, GARDES, figeExige, borne, adoucir };

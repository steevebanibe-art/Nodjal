// Machine a etats des jalons.
//
// Une seule regle porte tout le reste : l'argent ne se deplace que dans le sens
// des fleches, et chaque fleche a une garde. Aucun raccourci n'est expose par
// l'interface, parce qu'aucun raccourci n'existe ici.
//
// Le retour en arriere est possible depuis « preuves deposees » et « rejete »,
// et seulement depuis la. Une fois le donneur d'ordre engage, on ne revient pas.

export const ETATS = {
  a_faire: {
    libelle: 'A faire',
    description: "Jalon ouvert. L'executant peut deposer ses preuves.",
    suivants: ['preuves_deposees', 'annule'],
  },
  preuves_deposees: {
    libelle: 'Preuves deposees',
    description: 'Toutes les prises imposees sont couvertes. Analyse en attente.',
    suivants: ['analyse_conforme', 'analyse_a_instruire', 'analyse_rejetee', 'a_faire'],
  },
  analyse_a_instruire: {
    libelle: 'A instruire',
    description: 'Signaux defavorables. Piece complementaire ou reprise demandee.',
    suivants: ['preuves_deposees', 'analyse_conforme', 'analyse_rejetee', 'a_faire'],
  },
  analyse_rejetee: {
    libelle: 'Rejete',
    description: "Signal bloquant. Le jalon repart a zero, les preuves restent au dossier.",
    suivants: ['a_faire'],
  },
  analyse_conforme: {
    libelle: 'Analyse conforme',
    description: 'Faisceau suffisant. Certificat emis. Le donneur d\'ordre decide.',
    suivants: ['valide_donneur_ordre', 'analyse_a_instruire', 'conteste'],
  },
  conteste: {
    libelle: 'Conteste',
    description: "Le donneur d'ordre conteste malgre un certificat conforme. Instruction contradictoire.",
    suivants: ['analyse_conforme', 'analyse_rejetee'],
  },
  valide_donneur_ordre: {
    libelle: 'Valide par le donneur d\'ordre',
    description: 'Liberation autorisee. Instruction de paiement transmise.',
    suivants: ['paye'],
  },
  paye: { libelle: 'Paye', description: 'Fonds liberes a l\'executant.', suivants: [] },
  annule: { libelle: 'Annule', description: 'Jalon retire du marche.', suivants: [] },
};

export const ETATS_TERMINAUX = ['paye', 'annule'];

export class TransitionInterdite extends Error {
  constructor(depuis, vers, raison) {
    super(`transition ${depuis} → ${vers} refusee : ${raison}`);
    this.depuis = depuis;
    this.vers = vers;
    this.raison = raison;
  }
}

/**
 * Gardes. Chacune rend null si la transition est permise, ou le motif du refus.
 * Elles portent les invariants metier ; l'interface ne fait que les afficher.
 */
const GARDES = {
  'a_faire→preuves_deposees': (ctx) =>
    ctx.prisesManquantes?.length
      ? `${ctx.prisesManquantes.length} prise(s) imposee(s) encore manquante(s)`
      : null,

  'preuves_deposees→analyse_conforme': (ctx) =>
    ctx.evaluation?.verdict === 'conforme'
      ? null
      : `l'analyse conclut « ${ctx.evaluation?.verdict ?? 'aucune analyse'} »`,

  'analyse_a_instruire→analyse_conforme': (ctx) =>
    ctx.evaluation?.verdict === 'conforme' ? null : "l'analyse ne conclut toujours pas a la conformite",

  'analyse_conforme→valide_donneur_ordre': (ctx) => {
    if (!ctx.certificat) return 'aucun certificat d\'avancement emis';
    if (!ctx.acteurEstDonneurOrdre) return "seul le donneur d'ordre peut liberer un jalon";
    return null;
  },

  'valide_donneur_ordre→paye': (ctx) =>
    ctx.instructionPaiement ? null : 'aucune instruction de paiement enregistree',

  'conteste→analyse_rejetee': (ctx) =>
    ctx.motifContestation ? null : 'une contestation doit porter un motif ecrit',
};

/** Rend { autorise, raison } sans muter quoi que ce soit. */
export function peutPasser(depuis, vers, ctx = {}) {
  const etat = ETATS[depuis];
  if (!etat) return { autorise: false, raison: `etat inconnu : ${depuis}` };
  if (!ETATS[vers]) return { autorise: false, raison: `etat cible inconnu : ${vers}` };
  if (!etat.suivants.includes(vers)) {
    return { autorise: false, raison: `${ETATS[depuis].libelle} ne mene pas a ${ETATS[vers].libelle}` };
  }
  const garde = GARDES[`${depuis}→${vers}`];
  const refus = garde ? garde(ctx) : null;
  return refus ? { autorise: false, raison: refus } : { autorise: true, raison: null };
}

/** Applique la transition ou leve. Rend l'evenement a journaliser. */
export function passer(jalon, vers, ctx = {}) {
  const { autorise, raison } = peutPasser(jalon.statut, vers, ctx);
  if (!autorise) throw new TransitionInterdite(jalon.statut, vers, raison);
  const depuis = jalon.statut;
  jalon.statut = vers;
  return {
    type: 'jalon.transition',
    jalonId: jalon.id,
    projetId: jalon.projetId,
    depuis,
    vers,
    acteur: ctx.acteur || 'systeme',
    motif: ctx.motif || ETATS[vers].description,
  };
}

/** Progression d'un projet, ponderee par le montant des jalons et non par leur nombre. */
export function avancement(jalons) {
  const total = jalons.reduce((s, j) => s + (j.montant || 0), 0);
  if (!total) return { paye: 0, valide: 0, certifie: 0, montantTotal: 0, montantPaye: 0 };
  const part = (etats) =>
    jalons.filter((j) => etats.includes(j.statut)).reduce((s, j) => s + (j.montant || 0), 0);
  const montantPaye = part(['paye']);
  return {
    paye: montantPaye / total,
    valide: part(['paye', 'valide_donneur_ordre']) / total,
    certifie: part(['paye', 'valide_donneur_ordre', 'analyse_conforme']) / total,
    montantTotal: total,
    montantPaye,
    montantCantonne: total - montantPaye,
  };
}

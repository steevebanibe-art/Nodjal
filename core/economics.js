// Economie du produit.
//
// Ces chiffres sont dans le dossier ; ils sont ici pour etre CALCULES, pas
// recopies. Un jury ou siege un cabinet de conseil demandera d'ou vient le
// nombre. Chaque fonction porte sa formule, chaque hypothese porte son statut :
// mesuree, officielle, ou hypothese de travail.
//
// Rien ici n'est presente comme un fait acquis. Les hypotheses de travail sont
// marquees comme telles jusqu'a ce que les chantiers pilotes les corrigent.

export const PARITE_XAF_EUR = 655.957; // parite fixe franc CFA / euro

export const SOURCES = {
  transfertsCameroun2024: {
    valeurFcfa: 652e9,
    croissance: 0.08,
    partFrance: 0.35,
    partEtatsUnis: 0.2,
    partBelgique: 0.12,
    source: "Rapport d'evaluation a mi-parcours de la SND30, ministere de l'Economie (via EcoMatin)",
    statut: 'officiel',
  },
  diasporaCamerounaise: {
    personnes2015: 349000,
    personnes2024: 500000,
    source: 'meme rapport SND30',
    statut: 'officiel',
  },
  transfertsAfrique2024: {
    valeurUsd: 95e9,
    partPib: 0.051,
    partConsommation: 0.75,
    elasticiteInvestissement: 0.17,
    elasticiteConsommation: 0.22,
    source: 'Making Remittances Work for Africa, Banque africaine de developpement, mars 2025',
    statut: 'officiel',
  },
  partImmobiliere: {
    valeur: 0.25,
    source: "deduite du complement a la part de consommation contrainte mesuree par la BAD",
    statut: 'hypothese de travail',
  },
  tauxCapture: {
    valeur: 0.02,
    source: 'aucune',
    statut: 'hypothese de travail, a corriger sur les pilotes',
  },
};

export const TARIFS = {
  sequestreMin: 0.015,
  sequestreMax: 0.025,
  abonnementMinEur: 29,
  abonnementMaxEur: 49,
  commissionReseauMin: 0.03,
  commissionReseauMax: 0.05,
  statut: 'hypothese de travail, a valider sur 3 a 5 chantiers pilotes',
};

export const CHANTIER_TYPE = {
  montantMinFcfa: 15e6,
  montantMaxFcfa: 40e6,
  dureeMinMois: 12,
  dureeMaxMois: 24,
  statut: 'observe sur les annonces des agences diaspora, non mesure',
};

/** Revenu d'un chantier, poste par poste. Montants en euros. */
export function revenuChantier({
  montantEur,
  dureeMois,
  tauxSequestre = 0.02,
  abonnementMensuelEur = 35,
  commissionReseau = 0,
} = {}) {
  const sequestre = montantEur * tauxSequestre;
  const abonnement = abonnementMensuelEur * dureeMois;
  const commission = montantEur * commissionReseau;
  const total = sequestre + abonnement + commission;
  return {
    montantEur,
    dureeMois,
    sequestre,
    abonnement,
    commission,
    total,
    detail:
      `${tauxSequestre * 100} % x ${montantEur.toLocaleString('fr-FR')} EUR = ${Math.round(sequestre)} EUR de sequestre, ` +
      `plus ${dureeMois} x ${abonnementMensuelEur} EUR = ${Math.round(abonnement)} EUR d'abonnement` +
      (commission ? `, plus ${commissionReseau * 100} % de commission reseau = ${Math.round(commission)} EUR` : '') +
      `, soit ${Math.round(total)} EUR.`,
  };
}

/** Bornes basse et haute du revenu par chantier, avec le cas central du dossier. */
export function fourchetteRevenu() {
  const bas = revenuChantier({
    montantEur: CHANTIER_TYPE.montantMinFcfa / PARITE_XAF_EUR,
    dureeMois: CHANTIER_TYPE.dureeMinMois,
    tauxSequestre: TARIFS.sequestreMin,
    abonnementMensuelEur: TARIFS.abonnementMinEur,
  });
  const central = revenuChantier({ montantEur: 40000, dureeMois: 18, tauxSequestre: 0.02, abonnementMensuelEur: 35 });
  const haut = revenuChantier({
    montantEur: CHANTIER_TYPE.montantMaxFcfa / PARITE_XAF_EUR,
    dureeMois: CHANTIER_TYPE.dureeMaxMois,
    tauxSequestre: TARIFS.sequestreMax,
    abonnementMensuelEur: TARIFS.abonnementMaxEur,
    commissionReseau: TARIFS.commissionReseauMin,
  });
  return { bas, central, haut };
}

/** Rentabilite unitaire : marge brute, retour sur cout d'acquisition, seuil. */
export function uniteEconomique({
  revenuTotalEur,
  dureeMois,
  coutAcquisitionEur = 250,
  coutVariableParChantierEur = 180,
  coutInspectionParJalonEur = 12,
  nombreJalons = 6,
} = {}) {
  const coutsDirects = coutVariableParChantierEur + coutInspectionParJalonEur * nombreJalons;
  const margeBrute = revenuTotalEur - coutsDirects;
  const tauxMarge = revenuTotalEur ? margeBrute / revenuTotalEur : 0;
  const ratio = coutAcquisitionEur ? margeBrute / coutAcquisitionEur : Infinity;
  const revenuMensuel = revenuTotalEur / dureeMois;
  return {
    revenuTotalEur,
    coutsDirects,
    margeBrute,
    tauxMarge,
    coutAcquisitionEur,
    ratioMargeSurAcquisition: ratio,
    moisAvantRetour: revenuMensuel ? coutAcquisitionEur / revenuMensuel : Infinity,
    verdict:
      ratio >= 3
        ? 'Marge brute superieure a trois fois le cout d\'acquisition : le modele tient a cette echelle.'
        : ratio >= 1
          ? "Marge brute superieure au cout d'acquisition, sans marge de securite. A ameliorer par le canal communautaire."
          : "Le cout d'acquisition depasse la marge brute. Le modele ne tient pas a ce prix d'acquisition.",
  };
}

/**
 * Dimensionnement du corridor France vers Cameroun.
 * Chaque etape porte son statut : la premiere ligne est officielle, les
 * suivantes sont des hypotheses declarees.
 */
export function corridorFranceCameroun({
  partImmobiliere = SOURCES.partImmobiliere.valeur,
  tauxCapture = SOURCES.tauxCapture.valeur,
} = {}) {
  const s = SOURCES.transfertsCameroun2024;
  const totalEur = s.valeurFcfa / PARITE_XAF_EUR;
  const franceEur = totalEur * s.partFrance;
  const immobilierEur = franceEur * partImmobiliere;
  const captureEur = immobilierEur * tauxCapture;
  const revenuMoyen = 1430;
  const montantMoyen = 40000;
  return {
    etapes: [
      { libelle: 'Transferts diaspora camerounaise, 2024', valeurEur: totalEur, statut: 'officiel', source: s.source },
      { libelle: `Part emise depuis la France (${(s.partFrance * 100).toFixed(0)} %)`, valeurEur: franceEur, statut: 'officiel', source: s.source },
      { libelle: `Part orientee vers un projet immobilier (${(partImmobiliere * 100).toFixed(0)} %)`, valeurEur: immobilierEur, statut: 'hypothese de travail', source: SOURCES.partImmobiliere.source },
      { libelle: `Flux passant par Nodjal a maturite (${(tauxCapture * 100).toFixed(1)} %)`, valeurEur: captureEur, statut: 'hypothese de travail', source: 'objectif interne' },
    ],
    fluxCaptureEur: captureEur,
    chantiersEquivalents: Math.round(captureEur / montantMoyen),
    revenuAnnuelEur: Math.round((captureEur / montantMoyen) * revenuMoyen),
    avertissement:
      "Les deux dernieres etapes sont des hypotheses de travail. Elles ne sont pas mesurees et n'ont pas vocation a l'etre avant les chantiers pilotes.",
  };
}

/**
 * Trajectoire : ce que donne le corridor pilote a differents taux de capture,
 * puis ce que l'extension aux corridors voisins ajoute.
 *
 * Utile parce que le seul chiffre du corridor pilote a 2 % se retourne contre
 * nous en question — « c'est tout ? ». La reponse honnete n'est pas de gonfler
 * l'hypothese, c'est de montrer que 2 % est un point de depart declare et que la
 * pente est connue.
 */
export function trajectoire() {
  const revenuMoyen = 1430;
  const montantMoyen = 40000;
  const paliers = [0.005, 0.02, 0.05, 0.1].map((taux) => {
    const c = corridorFranceCameroun({ tauxCapture: taux });
    return {
      tauxCapture: taux,
      fluxEur: c.fluxCaptureEur,
      chantiers: Math.round(c.fluxCaptureEur / montantMoyen),
      revenuEur: Math.round((c.fluxCaptureEur / montantMoyen) * revenuMoyen),
    };
  });

  // Extension : les corridors voisins du meme flux camerounais, puis le
  // Senegal, ou le meme mecanisme s'applique sans changement de produit.
  const s = SOURCES.transfertsCameroun2024;
  const totalEur = s.valeurFcfa / PARITE_XAF_EUR;
  const corridors = [
    { nom: 'France → Cameroun', part: s.partFrance, statut: 'officiel' },
    { nom: 'Etats-Unis → Cameroun', part: s.partEtatsUnis, statut: 'officiel' },
    { nom: 'Belgique → Cameroun', part: s.partBelgique, statut: 'officiel' },
  ].map((c) => ({
    ...c,
    fluxEur: totalEur * c.part,
    adressableEur: totalEur * c.part * SOURCES.partImmobiliere.valeur,
  }));

  return {
    paliers,
    corridors,
    note:
      "Le taux de capture est le seul levier reellement inconnu. Les trois corridors " +
      'sont, eux, des parts officielles du meme flux : les ouvrir ne demande aucun ' +
      'changement de produit, seulement un partenaire de decaissement de plus.',
  };
}

/** Sensibilite du revenu par chantier a chacun des trois leviers de prix. */
export function sensibilite() {
  const base = { montantEur: 40000, dureeMois: 18, tauxSequestre: 0.02, abonnementMensuelEur: 35 };
  const variations = [];
  for (const taux of [0.015, 0.02, 0.025]) {
    for (const abo of [29, 35, 49]) {
      const r = revenuChantier({ ...base, tauxSequestre: taux, abonnementMensuelEur: abo });
      variations.push({
        tauxSequestre: taux,
        abonnementMensuelEur: abo,
        revenu: Math.round(r.total),
        margeBrute: Math.round(uniteEconomique({ revenuTotalEur: r.total, dureeMois: 18 }).margeBrute),
      });
    }
  }
  return {
    base,
    variations,
    min: Math.min(...variations.map((v) => v.revenu)),
    max: Math.max(...variations.map((v) => v.revenu)),
  };
}

/** Cout d'exploitation du MVP jusqu'a la finale du 24 octobre 2026. */
export function coutMvp() {
  const postes = [
    { poste: 'Supabase Pro', unitaireEur: 23, mois: 3, total: 69, note: '25 USD par mois' },
    { poste: 'Vercel', unitaireEur: 0, mois: 3, total: 0, note: 'palier gratuit suffisant en pilote' },
    { poste: 'Compilation EAS', unitaireEur: 0, mois: 3, total: 0, note: 'palier gratuit, compilations limitees' },
    { poste: 'Analyse par modele de vision', unitaireEur: 0.02, mois: null, total: 12, note: '~600 photos en pilote, 0,02 EUR la photo' },
    { poste: 'Horodatage qualifie', unitaireEur: 0.05, mois: null, total: 3, note: '~60 certificats' },
    { poste: 'Nom de domaine', unitaireEur: 15, mois: null, total: 15, note: 'un an' },
  ];
  const total = postes.reduce((s, p) => s + p.total, 0);
  return {
    postes,
    total,
    drone: { poste: 'Drone DJI Mini', total: 500, note: 'optionnel, semaine 4' },
    phrase: `MVP fonctionnel a ${total} EUR hors drone. Le dire au jury : c'est la preuve qu'on sait ce qui compte.`,
  };
}

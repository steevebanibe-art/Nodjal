// Rapprochement facture / devis quantitatif — contre-mesure T6.
//
// Le devis quantitatif n'est pas une formalite administrative : c'est le seul
// document qui permette de dire qu'une facture est fausse. Sans metre, une
// facture de ciment est invérifiable ; avec metre, elle est soit compatible avec
// l'ouvrage, soit non.
//
// Effet secondaire, et c'est l'argument environnemental du dossier : le
// gaspillage de ciment, de sable et de fer sur les chantiers informels vient
// d'abord de l'absence de metre. On commande a l'estime, on sur-commande, le
// surplus se perd. Mesurer, c'est deja reduire.

const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/**
 * Similarite de deux libelles, dans [0, 1].
 * Jaccard sur les mots, plus un bonus de prefixe commun. Volontairement simple :
 * un rapprochement approximatif ne decide jamais seul, il propose.
 */
export function similarite(a, b) {
  const ma = new Set(norm(a).split(' ').filter(Boolean));
  const mb = new Set(norm(b).split(' ').filter(Boolean));
  if (!ma.size || !mb.size) return 0;
  let communs = 0;
  for (const m of ma) if (mb.has(m)) communs++;
  const jaccard = communs / (ma.size + mb.size - communs);
  const na = norm(a);
  const nb = norm(b);
  let prefixe = 0;
  while (prefixe < na.length && prefixe < nb.length && na[prefixe] === nb[prefixe]) prefixe++;
  return Math.min(1, jaccard + (prefixe / Math.max(na.length, nb.length)) * 0.25);
}

/** Postes qu'aucune facture fournisseur ne peut couvrir. */
export const NATURES_NON_FOURNIES = ['main_oeuvre', 'forfait', 'location', 'etude'];

/** Un poste est-il approvisionne par un fournisseur ? */
export function estMateriau(poste) {
  if (poste.nature) return !NATURES_NON_FOURNIES.includes(poste.nature);
  // Sans champ « nature », on retombe sur le libelle. Heuristique de repli :
  // elle est declaree ici plutot que cachee dans une expression au milieu du code.
  return !/main.?d.?oeuvre|forfait|location|honoraire|etude/i.test(poste.libelle || '');
}

/**
 * Rapproche les factures d'un jalon de son devis quantitatif.
 *
 * Un point de modelisation qui compte : le rapprochement ne compare QUE les
 * postes approvisionnes par un fournisseur. Comparer des factures materiaux au
 * devis total, main d'oeuvre comprise, produit mecaniquement un ecart negatif
 * enorme et sans aucun sens — la main d'oeuvre n'a pas de facture fournisseur,
 * elle est attestee par l'avancement lui-meme. Le budget de reference est donc
 * le sous-ensemble materiaux, et la main d'oeuvre est rapportee a part.
 *
 * devis     : [{ code, libelle, unite, quantite, prixUnitaire, nature? }]
 * factures  : [{ id, fournisseur, fournisseurRefId, numero, date, lignes: [...] }]
 * options   : { toleranceEcart, fournisseursReferences, facturesAnterieures, fenetre }
 */
export function rapprocher(devis, factures, options = {}) {
  const {
    toleranceEcart = 0.15,
    fournisseursReferences = [],
    facturesAnterieures = [],
    fenetre = null,
  } = options;

  const anomalies = [];
  const lignes = [];
  const referencesConnues = new Set(fournisseursReferences.map((f) => f.id));
  const numerosDejaVus = new Set(facturesAnterieures.map((f) => `${norm(f.fournisseur)}#${f.numero}`));

  const postesMateriaux = devis.filter(estMateriau);
  const postesHorsFourniture = devis.filter((p) => !estMateriau(p));
  const budgetDevis = postesMateriaux.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  const budgetHorsFourniture = postesHorsFourniture.reduce((s, l) => s + l.quantite * l.prixUnitaire, 0);
  let totalFacture = 0;
  let rapprochees = 0;

  for (const facture of factures) {
    // --- Fournisseur referencé ?
    if (!facture.fournisseurRefId || !referencesConnues.has(facture.fournisseurRefId)) {
      anomalies.push({
        code: 'fournisseur_non_reference',
        gravite: 'attention',
        titre: 'Fournisseur hors du reseau reference',
        detail: `« ${facture.fournisseur} » ne figure pas dans la base des fournisseurs verifies. Recevable, mais le prix ne peut pas etre compare a un barreme.`,
        mesure: { factureId: facture.id },
      });
    }

    // --- Numero deja utilise ?
    const cle = `${norm(facture.fournisseur)}#${facture.numero}`;
    if (numerosDejaVus.has(cle)) {
      anomalies.push({
        code: 'facture_dupliquee',
        gravite: 'alerte',
        titre: 'Numero de facture deja presente au dossier',
        detail: `Le numero ${facture.numero} de « ${facture.fournisseur} » a deja ete rapproche sur un autre jalon.`,
        mesure: { factureId: facture.id, numero: facture.numero },
      });
    }
    numerosDejaVus.add(cle);

    // --- Date dans la fenetre du jalon ?
    if (fenetre && facture.date) {
      const d = new Date(facture.date).getTime();
      if (d < new Date(fenetre.debut).getTime() || d > new Date(fenetre.fin).getTime()) {
        anomalies.push({
          code: 'facture_hors_fenetre',
          gravite: 'attention',
          titre: 'Facture datee hors de la periode du jalon',
          detail: `Facture du ${facture.date}, jalon ouvert du ${fenetre.debut.slice(0, 10)} au ${fenetre.fin.slice(0, 10)}. Un achat anticipe est possible ; a confirmer.`,
          mesure: { factureId: facture.id, date: facture.date },
        });
      }
    }

    for (const ligne of facture.lignes || []) {
      const montant = ligne.montant ?? ligne.quantite * ligne.prixUnitaire;
      totalFacture += montant;

      const cible = apparier(ligne, postesMateriaux);
      if (!cible) {
        anomalies.push({
          code: 'ligne_hors_devis',
          gravite: 'attention',
          titre: 'Poste absent du devis quantitatif',
          detail: `« ${ligne.libelle} » (${montant.toLocaleString('fr-FR')} FCFA) ne correspond a aucun poste. Achat imprevu, ou libelle a normaliser.`,
          mesure: { factureId: facture.id, montant },
        });
        lignes.push({ ligne, cible: null, ecartQuantite: null, ecartPrix: null, factureId: facture.id });
        continue;
      }

      rapprochees++;
      const ecartQuantite = (ligne.quantite - cible.poste.quantite) / cible.poste.quantite;
      const ecartPrix = (ligne.prixUnitaire - cible.poste.prixUnitaire) / cible.poste.prixUnitaire;

      if (ecartQuantite > toleranceEcart) {
        anomalies.push({
          code: 'quantite_depassee',
          gravite: ecartQuantite > toleranceEcart * 3 ? 'alerte' : 'attention',
          titre: 'Quantite facturee superieure au metre',
          detail: `${ligne.libelle} : ${ligne.quantite} ${ligne.unite || cible.poste.unite} factures pour ${cible.poste.quantite} au devis, soit ${(ecartQuantite * 100).toFixed(0)} % de plus.`,
          mesure: { poste: cible.poste.code, ecart: ecartQuantite },
        });
      }
      if (Math.abs(ecartPrix) > toleranceEcart * 2) {
        anomalies.push({
          code: 'prix_unitaire_ecarte',
          gravite: 'attention',
          titre: 'Prix unitaire ecarte du devis',
          detail: `${ligne.libelle} : ${ligne.prixUnitaire.toLocaleString('fr-FR')} FCFA contre ${cible.poste.prixUnitaire.toLocaleString('fr-FR')} au devis (${ecartPrix > 0 ? '+' : ''}${(ecartPrix * 100).toFixed(0)} %).`,
          mesure: { poste: cible.poste.code, ecart: ecartPrix },
        });
      }
      if (cible.score < 0.55) {
        anomalies.push({
          code: 'appariement_incertain',
          gravite: 'info',
          titre: 'Rapprochement approximatif',
          detail: `« ${ligne.libelle} » rapproche de « ${cible.poste.libelle} » avec une confiance de ${(cible.score * 100).toFixed(0)} %. A confirmer par l'inspecteur.`,
          mesure: { poste: cible.poste.code, score: cible.score },
        });
      }
      lignes.push({ ligne, cible: cible.poste, score: cible.score, ecartQuantite, ecartPrix, factureId: facture.id });
    }
  }

  // Montants ronds : indice faible pris isolement, utile agrege.
  const ronds = factures.filter((f) => {
    const t = (f.lignes || []).reduce((s, l) => s + (l.montant ?? l.quantite * l.prixUnitaire), 0);
    return t > 0 && t % 100000 === 0;
  });
  if (ronds.length >= 2) {
    anomalies.push({
      code: 'montants_ronds',
      gravite: 'attention',
      titre: 'Plusieurs factures a montant rond',
      detail: `${ronds.length} factures tombent sur une centaine de milliers de francs exacte. Une facture de materiaux reelle tombe rarement rond.`,
      mesure: { factures: ronds.map((f) => f.id) },
    });
  }

  const ecartRelatif = budgetDevis ? (totalFacture - budgetDevis) / budgetDevis : 0;
  const pire = anomalies.reduce(
    (m, a) => Math.max(m, { info: 0, attention: 1, alerte: 2, blocage: 3 }[a.gravite]),
    0,
  );

  let verdict;
  let motif;
  if (pire >= 2 || ecartRelatif > toleranceEcart * 2) {
    verdict = 'rejete';
    motif = `Ecart de ${(ecartRelatif * 100).toFixed(1)} % entre factures et postes materiaux du devis, ${anomalies.filter((a) => a.gravite === 'alerte').length} alerte(s).`;
  } else if (pire >= 1 || Math.abs(ecartRelatif) > toleranceEcart) {
    verdict = 'a_instruire';
    motif = `Ecart de ${(ecartRelatif * 100).toFixed(1)} % sur les postes materiaux, ${anomalies.length} point(s) a instruire.`;
  } else {
    verdict = 'conforme';
    motif =
      `Postes materiaux rapproches a ${(ecartRelatif * 100).toFixed(1)} % pres, dans la tolerance de ` +
      `${(toleranceEcart * 100).toFixed(0)} %.` +
      (budgetHorsFourniture ? ` Main d'oeuvre et forfaits (${Math.round(budgetHorsFourniture).toLocaleString('fr-FR')} FCFA) attestes par l'avancement, hors rapprochement fournisseur.` : '');
  }

  return {
    verdict, motif, anomalies, lignes,
    budgetDevis, totalFacture, ecartRelatif,
    budgetHorsFourniture,
    postesHorsFourniture: postesHorsFourniture.map((p) => ({
      code: p.code, libelle: p.libelle, montant: p.quantite * p.prixUnitaire,
    })),
    lignesRapprochees: rapprochees,
    lignesTotal: lignes.length,
  };
}

function apparier(ligne, devis) {
  if (ligne.code) {
    const exact = devis.find((d) => d.code === ligne.code);
    if (exact) return { poste: exact, score: 1 };
  }
  let meilleur = null;
  for (const poste of devis) {
    const score = similarite(ligne.libelle, poste.libelle);
    if (!meilleur || score > meilleur.score) meilleur = { poste, score };
  }
  return meilleur && meilleur.score >= 0.3 ? meilleur : null;
}

/**
 * Estimation de matiere evitee par la mise au metre.
 * Hypothese de travail : 12 % de sur-commande sur les chantiers sans metre.
 * Le chiffre vient de la litterature sur le gaspillage en construction et n'a
 * pas ete mesure sur nos chantiers. Il est presente comme tel, ici et au jury.
 */
export function economieMatiere(devis, tauxSurCommandeSansMetre = 0.12) {
  const postes = devis.filter((d) => /ciment|sable|gravier|fer|acier|agregat/i.test(d.libelle));
  const budget = postes.reduce((s, d) => s + d.quantite * d.prixUnitaire, 0);
  return {
    postesConcernes: postes.length,
    budgetMateriaux: budget,
    surCommandeEvitee: budget * tauxSurCommandeSansMetre,
    taux: tauxSurCommandeSansMetre,
    statut: 'hypothese de travail, non mesuree sur nos chantiers',
  };
}

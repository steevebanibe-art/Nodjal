// Certificat d'avancement.
//
// Le document que la diaspora n'a jamais eu. Deux formes, une seule verite :
//   - un MANIFESTE JSON, canonique et hachable, qui est la piece de reference ;
//   - un PDF, qui est la vue lisible du manifeste.
// Le PDF est hache et cet hachage est horodate. Le manifeste est reproductible :
// n'importe qui, avec les preuves d'origine, recalcule le meme condensat.
//
// Sur le vocabulaire, une fois pour toutes : ce certificat n'est pas
// « opposable ». C'est un faisceau de preuves horodatees et non repudiables.
// La nuance n'est pas cosmetique — un avocat dans la salle la releverait, et il
// aurait raison.
//
// Ceci n'est pas un avis juridique. La formulation doit etre validee par un
// juriste avant d'etre imprimee sur un contrat.

import { hashObject, sha256 } from './hash.js';
import { Document, PAGE } from './pdf.js';
import { formatPosition, distancePolygone } from './geo.js';
import { resumerFaisceau } from './threat.js';
import { horodater } from './tsa.js';

const COULEURS = {
  encre: '#1A1814',
  texte: '#3C3831',
  discret: '#8B8375',
  filet: '#D8D2C6',
  fond: '#F6F3EC',
  blanc: '#FFFFFF',
  paille: '#B9B1A1',
  conforme: '#2F6B4F',
  instruire: '#9A6B1E',
  rejete: '#A33B2A',
};

const ETIQUETTE_VERDICT = { conforme: 'CONFORME', a_instruire: 'A INSTRUIRE', rejete: 'REJETE' };
const CLE_COULEUR = { conforme: 'conforme', a_instruire: 'instruire', rejete: 'rejete' };
const ETIQUETTE_GRAVITE = { info: 'Controle', attention: 'Attention', alerte: 'Alerte', blocage: 'Bloquant' };

function fcfa(n) {
  return Math.round(n).toLocaleString('fr-FR').replace(/ | /g, ' ') + ' FCFA';
}

function dateFr(iso) {
  const d = new Date(iso);
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getUTCDate())}/${p(d.getUTCMonth() + 1)}/${d.getUTCFullYear()} ` +
    `${p(d.getUTCHours())}:${p(d.getUTCMinutes())} UTC`;
}

/**
 * Construit le manifeste. C'est LUI la piece de reference ; le PDF n'en est que
 * le rendu. Aucune valeur tiree du hasard ni de l'horloge locale n'y entre,
 * sinon le condensat ne serait pas reproductible.
 */
export function construireManifeste({
  projet, jalon, preuves, evaluation, rapprochement, inspection,
  certificatPrecedent, reference, emisLe,
}) {
  return {
    version: 'nodjal.certificat.1',
    reference,
    emisLe,
    projet: {
      id: projet.id,
      libelle: projet.libelle,
      adresse: projet.adresse,
      ville: projet.ville,
      pays: projet.pays,
      parcelle: projet.parcelle,
      superficieM2: projet.superficieM2 ?? null,
      donneurOrdre: {
        id: projet.donneurOrdreId,
        nom: projet.donneurOrdreNom,
        residence: projet.donneurOrdreResidence,
      },
      executant: { id: projet.executantId, nom: projet.executantNom },
      devisTotal: projet.devisTotal,
      devise: projet.devise,
    },
    jalon: {
      id: jalon.id,
      ordre: jalon.ordre,
      type: jalon.type,
      libelle: jalon.libelle,
      montant: jalon.montant,
      statut: jalon.statut,
      prisesRequises: (jalon.prisesRequises || []).map((p) => ({
        code: p.code, libelle: p.libelle, capAttendu: p.capAttendu ?? null,
      })),
    },
    preuves: preuves.map((p) => ({
      id: p.id,
      type: p.type,
      priseDeVue: p.priseDeVue ?? null,
      sha256: p.sha256,
      phash: p.phash ?? null,
      octets: p.octets ?? null,
      position:
        typeof p.gpsLat === 'number'
          ? { lat: p.gpsLat, lng: p.gpsLng, precisionM: p.precisionM ?? null }
          : null,
      distanceParcelleM:
        typeof p.gpsLat === 'number' && projet.parcelle && projet.parcelle.length >= 3
          ? Number(distancePolygone({ lat: p.gpsLat, lng: p.gpsLng }, projet.parcelle).toFixed(2))
          : null,
      cap: p.cap ?? null,
      gpsSimule: p.gpsSimule ?? null,
      horodatageAppareil: p.horodatageAppareil ?? null,
      horodatageServeur: p.horodatageServeur,
      exifPresent: Boolean(p.exif && p.exif.present),
      appareil: (p.exif && p.exif.champs && p.exif.champs.modele) || null,
    })),
    analyse: {
      verdict: evaluation.verdict,
      motif: evaluation.motif,
      familles: evaluation.familles,
      couverture: evaluation.couverture,
      compteurs: evaluation.compteurs,
      signaux: evaluation.signaux.map((s) => ({
        code: s.code, menace: s.menace, gravite: s.gravite,
        titre: s.titre, detail: s.detail, mesure: s.mesure,
      })),
    },
    materiaux: rapprochement
      ? {
          verdict: rapprochement.verdict,
          motif: rapprochement.motif,
          budgetDevis: rapprochement.budgetDevis,
          totalFacture: rapprochement.totalFacture,
          ecartRelatif: rapprochement.ecartRelatif,
          lignesRapprochees: rapprochement.lignesRapprochees,
        }
      : null,
    inspection: inspection
      ? {
          inspecteurId: inspection.inspecteurId,
          nom: inspection.inspecteurNom,
          dejaVenu: inspection.dejaVenu,
          motifTirage: inspection.motif ?? null,
        }
      : null,
    chainage: {
      certificatPrecedent: (certificatPrecedent && certificatPrecedent.reference) || null,
      empreintePrecedente: (certificatPrecedent && certificatPrecedent.empreinteManifeste) || null,
    },
  };
}

/** Rend le PDF du certificat sous forme de Buffer. */
export function rendrePdf({ manifeste, empreinteManifeste, horodatage, projet, jalon }) {
  const verdict = manifeste.analyse.verdict;
  const couleurVerdict = COULEURS[CLE_COULEUR[verdict]];

  const doc = new Document({
    titre: `Certificat d'avancement ${manifeste.reference}`,
    auteur: 'Nodjal',
    sujet: `${projet.libelle} - jalon ${jalon.ordre} : ${jalon.libelle}`,
    mots: ['certificat', 'avancement', 'sequestre', 'diaspora', manifeste.reference],
  });
  doc.pied(`${manifeste.reference} - empreinte du manifeste ${empreinteManifeste.slice(0, 16)} - nodjal.africa`);

  // --- Bandeau
  doc.rectangle(0, PAGE.hauteur - 96, PAGE.largeur, 96, { remplissage: COULEURS.encre });
  doc.texte('NODJAL', { x: 56, y: PAGE.hauteur - 34, taille: 19, police: 'gras', couleur: COULEURS.blanc });
  doc.texte("Rien n'est paye tant que rien n'est prouve.", {
    x: 56, y: PAGE.hauteur - 56, taille: 8.5, police: 'italique', couleur: COULEURS.paille,
  });
  doc.texte("CERTIFICAT D'AVANCEMENT", {
    x: 56, y: PAGE.hauteur - 34, taille: 9, police: 'gras', couleur: COULEURS.paille,
    largeur: PAGE.largeur - 112, aligne: 'droite',
  });
  doc.texte(manifeste.reference, {
    x: 56, y: PAGE.hauteur - 52, taille: 12, police: 'monoGras', couleur: COULEURS.blanc,
    largeur: PAGE.largeur - 112, aligne: 'droite',
  });
  doc.texte(`Emis le ${dateFr(manifeste.emisLe)}`, {
    x: 56, y: PAGE.hauteur - 70, taille: 8, couleur: COULEURS.discret,
    largeur: PAGE.largeur - 112, aligne: 'droite',
  });
  doc.page.y = PAGE.hauteur - 130;

  // --- Verdict
  doc.rectangle(doc.x0, doc.page.y - 48, doc.largeurUtile, 48, {
    remplissage: COULEURS.fond, contour: couleurVerdict, epaisseur: 1.4,
  });
  doc.texte(ETIQUETTE_VERDICT[verdict], {
    x: doc.x0 + 16, y: doc.page.y - 12, taille: 16, police: 'gras', couleur: couleurVerdict,
  });
  doc.texte(manifeste.analyse.motif, {
    x: doc.x0 + 16, y: doc.page.y - 31, taille: 8.4, couleur: COULEURS.texte,
    largeur: doc.largeurUtile - 32,
  });
  doc.page.y -= 64;

  // --- Identification
  doc.texte('IDENTIFICATION', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(4);
  const identite = [
    ['Projet', `${projet.libelle} - ${projet.adresse}, ${projet.ville}, ${projet.pays}`],
    ['Jalon', `${jalon.ordre}. ${jalon.libelle} - ${fcfa(jalon.montant)}`],
    ["Donneur d'ordre", `${projet.donneurOrdreNom} (${projet.donneurOrdreResidence})`],
    ['Executant', projet.executantNom],
    ['Parcelle', `${projet.parcelle.length} sommets` + (projet.superficieM2 ? `, ${Math.round(projet.superficieM2)} m2` : '')],
  ];
  for (const [cle, valeur] of identite) {
    const y = doc.reserver(14);
    doc.texte(cle, { x: doc.x0, y, taille: 8.4, couleur: COULEURS.discret, largeur: 110 });
    doc.texte(valeur, { x: doc.x0 + 115, y, taille: 8.8, couleur: COULEURS.encre, largeur: doc.largeurUtile - 115 });
    doc.page.y = y - 14;
  }
  doc.separateur(10);

  // --- Faisceau
  doc.texte('FAISCEAU DE PREUVES', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(4);
  doc.texte(resumerFaisceau(manifeste.analyse), { taille: 9, couleur: COULEURS.encre });
  doc.espace(6);
  doc.texte(
    "Aucune de ces preuves ne vaut isolement. Prises ensemble, et parce qu'elles proviennent de sources " +
    "independantes, elles rendent la fraude plus couteuse que le travail. C'est le seul objectif atteignable, " +
    'et il suffit.',
    { taille: 8.2, couleur: COULEURS.texte, police: 'italique' },
  );
  doc.espace(10);

  // --- Pieces
  doc.texte('PIECES AU DOSSIER', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(4);
  doc.tableau(
    [
      { cle: 'prise', titre: 'Prise imposee', largeur: 150 },
      { cle: 'position', titre: 'Position', largeur: 120, police: 'mono' },
      { cle: 'ecart', titre: 'Parcelle', largeur: 78, aligne: 'droite' },
      { cle: 'heure', titre: 'Heure serveur', largeur: 108, police: 'mono' },
      { cle: 'sha', titre: 'SHA-256', largeur: 96, police: 'mono' },
    ],
    manifeste.preuves.map((p) => ({
      prise: p.priseDeVue || p.type,
      position: p.position ? formatPosition(p.position) : '-',
      ecart:
        p.distanceParcelleM === null
          ? '-'
          : `${p.distanceParcelleM < 0 ? 'dedans' : 'dehors'} ${Math.abs(p.distanceParcelleM).toFixed(1)} m`,
      heure: new Date(p.horodatageServeur).toISOString().slice(0, 16).replace('T', ' '),
      sha: p.sha256.slice(0, 12),
    })),
  );

  // --- Controles
  doc.texte('CONTROLES EXECUTES', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(4);
  doc.tableau(
    [
      { cle: 'gravite', titre: 'Niveau', largeur: 62 },
      { cle: 'menace', titre: 'Menace', largeur: 42, police: 'mono' },
      { cle: 'titre', titre: 'Controle', largeur: 178 },
      { cle: 'detail', titre: 'Constat', largeur: 270 },
    ],
    manifeste.analyse.signaux.map((s) => ({
      gravite: ETIQUETTE_GRAVITE[s.gravite],
      menace: s.menace || '-',
      titre: s.titre,
      detail: s.detail,
      _couleur:
        s.gravite === 'blocage' || s.gravite === 'alerte'
          ? COULEURS.rejete
          : s.gravite === 'attention'
            ? COULEURS.instruire
            : COULEURS.texte,
    })),
    { taille: 7.4, hauteurRang: 28 },
  );

  // --- Materiaux
  if (manifeste.materiaux) {
    const m = manifeste.materiaux;
    doc.texte('RAPPROCHEMENT MATERIAUX', { taille: 8, police: 'gras', couleur: COULEURS.discret });
    doc.espace(4);
    doc.encadre([
      { texte: m.motif, police: 'gras', taille: 9 },
      { texte: `Devis quantitatif : ${fcfa(m.budgetDevis)}. Factures rapprochees : ${fcfa(m.totalFacture)}. ${m.lignesRapprochees} ligne(s) appariee(s).` },
      { texte: "Le devis quantitatif n'est pas une formalite : c'est le seul document qui permette de dire qu'une facture est fausse.", police: 'italique', couleur: COULEURS.discret },
    ]);
  }

  // --- Inspection
  if (manifeste.inspection) {
    const i = manifeste.inspection;
    doc.texte('INSPECTION INDEPENDANTE', { taille: 8, police: 'gras', couleur: COULEURS.discret });
    doc.espace(4);
    doc.encadre([
      { texte: `${i.nom} (${i.inspecteurId})`, police: 'gras', taille: 9 },
      {
        texte: i.dejaVenu
          ? 'Deja intervenu sur ce chantier. La regle de rotation est violee.'
          : i.motifTirage || 'Affectation par tirage deterministe, premiere venue sur ce projet.',
      },
      { texte: "Le tirage est reproductible a partir du sel du projet : imprevisible pour l'executant, verifiable par un auditeur.", police: 'italique', couleur: COULEURS.discret },
    ]);
  }

  // --- Scellement
  doc.nouvellePage();
  doc.texte('SCELLEMENT', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(6);
  doc.texte(
    'Chaque piece a ete hachee en SHA-256 A LA RECEPTION, cote serveur, sur les octets recus. ' +
    "Le manifeste ci-dessous reprend ces empreintes ; son propre condensat scelle l'ensemble. " +
    'Modifier une seule piece change le condensat du manifeste, et cela se voit.',
    { taille: 8.6, couleur: COULEURS.texte },
  );
  doc.espace(10);

  doc.tableau(
    [
      { cle: 'element', titre: 'Element', largeur: 160 },
      { cle: 'empreinte', titre: 'Empreinte SHA-256', largeur: 420, police: 'mono' },
    ],
    [
      { element: 'Manifeste du certificat', empreinte: empreinteManifeste },
      ...manifeste.preuves.map((p) => ({
        element: `Piece ${p.priseDeVue || p.type}`,
        empreinte: p.sha256,
      })),
      ...(manifeste.chainage.empreintePrecedente
        ? [{ element: `Certificat precedent (${manifeste.chainage.certificatPrecedent})`, empreinte: manifeste.chainage.empreintePrecedente }]
        : []),
    ],
    { taille: 7.2, hauteurRang: 14 },
  );

  doc.espace(6);
  if (horodatage && horodatage.actif) {
    doc.encadre(
      [
        { texte: 'Horodatage qualifie RFC 3161', police: 'gras', taille: 9.5, couleur: COULEURS.conforme },
        { texte: `Prestataire : ${horodatage.prestataire}. Date attestee : ${horodatage.date}.` },
        { texte: `Empreinte du jeton : ${horodatage.empreinteJeton}` },
        { texte: `Verification de signature : ${horodatage.verificationSignature}.`, couleur: COULEURS.discret },
      ],
      { fond: '#EFF5F1', bord: COULEURS.conforme },
    );
  } else {
    doc.encadre(
      [
        { texte: 'Horodatage qualifie non configure', police: 'gras', taille: 9.5, couleur: COULEURS.instruire },
        { texte: (horodatage && horodatage.motif) || 'Aucun prestataire eIDAS declare sur cette instance.' },
        { texte: "Ce certificat porte donc l'heure serveur seule, sans attestation d'un tiers qualifie. Le systeme ne fabrique pas un jeton qu'il n'a pas : il le dit.", couleur: COULEURS.texte },
      ],
      { fond: '#FBF5E9', bord: COULEURS.instruire },
    );
  }

  doc.espace(12);
  doc.texte('PORTEE ET LIMITES', { taille: 8, police: 'gras', couleur: COULEURS.discret });
  doc.espace(4);
  doc.texte(
    'Ce document constitue un faisceau de preuves horodatees et non repudiables. Il ne porte par lui-meme ' +
    "aucune qualification juridique : il etablit qu'a une date donnee, un ensemble de pieces concordantes " +
    "existait et decrivait l'etat d'avancement rapporte ci-dessus.\n\n" +
    'Nodjal ne construit pas et ne vend pas de terrain. Nodjal n\'est pas etablissement de paiement et ne ' +
    'detient pas les fonds : le cantonnement est opere par un etablissement agree, dont Nodjal est le ' +
    'prestataire technique et le tiers verificateur.\n\n' +
    'Le systeme ne promet pas de detecter toute fraude. Il rend la fraude plus couteuse que le travail, et ' +
    'il rend ce deplacement mesurable. Un modele de vision prepare le dossier ; un humain tranche.',
    { taille: 8.2, couleur: COULEURS.texte },
  );

  return doc.rendre();
}

/**
 * Emet un certificat complet.
 * Rend { reference, manifeste, empreinteManifeste, pdf, empreintePdf, horodatage }.
 */
export async function emettre({
  projet, jalon, preuves, evaluation, rapprochement = null, inspection = null,
  certificatPrecedent = null, reference, emisLe = new Date().toISOString(),
}) {
  const manifeste = construireManifeste({
    projet, jalon, preuves, evaluation, rapprochement, inspection,
    certificatPrecedent, reference, emisLe,
  });
  const empreinteManifeste = hashObject(manifeste);
  const horodatage = await horodater(empreinteManifeste);
  const pdf = rendrePdf({ manifeste, empreinteManifeste, horodatage, projet, jalon });
  return {
    reference,
    emisLe,
    manifeste,
    empreinteManifeste,
    pdf,
    empreintePdf: sha256(pdf),
    horodatage,
    verdict: evaluation.verdict,
  };
}

/**
 * Verifie un certificat a posteriori.
 * C'est la fonction qu'execute un auditeur, un assureur, ou un juge.
 */
export function verifier({ manifeste, empreinteAnnoncee, preuvesOrigine = [] }) {
  const recalculee = hashObject(manifeste);
  const problemes = [];
  if (recalculee !== empreinteAnnoncee) {
    problemes.push({
      gravite: 'blocage',
      detail:
        `Le manifeste ne produit pas l'empreinte annoncee (${recalculee.slice(0, 16)} contre ` +
        `${empreinteAnnoncee.slice(0, 16)}). Le document a ete modifie apres emission.`,
    });
  }
  for (const p of manifeste.preuves) {
    const origine = preuvesOrigine.find((o) => o.id === p.id);
    if (!origine) {
      problemes.push({ gravite: 'attention', detail: `Piece ${p.id} non fournie pour verification.` });
      continue;
    }
    const recalcule = sha256(origine.contenu);
    if (recalcule !== p.sha256) {
      problemes.push({
        gravite: 'blocage',
        detail: `Piece ${p.id} : empreinte recalculee ${recalcule.slice(0, 16)} differente de celle inscrite au certificat.`,
      });
    }
  }
  return {
    conforme: problemes.every((p) => p.gravite !== 'blocage'),
    empreinteRecalculee: recalculee,
    problemes,
    piecesVerifiees: preuvesOrigine.length,
    piecesAttendues: manifeste.preuves.length,
  };
}

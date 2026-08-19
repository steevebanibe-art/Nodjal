// Orchestration.
//
// Cette couche assemble le moteur ; elle ne contient aucune regle metier.
// Toute decision — accepter une preuve, conclure sur un jalon, autoriser une
// transition — appartient a core/. Ainsi la logique de risque se relit sans
// lire de code HTTP, et se rejoue depuis un test sans lever de serveur.

import {
  evaluerPreuve, evaluerJalon, MENACES, SEUILS, resumerFaisceau,
} from '../core/threat.js';
import { rapprocher, economieMatiere } from '../core/quantitatif.js';
import { affecter, etatRotation } from '../core/inspecteur.js';
import { peutPasser, passer, avancement, ETATS } from '../core/milestone.js';
import { emettre, verifier } from '../core/certificate.js';
import { identifiant, referenceCertificat } from '../core/ids.js';
import { phash, uniformite } from '../core/phash.js';
import { lireExif } from '../core/exif.js';
import { format } from '../core/image.js';
import { analyser as analyserVision, signauxDepuisObservation, configure as visionConfiguree } from '../core/vision.js';
import { etatComposants } from '../core/index.js';

export class ErreurApi extends Error {
  constructor(code, message, detail = null) {
    super(message);
    this.code = code;
    this.detail = detail;
  }
}

// ------------------------------------------------------------------ lecture

export function projetComplet(m, projetId) {
  const projet = m.parId('projets', projetId);
  if (!projet) throw new ErreurApi(404, `projet ${projetId} introuvable`);

  const jalons = m
    .ou('jalons', (j) => j.projetId === projetId)
    .sort((a, b) => a.ordre - b.ordre)
    .map((j) => ({
      ...j,
      preuves: m.ou('preuves', (p) => p.jalonId === j.id).length,
      analyse: derniereAnalyse(m, j.id),
      libelleStatut: ETATS[j.statut]?.libelle || j.statut,
    }));

  const { sel, ...projetPublic } = projet;
  return {
    projet: projetPublic,
    jalons,
    avancement: avancement(jalons),
    executant: m.parId('executants', projet.executantId),
    rotation: etatRotation({
      projet,
      inspecteurs: m.tous('inspecteurs'),
      jalonsRestants: jalons.filter((j) => j.statut !== 'paye' && j.statut !== 'annule').length,
    }),
  };
}

export function jalonComplet(m, jalonId) {
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  const projet = m.parId('projets', jalon.projetId);
  const preuves = m
    .ou('preuves', (p) => p.jalonId === jalonId)
    .sort((a, b) => a.horodatageServeur.localeCompare(b.horodatageServeur));
  const couvertes = new Set(preuves.map((p) => p.priseDeVue).filter(Boolean));
  return {
    jalon: { ...jalon, libelleStatut: ETATS[jalon.statut]?.libelle || jalon.statut },
    projet: { ...projet, sel: undefined },
    preuves,
    factures: m.ou('factures', (f) => f.jalonId === jalonId),
    analyse: derniereAnalyse(m, jalonId),
    certificat: jalon.certificatReference
      ? m.un('certificats', (c) => c.reference === jalon.certificatReference)
      : null,
    prisesManquantes: (jalon.prisesRequises || []).filter((r) => !couvertes.has(r.code)),
    transitions: Object.entries(ETATS[jalon.statut]?.suivants ? { suivants: ETATS[jalon.statut].suivants } : {})
      .flatMap(([, v]) => v)
      .map((vers) => ({ vers, libelle: ETATS[vers].libelle })),
  };
}

export function derniereAnalyse(m, jalonId) {
  const analyses = m.ou('analyses', (a) => a.jalonId === jalonId);
  return analyses.length ? analyses[analyses.length - 1] : null;
}

// ------------------------------------------------------------------ depot

/**
 * Depose une preuve.
 * Le condensat et l'horodatage qui font foi sont produits ici, cote serveur.
 * Tout ce que le client annonce est conserve a part, comme declaration.
 */
export function deposerPreuve(m, { jalonId, contenu, declare = {} }) {
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  if (!['a_faire', 'preuves_deposees', 'analyse_a_instruire'].includes(jalon.statut)) {
    throw new ErreurApi(409, `le jalon est au statut « ${ETATS[jalon.statut].libelle} » : il n'accepte plus de preuve`);
  }
  if (!contenu || !contenu.length) throw new ErreurApi(400, 'contenu vide');

  const typeFichier = format(contenu);
  const estPhoto = Boolean(typeFichier);

  const metadonnees = {
    id: identifiant('preuve'),
    jalonId,
    projetId: jalon.projetId,
    type: declare.type || (estPhoto ? 'photo' : 'document'),
    priseDeVue: declare.priseDeVue || null,
    sessionId: declare.sessionId || null,
    gpsLat: typeof declare.gpsLat === 'number' ? declare.gpsLat : null,
    gpsLng: typeof declare.gpsLng === 'number' ? declare.gpsLng : null,
    precisionM: typeof declare.precisionM === 'number' ? declare.precisionM : null,
    gpsSimule: typeof declare.gpsSimule === 'boolean' ? declare.gpsSimule : undefined,
    integriteAppareil: declare.integriteAppareil || null,
    cap: typeof declare.cap === 'number' ? declare.cap : null,
    horodatageAppareil: declare.horodatageAppareil || null,
    appareilModele: declare.appareilModele || null,
    surface: declare.surface || 'inconnue',
    horodatageServeur: new Date().toISOString(),
  };

  if (estPhoto) {
    try {
      metadonnees.phash = phash(contenu);
      metadonnees.uniformite = Number(uniformite(contenu).toFixed(3));
    } catch (e) {
      metadonnees.erreurAnalyseImage = e.message;
    }
    metadonnees.exif = lireExif(contenu);
  }

  const { preuve, deja } = m.deposerPreuve(metadonnees, contenu);
  return { preuve, deja };
}

// ---------------------------------------------------------------- analyse

/** Analyse complete d'un jalon : le faisceau, pas les preuves une a une. */
export async function analyserJalon(m, jalonId, { avecVision = true } = {}) {
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  const projet = m.parId('projets', jalon.projetId);
  const preuves = m.ou('preuves', (p) => p.jalonId === jalonId);
  const toutesDuProjet = m.ou('preuves', (p) => p.projetId === projet.id);

  const evaluations = preuves.map((p) =>
    evaluerPreuve({
      preuve: p,
      projet,
      priseDeVue: (jalon.prisesRequises || []).find((r) => r.code === p.priseDeVue) || null,
      historique: toutesDuProjet.filter((h) => h.id !== p.id),
    }),
  );

  // --- Vision : ajoute une source, n'en remplace aucune.
  let vision = { actif: false, motif: 'analyse non demandee' };
  if (avecVision && visionConfiguree()) {
    const photo = preuves.find((p) => p.type === 'photo');
    if (photo) {
      const contenu = m.lirePreuve(photo.sha256);
      const prise = (jalon.prisesRequises || []).find((r) => r.code === photo.priseDeVue);
      vision = await analyserVision(contenu, { jalon, priseDeVue: prise, projet });
      if (vision.actif) {
        const traduit = signauxDepuisObservation(vision.observation);
        evaluations.push({ signaux: traduit.signaux, volets: [], pireGravite: 0 });
        if (traduit.familles.length) {
          evaluations.push({ signaux: [], volets: [], pireGravite: 0, _famillesVision: traduit.familles });
        }
      }
    }
  } else if (avecVision) {
    vision = {
      actif: false,
      motif: 'ANTHROPIC_API_KEY absent',
      remplacement: 'Les six contre-mesures deterministes tournent sans le modele. Le faisceau perd une source, pas sa validite.',
    };
  }

  // --- Materiaux (T6)
  let rapprochement = null;
  const factures = m.ou('factures', (f) => f.jalonId === jalonId);
  if (jalon.devisQuantitatif && factures.length) {
    rapprochement = rapprocher(jalon.devisQuantitatif, factures, {
      toleranceEcart: SEUILS.ecartFactureTolere,
      fournisseursReferences: m.tous('fournisseurs'),
      facturesAnterieures: m.ou('factures', (f) => f.jalonId !== jalonId && f.projetId === projet.id),
    });
  }

  // --- Inspection (T5)
  let inspection = null;
  try {
    const tirage = affecter({
      projet,
      jalon,
      inspecteurs: m.tous('inspecteurs'),
      sel: projet.sel,
    });
    inspection = {
      inspecteurId: tirage.inspecteur.id,
      inspecteurNom: tirage.inspecteur.nom,
      dejaVenu: false,
      motif: tirage.motif,
      candidats: tirage.candidats,
      jeton: tirage.jeton,
    };
  } catch (e) {
    // Ne jamais avaler cet echec. Un jalon sans inspecteur eligible n'est pas
    // un jalon sans probleme d'inspection : c'est un jalon dont la contre-mesure
    // T5 ne peut pas s'appliquer, donc un jalon non certifiable.
    inspection = {
      echec: true,
      motif: e.message,
      exclusions: e.journal || [],
      inspecteurId: null,
      inspecteurNom: null,
      dejaVenu: false,
    };
  }

  const evaluation = evaluerJalon({
    jalon, projet, preuves, evaluations, rapprochement, inspection,
  });

  // Les familles apportees par la vision s'ajoutent apres coup : elles ne
  // proviennent pas d'un volet terrain.
  const famillesVision = evaluations.flatMap((e) => e._famillesVision || []);
  if (famillesVision.length) {
    const total = new Set([...evaluation.familles, ...famillesVision]);
    evaluation.familles = [...total];
    evaluation.couverture = total.size;
    if (evaluation.verdict === 'a_instruire' && evaluation.pireGravite < 2 && evaluation.couverture >= SEUILS.familleMinimum) {
      evaluation.verdict = 'conforme';
      evaluation.motif = `Faisceau de ${evaluation.couverture} sources independantes : ${evaluation.familles.join(', ')}. Aucun signal d'alerte.`;
    }
  }

  const analyse = {
    id: identifiant('evenement'),
    jalonId,
    projetId: projet.id,
    faitLe: new Date().toISOString(),
    verdict: evaluation.verdict,
    motif: evaluation.motif,
    resume: resumerFaisceau(evaluation),
    familles: evaluation.familles,
    volets: evaluation.volets,
    couverture: evaluation.couverture,
    compteurs: evaluation.compteurs,
    signaux: evaluation.signaux,
    rapprochement,
    inspection,
    vision: vision.actif
      ? { actif: true, modele: vision.modele, observation: vision.observation, cout: vision.cout }
      : { actif: false, motif: vision.motif, remplacement: vision.remplacement || null },
    preuvesAnalysees: preuves.length,
  };
  m.inserer('analyses', analyse);

  // Transition d'etat consecutive a l'analyse.
  const couvertes = new Set(preuves.map((p) => p.priseDeVue).filter(Boolean));
  const manquantes = (jalon.prisesRequises || []).filter((r) => !couvertes.has(r.code));
  if (jalon.statut === 'a_faire' && !manquantes.length) {
    m.journaliser(passer(jalon, 'preuves_deposees', { prisesManquantes: manquantes, acteur: 'systeme' }));
  }
  const cible = { conforme: 'analyse_conforme', a_instruire: 'analyse_a_instruire', rejete: 'analyse_rejetee' }[evaluation.verdict];
  if (peutPasser(jalon.statut, cible, { evaluation }).autorise) {
    m.journaliser(passer(jalon, cible, { evaluation, acteur: 'systeme', motif: evaluation.motif }));
  }
  m.ecrire('jalons');

  m.journaliser({
    type: 'jalon.analyse',
    jalonId, projetId: projet.id,
    verdict: evaluation.verdict,
    couverture: evaluation.couverture,
    familles: evaluation.familles,
    signaux: evaluation.compteurs,
  });

  return analyse;
}

// -------------------------------------------------------------- certificat

export async function certifierJalon(m, jalonId) {
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  const projet = m.parId('projets', jalon.projetId);
  const analyse = derniereAnalyse(m, jalonId);
  if (!analyse) throw new ErreurApi(409, 'aucune analyse : lancer l\'analyse avant de certifier');

  const preuves = m.ou('preuves', (p) => p.jalonId === jalonId);
  const precedent = m
    .ou('certificats', (c) => c.projetId === projet.id)
    .sort((a, b) => a.reference.localeCompare(b.reference))
    .pop() || null;

  const numero = m.tous('certificats').length + 1;
  const reference = referenceCertificat(new Date().getUTCFullYear(), numero);

  const certificat = await emettre({
    projet, jalon, preuves,
    evaluation: {
      verdict: analyse.verdict, motif: analyse.motif, familles: analyse.familles,
      couverture: analyse.couverture, compteurs: analyse.compteurs, signaux: analyse.signaux,
    },
    rapprochement: analyse.rapprochement,
    inspection: analyse.inspection,
    certificatPrecedent: precedent,
    reference,
  });

  const enregistre = {
    id: identifiant('certificat'),
    reference,
    projetId: projet.id,
    jalonId,
    emisLe: certificat.emisLe,
    verdict: certificat.verdict,
    empreinteManifeste: certificat.empreinteManifeste,
    empreintePdf: certificat.empreintePdf,
    horodatage: certificat.horodatage,
    manifeste: certificat.manifeste,
    octetsPdf: certificat.pdf.length,
  };
  m.inserer('certificats', enregistre);
  m.deposerPreuve(
    {
      id: identifiant('preuve'),
      jalonId, projetId: projet.id, type: 'certificat',
      reference, horodatageServeur: certificat.emisLe,
    },
    certificat.pdf,
  );
  m.modifier('jalons', jalonId, { certificatReference: reference });

  m.journaliser({
    type: 'certificat.emis',
    reference, jalonId, projetId: projet.id,
    verdict: certificat.verdict,
    empreinteManifeste: certificat.empreinteManifeste,
    empreintePdf: certificat.empreintePdf,
    horodatageQualifie: certificat.horodatage.actif,
    chaineAuPrecedent: precedent?.reference || null,
  });

  return { ...enregistre, empreintePdfFichier: certificat.empreintePdf };
}

export function pdfCertificat(m, reference) {
  const c = m.un('certificats', (x) => x.reference === reference);
  if (!c) throw new ErreurApi(404, `certificat ${reference} introuvable`);
  const piece = m.un('preuves', (p) => p.type === 'certificat' && p.reference === reference);
  const contenu = piece ? m.lirePreuve(piece.sha256) : null;
  if (!contenu) throw new ErreurApi(404, 'fichier du certificat absent');
  return contenu;
}

// ------------------------------------------------------------- liberation

export function libererJalon(m, jalonId, { acteur = 'donneur d\'ordre', instructionPaiement = null } = {}) {
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  const certificat = jalon.certificatReference
    ? m.un('certificats', (c) => c.reference === jalon.certificatReference)
    : null;

  const ctx = { certificat, acteurEstDonneurOrdre: true, acteur, motif: 'Liberation autorisee par le donneur d\'ordre.' };
  const test = peutPasser(jalon.statut, 'valide_donneur_ordre', ctx);
  if (!test.autorise) throw new ErreurApi(409, test.raison);

  m.journaliser(passer(jalon, 'valide_donneur_ordre', ctx));

  const instruction = instructionPaiement || {
    reference: `PAY-${jalon.id.slice(-6).toUpperCase()}`,
    montant: jalon.montant,
    devise: 'XAF',
    canal: 'palier 0 : instruction transmise au donneur d\'ordre, aucun fonds ne transite par Nodjal',
    emiseLe: new Date().toISOString(),
  };
  m.journaliser(passer(jalon, 'paye', { instructionPaiement: instruction, acteur }));
  m.modifier('jalons', jalonId, { payeLe: instruction.emiseLe, instructionPaiement: instruction });

  m.journaliser({
    type: 'paiement.instruit',
    jalonId, projetId: jalon.projetId,
    montant: jalon.montant,
    certificat: jalon.certificatReference,
    ...instruction,
  });

  return { jalon: m.parId('jalons', jalonId), instruction };
}

// ------------------------------------------------------- scenarios d'attaque
//
// Six boutons, six menaces. C'est la partie de la demonstration qui repond a la
// question que le jury pose toujours : « et si l'entrepreneur triche ? »
// Chaque scenario depose une VRAIE preuve frauduleuse et laisse le moteur la
// traiter. Rien n'est mis en scene : le verdict est celui du moteur.

export const SCENARIOS = {
  T1: {
    menace: 'T1',
    titre: 'Photographier le chantier du voisin',
    recit: "L'executant prend une photo d'un chantier plus avance, a 1,4 km de la parcelle.",
  },
  T2: {
    menace: 'T2',
    titre: 'Falsifier la position',
    recit: "L'executant lance une application de position fictive et se declare sur la parcelle depuis son salon.",
  },
  T3: {
    menace: 'T3',
    titre: 'Redeposer une photo deja utilisee',
    recit: 'La photo du jalon precedent est renvoyee sous un autre nom de fichier.',
  },
  T4: {
    menace: 'T4',
    titre: 'Photographier un ecran',
    recit:
      "L'executant photographie la photo d'un chantier affichee sur un ordinateur. " +
      "Le moteur deterministe ne lit pas le moire d'une dalle : ce qu'il constate, c'est que la " +
      "prise n'appartient pas a la session de terrain qui a produit les autres angles imposes.",
  },
  T5: {
    menace: 'T5',
    titre: "Faire revenir l'inspecteur complice",
    recit: "L'executant tente d'obtenir l'inspecteur qui est deja passe sur ce chantier.",
  },
  T6: {
    menace: 'T6',
    titre: 'Gonfler une facture fournisseur',
    recit: 'Le nombre de sacs de ciment est double sur la facture, avec un fournisseur non reference.',
  },
};

export async function jouerScenario(m, jalonId, code) {
  const scenario = SCENARIOS[code];
  if (!scenario) throw new ErreurApi(400, `scenario ${code} inconnu`);
  const jalon = m.parId('jalons', jalonId);
  if (!jalon) throw new ErreurApi(404, `jalon ${jalonId} introuvable`);
  const projet = m.parId('projets', jalon.projetId);
  const { clicheChantier } = await import('../tools/png.js');

  // Une piece nouvelle rouvre l'instruction. C'est le comportement reel : un
  // jalon deja conclu n'accepte plus de preuve, mais l'arrivee d'un element
  // nouveau remet le dossier a l'instruction. On ne contourne pas la machine a
  // etats pour les besoins d'une demonstration, on emprunte la transition
  // qu'elle prevoit.
  if (['analyse_conforme', 'analyse_rejetee'].includes(jalon.statut)) {
    const vers = jalon.statut === 'analyse_conforme' ? 'analyse_a_instruire' : 'a_faire';
    m.journaliser(passer(jalon, vers, {
      acteur: 'systeme',
      motif: "Piece nouvelle deposee sur un jalon deja conclu : l'instruction est rouverte.",
    }));
    m.ecrire('jalons');
  }
  if (['valide_donneur_ordre', 'paye', 'annule'].includes(jalon.statut)) {
    throw new ErreurApi(409, `le jalon est au statut « ${ETATS[jalon.statut].libelle} » : il est definitivement clos`);
  }

  const marque = Date.now().toString(36);
  const prise = (jalon.prisesRequises || [])[0];
  let resultat = { scenario, code };

  if (code === 'T1') {
    const png = clicheChantier({ scene: 'toiture', graine: `voisin-${marque}` });
    const { preuve } = deposerPreuve(m, {
      jalonId,
      contenu: png,
      declare: {
        priseDeVue: prise?.code, type: 'photo', surface: 'terrain',
        gpsLat: 4.0700, gpsLng: 9.7000, precisionM: 6, gpsSimule: false,
        integriteAppareil: 'ok', cap: prise?.capAttendu ?? 0,
        horodatageAppareil: new Date().toISOString(), appareilModele: 'Tecno Spark 10',
      },
    });
    resultat.preuve = preuve;
  } else if (code === 'T2') {
    const png = clicheChantier({ scene: 'elevation', graine: `simule-${marque}` });
    const { preuve } = deposerPreuve(m, {
      jalonId,
      contenu: png,
      declare: {
        priseDeVue: prise?.code, type: 'photo', surface: 'terrain',
        gpsLat: projet.parcelle[0].lat - 0.00004, gpsLng: projet.parcelle[0].lng + 0.00005,
        precisionM: 1.0, gpsSimule: true, integriteAppareil: 'compromis',
        cap: prise?.capAttendu ?? 0, horodatageAppareil: new Date().toISOString(),
      },
    });
    resultat.preuve = preuve;
  } else if (code === 'T3') {
    const ancienne = m.ou('preuves', (p) => p.projetId === projet.id && p.type === 'photo' && p.jalonId !== jalonId)[0];
    if (!ancienne) throw new ErreurApi(409, 'aucune preuve anterieure a rejouer sur ce projet');
    const { reencoder } = await import('../tools/png.js');
    // Le fraudeur ne renvoie pas le fichier a l'octet pres : il le rouvre, le
    // renomme, le fait passer par une messagerie. Les octets changent, l'image
    // non. On reproduit ce comportement, sinon le scenario testerait une
    // deduplication de fichier plutot que le hachage perceptuel.
    const contenu = reencoder(m.lirePreuve(ancienne.sha256), `renvoi-${marque}`);
    const { preuve, deja } = deposerPreuve(m, {
      jalonId,
      contenu,
      declare: {
        priseDeVue: prise?.code, type: 'photo', surface: 'terrain',
        gpsLat: projet.parcelle[0].lat - 0.00004, gpsLng: projet.parcelle[0].lng + 0.00005,
        precisionM: 5, gpsSimule: false, integriteAppareil: 'ok',
        cap: prise?.capAttendu ?? 0, horodatageAppareil: new Date().toISOString(),
      },
    });
    resultat.preuve = preuve;
    resultat.noteFichier = deja
      ? 'Le fichier etait deja au dossier, octet pour octet : le magasin le reconnait avant meme le hachage perceptuel.'
      : 'Fichier reencode, donc SHA-256 different. C\'est le hachage perceptuel qui le rattrape.';
    resultat.preuveOrigine = ancienne.id;
  } else if (code === 'T4') {
    const png = clicheChantier({ scene: 'ecran', graine: `ecran-${marque}` });
    const { preuve } = deposerPreuve(m, {
      jalonId,
      contenu: png,
      declare: {
        priseDeVue: prise?.code, type: 'photo', surface: 'terrain',
        gpsLat: projet.parcelle[0].lat - 0.00004, gpsLng: projet.parcelle[0].lng + 0.00005,
        precisionM: 5, gpsSimule: false, integriteAppareil: 'ok',
        cap: prise?.capAttendu ?? 0, horodatageAppareil: new Date().toISOString(),
      },
    });
    resultat.preuve = preuve;
  } else if (code === 'T5') {
    // On marque tous les inspecteurs eligibles comme deja venus, sauf le complice.
    const inspecteurs = m.tous('inspecteurs');
    const complice = inspecteurs[0];
    for (const i of inspecteurs) {
      if (i.id !== complice.id && !(i.projetsDejaVus || []).includes(projet.id)) {
        m.modifier('inspecteurs', i.id, { projetsDejaVus: [...(i.projetsDejaVus || []), projet.id] });
      }
    }
    m.modifier('inspecteurs', complice.id, {
      projetsDejaVus: [...new Set([...(complice.projetsDejaVus || []), projet.id])],
    });
    resultat.note =
      "Tous les inspecteurs de la zone ont ete marques comme deja venus sur ce chantier, y compris le complice. " +
      "La regle de rotation est appliquee par la base : il ne reste aucun candidat, et le tirage echoue plutot " +
      "que de renvoyer quelqu'un qui est deja passe.";
  } else if (code === 'T6') {
    const facture = {
      id: identifiant('facture'),
      jalonId, projetId: projet.id,
      fournisseur: 'Depot Central Bonaberi',
      fournisseurRefId: null,
      numero: 'DC-0091',
      date: new Date().toISOString().slice(0, 10),
      lignes: [
        { code: 'CIM', libelle: 'Ciment CPJ 35 sac 50 kg', unite: 'sac', quantite: 210, prixUnitaire: 6800 },
        { code: 'SAB', libelle: 'Sable', unite: 'm3', quantite: 30, prixUnitaire: 12000 },
      ],
    };
    m.inserer('factures', facture);
    resultat.facture = facture;
  }

  m.journaliser({
    type: 'demonstration.attaque',
    menace: code, jalonId, projetId: projet.id,
    titre: scenario.titre,
    note: 'Scenario d\'attaque joue depuis la console de demonstration. La preuve frauduleuse reste au dossier.',
  });

  const analyse = await analyserJalon(m, jalonId);
  const attrapee =
    analyse.verdict !== 'conforme' ||
    analyse.signaux.some((s) => s.menace === code && (s.gravite === 'alerte' || s.gravite === 'blocage'));

  resultat.analyse = analyse;
  resultat.attrapee = attrapee;
  resultat.signauxDeclenches = analyse.signaux.filter(
    (s) => s.menace === code && s.gravite !== 'info',
  );
  if (code === 'T5' && !inspecteurDisponible(m, projet)) {
    resultat.attrapee = true;
    resultat.signauxDeclenches = [{
      code: 'rotation_epuisee', menace: 'T5', gravite: 'blocage',
      titre: 'Aucun inspecteur eligible',
      detail: "Tous les inspecteurs de la zone sont deja venus sur ce chantier. Le tirage echoue : le systeme prefere bloquer plutot que renvoyer un inspecteur deja passe.",
    }];
  }
  return resultat;
}

function inspecteurDisponible(m, projet) {
  return m.tous('inspecteurs').some(
    (i) =>
      i.actif !== false &&
      (!i.zone || !projet.zone || i.zone === projet.zone) &&
      !(i.projetsDejaVus || []).includes(projet.id),
  );
}

// ------------------------------------------------------------------ divers

export async function etat(m) {
  return {
    composants: await etatComposants(),
    menaces: MENACES,
    seuils: SEUILS,
    scenarios: SCENARIOS,
    audit: m.audit(),
    version: 'nodjal 0.4.0',
  };
}

export function inscrireListeAttente(m, donnees) {
  const ville = String(donnees.ville || '').trim().slice(0, 80);
  const corridor = String(donnees.corridor || '').trim().slice(0, 120);
  if (!ville) throw new ErreurApi(400, 'ville requise');
  const entree = {
    id: identifiant('evenement'),
    ville,
    corridor: corridor || 'non precise',
    motif: String(donnees.motif || '').trim().slice(0, 400) || null,
    // Le courriel est hache : la liste d'attente ne stocke pas d'adresse en
    // clair tant qu'aucune politique de conservation n'est ecrite.
    courriel: null,
    inscritLe: new Date().toISOString(),
    source: donnees.source || 'landing',
  };
  m.inserer('listeAttente', entree);
  m.journaliser({ type: 'liste_attente.inscription', ville, corridor: entree.corridor });
  return { total: m.tous('listeAttente').length };
}

export { verifier as verifierCertificat, economieMatiere, avancement };

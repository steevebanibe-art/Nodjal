// Modele de menace.
//
// C'est le fichier a lire en premier. Tout le reste du depot existe pour
// l'alimenter.
//
// La these tient en une phrase : aucune de ces preuves ne suffit seule ; prises
// ensemble, elles rendent la fraude plus couteuse que le travail. Le systeme ne
// promet pas l'infaillibilite. Il deplace le rapport cout/benefice de la fraude,
// et il rend ce deplacement mesurable.
//
// Consequence de conception : le score n'est pas une somme de penalites. Un
// fraudeur qui optimise une somme trouve le sous-ensemble le moins cher a
// truquer. Ce qui compte est le nombre de FAMILLES DE PREUVE INDEPENDANTES qui
// se recoupent. Truquer une photo coute peu. Truquer une photo, la position, le
// cap, l'horloge serveur, la facture fournisseur et l'inspecteur tirant au sort
// coute plus que de monter le mur.

import { dansPolygone, distancePolygone, ecartCap, haversine } from './geo.js';
import { chercherDoublon, uniformite, SEUIL_IDENTIQUE } from './phash.js';

export const MENACES = {
  T1: {
    titre: 'Photographier un autre chantier',
    contreMesure: 'Geofence sur le polygone de la parcelle, plus cap boussole impose par prise de vue',
    famille: 'terrain', volet: 'position',
  },
  T2: {
    titre: 'Falsifier la position GPS',
    contreMesure: "Drapeau isFromMockProvider d'Android, attestation d'integrite de l'appareil, coherence avec la position EXIF",
    famille: 'terrain', volet: 'position',
  },
  T3: {
    titre: 'Rejouer une photo ancienne ou la deposer deux fois',
    contreMesure: "Hachage perceptuel compare a tout l'historique du projet, horodatage serveur faisant foi",
    famille: 'terrain', volet: 'unicite',
  },
  T4: {
    titre: "Photographier un ecran ou un tirage papier",
    contreMesure: 'Prises multiples sous angles imposes dans une meme session, video panoramique courte, controle d\'uniformite',
    famille: 'scene',
  },
  T5: {
    titre: 'Collusion entre executant et inspecteur',
    contreMesure: 'Affectation aleatoire, aucun inspecteur ne revient sur un chantier deja visite',
    famille: 'inspection',
  },
  T6: {
    titre: 'Fausses factures fournisseurs',
    contreMesure: 'Rapprochement automatique avec le devis quantitatif, base de fournisseurs referencee',
    famille: 'materiaux',
  },
};

export const GRAVITES = { info: 0, attention: 1, alerte: 2, blocage: 3 };

export const SEUILS = {
  toleranceCapDegres: 35,
  margeGeofenceMetres: 25,
  precisionGpsMaxMetres: 50,
  ecartHorlogeAttentionMinutes: 5,
  ecartHorlogeAlerteMinutes: 60,
  ecartGpsExifMetres: 80,
  uniformiteMax: 0.72,
  familleMinimum: 3,
  ecartFactureTolere: 0.15,
};

const signal = (code, menace, gravite, titre, detail, mesure = null) => ({
  code, menace, gravite, titre, detail, mesure,
  famille: menace ? MENACES[menace].famille : null,
  volet: menace ? MENACES[menace].volet || null : null,
});

// ------------------------------------------------------------------ preuve

/**
 * Evalue une preuve isolee.
 *
 * ctx = { preuve, projet, priseDeVue, historique, maintenant }
 *   preuve      : { type, gpsLat, gpsLng, precisionM, gpsSimule, integriteAppareil,
 *                   cap, horodatageAppareil, horodatageServeur, phash, exif, sessionId }
 *   priseDeVue  : { code, libelle, capAttendu } — la prise imposee par le jalon
 *   historique  : preuves deja deposees sur le projet
 *
 * Rend { signaux, volets, pireGravite }.
 *
 * Attention au vocabulaire : une preuve isolee ne produit pas des FAMILLES mais
 * des VOLETS. Position, temps et unicite sont trois controles sur un seul et
 * meme fichier, issu d'une seule et meme source. Les compter comme trois
 * preuves independantes reviendrait a se convaincre tout seul.
 */
export function evaluerPreuve(ctx) {
  const { preuve, projet, priseDeVue = null, historique = [], maintenant = new Date() } = ctx;
  const signaux = [];
  const volets = new Set();

  // --- T2 : la position est-elle reelle ?
  // Traitee avant T1 : verifier qu'un point est dans la parcelle n'a aucun sens
  // si le point est fabrique.
  if (preuve.gpsSimule === true) {
    signaux.push(signal(
      'gps_simule', 'T2', 'blocage',
      'Position simulee detectee sur l\'appareil',
      "Android signale que la position provient d'un fournisseur fictif. Le systeme d'exploitation l'expose ; un navigateur ne le peut pas. C'est la raison d'etre de l'application native.",
    ));
  } else if (preuve.gpsSimule === false) {
    volets.add('position');
    signaux.push(signal(
      'gps_authentique', 'T2', 'info',
      'Position fournie par le materiel',
      'Aucun fournisseur de position fictive actif au moment de la prise.',
    ));
  } else {
    signaux.push(signal(
      'gps_indetermine', 'T2', 'attention',
      "Origine de la position inconnue",
      "Preuve deposee depuis une surface qui n'expose pas le drapeau de position fictive (navigateur web). Recevable en pilote, insuffisante en production.",
    ));
  }

  if (preuve.integriteAppareil === 'compromis') {
    signaux.push(signal(
      'appareil_compromis', 'T2', 'alerte',
      'Appareil signale comme compromis',
      "L'attestation d'integrite echoue : appareil deverrouille, emulateur, ou image systeme non certifiee.",
    ));
  }

  if (typeof preuve.precisionM === 'number') {
    if (preuve.precisionM > SEUILS.precisionGpsMaxMetres) {
      signaux.push(signal(
        'precision_insuffisante', 'T1', 'attention',
        'Precision de localisation insuffisante',
        `Rayon annonce de ${Math.round(preuve.precisionM)} m, au-dela du seuil de ${SEUILS.precisionGpsMaxMetres} m. Frequent en interieur ou sous couvert. A reprendre a ciel ouvert.`,
        { precisionM: preuve.precisionM },
      ));
    } else if (preuve.precisionM < 1.5) {
      // Une precision annoncee sous le metre en environnement urbain est
      // physiquement rare. Certaines applications de simulation la fixent a 1 m.
      signaux.push(signal(
        'precision_trop_belle', 'T2', 'attention',
        'Precision annoncee anormalement bonne',
        `${preuve.precisionM.toFixed(1)} m sur un telephone en milieu bati. Certaines applications de position fictive figent cette valeur.`,
        { precisionM: preuve.precisionM },
      ));
    }
  }

  // --- T1 : la position est-elle la bonne ?
  const parcelle = projet?.parcelle;
  if (parcelle?.length >= 3 && typeof preuve.gpsLat === 'number') {
    const p = { lat: preuve.gpsLat, lng: preuve.gpsLng };
    const d = distancePolygone(p, parcelle);
    const dedans = dansPolygone(p, parcelle);
    if (dedans) {
      volets.add('position');
      signaux.push(signal(
        'dans_parcelle', 'T1', 'info',
        'Position a l\'interieur de la parcelle',
        `${Math.abs(d).toFixed(1)} m a l'interieur de la limite la plus proche.`,
        { distanceM: d },
      ));
    } else if (d <= SEUILS.margeGeofenceMetres) {
      signaux.push(signal(
        'limite_parcelle', 'T1', 'attention',
        'Position en limite de parcelle',
        `${d.toFixed(1)} m au-dela de la limite, dans la marge toleree de ${SEUILS.margeGeofenceMetres} m. Compatible avec une prise de vue en recul depuis la rue.`,
        { distanceM: d },
      ));
    } else {
      signaux.push(signal(
        'hors_parcelle', 'T1', 'blocage',
        'Position hors de la parcelle',
        `${Math.round(d)} m au-dela de la limite. Au-dela de ${SEUILS.margeGeofenceMetres} m, la prise de vue ne peut pas concerner ce chantier.`,
        { distanceM: d },
      ));
    }
  }

  // --- T1 : la bonne direction ?
  if (priseDeVue && typeof priseDeVue.capAttendu === 'number' && typeof preuve.cap === 'number') {
    const ecart = ecartCap(preuve.cap, priseDeVue.capAttendu);
    if (ecart <= SEUILS.toleranceCapDegres) {
      volets.add('position');
      signaux.push(signal(
        'cap_conforme', 'T1', 'info',
        'Orientation conforme a la prise imposee',
        `Cap ${Math.round(preuve.cap)} degres, attendu ${priseDeVue.capAttendu} degres, ecart ${Math.round(ecart)} degres.`,
        { ecartDegres: ecart },
      ));
    } else {
      signaux.push(signal(
        'cap_devie', 'T1', 'alerte',
        'Orientation hors de la prise imposee',
        `Cap ${Math.round(preuve.cap)} degres pour ${priseDeVue.capAttendu} degres attendus, soit ${Math.round(ecart)} degres d'ecart. La prise ne cadre pas la facade demandee.`,
        { ecartDegres: ecart },
      ));
    }
  }

  // --- T2 : la position transmise et la position EXIF disent-elles la meme chose ?
  const gpsExif = preuve.exif?.gps;
  if (gpsExif && typeof preuve.gpsLat === 'number') {
    const ecart = haversine({ lat: preuve.gpsLat, lng: preuve.gpsLng }, gpsExif);
    if (ecart > SEUILS.ecartGpsExifMetres) {
      signaux.push(signal(
        'discordance_gps_exif', 'T2', 'alerte',
        'Position transmise et position du fichier discordantes',
        `${Math.round(ecart)} m separent la position transmise par l'application de celle inscrite dans le fichier. Les deux devraient coincider a quelques metres.`,
        { ecartM: ecart },
      ));
    } else {
      volets.add('position');
      signaux.push(signal(
        'concordance_gps_exif', 'T2', 'info',
        'Position transmise et position du fichier concordantes',
        `${Math.round(ecart)} m d'ecart entre les deux sources.`,
        { ecartM: ecart },
      ));
    }
  }

  // --- Temps : l'horloge serveur fait foi, celle de l'appareil est un indice.
  if (preuve.horodatageAppareil && preuve.horodatageServeur) {
    const ecartMin = Math.abs(
      new Date(preuve.horodatageServeur) - new Date(preuve.horodatageAppareil),
    ) / 60000;
    if (ecartMin > SEUILS.ecartHorlogeAlerteMinutes) {
      signaux.push(signal(
        'horloge_incoherente', 'T3', 'alerte',
        "Horloge de l'appareil fortement decalee",
        `${Math.round(ecartMin)} minutes d'ecart avec l'horloge serveur. Un decalage de cette ampleur accompagne souvent une tentative d'antidatage.`,
        { ecartMinutes: ecartMin },
      ));
    } else if (ecartMin > SEUILS.ecartHorlogeAttentionMinutes) {
      signaux.push(signal(
        'horloge_decalee', 'T3', 'attention',
        "Horloge de l'appareil decalee",
        `${Math.round(ecartMin)} minutes d'ecart. Frequent sur les appareils restes longtemps hors reseau ; sans consequence sur la preuve, l'heure serveur faisant foi.`,
        { ecartMinutes: ecartMin },
      ));
    } else {
      volets.add('temps');
      signaux.push(signal(
        'horloge_coherente', 'T3', 'info',
        'Horloges appareil et serveur coherentes',
        `${ecartMin.toFixed(1)} minute d'ecart.`,
        { ecartMinutes: ecartMin },
      ));
    }
  }

  // --- T3 : cette image a-t-elle deja ete vue ?
  if (preuve.phash) {
    const autres = historique.filter((h) => h.id !== preuve.id);
    const doublon = chercherDoublon(preuve.phash, autres);
    if (doublon && doublon.distance <= SEUIL_IDENTIQUE) {
      signaux.push(signal(
        'image_dupliquee', 'T3', 'blocage',
        'Image deja deposee sur ce projet',
        `Distance perceptuelle de ${doublon.distance} sur 64 avec la preuve ${doublon.id}${doublon.jalonId ? ` (jalon ${doublon.jalonId})` : ''}. En deca de ${SEUIL_IDENTIQUE}, il s'agit du meme cliche.`,
        { distance: doublon.distance, preuveVoisine: doublon.id },
      ));
    } else if (doublon) {
      signaux.push(signal(
        'image_voisine', 'T3', 'attention',
        'Image tres proche d\'une preuve existante',
        `Distance de ${doublon.distance} sur 64 avec la preuve ${doublon.id}. Attendu entre deux vues du meme jalon, a instruire si les jalons different.`,
        { distance: doublon.distance, preuveVoisine: doublon.id },
      ));
    } else {
      volets.add('unicite');
      signaux.push(signal(
        'image_inedite', 'T3', 'info',
        'Image inedite sur ce projet',
        `Comparee a ${autres.length} preuve(s) anterieure(s), aucune correspondance.`,
        { comparaisons: autres.length },
      ));
    }
  }

  // --- T4 : la scene est-elle une scene, ou une surface plate ?
  if (typeof preuve.uniformite === 'number' && preuve.uniformite > SEUILS.uniformiteMax) {
    signaux.push(signal(
      'image_uniforme', 'T4', 'alerte',
      'Image pauvre en relief',
      `Indice d'uniformite de ${preuve.uniformite.toFixed(2)}. Objectif obstrue, cadrage trop serre, ou photographie d'une surface plane. Une photo d'ecran produit souvent ce profil.`,
      { uniformite: preuve.uniformite },
    ));
  }

  const anomaliesExif = preuve.exif?.anomalies || [];
  if (anomaliesExif.includes('logiciel_de_retouche')) {
    signaux.push(signal(
      'retouche_declaree', 'T4', 'alerte',
      'Fichier passe par un logiciel de retouche',
      `Champ logiciel : « ${preuve.exif.champs.logiciel} ». Une photo de chantier ne passe pas par un editeur avant depot.`,
      { logiciel: preuve.exif.champs.logiciel },
    ));
  }
  if (anomaliesExif.includes('exif_absent') && preuve.type === 'photo') {
    // Le signal ne change pas de gravite selon l'origine du fichier : ce serait
    // ouvrir une porte derobee. Seul le constat precise ce qui est connu.
    signaux.push(signal(
      'metadonnees_absentes', 'T4', 'attention',
      'Fichier depourvu de metadonnees',
      preuve.synthetique
        ? "Un cliche pris par un telephone porte toujours un EXIF. Cette piece appartient au jeu de demonstration et a ete generee, elle n'en porte donc pas. Le signal reste leve : nous ne desactivons pas un controle parce que la piece nous arrange."
        : "Un cliche pris par un telephone porte toujours un EXIF. Son absence signale une capture d'ecran, un partage par messagerie, ou un reencodage.",
    ));
  }
  if (anomaliesExif.includes('appareil_non_declare') && !anomaliesExif.includes('exif_absent')) {
    signaux.push(signal(
      'appareil_efface', 'T4', 'attention',
      'Fabricant et modele effaces des metadonnees',
      "Le fichier porte un EXIF, mais l'appareil n'y figure pas. Effacement selectif probable.",
    ));
  }

  const pireGravite = signaux.reduce((m, s) => Math.max(m, GRAVITES[s.gravite]), 0);
  return { signaux, volets: [...volets], pireGravite };
}

// ------------------------------------------------------------------- jalon

/**
 * Evalue un jalon complet : le faisceau, pas les preuves une a une.
 *
 * ctx = { jalon, projet, preuves, evaluations, rapprochement, inspection, satellite }
 */
export function evaluerJalon(ctx) {
  const {
    jalon, projet, preuves = [], evaluations = [],
    rapprochement = null, inspection = null, satellite = null,
  } = ctx;

  const signaux = evaluations.flatMap((e) => e.signaux);
  const familles = new Set();

  // --- La source « terrain » : une seule famille, quel que soit le nombre de
  // controles passes. Elle ne compte que si elle se recoupe elle-meme sur au
  // moins deux volets distincts — position, temps, unicite. Un fichier qui
  // valide un seul volet n'est pas une preuve, c'est une affirmation.
  const volets = new Set(evaluations.flatMap((e) => e.volets || []));
  if (volets.size >= 2) familles.add('terrain');

  // --- Completude : les prises imposees sont-elles toutes couvertes ?
  const requises = jalon.prisesRequises || [];
  const couvertes = new Set(preuves.map((p) => p.priseDeVue).filter(Boolean));
  const manquantes = requises.filter((r) => !couvertes.has(r.code));
  if (manquantes.length) {
    signaux.push(signal(
      'prises_manquantes', null, 'blocage',
      'Prises de vue imposees manquantes',
      `${manquantes.length} sur ${requises.length} non couverte(s) : ${manquantes.map((m) => m.libelle).join(', ')}.`,
      { manquantes: manquantes.map((m) => m.code) },
    ));
  }

  // --- T4 : les prises ont-elles ete faites dans une meme session de terrain ?
  // Reproduire quatre angles imposes sur un ecran coute plus cher que de faire
  // le tour du batiment. Encore faut-il que les prises soient contemporaines.
  const photos = preuves.filter((p) => p.type === 'photo' && p.horodatageServeur);
  if (photos.length >= 2) {
    const dates = photos.map((p) => new Date(p.horodatageServeur).getTime()).sort((a, b) => a - b);
    const etendueMin = (dates[dates.length - 1] - dates[0]) / 60000;
    const sessions = new Set(photos.map((p) => p.sessionId).filter(Boolean));
    if (etendueMin > 240) {
      signaux.push(signal(
        'session_etalee', 'T4', 'attention',
        'Prises de vue etalees sur plus de quatre heures',
        `${Math.round(etendueMin)} minutes entre la premiere et la derniere. Les angles imposes doivent etre captes dans une meme visite.`,
        { etendueMinutes: etendueMin },
      ));
    } else if (sessions.size <= 1) {
      familles.add('scene');
      signaux.push(signal(
        'session_unique', 'T4', 'info',
        'Prises de vue captees en une seule visite',
        `${photos.length} prises sur ${Math.round(etendueMin)} minutes, meme session de terrain.`,
        { etendueMinutes: etendueMin, prises: photos.length },
      ));
    }

    // --- T4 : une prise isolee de la session dominante.
    // C'est la contre-mesure reelle contre la photographie d'ecran. Le moteur
    // deterministe ne lit pas le moire d'une dalle LCD — le pretendre serait
    // faux. Ce qu'il constate, et qui suffit, c'est qu'une prise n'appartient
    // pas a la visite de terrain qui a produit les autres angles imposes.
    // Reproduire quatre angles imposes depuis un ecran, dans la meme session,
    // coute plus cher que de faire le tour du batiment.
    const compte = new Map();
    for (const p of photos) {
      const cle = p.sessionId || 'sans_session';
      compte.set(cle, (compte.get(cle) || 0) + 1);
    }
    if (compte.size > 1) {
      const [dominante] = [...compte.entries()].sort((a, b) => b[1] - a[1])[0];
      const isolees = photos.filter((p) => (p.sessionId || 'sans_session') !== dominante);
      signaux.push(signal(
        'prise_hors_session', 'T4', 'alerte',
        'Prise de vue hors de la session de terrain',
        `${isolees.length} prise(s) sur ${photos.length} n'appartiennent pas a la visite qui a produit les angles imposes` +
        `${isolees.some((p) => !p.sessionId) ? ', dont au moins une sans session declaree' : ''}. ` +
        "Une photographie d'ecran ou un cliche rapporte d'ailleurs produit exactement ce profil.",
        { isolees: isolees.length, sessions: compte.size },
      ));
    }
  }

  if (preuves.some((p) => p.type === 'video')) {
    familles.add('scene');
    signaux.push(signal(
      'panoramique_present', 'T4', 'info',
      'Panoramique video joint',
      'Trois secondes de balayage continu. Reproduire un panoramique coherent depuis un ecran demande un montage, pas une photo.',
    ));
  }

  // --- T6 : les materiaux consommes correspondent-ils au devis ?
  if (rapprochement) {
    if (rapprochement.verdict === 'conforme') {
      familles.add('materiaux');
      signaux.push(signal(
        'materiaux_conformes', 'T6', 'info',
        'Factures rapprochees du devis quantitatif',
        `${rapprochement.lignesRapprochees} ligne(s) rapprochee(s), ecart global de ${(rapprochement.ecartRelatif * 100).toFixed(1)} %.`,
        { ecartRelatif: rapprochement.ecartRelatif },
      ));
    } else {
      signaux.push(signal(
        'materiaux_ecart', 'T6', rapprochement.verdict === 'rejete' ? 'alerte' : 'attention',
        'Ecart entre factures et devis quantitatif',
        rapprochement.motif,
        { ecartRelatif: rapprochement.ecartRelatif },
      ));
    }
    for (const anomalie of rapprochement.anomalies || []) {
      signaux.push(signal(anomalie.code, 'T6', anomalie.gravite, anomalie.titre, anomalie.detail, anomalie.mesure));
    }
  }

  // --- T5 : l'inspecteur est-il neutre ?
  if (inspection) {
    if (inspection.echec) {
      signaux.push(signal(
        'rotation_epuisee', 'T5', 'blocage',
        'Aucun inspecteur eligible pour ce jalon',
        `${inspection.motif}. Le vivier de la zone est epuise : tous les inspecteurs disponibles sont ` +
        "deja venus sur ce chantier, ou ont un lien declare avec l'executant. Le systeme prefere bloquer " +
        "plutot que de renvoyer quelqu'un qui est deja passe — c'est precisement la regle qui protege " +
        'contre la collusion.',
        { exclusions: (inspection.exclusions || []).length },
      ));
    } else if (inspection.dejaVenu) {
      signaux.push(signal(
        'inspecteur_recurrent', 'T5', 'blocage',
        'Inspecteur deja intervenu sur ce chantier',
        `${inspection.inspecteurNom} a deja visite ce projet. La regle de rotation l'interdit : elle est appliquee par la base, pas par une consigne.`,
        { inspecteurId: inspection.inspecteurId },
      ));
    } else {
      familles.add('inspection');
      signaux.push(signal(
        'inspecteur_neutre', 'T5', 'info',
        'Inspecteur tirant au sort, premiere venue',
        `${inspection.inspecteurNom}, affectation aleatoire, aucun antecedent sur ce projet.`,
        { inspecteurId: inspection.inspecteurId },
      ));
    }
  }

  // --- Satellite : anteriorite du terrain, pas lecture d'avancement.
  if (satellite) {
    familles.add('satellite');
    signaux.push(signal(
      'satellite_anteriorite', null, 'info',
      'Anteriorite du terrain verifiee',
      satellite.resume,
      satellite.mesure || null,
    ));
  }

  const pireGravite = signaux.reduce((m, s) => Math.max(m, GRAVITES[s.gravite]), 0);
  const listeFamilles = [...familles];
  const couverture = listeFamilles.length;

  let verdict;
  let motif;
  if (pireGravite >= GRAVITES.blocage) {
    verdict = 'rejete';
    motif = 'Au moins un signal bloquant. Le jalon ne peut pas etre certifie en l\'etat.';
  } else if (pireGravite >= GRAVITES.alerte) {
    verdict = 'a_instruire';
    motif = 'Signaux d\'alerte presents. Une reprise de prise de vue ou une piece complementaire est demandee avant certification.';
  } else if (couverture < SEUILS.familleMinimum) {
    verdict = 'a_instruire';
    motif =
      `Faisceau trop etroit : ${couverture} source(s) independante(s) sur ${SEUILS.familleMinimum} requises ` +
      `(${listeFamilles.join(', ') || 'aucune'}). Aucun signal defavorable, mais les preuves proviennent ` +
      `d'un nombre de sources insuffisant pour se recouper.`;
  } else {
    verdict = 'conforme';
    motif = `Faisceau de ${couverture} sources independantes : ${listeFamilles.join(', ')}. Aucun signal d'alerte.`;
  }

  return {
    signaux,
    familles: listeFamilles,
    volets: [...volets],
    couverture,
    pireGravite,
    verdict,
    motif,
    compteurs: {
      info: signaux.filter((s) => s.gravite === 'info').length,
      attention: signaux.filter((s) => s.gravite === 'attention').length,
      alerte: signaux.filter((s) => s.gravite === 'alerte').length,
      blocage: signaux.filter((s) => s.gravite === 'blocage').length,
    },
  };
}

/** Resume d'une phrase, pour le certificat et pour la console. */
export function resumerFaisceau(evaluation) {
  const { couverture, familles, compteurs, verdict } = evaluation;
  const etat = { conforme: 'Conforme', a_instruire: 'A instruire', rejete: 'Rejete' }[verdict];
  return `${etat} — ${couverture} source(s) de preuve independante(s) (${familles.join(', ')}), ` +
    `${compteurs.alerte + compteurs.blocage} signal(aux) defavorable(s) sur ${
      compteurs.info + compteurs.attention + compteurs.alerte + compteurs.blocage} controles.`;
}

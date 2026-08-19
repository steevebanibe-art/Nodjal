// Tests du moteur. Bibliotheque standard de Node, aucune dependance.
//   node --test tests/

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { canonical, chain, hashObject, sha256, verifyChain } from '../core/hash.js';
import { aire, cap, centre, dansPolygone, distancePolygone, ecartCap, haversine } from '../core/geo.js';
import { luminance, format, ImageNonSupportee } from '../core/image.js';
import { distance, phash, uniformite, chercherDoublon } from '../core/phash.js';
import { lireExif } from '../core/exif.js';
import { evaluerPreuve, evaluerJalon, SEUILS } from '../core/threat.js';
import { peutPasser, passer, avancement, TransitionInterdite } from '../core/milestone.js';
import { rapprocher, similarite, estMateriau } from '../core/quantitatif.js';
import { affecter, verifierAffectation, etatRotation } from '../core/inspecteur.js';
import { construireManifeste, rendrePdf, verifier } from '../core/certificate.js';
import { construireRequete } from '../core/tsa.js';
import { signauxDepuisObservation } from '../core/vision.js';
import { revenuChantier, uniteEconomique, corridorFranceCameroun, coutMvp } from '../core/economics.js';
import { Magasin, PreuveImmuable } from '../core/store.js';
import { clicheChantier } from '../tools/png.js';

// Parcelle de reference : Bonaberi, Douala. Environ 400 m2.
const PARCELLE = [
  { lat: 4.062100, lng: 9.688200 },
  { lat: 4.062100, lng: 9.688380 },
  { lat: 4.061920, lng: 9.688380 },
  { lat: 4.061920, lng: 9.688200 },
];
const DEDANS = { lat: 4.062010, lng: 9.688290 };
const VOISIN = { lat: 4.061700, lng: 9.688290 };   // ~24 m au sud
const LOIN = { lat: 4.070000, lng: 9.700000 };     // ~1,5 km

const PROJET = {
  id: 'prj_test', libelle: 'Villa Bonaberi', adresse: 'Rue des Manguiers',
  ville: 'Douala', pays: 'Cameroun', zone: 'littoral',
  parcelle: PARCELLE, superficieM2: 400,
  donneurOrdreId: 'don_1', donneurOrdreNom: 'M. Tchoua', donneurOrdreResidence: 'Cergy, France',
  executantId: 'exe_1', executantNom: 'BTP Sawa',
  devisTotal: 26_000_000, devise: 'XAF',
};

const JALON = {
  id: 'jln_3', projetId: 'prj_test', ordre: 3, type: 'elevation',
  libelle: 'Elevation des murs, niveau 1', montant: 5_200_000, statut: 'a_faire',
  prisesRequises: [
    { code: 'nord', libelle: 'Facade nord', capAttendu: 0 },
    { code: 'est', libelle: 'Facade est', capAttendu: 90 },
  ],
};

const T = (min) => new Date(Date.UTC(2026, 7, 17, 9, min, 0)).toISOString();

function preuve(sur = {}) {
  return {
    id: 'prv_1', jalonId: 'jln_3', projetId: 'prj_test', type: 'photo',
    priseDeVue: 'nord', sha256: 'a'.repeat(64), phash: '0f1e2d3c4b5a6978',
    gpsLat: DEDANS.lat, gpsLng: DEDANS.lng, precisionM: 6, gpsSimule: false,
    integriteAppareil: 'ok', cap: 4,
    horodatageAppareil: T(0), horodatageServeur: T(0),
    sessionId: 'ses_1',
    exif: { present: true, champs: { modele: 'Tecno Spark 10' }, gps: null, anomalies: [] },
    ...sur,
  };
}

// ---------------------------------------------------------------- empreintes

describe('empreintes et chainage', () => {
  test("la forme canonique ne depend pas de l'ordre des cles", () => {
    assert.equal(canonical({ b: 1, a: 2 }), canonical({ a: 2, b: 1 }));
    assert.equal(hashObject({ x: [1, { z: 1, y: 2 }] }), hashObject({ x: [1, { y: 2, z: 1 }] }));
  });

  test('une chaine intacte se verifie', () => {
    let prev = '';
    const entrees = [{ n: 1 }, { n: 2 }, { n: 3 }].map((payload) => {
      const hash = chain(prev, payload);
      prev = hash;
      return { payload, hash };
    });
    assert.equal(verifyChain(entrees), -1);
  });

  test('modifier un maillon casse la chaine a cet endroit precis', () => {
    let prev = '';
    const entrees = [{ n: 1 }, { n: 2 }, { n: 3 }].map((payload) => {
      const hash = chain(prev, payload);
      prev = hash;
      return { payload, hash };
    });
    entrees[1].payload.n = 99;
    assert.equal(verifyChain(entrees), 1);
  });
});

// --------------------------------------------------------------- geometrie

describe('geometrie de parcelle', () => {
  test('point interieur et exterieur', () => {
    assert.equal(dansPolygone(DEDANS, PARCELLE), true);
    assert.equal(dansPolygone(VOISIN, PARCELLE), false);
  });

  test('la distance est negative a l\'interieur, positive dehors', () => {
    assert.ok(distancePolygone(DEDANS, PARCELLE) < 0);
    assert.ok(distancePolygone(VOISIN, PARCELLE) > 0);
  });

  test('le chantier voisin tombe hors de la marge toleree', () => {
    const d = distancePolygone(LOIN, PARCELLE);
    assert.ok(d > SEUILS.margeGeofenceMetres, `attendu > ${SEUILS.margeGeofenceMetres} m, obtenu ${d}`);
  });

  test('haversine, cap et ecart de cap', () => {
    assert.ok(Math.abs(haversine(PARCELLE[0], PARCELLE[3]) - 20) < 4);
    assert.ok(Math.abs(cap({ lat: 0, lng: 0 }, { lat: 1, lng: 0 })) < 1);
    assert.equal(ecartCap(350, 10), 20);
    assert.equal(ecartCap(10, 350), 20);
  });

  test('la superficie est de l\'ordre de 400 m2', () => {
    const a = aire(PARCELLE);
    assert.ok(a > 300 && a < 500, `superficie calculee : ${a}`);
    assert.ok(dansPolygone(centre(PARCELLE), PARCELLE));
  });
});

// ------------------------------------------------------------------ images

describe('decodage et hachage perceptuel', () => {
  test('le format se reconnait sans decoder', () => {
    assert.equal(format(clicheChantier({ scene: 'elevation' })), 'image/png');
  });

  test('un PNG se decode en carte de luminance', () => {
    const png = clicheChantier({ largeur: 96, hauteur: 72, scene: 'elevation' });
    const l = luminance(png);
    assert.equal(l.largeur, 96);
    assert.equal(l.hauteur, 72);
    assert.ok(l.luma.some((v) => v > 0 && v < 255));
  });

  test('un format inconnu est refuse explicitement', () => {
    assert.throws(() => luminance(Buffer.from('pas une image')), ImageNonSupportee);
  });

  test('deux fois la meme image : distance nulle', () => {
    const png = clicheChantier({ scene: 'elevation', graine: 'a' });
    assert.equal(distance(phash(png), phash(png)), 0);
  });

  test('deux scenes differentes : distance elevee', () => {
    const d = distance(
      phash(clicheChantier({ scene: 'fondations', graine: 'a' })),
      phash(clicheChantier({ scene: 'toiture', graine: 'b' })),
    );
    assert.ok(d > 8, `attendu > 8, obtenu ${d}`);
  });

  test('une image quasi uniforme est signalee', () => {
    assert.ok(uniformite(clicheChantier({ scene: 'uniforme' })) > SEUILS.uniformiteMax);
    assert.ok(uniformite(clicheChantier({ scene: 'elevation' })) < SEUILS.uniformiteMax);
  });

  test('la recherche de doublon rend le plus proche voisin', () => {
    const p = phash(clicheChantier({ scene: 'elevation', graine: 'a' }));
    const trouve = chercherDoublon(p, [{ id: 'prv_9', phash: p }]);
    assert.equal(trouve.id, 'prv_9');
    assert.equal(trouve.qualification, 'identique');
    assert.equal(chercherDoublon(p, [{ id: 'prv_9', phash: 'ffffffffffffffff' }]), null);
  });
});

describe('EXIF', () => {
  test("l'absence d'EXIF est une information, pas une panne", () => {
    const r = lireExif(clicheChantier({ scene: 'elevation' }));
    assert.equal(r.present, false);
    assert.ok(r.anomalies.includes('exif_absent'));
  });

  test('un fichier illisible ne fait pas tomber le lecteur', () => {
    assert.doesNotThrow(() => lireExif(Buffer.from([0xff, 0xd8, 0xff, 0xe1, 0x00, 0x08, 0x45])));
  });
});

// ------------------------------------------------------------ modele de menace

describe('modele de menace', () => {
  test('T1 — une prise hors parcelle bloque', () => {
    const r = evaluerPreuve({ preuve: preuve({ gpsLat: LOIN.lat, gpsLng: LOIN.lng }), projet: PROJET });
    assert.ok(r.signaux.some((s) => s.code === 'hors_parcelle' && s.gravite === 'blocage'));
  });

  test('T1 — la marge en limite de parcelle est toleree, avec mention', () => {
    const r = evaluerPreuve({ preuve: preuve({ gpsLat: VOISIN.lat, gpsLng: VOISIN.lng }), projet: PROJET });
    const s = r.signaux.find((x) => x.code === 'limite_parcelle');
    assert.ok(s, 'signal de limite attendu');
    assert.equal(s.gravite, 'attention');
  });

  test('T2 — une position simulee bloque', () => {
    const r = evaluerPreuve({ preuve: preuve({ gpsSimule: true }), projet: PROJET });
    const s = r.signaux.find((x) => x.code === 'gps_simule');
    assert.equal(s.gravite, 'blocage');
    assert.equal(s.menace, 'T2');
  });

  test('T2 — le web ne peut pas se prononcer, et le dit', () => {
    const r = evaluerPreuve({ preuve: preuve({ gpsSimule: undefined }), projet: PROJET });
    assert.ok(r.signaux.some((s) => s.code === 'gps_indetermine' && s.gravite === 'attention'));
  });

  test('T2 — position transmise et position EXIF discordantes', () => {
    const r = evaluerPreuve({
      preuve: preuve({ exif: { present: true, champs: {}, gps: LOIN, anomalies: [] } }),
      projet: PROJET,
    });
    assert.ok(r.signaux.some((s) => s.code === 'discordance_gps_exif' && s.gravite === 'alerte'));
  });

  test('T1 — un cap devie est signale', () => {
    const r = evaluerPreuve({
      preuve: preuve({ cap: 180 }), projet: PROJET,
      priseDeVue: JALON.prisesRequises[0],
    });
    assert.ok(r.signaux.some((s) => s.code === 'cap_devie' && s.gravite === 'alerte'));
  });

  test('T3 — une image deja deposee bloque', () => {
    const r = evaluerPreuve({
      preuve: preuve(), projet: PROJET,
      historique: [{ id: 'prv_ancien', phash: '0f1e2d3c4b5a6978', jalonId: 'jln_1' }],
    });
    assert.ok(r.signaux.some((s) => s.code === 'image_dupliquee' && s.gravite === 'blocage'));
  });

  test('T3 — un ecart d\'horloge important est signale', () => {
    const r = evaluerPreuve({
      preuve: preuve({ horodatageAppareil: T(-600) }), projet: PROJET,
    });
    assert.ok(r.signaux.some((s) => s.code === 'horloge_incoherente'));
  });

  test('T4 — un logiciel de retouche declare leve une alerte', () => {
    const r = evaluerPreuve({
      preuve: preuve({ exif: { present: true, champs: { logiciel: 'Adobe Photoshop 25.0' }, gps: null, anomalies: ['logiciel_de_retouche'] } }),
      projet: PROJET,
    });
    assert.ok(r.signaux.some((s) => s.code === 'retouche_declaree' && s.gravite === 'alerte'));
  });

  test('une seule photo irreprochable ne suffit pas a certifier', () => {
    // Le point du modele : position, temps et unicite sont trois controles sur
    // UN SEUL fichier. Ils ne font pas trois preuves independantes.
    const p = preuve();
    const ev = evaluerPreuve({ preuve: p, projet: PROJET, priseDeVue: JALON.prisesRequises[0] });
    assert.ok(ev.volets.length >= 2, 'la preuve valide bien plusieurs volets');
    const r = evaluerJalon({
      jalon: { ...JALON, prisesRequises: [JALON.prisesRequises[0]] },
      projet: PROJET, preuves: [p], evaluations: [ev],
    });
    assert.equal(r.compteurs.alerte + r.compteurs.blocage, 0);
    assert.deepEqual(r.familles, ['terrain'], 'une seule source : le terrain');
    assert.equal(r.couverture, 1);
    assert.equal(r.verdict, 'a_instruire');
    assert.match(r.motif, /Faisceau trop etroit/);
  });

  test('deux photos de la meme session ne font toujours qu une seule source', () => {
    const p1 = preuve({ id: 'prv_1', priseDeVue: 'nord', cap: 2, phash: '0102030405060708' });
    const p2 = preuve({ id: 'prv_2', priseDeVue: 'est', cap: 92, phash: 'aabbccddeeff0011', horodatageServeur: T(6), horodatageAppareil: T(6) });
    const evals = [
      evaluerPreuve({ preuve: p1, projet: PROJET, priseDeVue: JALON.prisesRequises[0], historique: [p2] }),
      evaluerPreuve({ preuve: p2, projet: PROJET, priseDeVue: JALON.prisesRequises[1], historique: [p1] }),
    ];
    const r = evaluerJalon({ jalon: JALON, projet: PROJET, preuves: [p1, p2], evaluations: evals });
    // terrain (le fichier) + scene (la session unique) : deux sources, pas cinq.
    assert.equal(r.couverture, 2);
    assert.equal(r.verdict, 'a_instruire');
  });

  test('un faisceau complet conclut a la conformite', () => {
    const p1 = preuve({ id: 'prv_1', priseDeVue: 'nord', cap: 2, phash: '0102030405060708' });
    const p2 = preuve({ id: 'prv_2', priseDeVue: 'est', cap: 92, phash: 'aabbccddeeff0011' });
    const evals = [
      evaluerPreuve({ preuve: p1, projet: PROJET, priseDeVue: JALON.prisesRequises[0], historique: [p2] }),
      evaluerPreuve({ preuve: p2, projet: PROJET, priseDeVue: JALON.prisesRequises[1], historique: [p1] }),
    ];
    const r = evaluerJalon({
      jalon: JALON, projet: PROJET, preuves: [p1, p2], evaluations: evals,
      rapprochement: { verdict: 'conforme', motif: 'ok', lignesRapprochees: 3, ecartRelatif: 0.02, anomalies: [] },
      inspection: { inspecteurId: 'ins_4', inspecteurNom: 'A. Ngo', dejaVenu: false, motif: 'tirage' },
    });
    assert.equal(r.verdict, 'conforme');
    assert.ok(r.couverture >= SEUILS.familleMinimum);
    assert.deepEqual(r.familles.sort(), ['inspection', 'materiaux', 'scene', 'terrain']);
  });

  test('T5 — un vivier epuise bloque le jalon plutot que de le laisser passer', () => {
    // Le defaut que le scenario d'attaque a revele : un echec d'affectation
    // etait avale en silence, et le jalon passait « conforme » sur les autres
    // sources. Aucun inspecteur eligible ne veut pas dire aucun probleme
    // d'inspection.
    const r = evaluerJalon({
      jalon: { ...JALON, prisesRequises: [] }, projet: PROJET, preuves: [], evaluations: [],
      inspection: { echec: true, motif: 'aucun inspecteur eligible', exclusions: [1, 2, 3] },
    });
    assert.equal(r.verdict, 'rejete');
    assert.ok(r.signaux.some((s) => s.code === 'rotation_epuisee' && s.gravite === 'blocage'));
  });

  test('T4 — une prise hors de la session de terrain leve une alerte', () => {
    const p1 = preuve({ id: 'prv_1', priseDeVue: 'nord', sessionId: 'ses_terrain', phash: '0102030405060708' });
    const p2 = preuve({ id: 'prv_2', priseDeVue: 'est', sessionId: 'ses_terrain', phash: 'aabbccddeeff0011', horodatageServeur: T(5), horodatageAppareil: T(5) });
    const intrus = preuve({ id: 'prv_3', priseDeVue: 'sud', sessionId: null, phash: '1122334455667788', horodatageServeur: T(9), horodatageAppareil: T(9) });
    const evals = [p1, p2, intrus].map((p) => evaluerPreuve({ preuve: p, projet: PROJET }));
    const r = evaluerJalon({
      jalon: { ...JALON, prisesRequises: [] }, projet: PROJET,
      preuves: [p1, p2, intrus], evaluations: evals,
    });
    const s = r.signaux.find((x) => x.code === 'prise_hors_session');
    assert.ok(s, 'signal de session attendu');
    assert.equal(s.gravite, 'alerte');
    assert.equal(s.menace, 'T4');
  });

  test('T5 — un inspecteur deja venu bloque le jalon', () => {
    const r = evaluerJalon({
      jalon: { ...JALON, prisesRequises: [] }, projet: PROJET, preuves: [], evaluations: [],
      inspection: { inspecteurId: 'ins_1', inspecteurNom: 'B. Etoa', dejaVenu: true },
    });
    assert.equal(r.verdict, 'rejete');
  });

  test('une prise imposee manquante bloque', () => {
    const p = preuve({ priseDeVue: 'nord' });
    const r = evaluerJalon({
      jalon: JALON, projet: PROJET, preuves: [p],
      evaluations: [evaluerPreuve({ preuve: p, projet: PROJET })],
    });
    assert.ok(r.signaux.some((s) => s.code === 'prises_manquantes' && s.gravite === 'blocage'));
    assert.equal(r.verdict, 'rejete');
  });
});

// ------------------------------------------------------------ machine a etats

describe('machine a etats des jalons', () => {
  test('on ne saute pas de « a faire » a « paye »', () => {
    assert.equal(peutPasser('a_faire', 'paye').autorise, false);
  });

  test('les prises manquantes empechent le depot', () => {
    const r = peutPasser('a_faire', 'preuves_deposees', { prisesManquantes: [{ code: 'est' }] });
    assert.equal(r.autorise, false);
    assert.match(r.raison, /prise/);
  });

  test('la liberation exige un certificat et le donneur d\'ordre', () => {
    assert.equal(peutPasser('analyse_conforme', 'valide_donneur_ordre', { acteurEstDonneurOrdre: true }).autorise, false);
    assert.equal(peutPasser('analyse_conforme', 'valide_donneur_ordre', { certificat: {}, acteurEstDonneurOrdre: false }).autorise, false);
    assert.equal(peutPasser('analyse_conforme', 'valide_donneur_ordre', { certificat: {}, acteurEstDonneurOrdre: true }).autorise, true);
  });

  test('une transition interdite leve avec son motif', () => {
    const j = { id: 'jln_1', projetId: 'prj_1', statut: 'a_faire' };
    assert.throws(() => passer(j, 'paye'), TransitionInterdite);
    assert.equal(j.statut, 'a_faire', "l'etat ne doit pas bouger sur un refus");
  });

  test("l'avancement est pondere par le montant, pas par le nombre de jalons", () => {
    const a = avancement([
      { montant: 1_000_000, statut: 'paye' },
      { montant: 9_000_000, statut: 'a_faire' },
    ]);
    assert.equal(a.paye, 0.1);
    assert.equal(a.montantCantonne, 9_000_000);
  });
});

// ------------------------------------------------------------- rapprochement

describe('rapprochement facture / devis', () => {
  const devis = [
    { code: 'CIM', libelle: 'Ciment CPJ 35 sac 50 kg', unite: 'sac', quantite: 200, prixUnitaire: 5500 },
    { code: 'SAB', libelle: 'Sable de riviere', unite: 'm3', quantite: 12, prixUnitaire: 12000 },
    { code: 'FER', libelle: 'Fer a beton HA 12', unite: 'barre', quantite: 60, prixUnitaire: 4800 },
  ];
  const fournisseurs = [{ id: 'frn_1', nom: 'Quincaillerie Akwa' }];

  test('un rapprochement propre conclut a la conformite', () => {
    const r = rapprocher(devis, [{
      id: 'fct_1', fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_1', numero: 'A-1201', date: '2026-08-10',
      lignes: [
        { code: 'CIM', libelle: 'Ciment CPJ 35', quantite: 200, prixUnitaire: 5500 },
        { code: 'SAB', libelle: 'Sable de riviere', quantite: 12, prixUnitaire: 12000 },
        { code: 'FER', libelle: 'Fer a beton HA 12', quantite: 60, prixUnitaire: 4800 },
      ],
    }], { fournisseursReferences: fournisseurs });
    assert.equal(r.verdict, 'conforme');
    assert.equal(r.lignesRapprochees, 3);
  });

  test('T6 — une quantite gonflee est detectee', () => {
    const r = rapprocher(devis, [{
      id: 'fct_2', fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_1', numero: 'A-1202',
      lignes: [{ code: 'CIM', libelle: 'Ciment CPJ 35', quantite: 400, prixUnitaire: 5500 }],
    }], { fournisseursReferences: fournisseurs });
    assert.ok(r.anomalies.some((a) => a.code === 'quantite_depassee'));
  });

  test('T6 — un fournisseur hors reseau est signale', () => {
    const r = rapprocher(devis, [{
      id: 'fct_3', fournisseur: 'Depot inconnu', numero: 'X-1',
      lignes: [{ code: 'CIM', libelle: 'Ciment', quantite: 10, prixUnitaire: 5500 }],
    }], { fournisseursReferences: fournisseurs });
    assert.ok(r.anomalies.some((a) => a.code === 'fournisseur_non_reference'));
  });

  test('T6 — une facture deja rapprochee ailleurs leve une alerte', () => {
    const r = rapprocher(devis, [{
      id: 'fct_4', fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_1', numero: 'A-1201',
      lignes: [{ code: 'CIM', libelle: 'Ciment', quantite: 10, prixUnitaire: 5500 }],
    }], {
      fournisseursReferences: fournisseurs,
      facturesAnterieures: [{ fournisseur: 'Quincaillerie Akwa', numero: 'A-1201' }],
    });
    assert.ok(r.anomalies.some((a) => a.code === 'facture_dupliquee' && a.gravite === 'alerte'));
  });

  test('un poste absent du devis est signale sans etre rejete', () => {
    const r = rapprocher(devis, [{
      id: 'fct_5', fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_1', numero: 'A-1210',
      lignes: [{ libelle: 'Location betonniere', quantite: 1, prixUnitaire: 45000 }],
    }], { fournisseursReferences: fournisseurs });
    assert.ok(r.anomalies.some((a) => a.code === 'ligne_hors_devis'));
  });

  test('la main d oeuvre sort du budget de reference', () => {
    // Le defaut que le chantier pilote a revele : comparer des factures
    // materiaux a un devis main d'oeuvre comprise produit un ecart negatif
    // enorme et sans aucun sens.
    const avecMo = [...devis, { code: 'MO', nature: 'main_oeuvre', libelle: 'Main d oeuvre maconnerie', unite: 'forfait', quantite: 1, prixUnitaire: 1_450_000 }];
    const r = rapprocher(avecMo, [{
      id: 'fct_6', fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_1', numero: 'A-1300',
      lignes: [
        { code: 'CIM', libelle: 'Ciment CPJ 35', quantite: 200, prixUnitaire: 5500 },
        { code: 'SAB', libelle: 'Sable de riviere', quantite: 12, prixUnitaire: 12000 },
        { code: 'FER', libelle: 'Fer a beton HA 12', quantite: 60, prixUnitaire: 4800 },
      ],
    }], { fournisseursReferences: fournisseurs });
    assert.equal(r.verdict, 'conforme');
    assert.ok(Math.abs(r.ecartRelatif) < 0.02, `ecart obtenu : ${r.ecartRelatif}`);
    assert.equal(r.budgetHorsFourniture, 1_450_000);
    assert.equal(r.postesHorsFourniture.length, 1);
    assert.match(r.motif, /Main d'oeuvre/);
  });

  test('la nature d un poste prime sur le libelle, et le libelle sert de repli', () => {
    assert.equal(estMateriau({ nature: 'materiau', libelle: 'Location betonniere' }), true);
    assert.equal(estMateriau({ nature: 'main_oeuvre', libelle: 'Ciment' }), false);
    assert.equal(estMateriau({ libelle: 'Main d oeuvre maconnerie' }), false);
    assert.equal(estMateriau({ libelle: 'Ciment CPJ 35' }), true);
  });

  test('la similarite de libelle se comporte comme attendu', () => {
    assert.ok(similarite('Ciment CPJ 35 sac', 'Ciment CPJ 35 sac 50 kg') > 0.6);
    assert.ok(similarite('Ciment', 'Fer a beton') < 0.3);
  });
});

// ------------------------------------------------------------- inspecteurs

describe('rotation des inspecteurs', () => {
  const inspecteurs = [
    { id: 'ins_1', nom: 'A. Ngo', zone: 'littoral', projetsDejaVus: ['prj_test'] },
    { id: 'ins_2', nom: 'B. Etoa', zone: 'littoral', projetsDejaVus: [] },
    { id: 'ins_3', nom: 'C. Manga', zone: 'littoral', projetsDejaVus: [] },
    { id: 'ins_4', nom: 'D. Bile', zone: 'centre', projetsDejaVus: [] },
    { id: 'ins_5', nom: 'E. Sone', zone: 'littoral', projetsDejaVus: [], executantsLies: ['exe_1'] },
  ];

  test('T5 — un inspecteur deja venu n\'est jamais retire au sort', () => {
    for (let n = 1; n <= 8; n++) {
      const r = affecter({ projet: PROJET, jalon: { ...JALON, id: `jln_${n}` }, inspecteurs, sel: 'sel-du-projet' });
      assert.notEqual(r.inspecteur.id, 'ins_1');
    }
  });

  test('la zone et le lien avec l\'executant excluent', () => {
    const r = affecter({ projet: PROJET, jalon: JALON, inspecteurs, sel: 'sel' });
    assert.ok(['ins_2', 'ins_3'].includes(r.inspecteur.id));
    assert.equal(r.candidats, 2);
  });

  test('le tirage est reproductible avec le sel, et seulement avec lui', () => {
    const a = affecter({ projet: PROJET, jalon: JALON, inspecteurs, sel: 'sel-A' });
    const b = affecter({ projet: PROJET, jalon: JALON, inspecteurs, sel: 'sel-A' });
    assert.equal(a.inspecteur.id, b.inspecteur.id);
    const v = verifierAffectation({ projet: PROJET, jalon: JALON, inspecteurs, sel: 'sel-A', inspecteurAttenduId: a.inspecteur.id });
    assert.equal(v.conforme, true);
  });

  test('sans sel, le tirage est refuse', () => {
    assert.throws(() => affecter({ projet: PROJET, jalon: JALON, inspecteurs, sel: null }), /sel/);
  });

  test('un vivier insuffisant est signale avant de devenir bloquant', () => {
    const e = etatRotation({ projet: PROJET, inspecteurs, jalonsRestants: 5 });
    assert.equal(e.suffisant, false);
    assert.match(e.alerte, /Vivier insuffisant/);
  });
});

// ------------------------------------------------------------- certificat

describe('certificat', () => {
  const p = preuve({ sha256: sha256(Buffer.from('piece-1')) });
  const evaluation = {
    verdict: 'conforme', motif: 'faisceau de 3 familles', familles: ['position', 'temps', 'unicite'],
    couverture: 3, compteurs: { info: 5, attention: 0, alerte: 0, blocage: 0 },
    signaux: [{ code: 'dans_parcelle', menace: 'T1', gravite: 'info', titre: 'Dans la parcelle', detail: '4 m a l\'interieur.', mesure: null }],
  };
  const base = {
    projet: PROJET, jalon: JALON, preuves: [p], evaluation,
    rapprochement: null, inspection: null, certificatPrecedent: null,
    reference: 'NDJ-2026-000001', emisLe: T(0),
  };

  test('le manifeste est reproductible', () => {
    assert.equal(hashObject(construireManifeste(base)), hashObject(construireManifeste(base)));
  });

  test('modifier le manifeste change son empreinte', () => {
    const m1 = construireManifeste(base);
    const m2 = construireManifeste({ ...base, jalon: { ...JALON, montant: 9_999_999 } });
    assert.notEqual(hashObject(m1), hashObject(m2));
  });

  test('le PDF est un vrai PDF', () => {
    const m = construireManifeste(base);
    const pdf = rendrePdf({ manifeste: m, empreinteManifeste: hashObject(m), horodatage: { actif: false, motif: 'non configure' }, projet: PROJET, jalon: JALON });
    assert.equal(pdf.subarray(0, 5).toString('latin1'), '%PDF-');
    assert.ok(pdf.includes(Buffer.from('%%EOF')));
    assert.ok(pdf.length > 3000, `PDF trop court : ${pdf.length} octets`);
    assert.ok(pdf.includes(Buffer.from('NDJ-2026-000001', 'latin1')));
  });

  test('la verification detecte un manifeste altere', () => {
    const m = construireManifeste(base);
    const empreinte = hashObject(m);
    m.jalon.montant = 99;
    const r = verifier({ manifeste: m, empreinteAnnoncee: empreinte });
    assert.equal(r.conforme, false);
    assert.ok(r.problemes.some((x) => x.gravite === 'blocage'));
  });

  test('la verification detecte une piece substituee', () => {
    const m = construireManifeste(base);
    const r = verifier({
      manifeste: m, empreinteAnnoncee: hashObject(m),
      preuvesOrigine: [{ id: 'prv_1', contenu: Buffer.from('piece-substituee') }],
    });
    assert.equal(r.conforme, false);
  });

  test('la verification passe sur des pieces intactes', () => {
    const m = construireManifeste(base);
    const r = verifier({
      manifeste: m, empreinteAnnoncee: hashObject(m),
      preuvesOrigine: [{ id: 'prv_1', contenu: Buffer.from('piece-1') }],
    });
    assert.equal(r.conforme, true);
  });
});

describe('horodatage RFC 3161', () => {
  test('la requete est un DER bien forme', () => {
    const r = construireRequete(sha256('x'));
    assert.equal(r[0], 0x30);
    assert.ok(r.length > 40);
  });

  test('une empreinte qui n\'est pas du SHA-256 est refusee', () => {
    assert.throws(() => construireRequete('abcd'), /SHA-256/);
  });
});

// ------------------------------------------------------------------ vision

describe('traduction des observations du modele de vision', () => {
  const socle = {
    ouvrageIdentifie: 'Mur en parpaings, deux rangees.', avancementObserve: 'partiel',
    elementsAttendusVus: ['parpaings'], elementsAttendusAbsents: [], indicesDeScenePlate: [],
    conditionsPriseDeVue: 'plein jour', qualiteExploitable: true, confiance: 0.82,
    reserve: 'La face arriere n\'est pas visible.',
  };

  test('une observation coherente ajoute la famille vision', () => {
    const r = signauxDepuisObservation({ ...socle, coherenceAvecDeclare: 'coherent' });
    assert.deepEqual(r.familles, ['vision']);
    assert.equal(r.signaux[0].gravite, 'info');
  });

  test('un avancement en deca leve une alerte sans ajouter de famille', () => {
    const r = signauxDepuisObservation({ ...socle, coherenceAvecDeclare: 'en_deca', elementsAttendusAbsents: ['chainage haut'] });
    assert.deepEqual(r.familles, []);
    assert.equal(r.signaux[0].gravite, 'alerte');
  });

  test('des indices de scene plate declenchent T4', () => {
    const r = signauxDepuisObservation({ ...socle, coherenceAvecDeclare: 'coherent', indicesDeScenePlate: ['moire reguliere', 'bord d\'ecran'] });
    assert.ok(r.signaux.some((s) => s.menace === 'T4' && s.gravite === 'alerte'));
  });

  test('une confiance basse ne conclut pas', () => {
    const r = signauxDepuisObservation({ ...socle, coherenceAvecDeclare: 'coherent', confiance: 0.2 });
    assert.deepEqual(r.familles, []);
    assert.ok(r.signaux.some((s) => s.code === 'vision_peu_sure'));
  });
});

// ------------------------------------------------------------------ economie

describe('economie', () => {
  test('le chantier type du dossier donne bien 1 430 EUR', () => {
    const r = revenuChantier({ montantEur: 40000, dureeMois: 18, tauxSequestre: 0.02, abonnementMensuelEur: 35 });
    assert.equal(Math.round(r.sequestre), 800);
    assert.equal(Math.round(r.abonnement), 630);
    assert.equal(Math.round(r.total), 1430);
  });

  test("l'unite economique tient au cout d'acquisition vise", () => {
    const u = uniteEconomique({ revenuTotalEur: 1430, dureeMois: 18, coutAcquisitionEur: 250 });
    assert.ok(u.margeBrute > 0);
    assert.ok(u.ratioMargeSurAcquisition > 3, `ratio obtenu : ${u.ratioMargeSurAcquisition}`);
  });

  test('le corridor part du chiffre officiel et marque ses hypotheses', () => {
    const c = corridorFranceCameroun();
    assert.equal(c.etapes[0].statut, 'officiel');
    assert.equal(c.etapes[2].statut, 'hypothese de travail');
    assert.ok(c.etapes[0].valeurEur > 900e6 && c.etapes[0].valeurEur < 1050e6);
    assert.ok(c.chantiersEquivalents > 0);
  });

  test('le MVP tient sous 300 EUR', () => {
    assert.ok(coutMvp().total < 300);
  });
});

// ------------------------------------------------------------------ magasin

describe('magasin : immuabilite et journal', () => {
  function magasinTemporaire() {
    const d = mkdtempSync(join(tmpdir(), 'nodjal-'));
    return { m: new Magasin(d), nettoyer: () => rmSync(d, { recursive: true, force: true }) };
  }

  test('une preuve ne se modifie pas', () => {
    const { m, nettoyer } = magasinTemporaire();
    try {
      m.deposerPreuve({ id: 'prv_1', jalonId: 'jln_1', projetId: 'prj_1', type: 'photo' }, Buffer.from('image'));
      assert.throws(() => m.modifier('preuves', 'prv_1', { type: 'video' }), PreuveImmuable);
      assert.throws(() => m.inserer('preuves', { id: 'prv_2' }), PreuveImmuable);
    } finally { nettoyer(); }
  });

  test('un certificat emis ne se modifie pas', () => {
    const { m, nettoyer } = magasinTemporaire();
    try {
      m.inserer('certificats', { id: 'crt_1', reference: 'NDJ-2026-000001' });
      assert.throws(() => m.modifier('certificats', 'crt_1', { reference: 'X' }), PreuveImmuable);
    } finally { nettoyer(); }
  });

  test('le meme fichier deux fois est reconnu, pas duplique', () => {
    const { m, nettoyer } = magasinTemporaire();
    try {
      const a = m.deposerPreuve({ id: 'prv_1', jalonId: 'j', projetId: 'p', type: 'photo' }, Buffer.from('meme'));
      const b = m.deposerPreuve({ id: 'prv_2', jalonId: 'j', projetId: 'p', type: 'photo' }, Buffer.from('meme'));
      assert.equal(a.deja, false);
      assert.equal(b.deja, true);
      assert.equal(b.preuve.id, 'prv_1');
      assert.equal(m.tous('preuves').length, 1);
    } finally { nettoyer(); }
  });

  test('le journal se verifie, et l\'audit complet passe', () => {
    const { m, nettoyer } = magasinTemporaire();
    try {
      m.deposerPreuve({ id: 'prv_1', jalonId: 'j', projetId: 'p', type: 'photo' }, Buffer.from('a'));
      m.journaliser({ type: 'jalon.transition', depuis: 'a_faire', vers: 'preuves_deposees' });
      const j = m.verifierJournal();
      assert.equal(j.conforme, true);
      assert.equal(j.entrees, 2);
      assert.equal(m.audit().conforme, true);
    } finally { nettoyer(); }
  });

  test('le contenu d\'une preuve se relit et correspond a son empreinte', () => {
    const { m, nettoyer } = magasinTemporaire();
    try {
      const { preuve: p } = m.deposerPreuve({ id: 'prv_1', jalonId: 'j', projetId: 'p', type: 'photo' }, Buffer.from('contenu'));
      assert.equal(sha256(m.lirePreuve(p.sha256)), p.sha256);
      assert.equal(m.verifierPreuves().conforme, true);
    } finally { nettoyer(); }
  });
});

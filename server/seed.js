// Jeu de demonstration : un chantier pilote a Douala.
//
// Tout est regenerable a partir d'une graine fixe. Aucun binaire n'est
// versionne, et deux executions produisent le meme dossier au bit pres — ce qui
// permet de rejouer une demonstration a l'identique, y compris sur scene.
//
// Les cliches sont SYNTHETIQUES et l'interface le dit en permanence. Nous ne
// faisons jamais passer une image fabriquee pour une photo de chantier : c'est
// exactement le comportement que le produit combat.

import { rmSync, mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

import { Magasin } from '../core/store.js';
import { suiteDeterministe, referenceCertificat } from '../core/ids.js';
import { clicheChantier } from '../tools/png.js';
import { phash, uniformite } from '../core/phash.js';
import { lireExif } from '../core/exif.js';
import { aire } from '../core/geo.js';

const ICI = dirname(fileURLToPath(import.meta.url));
export const RACINE_DONNEES = join(ICI, '..', 'data');

const id = suiteDeterministe('nodjal-pilote-2026');

// Bonaberi, Douala. Parcelle d'environ 400 m2 sur la rive gauche du Wouri.
const PARCELLE = [
  { lat: 4.062100, lng: 9.688200 },
  { lat: 4.062100, lng: 9.688380 },
  { lat: 4.061920, lng: 9.688380 },
  { lat: 4.061920, lng: 9.688200 },
];

const T = (jour, heure, minute = 0) =>
  new Date(Date.UTC(2026, 6, jour, heure, minute, 0)).toISOString();

export function semer({ racine = RACINE_DONNEES, reinitialiser = false } = {}) {
  if (reinitialiser) rmSync(racine, { recursive: true, force: true });
  mkdirSync(racine, { recursive: true });
  const m = new Magasin(racine);
  if (m.tous('projets').length) return { m, deja: true };

  // ------------------------------------------------------------ acteurs

  const executant = {
    id: 'exe_SAWA', raisonSociale: 'BTP Sawa Construction',
    responsable: 'Emmanuel Njoya', telephone: '+237 6 99 xx xx xx',
    ville: 'Douala', zone: 'littoral',
    noteFiabilite: 0.78, jalonsValides: 14, jalonsRejetes: 2, litiges: 0,
    depuis: '2026-02-11',
    note: "Historique constitue sur trois chantiers Nodjal. C'est cette donnee que personne ne possede aujourd'hui.",
  };
  m.inserer('executants', executant);

  const inspecteurs = [
    { id: 'ins_NGO', nom: 'Alice Ngo Bassong', zone: 'littoral', metier: 'technicienne genie civil', projetsDejaVus: [], actif: true },
    { id: 'ins_ETO', nom: 'Bertrand Etoa', zone: 'littoral', metier: 'conducteur de travaux', projetsDejaVus: [], actif: true },
    { id: 'ins_MAN', nom: 'Clarisse Manga', zone: 'littoral', metier: 'metreuse', projetsDejaVus: [], actif: true },
    { id: 'ins_BIL', nom: 'Daniel Bile', zone: 'littoral', metier: 'geometre', projetsDejaVus: [], actif: true },
    { id: 'ins_SON', nom: 'Estelle Sone', zone: 'centre', metier: 'architecte', projetsDejaVus: [], actif: true },
  ];
  for (const i of inspecteurs) m.inserer('inspecteurs', i);

  const fournisseurs = [
    { id: 'frn_AKW', nom: 'Quincaillerie Akwa', ville: 'Douala', referenceDepuis: '2026-03-02' },
    { id: 'frn_CIM', nom: 'Cimencam Depot Bonaberi', ville: 'Douala', referenceDepuis: '2026-03-02' },
    { id: 'frn_BTC', nom: 'Briqueterie Terre Comprimee Nkolbisson', ville: 'Yaounde', referenceDepuis: '2026-05-19', basCarbone: true },
  ];
  for (const f of fournisseurs) m.inserer('fournisseurs', f);

  // ------------------------------------------------------------- projet

  const projet = {
    id: 'prj_BONABERI',
    libelle: 'Villa R+1 Bonaberi',
    adresse: 'Rue des Manguiers, quartier Bonassama',
    ville: 'Douala', pays: 'Cameroun', zone: 'littoral',
    parcelle: PARCELLE,
    superficieM2: Math.round(aire(PARCELLE)),
    donneurOrdreId: 'don_TCHOUA',
    donneurOrdreNom: 'Marceline Tchoua',
    donneurOrdreResidence: 'Cergy, France',
    executantId: executant.id,
    executantNom: executant.raisonSociale,
    devisTotal: 26_000_000,
    devise: 'XAF',
    ouvertLe: T(2, 9),
    sel: 'sel-pilote-bonaberi-2026',
    palierSequestre: 0,
    noteSequestre:
      "Palier 0 : le donneur d'ordre paie directement l'executant ; Nodjal autorise le versement " +
      'jalon par jalon et le trace. Aucun fonds ne transite par Nodjal, aucune licence n\'est requise.',
    synthetique: true,
  };
  m.inserer('projets', projet);
  m.journaliser({ type: 'projet.ouvert', projetId: projet.id, devisTotal: projet.devisTotal });

  // ------------------------------------------------------------- jalons

  const prises = {
    terrain: [
      { code: 'vue_ensemble', libelle: 'Vue d\'ensemble de la parcelle', capAttendu: 180 },
      { code: 'borne_nord', libelle: 'Borne nord', capAttendu: 0 },
    ],
    fondations: [
      { code: 'fouilles', libelle: 'Fouilles en rigole', capAttendu: 180 },
      { code: 'semelles', libelle: 'Semelles ferraillees', capAttendu: 90 },
    ],
    elevation: [
      { code: 'nord', libelle: 'Facade nord', capAttendu: 0 },
      { code: 'est', libelle: 'Facade est', capAttendu: 90 },
      { code: 'sud', libelle: 'Facade sud', capAttendu: 180 },
      { code: 'interieur', libelle: 'Interieur, angle sud-ouest', capAttendu: 225 },
    ],
    dalle: [
      { code: 'chainage', libelle: 'Chainage haut', capAttendu: 0 },
      { code: 'dalle', libelle: 'Dalle coulee', capAttendu: 90 },
    ],
    couverture: [
      { code: 'charpente', libelle: 'Charpente posee', capAttendu: 0 },
      { code: 'toiture', libelle: 'Couverture terminee', capAttendu: 90 },
    ],
    finitions: [
      { code: 'menuiseries', libelle: 'Menuiseries posees', capAttendu: 180 },
      { code: 'interieur_fini', libelle: 'Interieur fini', capAttendu: 270 },
    ],
  };

  const definitions = [
    {
      ordre: 1, type: 'terrain', libelle: 'Verification du terrain et bornage',
      montant: 1_300_000, statut: 'paye',
      description: "Confirmation que la parcelle existe, qu'elle est libre, et qu'elle correspond au titre presente.",
      elementsAttendus: ['parcelle degagee', 'bornes visibles', 'acces chantier'],
      scene: 'terrain', jour: 3,
    },
    {
      ordre: 2, type: 'fondations', libelle: 'Fouilles, semelles et longrines',
      montant: 4_800_000, statut: 'paye',
      description: 'Fouilles en rigole, semelles filantes ferraillees, longrines coulees.',
      elementsAttendus: ['fouilles ouvertes', 'ferraillage en place', 'beton coule'],
      scene: 'fondations', jour: 11,
    },
    {
      ordre: 3, type: 'elevation', libelle: 'Elevation des murs, niveau 1',
      montant: 5_200_000, statut: 'a_faire',
      description: 'Montage des murs en parpaings creux 15, jusqu\'au niveau du chainage haut.',
      elementsAttendus: ['murs montes sur toute la peripherie', 'ouvertures reservees', 'poteaux raidisseurs coules'],
      scene: 'elevation', jour: 24, enCours: true,
    },
    {
      ordre: 4, type: 'dalle', libelle: 'Chainage haut et dalle de plancher',
      montant: 6_100_000, statut: 'a_faire',
      description: 'Chainage haut ferraille, coffrage et coulage de la dalle du niveau 1.',
      elementsAttendus: ['chainage coule', 'dalle coffree', 'dalle coulee'],
      scene: 'fondations',
    },
    {
      ordre: 5, type: 'couverture', libelle: 'Charpente et couverture',
      montant: 5_400_000, statut: 'a_faire',
      description: 'Charpente bois, couverture en tole bac aluzinc.',
      elementsAttendus: ['fermes posees', 'pannes fixees', 'couverture posee'],
      scene: 'toiture',
    },
    {
      ordre: 6, type: 'finitions', libelle: 'Menuiseries et finitions',
      montant: 3_200_000, statut: 'a_faire',
      description: 'Menuiseries exterieures, enduits, peinture, reseaux apparents.',
      elementsAttendus: ['menuiseries posees', 'enduits termines', 'peinture appliquee'],
      scene: 'elevation',
    },
  ];

  const jalons = definitions.map((d) => {
    const j = {
      id: id('jalon'), projetId: projet.id, ordre: d.ordre, type: d.type,
      libelle: d.libelle, description: d.description, montant: d.montant,
      statut: d.statut, elementsAttendus: d.elementsAttendus,
      prisesRequises: prises[d.type],
      ouvertLe: d.jour ? T(d.jour, 7) : null,
      _scene: d.scene, _jour: d.jour, _enCours: Boolean(d.enCours),
    };
    m.inserer('jalons', j);
    return j;
  });

  // ------------------------------------- devis quantitatif du jalon en cours

  const jalonCourant = jalons.find((j) => j._enCours);
  jalonCourant.devisQuantitatif = [
    { code: 'PAR15', libelle: 'Parpaing creux 15x20x40', unite: 'unite', quantite: 1850, prixUnitaire: 425 },
    { code: 'CIM', libelle: 'Ciment CPJ 35 sac 50 kg', unite: 'sac', quantite: 96, prixUnitaire: 5500 },
    { code: 'SAB', libelle: 'Sable de riviere', unite: 'm3', quantite: 14, prixUnitaire: 12000 },
    { code: 'FER8', libelle: 'Fer a beton HA 8 pour raidisseurs', unite: 'barre', quantite: 42, prixUnitaire: 3200 },
    { code: 'MO', libelle: 'Main d\'oeuvre maconnerie', unite: 'forfait', quantite: 1, prixUnitaire: 1_450_000 },
  ];
  m.ecrire('jalons');

  const factures = [
    {
      id: id('facture'), jalonId: jalonCourant.id, projetId: projet.id,
      fournisseur: 'Quincaillerie Akwa', fournisseurRefId: 'frn_AKW',
      numero: 'AKW-2026-4412', date: T(20, 10).slice(0, 10),
      lignes: [
        { code: 'PAR15', libelle: 'Parpaing creux 15x20x40', unite: 'unite', quantite: 1850, prixUnitaire: 425 },
        { code: 'FER8', libelle: 'Fer a beton HA 8', unite: 'barre', quantite: 44, prixUnitaire: 3200 },
      ],
    },
    {
      id: id('facture'), jalonId: jalonCourant.id, projetId: projet.id,
      fournisseur: 'Cimencam Depot Bonaberi', fournisseurRefId: 'frn_CIM',
      numero: 'CIM-118803', date: T(21, 8).slice(0, 10),
      lignes: [
        { code: 'CIM', libelle: 'Ciment CPJ 35 sac 50 kg', unite: 'sac', quantite: 98, prixUnitaire: 5500 },
        { code: 'SAB', libelle: 'Sable de riviere lave', unite: 'm3', quantite: 14, prixUnitaire: 12500 },
      ],
    },
  ];
  for (const f of factures) m.inserer('factures', f);

  // ------------------------------------------------------- preuves posees

  let refCertificat = 0;

  for (const j of jalons) {
    if (!j._jour) continue;
    const sessionId = id('session');
    const deja = [];

    j.prisesRequises.forEach((prise, index) => {
      const png = clicheChantier({
        largeur: 384, hauteur: 288, scene: j._scene,
        graine: `${projet.id}-${j.ordre}-${prise.code}`,
      });
      const metadonnees = {
        id: id('preuve'), jalonId: j.id, projetId: projet.id, type: 'photo',
        priseDeVue: prise.code, sessionId,
        gpsLat: PARCELLE[0].lat - 0.00005 - index * 0.00002,
        gpsLng: PARCELLE[0].lng + 0.00006 + index * 0.00002,
        precisionM: 4.5 + index * 0.8,
        gpsSimule: false,
        integriteAppareil: 'ok',
        cap: (prise.capAttendu + (index % 2 ? 7 : -6) + 360) % 360,
        horodatageAppareil: T(j._jour, 10, index * 7),
        horodatageServeur: T(j._jour, 10, index * 7 + 1),
        appareilModele: 'Tecno Spark 10',
        phash: phash(png),
        uniformite: Number(uniformite(png).toFixed(3)),
        exif: lireExif(png),
        synthetique: true,
      };
      m.deposerPreuve(metadonnees, png);
      deja.push(metadonnees);
    });

    // Panoramique video : contre-mesure T4. Le fichier est un marqueur en
    // pilote ; l'appli terrain produit un vrai flux de trois secondes.
    const marqueur = Buffer.from(
      `nodjal-panoramique-synthetique\nprojet=${projet.id}\njalon=${j.ordre}\nsession=${sessionId}\n`,
      'utf8',
    );
    m.deposerPreuve(
      {
        id: id('preuve'), jalonId: j.id, projetId: projet.id, type: 'video',
        priseDeVue: null, sessionId, dureeSecondes: 3,
        gpsLat: PARCELLE[0].lat - 0.00007, gpsLng: PARCELLE[0].lng + 0.00008,
        precisionM: 5.2, gpsSimule: false, integriteAppareil: 'ok',
        horodatageAppareil: T(j._jour, 10, 30), horodatageServeur: T(j._jour, 10, 31),
        synthetique: true,
      },
      marqueur,
    );

    if (j.statut === 'paye') {
      refCertificat++;
      j.certificatReference = referenceCertificat(2026, refCertificat);
      j.payeLe = T(j._jour + 2, 14);
      m.journaliser({
        type: 'jalon.transition', jalonId: j.id, projetId: projet.id,
        depuis: 'valide_donneur_ordre', vers: 'paye', acteur: projet.donneurOrdreNom,
        motif: 'Liberation du jalon apres certificat conforme (dossier historique).',
      });
    }
  }
  m.ecrire('jalons');

  // ------------------------------------------------- liste d'attente amorcee

  const amorce = [
    { ville: 'Cergy', corridor: 'France vers Cameroun', motif: 'Chantier familial a Yaounde' },
    { ville: 'Bruxelles', corridor: 'Belgique vers Cameroun', motif: 'Reprise de la maison des parents' },
    { ville: 'Douala', corridor: 'local', motif: 'Entreprise cherchant a se faire referencer' },
  ];
  amorce.forEach((a, i) =>
    m.inserer('listeAttente', {
      id: id('evenement'), ...a, courriel: null,
      inscritLe: T(15 + i, 12), source: 'jeu de demonstration',
    }),
  );

  m.journaliser({
    type: 'demonstration.semee',
    projetId: projet.id,
    jalons: jalons.length,
    preuves: m.tous('preuves').length,
    note: 'Cliches synthetiques generes a partir d\'une graine fixe. Rejouable a l\'identique.',
  });

  return { m, deja: false, projet, jalons };
}

// Execution directe : node server/seed.js [--reset]
if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const reinitialiser = process.argv.includes('--reset');
  const { m, deja, projet } = semer({ reinitialiser });
  if (deja) {
    console.log('Jeu de demonstration deja present. Relancer avec --reset pour le regenerer.');
  } else {
    console.log(`Chantier pilote seme : ${projet.libelle}, ${projet.ville}`);
    console.log(`  ${m.tous('jalons').length} jalons, ${m.tous('preuves').length} preuves, ${m.tous('factures').length} factures`);
    console.log(`  ${m.tous('inspecteurs').length} inspecteurs, ${m.tous('fournisseurs').length} fournisseurs`);
  }
  const audit = m.audit();
  console.log(`  Audit d'integrite : ${audit.resume}`);
}

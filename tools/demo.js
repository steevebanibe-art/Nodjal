// Démonstration de bout en bout, sans serveur ni navigateur.
//
//   node tools/demo.js            parcours complet
//   node tools/demo.js --attaques les six scénarios d'attaque
//
// Sert à deux choses : répéter le script de démonstration sans dépendre d'un
// écran, et servir de test d'intégration lisible. Tout ce qui s'affiche ici sort
// du moteur ; rien n'est mis en scène.

import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { semer } from '../server/seed.js';
import * as api from '../server/api.js';
import { MENACES } from '../core/threat.js';

const V = '\x1b[32m', J = '\x1b[33m', R = '\x1b[31m', G = '\x1b[1m', F = '\x1b[2m', Z = '\x1b[0m';
const couleurVerdict = (v) => ({ conforme: V, a_instruire: J, rejete: R })[v] || '';
const motVerdict = (v) => ({ conforme: 'CONFORME', a_instruire: 'À INSTRUIRE', rejete: 'REJETÉ' })[v];
const fcfa = (n) => `${Math.round(n).toLocaleString('fr-FR')} FCFA`;

const etape = (n, t) => {
  console.log('');
  console.log(`${G}${n}. ${t}${Z}`);
  console.log(F + '─'.repeat(64) + Z);
};

const racine = mkdtempSync(join(tmpdir(), 'nodjal-demo-'));
const { m, projet } = semer({ racine, reinitialiser: true });

try {
  const jalon = m.ou('jalons', (j) => j.projetId === projet.id).find((j) => j.statut === 'a_faire');

  console.log('');
  console.log(`${G}NODJAL${Z} — Rien n'est payé tant que rien n'est prouvé.`);
  console.log(F + `${projet.libelle}, ${projet.ville} · devis ${fcfa(projet.devisTotal)}` + Z);

  // ------------------------------------------------------------------ 1
  etape(1, 'Le dossier tel qu\'il arrive');
  const preuves = m.ou('preuves', (p) => p.jalonId === jalon.id);
  console.log(`   Jalon ${jalon.ordre} — ${jalon.libelle} · ${fcfa(jalon.montant)}`);
  console.log(`   ${preuves.length} pièces déposées, ${jalon.prisesRequises.length} prises imposées`);
  for (const p of preuves.filter((x) => x.priseDeVue)) {
    const prise = jalon.prisesRequises.find((r) => r.code === p.priseDeVue);
    console.log(`     ${F}·${Z} ${prise.libelle.padEnd(28)} cap ${String(Math.round(p.cap)).padStart(3)}° ` +
      `(attendu ${prise.capAttendu}°)  ${F}${p.sha256.slice(0, 12)}…${Z}`);
  }

  // ------------------------------------------------------------------ 2
  etape(2, 'Analyse — le faisceau, pas les preuves une à une');
  const a = await api.analyserJalon(m, jalon.id);
  console.log(`   ${couleurVerdict(a.verdict)}${G}${motVerdict(a.verdict)}${Z}  ${a.motif}`);
  console.log('');
  console.log(`   Sources indépendantes : ${a.familles.join(', ')}`);
  console.log(`   Volets du terrain     : ${a.volets.join(', ')}`);
  console.log(`   Contrôles             : ${a.compteurs.info} conformes, ${a.compteurs.attention} attention, ` +
    `${a.compteurs.alerte} alerte, ${a.compteurs.blocage} bloquant`);
  console.log(`   Modèle de vision      : ${a.vision.actif ? a.vision.modele : `dormant (${a.vision.motif})`}`);
  if (!a.vision.actif) console.log(`   ${F}${a.vision.remplacement}${Z}`);
  console.log('');
  for (const s of a.signaux.filter((s) => s.gravite !== 'info').slice(0, 4)) {
    console.log(`   ${J}▸${Z} ${s.titre}`);
  }
  console.log(`   ${F}Matériaux : ${a.rapprochement.motif}${Z}`);
  console.log(`   ${F}Inspection : ${a.inspection.inspecteurNom} — ${a.inspection.motif}${Z}`);

  // ------------------------------------------------------------------ 3
  etape(3, 'Certificat d\'avancement');
  const c = await api.certifierJalon(m, jalon.id);
  console.log(`   ${c.reference}  ·  ${c.octetsPdf.toLocaleString('fr-FR')} octets de PDF`);
  console.log(`   Manifeste  ${c.empreinteManifeste}`);
  console.log(`   PDF        ${c.empreintePdf}`);
  console.log(`   Horodatage ${c.horodatage.actif ? c.horodatage.prestataire : `non configuré (${c.horodatage.motif})`}`);

  const v = api.verifierCertificat({
    manifeste: c.manifeste,
    empreinteAnnoncee: c.empreinteManifeste,
    preuvesOrigine: c.manifeste.preuves.map((p) => ({ id: p.id, contenu: m.lirePreuve(p.sha256) })),
  });
  console.log(`   Vérification : ${v.conforme ? V + 'conforme' : R + 'ALTÉRÉ'}${Z} — ` +
    `${v.piecesVerifiees}/${v.piecesAttendues} pièces recalculées depuis les fichiers d'origine`);

  // ------------------------------------------------------------------ 4
  etape(4, 'Libération');
  const l = api.libererJalon(m, jalon.id);
  console.log(`   ${l.instruction.reference} · ${fcfa(l.instruction.montant)}`);
  console.log(`   ${F}${l.instruction.canal}${Z}`);

  // ------------------------------------------------------------------ 5
  etape(5, 'Intégrité du dossier');
  const audit = m.audit();
  console.log(`   ${audit.conforme ? V + '✓' : R + '✗'}${Z} ${audit.resume}`);
  console.log(`   ${F}Chaque événement scelle le précédent. Retirer une ligne au milieu casse${Z}`);
  console.log(`   ${F}toutes les suivantes, et la vérification le montre en une seconde.${Z}`);

  // ------------------------------------------------------- les attaques
  if (process.argv.includes('--attaques')) {
    etape(6, 'Les six attaques');
    console.log(`   ${F}Chaque scénario dépose une vraie preuve frauduleuse. Le verdict affiché${Z}`);
    console.log(`   ${F}est celui du moteur, pas une mise en scène.${Z}`);
    console.log('');
    for (const code of ['T1', 'T2', 'T3', 'T4', 'T5', 'T6']) {
      const frais = semer({ racine: mkdtempSync(join(tmpdir(), 'nodjal-atq-')), reinitialiser: true });
      const jc = frais.m.ou('jalons', (j) => j.statut === 'a_faire')[0];
      await api.analyserJalon(frais.m, jc.id);
      const r = await api.jouerScenario(frais.m, jc.id, code);
      const marque = r.attrapee ? `${V}interceptée${Z}` : `${R}PASSÉE${Z}`;
      console.log(`   ${G}${code}${Z}  ${MENACES[code].titre.padEnd(42)} ${marque}`);
      console.log(`        ${F}parade : ${MENACES[code].contreMesure}${Z}`);
      for (const s of r.signauxDeclenches.filter((s) => s.gravite === 'blocage' || s.gravite === 'alerte')) {
        console.log(`        ${R}▸${Z} [${s.gravite}] ${s.titre}`);
      }
      rmSync(frais.m.racine, { recursive: true, force: true });
    }
  }

  console.log('');
  console.log(`   ${G}« Ce que vous venez de voir, la diaspora ne l'a jamais eu. »${Z}`);
  console.log('');
} finally {
  rmSync(racine, { recursive: true, force: true });
}

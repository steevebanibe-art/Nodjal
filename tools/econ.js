// Économie du produit, calculée et non recopiée.
//
//   node tools/econ.js
//
// Chaque ligne porte son statut : officiel, ou hypothèse de travail. Un jury où
// siège un cabinet de conseil pardonne une hypothèse assumée ; il ne pardonne
// pas un chiffre inventé présenté comme un fait.

import {
  PARITE_XAF_EUR, SOURCES, TARIFS, CHANTIER_TYPE,
  revenuChantier, fourchetteRevenu, uniteEconomique,
  corridorFranceCameroun, sensibilite, coutMvp, trajectoire,
} from '../core/economics.js';

const silencieux = process.argv.includes('--quiet');
const P = (...a) => { if (!silencieux) console.log(...a); };
const eur = (n) => `${Math.round(n).toLocaleString('fr-FR')} EUR`;
const titre = (t) => { P(''); P(t); P('─'.repeat(t.length)); };

titre('SOURCES');
P(`Parité fixe                 1 EUR = ${PARITE_XAF_EUR} FCFA`);
for (const [cle, s] of Object.entries(SOURCES)) {
  const valeur = s.valeurFcfa ? `${(s.valeurFcfa / 1e9).toFixed(0)} Md FCFA`
    : s.valeurUsd ? `${(s.valeurUsd / 1e9).toFixed(0)} Md USD`
    : s.personnes2024 ? `${s.personnes2024.toLocaleString('fr-FR')} personnes`
    : `${(s.valeur * 100).toFixed(1)} %`;
  P(`${cle.padEnd(28)} ${valeur.padEnd(18)} [${s.statut}]`);
  P(`${' '.repeat(28)} ${s.source}`);
}

titre('CORRIDOR FRANCE → CAMEROUN');
const c = corridorFranceCameroun();
for (const e of c.etapes) {
  const marque = e.statut === 'officiel' ? '  ' : '~ ';
  P(`${marque}${e.libelle.padEnd(54)} ${eur(e.valeurEur).padStart(16)}  [${e.statut}]`);
}
P('');
P(`  Soit ${c.chantiersEquivalents.toLocaleString('fr-FR')} chantiers de 40 000 EUR, ` +
  `${eur(c.revenuAnnuelEur)} de revenu annuel à maturité.`);
P(`  ⚠ ${c.avertissement}`);

titre('TRAJECTOIRE');
const t = trajectoire();
P('  capture   flux capte        chantiers/an   revenu/an');
for (const p of t.paliers) {
  P(`  ${(p.tauxCapture * 100).toFixed(1).padStart(5)} %   ${eur(p.fluxEur).padStart(16)}   ` +
    `${String(p.chantiers).padStart(12)}   ${eur(p.revenuEur).padStart(12)}`);
}
P('');
P('  Corridors du meme flux camerounais, ouvrables sans changement de produit :');
for (const c of t.corridors) {
  P(`    ${c.nom.padEnd(24)} ${(c.part * 100).toFixed(0).padStart(3)} % du flux   ` +
    `${eur(c.adressableEur).padStart(14)} adressable   [${c.statut}]`);
}
P('');
P(`  ${t.note}`);

titre('REVENU PAR CHANTIER');
const f = fourchetteRevenu();
for (const [nom, r] of [['Borne basse', f.bas], ['Cas central du dossier', f.central], ['Borne haute', f.haut]]) {
  P(`${nom.padEnd(24)} ${eur(r.total).padStart(10)}   (${eur(r.montantEur)} sur ${r.dureeMois} mois)`);
  P(`${' '.repeat(24)} ${r.detail}`);
}

titre('UNITÉ ÉCONOMIQUE — cas central');
const u = uniteEconomique({ revenuTotalEur: f.central.total, dureeMois: 18 });
P(`Revenu total                ${eur(u.revenuTotalEur)}`);
P(`Coûts directs               ${eur(u.coutsDirects)}   (variable + 6 inspections)`);
P(`Marge brute                 ${eur(u.margeBrute)}   soit ${(u.tauxMarge * 100).toFixed(0)} %`);
P(`Coût d'acquisition visé     ${eur(u.coutAcquisitionEur)}`);
P(`Marge / acquisition         ${u.ratioMargeSurAcquisition.toFixed(1)}×`);
P(`Retour sur acquisition      ${u.moisAvantRetour.toFixed(1)} mois`);
P('');
P(`  ${u.verdict}`);

titre('SENSIBILITÉ AUX TROIS LEVIERS DE PRIX');
const s = sensibilite();
P('  séquestre   abonnement      revenu   marge brute');
for (const v of s.variations) {
  P(`  ${(v.tauxSequestre * 100).toFixed(1).padStart(6)} %   ${String(v.abonnementMensuelEur).padStart(6)} EUR   ` +
    `${eur(v.revenu).padStart(10)}   ${eur(v.margeBrute).padStart(10)}`);
}
P('');
P(`  Fourchette : ${eur(s.min)} à ${eur(s.max)} par chantier.`);

titre('COÛT DU MVP JUSQU\'À LA FINALE');
const m = coutMvp();
for (const p of m.postes) {
  P(`  ${p.poste.padEnd(32)} ${eur(p.total).padStart(9)}   ${p.note}`);
}
P(`  ${'TOTAL'.padEnd(32)} ${eur(m.total).padStart(9)}`);
P(`  ${(m.drone.poste + ' (optionnel)').padEnd(32)} ${eur(m.drone.total).padStart(9)}   ${m.drone.note}`);
P('');
P(`  ${m.phrase}`);

titre('CE QUE CES CHIFFRES NE SONT PAS');
P('  Les tarifs, la part immobilière et le taux de capture sont des HYPOTHÈSES');
P('  DE TRAVAIL. Aucun chantier pilote ne les a encore corrigés. Les présenter');
P('  comme des mesures serait le seul moyen sûr de perdre ce jury.');
P('');

if (silencieux) {
  const attendu = 1430;
  const obtenu = Math.round(f.central.total);
  if (obtenu !== attendu) {
    console.error(`econ: le cas central rend ${obtenu} EUR au lieu de ${attendu}`);
    process.exit(1);
  }
  console.log(`econ: cas central ${obtenu} EUR, marge ${Math.round(u.margeBrute)} EUR, ratio ${u.ratioMargeSurAcquisition.toFixed(1)}x`);
}

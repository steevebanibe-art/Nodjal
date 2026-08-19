// Console du donneur d'ordre.
//
// Aucune décision n'est prise ici. Cette page appelle le moteur et affiche ce
// qu'il rend — y compris quand il rend un refus. Si l'écran montre « conforme »,
// c'est que core/threat.js l'a conclu, pas que l'interface l'a décidé.

import {
  $, el, vider, api, fcfa, euros, pourcent, dateFr, ilYA,
  CLASSE_VERDICT, MOT_VERDICT, MOT_GRAVITE, tracerPlan,
} from '/shared/nodjal.js';

const etat = { projet: null, jalons: [], jalonActif: null, detail: null, etatSysteme: null };

// --------------------------------------------------------------- amorçage

async function demarrer() {
  etat.etatSysteme = await api('/etat');
  peindreBande(etat.etatSysteme);

  const { projets } = await api('/projets');
  if (!projets.length) {
    vider($('#racine')).append(el('p', { class: 'mention', texte: 'Aucun projet. Lancer « npm run seed ».' }));
    return;
  }
  await chargerProjet(projets[0].id);
}

function peindreBande(e) {
  const bande = vider($('#bande'));
  const actifs = e.composants.filter((c) => c.actif).length;
  bande.append(el('span', {}, [el('b', { texte: `${actifs}/${e.composants.length} composants actifs` })]));
  for (const c of e.composants.filter((x) => !x.actif)) {
    bande.append(el('span', { class: 'etat-off', title: c.note, texte: `○ ${c.composant}` }));
  }
  bande.append(
    el('span', {
      style: 'margin-left:auto',
      texte: e.audit.conforme ? `✓ ${e.audit.resume}` : `⚠ ${e.audit.resume}`,
    }),
  );
}

async function chargerProjet(id) {
  const donnees = await api(`/projets/${id}`);
  etat.projet = donnees.projet;
  etat.jalons = donnees.jalons;
  etat.avancement = donnees.avancement;
  etat.executant = donnees.executant;
  etat.rotation = donnees.rotation;
  if (!etat.jalonActif || !etat.jalons.some((j) => j.id === etat.jalonActif)) {
    const enCours = etat.jalons.find((j) => j.statut !== 'paye') || etat.jalons[0];
    etat.jalonActif = enCours.id;
  }
  await chargerJalon(etat.jalonActif);
}

async function chargerJalon(id) {
  etat.jalonActif = id;
  etat.detail = await api(`/jalons/${id}`);
  peindre();
}

// ----------------------------------------------------------------- rendu

function peindre() {
  const racine = vider($('#racine'));
  racine.append(enTete(), el('div', { class: 'atelier' }, [colonneGauche(), colonneDroite()]));
}

function enTete() {
  const p = etat.projet;
  const a = etat.avancement;
  return el('section', { class: 'pile pose pose-1', style: '--ecart:1.1rem' }, [
    el('div', { class: 'entre' }, [
      el('div', {}, [
        el('p', { class: 'chapeau chapeau--seul', texte: `${p.ville}, ${p.pays} · palier de séquestre ${p.palierSequestre}` }),
        el('h1', { style: 'font-size:clamp(1.7rem,1.2rem+1.9vw,2.5rem)', texte: p.libelle }),
        el('p', { class: 'mention', texte: `${p.adresse} · parcelle de ${p.superficieM2} m² · donneur d'ordre ${p.donneurOrdreNom} (${p.donneurOrdreResidence}) · exécutant ${p.executantNom}` }),
      ]),
      p.synthetique
        ? el('span', { class: 'sceau sceau--ocre', title: "Les clichés sont générés à partir d'une graine fixe." }, [
            'Jeu de démonstration', el('strong', { texte: 'Clichés synthétiques' }),
          ])
        : null,
    ]),
    el('div', { class: 'synthese' }, [
      bloc('Devis total', fcfa(p.devisTotal)),
      bloc('Libéré', fcfa(a.montantPaye)),
      bloc('Encore cantonné', fcfa(a.montantCantonne)),
      bloc('Avancement payé', pourcent(a.paye)),
      bloc('Fiabilité exécutant', etat.executant ? pourcent(etat.executant.noteFiabilite) : '—'),
    ]),
    el('div', { class: 'jauge' }, [el('i', { style: `width:${(a.paye * 100).toFixed(1)}%` })]),
    etat.rotation?.alerte
      ? el('p', { class: 'mention', style: 'color:var(--ocre)', texte: `⚠ ${etat.rotation.alerte}` })
      : null,
  ]);
}

const bloc = (titre, valeur) => el('div', {}, [el('span', { texte: titre }), el('strong', { texte: valeur })]);

function colonneGauche() {
  return el('div', { class: 'pile pose pose-2', style: '--ecart:1.2rem' }, [
    el('section', { class: 'carte' }, [
      el('p', { class: 'chapeau', texte: 'Registre des jalons' }),
      el('ul', { class: 'registre' }, etat.jalons.map(ligneJalon)),
    ]),
    panneauAttaques(),
    panneauJournal(),
  ]);
}

function ligneJalon(j) {
  const actif = j.id === etat.jalonActif;
  const classe = j.statut === 'paye' ? 'entree entree--paye' : actif ? 'entree entree--cours' : 'entree';
  return el('li', { class: classe }, [
    el('span', { class: 'entree__numero', texte: String(j.ordre) }),
    el('div', {}, [
      el('button', {
        class: 'entree__titre',
        style: 'background:none;border:0;padding:0;text-align:left;cursor:pointer;color:inherit;font:inherit;font-family:var(--display)',
        texte: j.libelle,
        onclick: () => chargerJalon(j.id),
      }),
      el('div', { class: 'entree__meta' }, [
        el('span', { class: 'machine', style: 'color:var(--encre-pale)', texte: fcfa(j.montant) }),
        el('span', {
          class: `pastille pastille--${j.statut === 'paye' ? 'ok' : j.analyse ? CLASSE_VERDICT[j.analyse.verdict] : 'eteinte'}`,
          texte: j.libelleStatut,
        }),
        j.preuves ? el('span', { class: 'mention', texte: `${j.preuves} pièce(s)` }) : null,
      ]),
    ]),
  ]);
}

function panneauAttaques() {
  const scenarios = Object.values(etat.etatSysteme.scenarios);
  return el('section', { class: 'carte' }, [
    el('p', { class: 'chapeau', texte: 'Scénarios d\'attaque' }),
    el('p', { class: 'mention', style: 'margin-bottom:.9rem', texte: "Chaque bouton dépose une vraie preuve frauduleuse et laisse le moteur la traiter. Rien n'est mis en scène : le verdict affiché est celui du moteur." }),
    el('div', { class: 'attaques' }, scenarios.map((s) =>
      el('button', {
        class: 'bouton bouton--menu',
        title: s.recit,
        // Le nom accessible doit être le libellé visible ; le récit reste en
        // infobulle, il n'est pas le nom du bouton.
        'aria-label': `${s.menace} — ${s.titre}`,
        onclick: (e) => jouerAttaque(s.menace, e.currentTarget),
      }, [`${s.menace} — ${s.titre}`]),
    )),
    el('p', { class: 'mention', style: 'margin-top:.9rem', texte: "Une preuve frauduleuse reste au dossier : c'est la règle du produit. Un jalon attaqué reste donc rejeté, et le bouton ci-dessous existe pour rejouer la démonstration, pas pour effacer une preuve." }),
    el('button', {
      class: 'bouton bouton--creux',
      style: 'margin-top:.6rem;width:100%;justify-content:center',
      texte: 'Remettre la démonstration à zéro',
      onclick: async (e) => {
        e.currentTarget.disabled = true;
        await api('/demonstration/reinitialiser', { method: 'POST', corps: {} });
        const { projets } = await api('/projets');
        etat.jalonActif = null;
        await chargerProjet(projets[0].id);
        await rafraichirJournal();
      },
    }),
  ]);
}

function panneauJournal() {
  return el('section', { class: 'carte' }, [
    el('div', { class: 'entre' }, [
      el('p', { class: 'chapeau chapeau--seul', texte: 'Journal chaîné' }),
      el('button', { class: 'bouton bouton--creux', style: 'padding:.34rem .6rem;font-size:.62rem', texte: 'Vérifier', onclick: verifierJournal }),
    ]),
    el('ul', { class: 'journal pile', id: 'journal', style: '--ecart:0;list-style:none;padding:0;margin:.8rem 0 0' }, [
      el('li', { class: 'mention', style: 'grid-template-columns:1fr', texte: 'Chargement…' }),
    ]),
  ]);
}

function colonneDroite() {
  const { jalon, projet, preuves, analyse, certificat, prisesManquantes, factures } = etat.detail;
  const photos = preuves.filter((p) => p.type === 'photo');

  return el('div', { class: 'pile pose pose-3', style: '--ecart:1.4rem', id: 'detail' }, [
    // --- Identification du jalon
    el('section', { class: 'carte pile', style: '--ecart:1rem' }, [
      el('div', { class: 'entre' }, [
        el('div', {}, [
          el('p', { class: 'chapeau chapeau--seul', texte: `Jalon ${jalon.ordre} sur ${etat.jalons.length} · ${fcfa(jalon.montant)}` }),
          el('h2', { style: 'font-size:1.5rem', texte: jalon.libelle }),
          el('p', { class: 'mention', style: 'margin-top:.35rem', texte: jalon.description || '' }),
        ]),
        el('span', {
          class: `pastille pastille--${analyse ? CLASSE_VERDICT[analyse.verdict] : 'eteinte'}`,
          texte: jalon.libelleStatut,
        }),
      ]),
      prisesManquantes.length
        ? el('p', { class: 'mention', style: 'color:var(--ocre)', texte: `Prises imposées manquantes : ${prisesManquantes.map((p) => p.libelle).join(', ')}.` })
        : el('p', { class: 'mention', style: 'color:var(--foret)', texte: `Les ${jalon.prisesRequises.length} prises imposées sont couvertes.` }),
      el('div', { class: 'rangee' }, [
        el('button', { class: 'bouton', id: 'btn-analyser', onclick: (e) => lancerAnalyse(e.currentTarget) }, ['Lancer l\'analyse']),
        el('button', {
          class: 'bouton bouton--creux',
          disabled: !analyse,
          onclick: (e) => emettreCertificat(e.currentTarget),
        }, ['Émettre le certificat']),
        el('button', {
          class: 'bouton bouton--foret',
          disabled: !(certificat && jalon.statut === 'analyse_conforme'),
          onclick: (e) => libererJalon(e.currentTarget),
        }, ['Libérer le jalon']),
      ]),
    ]),

    // --- Verdict
    analyse ? blocVerdict(analyse) : null,

    // --- Plan + preuves
    el('section', { class: 'duo' }, [
      el('div', { class: 'carte pile', style: '--ecart:.8rem' }, [
        el('p', { class: 'chapeau chapeau--seul', texte: 'Plan cadastral' }),
        (() => {
          const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
          svg.setAttribute('class', 'plan');
          queueMicrotask(() =>
            tracerPlan(svg, {
              parcelle: projet.parcelle,
              points: photos.map((p, i) => ({
                lat: p.gpsLat, lng: p.gpsLng, cap: p.cap,
                etiquette: p.priseDeVue || String(i + 1),
                hors: (analyse?.signaux || []).some(
                  (s) => s.code === 'hors_parcelle' && s.mesure && p.gpsLat && Math.abs(s.mesure.distanceM) > 25,
                ) && i === photos.length - 1,
              })),
            }),
          );
          return svg;
        })(),
        el('p', { class: 'mention', texte: 'Tracé depuis les coordonnées enregistrées. Pas de fond de carte tiers : c\'est un document, pas un GPS.' }),
      ]),
      el('div', { class: 'carte pile', style: '--ecart:.8rem' }, [
        el('p', { class: 'chapeau chapeau--seul', texte: `Pièces au dossier (${preuves.length})` }),
        el('div', { class: 'planches' }, preuves.slice(0, 8).map(planche)),
      ]),
    ]),

    // --- Signaux
    analyse ? blocSignaux(analyse) : null,

    // --- Matériaux
    analyse?.rapprochement ? blocMateriaux(analyse.rapprochement, factures) : null,

    // --- Certificat
    certificat ? blocCertificat(certificat) : null,
  ]);
}

function blocVerdict(a) {
  const classe = { conforme: '', a_instruire: ' verdict--instruire', rejete: ' verdict--rejet' }[a.verdict];
  return el('section', { class: `verdict${classe} pose` }, [
    el('h3', { texte: MOT_VERDICT[a.verdict] }),
    el('p', { style: 'margin-top:.5rem;max-width:none;font-size:.95rem', texte: a.motif }),
    el('div', { class: 'rangee', style: 'margin-top:.8rem' }, [
      ...a.familles.map((f) => el('span', { class: 'pastille pastille--ok', texte: f })),
      el('span', { class: 'mention', texte: `${a.compteurs.info + a.compteurs.attention + a.compteurs.alerte + a.compteurs.blocage} contrôles exécutés · analyse ${ilYA(a.faitLe)}` }),
    ]),
    a.vision?.actif === false
      ? el('p', { class: 'mention', style: 'margin-top:.7rem', texte: `Modèle de vision dormant (${a.vision.motif}). ${a.vision.remplacement || ''}` })
      : a.vision?.actif
        ? el('p', { class: 'mention', style: 'margin-top:.7rem', texte: `Vision ${a.vision.modele} : ${a.vision.observation.ouvrageIdentifie} Réserve : ${a.vision.observation.reserve}` })
        : null,
  ]);
}

function blocSignaux(a) {
  const ordre = { blocage: 0, alerte: 1, attention: 2, info: 3 };
  const tries = [...a.signaux].sort((x, y) => ordre[x.gravite] - ordre[y.gravite]);
  return el('section', { class: 'carte pile', style: '--ecart:.6rem' }, [
    el('div', { class: 'entre' }, [
      el('p', { class: 'chapeau chapeau--seul', texte: 'Contrôles exécutés' }),
      el('span', { class: 'mention', texte: `${a.compteurs.blocage} bloquant · ${a.compteurs.alerte} alerte · ${a.compteurs.attention} attention · ${a.compteurs.info} conforme` }),
    ]),
    el('div', {}, tries.map((s, i) =>
      el('div', { class: `signal signal--${s.gravite}`, style: `animation-delay:${Math.min(i * 45, 700)}ms` }, [
        el('span', { class: 'signal__marque', texte: s.menace ? `${s.menace} · ${MOT_GRAVITE[s.gravite]}` : MOT_GRAVITE[s.gravite] }),
        el('div', {}, [
          el('p', { class: 'signal__titre', texte: s.titre }),
          el('p', { class: 'signal__detail', texte: s.detail }),
        ]),
      ]),
    )),
  ]);
}

function blocMateriaux(r, factures) {
  return el('section', { class: 'carte pile', style: '--ecart:.8rem' }, [
    el('div', { class: 'entre' }, [
      el('p', { class: 'chapeau chapeau--seul', texte: 'Rapprochement matériaux (T6)' }),
      el('span', { class: `pastille pastille--${CLASSE_VERDICT[r.verdict]}`, texte: MOT_VERDICT[r.verdict] }),
    ]),
    el('p', { class: 'mention', texte: r.motif }),
    el('table', { class: 'tableau' }, [
      el('thead', {}, [el('tr', {}, [
        el('th', { texte: 'Fournisseur' }), el('th', { texte: 'N°' }),
        el('th', { texte: 'Postes' }), el('th', { class: 'num', texte: 'Montant' }),
      ])]),
      el('tbody', {}, factures.map((f) => {
        const total = (f.lignes || []).reduce((s, l) => s + (l.montant ?? l.quantite * l.prixUnitaire), 0);
        return el('tr', {}, [
          el('td', {}, [f.fournisseur, f.fournisseurRefId ? null : el('span', { class: 'mention', texte: ' — non référencé' })]),
          el('td', { class: 'machine', texte: f.numero }),
          el('td', { class: 'mention', texte: (f.lignes || []).map((l) => `${l.quantite} ${l.unite || ''} ${l.libelle}`).join(' · ') }),
          el('td', { class: 'num', texte: fcfa(total) }),
        ]);
      })),
    ]),
    el('p', { class: 'mention', texte: `Devis quantitatif ${fcfa(r.budgetDevis)} · factures ${fcfa(r.totalFacture)} · écart ${pourcent(r.ecartRelatif, 1)}` }),
  ]);
}

function blocCertificat(c) {
  return el('section', { class: 'carte carte--encre pile', style: '--ecart:.9rem' }, [
    el('div', { class: 'entre' }, [
      el('div', {}, [
        el('p', { class: 'chapeau chapeau--seul', style: 'color:rgba(246,243,236,.5)', texte: 'Certificat d\'avancement' }),
        el('h3', { class: 'machine', style: 'font-size:1.2rem;color:var(--papier)', texte: c.reference }),
      ]),
      el('a', { class: 'bouton bouton--foret', href: `/api/certificats/${c.reference}/pdf`, target: '_blank', rel: 'noopener' }, ['Ouvrir le PDF']),
    ]),
    el('div', { class: 'pile', style: '--ecart:.45rem' }, [
      ligneEmpreinte('Empreinte du manifeste', c.empreinteManifeste),
      ligneEmpreinte('Empreinte du PDF', c.empreintePdf),
      c.manifeste?.chainage?.empreintePrecedente
        ? ligneEmpreinte(`Chaîné au certificat ${c.manifeste.chainage.certificatPrecedent}`, c.manifeste.chainage.empreintePrecedente)
        : null,
    ]),
    el('p', { class: 'mention', texte: c.horodatage?.actif
      ? `Horodatage qualifié RFC 3161 par ${c.horodatage.prestataire}, date attestée ${c.horodatage.date}.`
      : `Horodatage qualifié non configuré (${c.horodatage?.motif}). Le certificat porte l'heure serveur seule, et il le dit.` }),
    el('div', { class: 'rangee' }, [
      el('button', { class: 'bouton bouton--creux', style: '--texte-bouton:var(--papier);background:transparent;border-color:rgba(246,243,236,.3)', texte: 'Vérifier le certificat', onclick: () => verifierCertificat(c.reference) }),
    ]),
  ]);
}

const ligneEmpreinte = (titre, valeur) =>
  el('div', {}, [
    el('span', { class: 'mention', style: 'color:rgba(246,243,236,.5);display:block', texte: titre }),
    el('code', { class: 'empreinte', style: 'color:rgba(246,243,236,.82)', texte: valeur }),
  ]);

function planche(p) {
  const image = p.type === 'photo'
    ? el('img', { src: `/api/preuves/${p.id}`, alt: `Prise de vue ${p.priseDeVue || ''}`, loading: 'lazy' })
    : el('div', { class: 'planche__vide', texte: p.type === 'video' ? 'panoramique 3 s' : p.type });
  return el('article', { class: 'planche' }, [
    image,
    el('dl', { class: 'planche__legende' }, [
      el('dt', { texte: p.priseDeVue ? 'Prise imposée' : 'Pièce' }),
      el('dd', { texte: p.priseDeVue || p.type }),
      el('dt', { texte: 'Heure serveur' }),
      el('dd', { class: 'machine', texte: dateFr(p.horodatageServeur) }),
      el('dt', { texte: 'SHA-256' }),
      el('dd', { class: 'machine', style: 'word-break:break-all', texte: p.sha256.slice(0, 24) + '…' }),
    ]),
  ]);
}

// ------------------------------------------------------------- actions

async function lancerAnalyse(bouton) {
  const initial = bouton.textContent;
  bouton.disabled = true;
  vider(bouton).append(el('span', { class: 'charge' }), ' Analyse…');
  try {
    await api(`/jalons/${etat.jalonActif}/analyser`, { method: 'POST', corps: {} });
    await chargerProjet(etat.projet.id);
    await rafraichirJournal();
  } catch (e) {
    alerter('Analyse impossible', e.message);
    bouton.disabled = false;
    vider(bouton).append(initial);
  }
}

async function emettreCertificat(bouton) {
  bouton.disabled = true;
  vider(bouton).append(el('span', { class: 'charge' }), ' Émission…');
  try {
    await api(`/jalons/${etat.jalonActif}/certifier`, { method: 'POST', corps: {} });
    await chargerProjet(etat.projet.id);
    await rafraichirJournal();
  } catch (e) {
    alerter('Émission impossible', e.message);
    bouton.disabled = false;
    vider(bouton).append('Émettre le certificat');
  }
}

async function libererJalon(bouton) {
  bouton.disabled = true;
  vider(bouton).append(el('span', { class: 'charge' }), ' Libération…');
  try {
    const r = await api(`/jalons/${etat.jalonActif}/liberer`, { method: 'POST', corps: {} });
    await chargerProjet(etat.projet.id);
    await rafraichirJournal();
    alerter('Jalon libéré', [
      el('p', { texte: `Instruction de paiement ${r.instruction.reference} pour ${fcfa(r.instruction.montant)}.` }),
      el('p', { class: 'mention', style: 'margin-top:.7rem', texte: r.instruction.canal }),
    ]);
  } catch (e) {
    alerter('Libération refusée', e.message);
    bouton.disabled = false;
    vider(bouton).append('Libérer le jalon');
  }
}

async function jouerAttaque(menace, bouton) {
  const initial = bouton.textContent;
  bouton.disabled = true;
  vider(bouton).append(el('span', { class: 'charge' }), ` ${menace} en cours…`);
  try {
    const r = await api(`/jalons/${etat.jalonActif}/attaque`, { method: 'POST', corps: { menace } });
    await chargerProjet(etat.projet.id);
    await rafraichirJournal();
    alerter(
      `${r.scenario.menace} — ${r.scenario.titre}`,
      [
        el('p', { texte: r.scenario.recit }),
        el('div', { class: `verdict${r.attrapee ? '' : ' verdict--instruire'}`, style: 'margin:1rem 0' }, [
          el('h3', { texte: r.attrapee ? 'Attaque interceptée' : 'Attaque non interceptée' }),
          el('p', { style: 'margin-top:.45rem;max-width:none', texte: r.analyse.motif }),
        ]),
        r.note ? el('p', { class: 'mention', texte: r.note }) : null,
        r.noteFichier ? el('p', { class: 'mention', texte: r.noteFichier }) : null,
        ...r.signauxDeclenches.map((s) =>
          el('div', { class: `signal signal--${s.gravite}` }, [
            el('span', { class: 'signal__marque', texte: `${s.menace} · ${MOT_GRAVITE[s.gravite]}` }),
            el('div', {}, [
              el('p', { class: 'signal__titre', texte: s.titre }),
              el('p', { class: 'signal__detail', texte: s.detail }),
            ]),
          ]),
        ),
        el('p', { class: 'mention', style: 'margin-top:1rem', texte: "La preuve frauduleuse reste au dossier. Une preuve ne s'efface pas : elle est annulée par une nouvelle preuve, ce qui permet de montrer la correction plutôt que de la cacher." }),
      ],
    );
  } catch (e) {
    alerter('Scénario impossible', e.message);
  } finally {
    bouton.disabled = false;
    vider(bouton).append(initial);
  }
}

async function verifierCertificat(reference) {
  const r = await api(`/certificats/${reference}/verifier`, { method: 'POST', corps: {} });
  alerter(`Vérification de ${reference}`, [
    el('div', { class: `verdict${r.conforme ? '' : ' verdict--rejet'}` }, [
      el('h3', { texte: r.conforme ? 'Certificat conforme' : 'Certificat altéré' }),
      el('p', { style: 'margin-top:.45rem;max-width:none', texte: `${r.piecesVerifiees} pièce(s) sur ${r.piecesAttendues} recalculée(s) depuis les fichiers d'origine.` }),
    ]),
    el('p', { class: 'mention', style: 'margin-top:1rem', texte: 'Empreinte recalculée du manifeste :' }),
    el('code', { class: 'empreinte', texte: r.empreinteRecalculee }),
    ...r.problemes.map((p) => el('p', { class: 'mention', style: 'color:var(--terre);margin-top:.6rem', texte: p.detail })),
  ]);
}

async function verifierJournal() {
  const { verification, total } = await api('/journal?limite=1');
  alerter('Intégrité du journal', [
    el('div', { class: `verdict${verification.conforme ? '' : ' verdict--rejet'}` }, [
      el('h3', { texte: verification.conforme ? 'Chaîne intacte' : 'Chaîne rompue' }),
      el('p', { style: 'margin-top:.45rem;max-width:none', texte: verification.detail }),
    ]),
    el('p', { class: 'mention', style: 'margin-top:1rem', texte: `${total} événement(s) enregistrés. Dernier maillon :` }),
    el('code', { class: 'empreinte', texte: verification.dernierHash || '—' }),
    el('p', { class: 'mention', style: 'margin-top:1rem', texte: "Chaque événement scelle le précédent. Retirer une ligne au milieu casse toutes les suivantes, et la vérification le montre en une seconde." }),
  ]);
}

async function rafraichirJournal() {
  const cible = $('#journal');
  if (!cible) return;
  const { entrees } = await api(`/journal?limite=40&projet=${etat.projet.id}`);
  vider(cible).append(
    ...entrees.map((e) =>
      el('li', {}, [
        el('time', { datetime: e.payload.horodatage, texte: dateFr(e.payload.horodatage).slice(0, 10) }),
        el('div', {}, [
          el('code', { texte: e.payload.type }),
          el('p', { class: 'mention', style: 'margin-top:.1rem', texte: resumerEvenement(e.payload) }),
        ]),
      ]),
    ),
  );
}

function resumerEvenement(p) {
  switch (p.type) {
    case 'preuve.deposee': return `${p.priseDeVue || 'pièce'} · ${p.octets} octets · ${p.sha256.slice(0, 12)}…`;
    case 'jalon.transition': return `${p.depuis} → ${p.vers} · ${p.acteur}`;
    case 'jalon.analyse': return `${p.verdict} · ${p.couverture} source(s) · ${p.familles?.join(', ') || ''}`;
    case 'certificat.emis': return `${p.reference} · ${p.verdict} · ${p.empreinteManifeste.slice(0, 12)}…`;
    case 'paiement.instruit': return `${fcfa(p.montant)} · ${p.reference}`;
    case 'demonstration.attaque': return `${p.menace} — ${p.titre}`;
    default: return p.note || p.motif || '';
  }
}

function alerter(titre, contenu) {
  const corps = vider($('#modale-corps'));
  corps.append(
    el('div', { class: 'entre', style: 'margin-bottom:1rem' }, [
      el('h3', { texte: titre }),
      el('button', { class: 'bouton bouton--creux', style: 'padding:.3rem .6rem', texte: 'Fermer', onclick: () => $('#modale').close() }),
    ]),
  );
  for (const c of [].concat(contenu)) {
    if (!c) continue;
    corps.append(c instanceof Node ? c : el('p', { texte: String(c) }));
  }
  $('#modale').showModal();
}

demarrer().then(rafraichirJournal).catch((e) => {
  vider($('#racine')).append(
    el('div', { class: 'carte' }, [
      el('h2', { texte: 'La console ne répond pas' }),
      el('p', { class: 'mention', style: 'margin-top:.6rem', texte: e.message }),
    ]),
  );
});

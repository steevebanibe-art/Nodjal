// Persistance.
//
// Deux regles gravees ici, pas dans une note de service :
//
//   1. AUCUNE PREUVE N'EST MODIFIABLE NI SUPPRIMABLE. Le magasin de preuves
//      n'expose ni ecriture ni effacement. Une preuve contestee est annulee PAR
//      UNE NOUVELLE PREUVE, jamais effacee. C'est ce qui rend la chaine
//      verifiable : un dossier ne peut pas maigrir en silence.
//
//   2. LE JOURNAL EST CHAINE ET EN AJOUT SEUL. Chaque evenement scelle le
//      precedent. Retirer une ligne au milieu casse toutes les suivantes, et la
//      verification le montre en une seconde.
//
// L'implementation est volontairement un systeme de fichiers plus du JSON. En
// production, c'est Postgres avec les memes contraintes exprimees en RLS et en
// declencheurs (voir supabase/migrations). Le point n'est pas le moteur, c'est
// que la contrainte soit dans la couche de donnees et non dans l'interface.

import { existsSync, mkdirSync, readFileSync, writeFileSync, appendFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { chain, sha256, verifyChain } from './hash.js';

export class PreuveImmuable extends Error {}

export class Magasin {
  constructor(racine) {
    this.racine = racine;
    this.cheminJournal = join(racine, 'journal.jsonl');
    this.cheminPreuves = join(racine, 'preuves');
    this.collections = new Map();
    for (const d of [racine, this.cheminPreuves]) mkdirSync(d, { recursive: true });
    this.charger();
  }

  // ---------------------------------------------------------- collections

  chemin(nom) { return join(this.racine, `${nom}.json`); }

  charger() {
    for (const nom of ['projets', 'jalons', 'preuves', 'certificats', 'executants', 'inspecteurs', 'fournisseurs', 'factures', 'analyses', 'listeAttente']) {
      const c = this.chemin(nom);
      this.collections.set(nom, existsSync(c) ? JSON.parse(readFileSync(c, 'utf8')) : []);
    }
  }

  ecrire(nom) {
    writeFileSync(this.chemin(nom), JSON.stringify(this.collections.get(nom), null, 2), 'utf8');
  }

  tous(nom) { return this.collections.get(nom) || []; }

  ou(nom, predicat) { return this.tous(nom).filter(predicat); }

  un(nom, predicat) { return this.tous(nom).find(predicat) || null; }

  parId(nom, id) { return this.un(nom, (x) => x.id === id); }

  /** Insere. Les preuves passent par deposerPreuve, pas par ici. */
  inserer(nom, objet) {
    if (nom === 'preuves') throw new PreuveImmuable('les preuves se deposent via deposerPreuve()');
    this.collections.get(nom).push(objet);
    this.ecrire(nom);
    return objet;
  }

  /** Modifie. Refuse categoriquement sur les preuves et les certificats. */
  modifier(nom, id, champs) {
    if (nom === 'preuves') {
      throw new PreuveImmuable(
        "une preuve ne se modifie pas. Deposez une preuve corrective : l'ancienne reste au dossier, " +
        'ce qui permet de montrer la correction plutot que de la cacher.',
      );
    }
    if (nom === 'certificats') {
      throw new PreuveImmuable("un certificat emis ne se modifie pas. Emettez-en un nouveau, chaine au precedent.");
    }
    const objet = this.parId(nom, id);
    if (!objet) throw new Error(`${nom}/${id} introuvable`);
    Object.assign(objet, champs);
    this.ecrire(nom);
    return objet;
  }

  // -------------------------------------------------------------- preuves

  /**
   * Depose une preuve. Le condensat est calcule ICI, sur les octets recus,
   * jamais fourni par le client. L'horodatage qui fait foi est celui du serveur.
   */
  deposerPreuve(metadonnees, contenu) {
    const sha = sha256(contenu);
    const fichier = join(this.cheminPreuves, `${sha}.bin`);
    if (existsSync(fichier)) {
      // Le meme fichier octet pour octet a deja ete recu. On ne le reecrit pas,
      // et l'information remonte : c'est un signal, pas une erreur.
      const existante = this.un('preuves', (p) => p.sha256 === sha);
      if (existante) return { preuve: existante, deja: true };
    } else {
      writeFileSync(fichier, contenu, { flag: 'wx' });
    }

    const preuve = {
      ...metadonnees,
      sha256: sha,
      octets: contenu.length,
      horodatageServeur: metadonnees.horodatageServeur || new Date().toISOString(),
      fichier: `${sha}.bin`,
    };
    this.collections.get('preuves').push(preuve);
    this.ecrire('preuves');
    this.journaliser({
      type: 'preuve.deposee',
      preuveId: preuve.id,
      jalonId: preuve.jalonId,
      projetId: preuve.projetId,
      sha256: sha,
      octets: contenu.length,
      priseDeVue: preuve.priseDeVue || null,
    });
    return { preuve, deja: false };
  }

  lirePreuve(sha) {
    const fichier = join(this.cheminPreuves, `${sha}.bin`);
    return existsSync(fichier) ? readFileSync(fichier) : null;
  }

  /**
   * Verifie que chaque preuve enregistree correspond toujours a son fichier.
   * C'est le controle d'integrite qu'un auditeur lance sur le dossier complet.
   */
  verifierPreuves() {
    const problemes = [];
    for (const p of this.tous('preuves')) {
      const contenu = this.lirePreuve(p.sha256);
      if (!contenu) { problemes.push({ preuveId: p.id, probleme: 'fichier absent' }); continue; }
      const recalcule = sha256(contenu);
      if (recalcule !== p.sha256) {
        problemes.push({ preuveId: p.id, probleme: `condensat different (${recalcule.slice(0, 16)})` });
      }
    }
    const orphelins = readdirSync(this.cheminPreuves)
      .filter((f) => f.endsWith('.bin'))
      .map((f) => f.replace('.bin', ''))
      .filter((sha) => !this.tous('preuves').some((p) => p.sha256 === sha));
    return {
      conforme: problemes.length === 0,
      controlees: this.tous('preuves').length,
      problemes,
      fichiersOrphelins: orphelins,
    };
  }

  // -------------------------------------------------------------- journal

  journaliser(evenement) {
    const precedent = this.dernierMaillon();
    const payload = { ...evenement, horodatage: evenement.horodatage || new Date().toISOString() };
    const entree = { index: precedent.index + 1, precedent: precedent.hash, payload, hash: chain(precedent.hash, payload) };
    appendFileSync(this.cheminJournal, JSON.stringify(entree) + '\n', 'utf8');
    this._dernier = entree;
    return entree;
  }

  dernierMaillon() {
    if (this._dernier) return this._dernier;
    const entrees = this.journal();
    this._dernier = entrees.length ? entrees[entrees.length - 1] : { index: -1, hash: '' };
    return this._dernier;
  }

  journal(filtre = null) {
    if (!existsSync(this.cheminJournal)) return [];
    const entrees = readFileSync(this.cheminJournal, 'utf8')
      .split('\n')
      .filter(Boolean)
      .map((l) => JSON.parse(l));
    return filtre ? entrees.filter(filtre) : entrees;
  }

  /** Verifie l'integrite du journal. Rend l'index du premier maillon casse, ou -1. */
  verifierJournal() {
    const entrees = this.journal();
    const casse = verifyChain(entrees);
    return {
      conforme: casse === -1,
      entrees: entrees.length,
      premierMaillonCasse: casse,
      dernierHash: entrees.length ? entrees[entrees.length - 1].hash : null,
      detail:
        casse === -1
          ? `${entrees.length} evenement(s), chaine intacte.`
          : `Chaine rompue au maillon ${casse}. Un evenement a ete modifie ou retire apres coup.`,
    };
  }

  // ------------------------------------------------------------- controle

  /** Controle complet du dossier : preuves et journal. */
  audit() {
    const preuves = this.verifierPreuves();
    const journal = this.verifierJournal();
    return {
      conforme: preuves.conforme && journal.conforme,
      preuves,
      journal,
      resume:
        preuves.conforme && journal.conforme
          ? `${preuves.controlees} preuve(s) et ${journal.entrees} evenement(s) verifies, aucun ecart.`
          : 'Ecart detecte. Voir le detail.',
    };
  }
}

let instance = null;

export function magasin(racine) {
  if (!instance || (racine && instance.racine !== racine)) {
    instance = new Magasin(racine || join(dirname(new URL(import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1'), '..', 'data'));
  }
  return instance;
}

// Serveur HTTP. Bibliotheque standard de Node, aucune dependance.
//
//   node server/server.js        →  http://127.0.0.1:8787
//
// Trois surfaces sur un seul processus :
//   /          la page publique (le lien exige par le formulaire ANE)
//   /console   l'espace du donneur d'ordre
//   /terrain   l'appli de terrain, version navigateur
//
// La version navigateur de l'appli terrain est un REPLI DE DEMONSTRATION, et
// l'ecran le dit : un navigateur ne peut pas savoir si la position est simulee.
// C'est precisement pour cela que la version de production est native.

import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { Magasin } from '../core/store.js';
import { semer, RACINE_DONNEES } from './seed.js';
import * as api from './api.js';
import { ErreurApi } from './api.js';
import { corridorFranceCameroun, fourchetteRevenu, uniteEconomique, sensibilite, coutMvp, SOURCES, TARIFS } from '../core/economics.js';

const ICI = dirname(fileURLToPath(import.meta.url));
const WEB = join(ICI, '..', 'web');
const PORT = Number(process.env.PORT || 8787);
// Les hebergeurs (Render, Railway, Fly, Docker) exigent une ecoute sur toutes
// les interfaces. En local on reste sur la boucle locale : un serveur de
// developpement ne doit pas etre joignable depuis le reseau par defaut.
const HOTE = process.env.HOST || (process.env.PORT ? '0.0.0.0' : '127.0.0.1');

const { m } = semer({ racine: RACINE_DONNEES });

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webmanifest': 'application/manifest+json',
  '.ico': 'image/x-icon',
};

const json = (res, code, corps) => {
  const texte = JSON.stringify(corps, null, 2);
  res.writeHead(code, {
    'content-type': 'application/json; charset=utf-8',
    'content-length': Buffer.byteLength(texte),
    'cache-control': 'no-store',
  });
  res.end(texte);
};

async function corpsJson(req, maxOctets = 24 * 1024 * 1024) {
  const morceaux = [];
  let total = 0;
  for await (const m of req) {
    total += m.length;
    if (total > maxOctets) throw new ErreurApi(413, 'charge trop volumineuse');
    morceaux.push(m);
  }
  if (!total) return {};
  try {
    return JSON.parse(Buffer.concat(morceaux).toString('utf8'));
  } catch {
    throw new ErreurApi(400, 'corps JSON illisible');
  }
}

const serveur = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const chemin = decodeURIComponent(url.pathname);

  try {
    if (chemin.startsWith('/api/')) return await routerApi(req, res, chemin, url);
    return await servirFichier(res, chemin);
  } catch (e) {
    if (e instanceof ErreurApi) return json(res, e.code, { erreur: e.message, detail: e.detail });
    console.error(`[${new Date().toISOString()}] ${chemin} :`, e);
    return json(res, 500, { erreur: 'erreur interne', message: e.message });
  }
});

// -------------------------------------------------------------------- API

async function routerApi(req, res, chemin, url) {
  const segments = chemin.split('/').filter(Boolean).slice(1); // retire « api »
  const [ressource, id, action, sous] = segments;

  // --- Etat des composants. Affiche en permanence par les trois interfaces.
  if (ressource === 'etat' && req.method === 'GET') {
    return json(res, 200, await api.etat(m));
  }

  if (ressource === 'projets') {
    if (!id && req.method === 'GET') {
      return json(res, 200, {
        projets: m.tous('projets').map(({ sel, ...p }) => ({
          ...p,
          jalons: m.ou('jalons', (j) => j.projetId === p.id).length,
        })),
      });
    }
    if (id && req.method === 'GET') return json(res, 200, api.projetComplet(m, id));
  }

  if (ressource === 'jalons' && id) {
    if (!action && req.method === 'GET') return json(res, 200, api.jalonComplet(m, id));

    if (action === 'preuves' && req.method === 'POST') {
      const corps = await corpsJson(req);
      if (!corps.contenuBase64) throw new ErreurApi(400, 'contenuBase64 requis');
      const contenu = Buffer.from(corps.contenuBase64, 'base64');
      const { preuve, deja } = api.deposerPreuve(m, { jalonId: id, contenu, declare: corps });
      return json(res, deja ? 200 : 201, { preuve, deja });
    }

    if (action === 'analyser' && req.method === 'POST') {
      const corps = await corpsJson(req);
      return json(res, 200, await api.analyserJalon(m, id, { avecVision: corps.avecVision !== false }));
    }

    if (action === 'certifier' && req.method === 'POST') {
      return json(res, 201, await api.certifierJalon(m, id));
    }

    if (action === 'liberer' && req.method === 'POST') {
      const corps = await corpsJson(req);
      return json(res, 200, api.libererJalon(m, id, corps));
    }

    if (action === 'attaque' && req.method === 'POST') {
      const corps = await corpsJson(req);
      return json(res, 200, await api.jouerScenario(m, id, corps.menace));
    }
  }

  if (ressource === 'preuves' && id && req.method === 'GET') {
    const preuve = m.parId('preuves', id) || m.un('preuves', (p) => p.sha256 === id);
    if (!preuve) throw new ErreurApi(404, 'preuve introuvable');
    const contenu = m.lirePreuve(preuve.sha256);
    if (!contenu) throw new ErreurApi(404, 'fichier absent');
    const type = preuve.type === 'certificat' ? 'application/pdf'
      : contenu[0] === 0xff ? 'image/jpeg'
      : contenu[0] === 0x89 ? 'image/png'
      : 'application/octet-stream';
    res.writeHead(200, {
      'content-type': type,
      'content-length': contenu.length,
      'cache-control': 'public, max-age=31536000, immutable',
      'x-nodjal-sha256': preuve.sha256,
    });
    return res.end(contenu);
  }

  if (ressource === 'certificats' && id) {
    if (action === 'pdf' && req.method === 'GET') {
      const pdf = api.pdfCertificat(m, id);
      res.writeHead(200, {
        'content-type': 'application/pdf',
        'content-length': pdf.length,
        'content-disposition': `inline; filename="${id}.pdf"`,
      });
      return res.end(pdf);
    }
    if (!action && req.method === 'GET') {
      const c = m.un('certificats', (x) => x.reference === id);
      if (!c) throw new ErreurApi(404, 'certificat introuvable');
      return json(res, 200, c);
    }
    if (action === 'verifier' && req.method === 'POST') {
      const c = m.un('certificats', (x) => x.reference === id);
      if (!c) throw new ErreurApi(404, 'certificat introuvable');
      const preuvesOrigine = c.manifeste.preuves
        .map((p) => ({ id: p.id, contenu: m.lirePreuve(p.sha256) }))
        .filter((p) => p.contenu);
      return json(res, 200, api.verifierCertificat({
        manifeste: c.manifeste,
        empreinteAnnoncee: c.empreinteManifeste,
        preuvesOrigine,
      }));
    }
  }

  if (ressource === 'journal' && req.method === 'GET') {
    const limite = Number(url.searchParams.get('limite') || 200);
    const projetId = url.searchParams.get('projet');
    let entrees = m.journal(projetId ? (e) => e.payload.projetId === projetId : null);
    entrees = entrees.slice(-limite).reverse();
    return json(res, 200, { entrees, total: m.journal().length, verification: m.verifierJournal() });
  }

  if (ressource === 'audit' && req.method === 'GET') return json(res, 200, m.audit());

  // Remise a zero du jeu de demonstration. Utile en repetition de pitch : les
  // scenarios d'attaque laissent volontairement leurs preuves au dossier, donc
  // un jalon attaque reste rejete. C'est le comportement voulu du produit ; ce
  // bouton existe pour rejouer la demonstration, pas pour effacer une preuve.
  if (ressource === 'demonstration' && id === 'reinitialiser' && req.method === 'POST') {
    const { semer: resemer } = await import('./seed.js');
    const { m: neuf } = resemer({ racine: RACINE_DONNEES, reinitialiser: true });
    Object.setPrototypeOf(m, Object.getPrototypeOf(neuf));
    Object.assign(m, neuf);
    return json(res, 200, { remis: true, audit: m.audit() });
  }

  if (ressource === 'economie' && req.method === 'GET') {
    return json(res, 200, {
      sources: SOURCES,
      tarifs: TARIFS,
      corridor: corridorFranceCameroun(),
      revenu: fourchetteRevenu(),
      unite: uniteEconomique({ revenuTotalEur: 1430, dureeMois: 18 }),
      sensibilite: sensibilite(),
      coutMvp: coutMvp(),
    });
  }

  if (ressource === 'liste-attente' && req.method === 'POST') {
    return json(res, 201, api.inscrireListeAttente(m, await corpsJson(req)));
  }

  throw new ErreurApi(404, `route inconnue : ${req.method} ${chemin}`);
}

// --------------------------------------------------------------- statique

const PAGES = { '/': 'landing', '/console': 'console', '/terrain': 'terrain' };

async function servirFichier(res, chemin) {
  let cible;
  if (PAGES[chemin]) {
    cible = join(WEB, PAGES[chemin], 'index.html');
  } else {
    const propre = normalize(chemin).replace(/^(\.\.[/\\])+/, '');
    cible = join(WEB, propre);
    if (!cible.startsWith(WEB)) throw new ErreurApi(403, 'chemin refuse');
  }

  try {
    const info = await stat(cible);
    if (info.isDirectory()) cible = join(cible, 'index.html');
    const contenu = await readFile(cible);
    res.writeHead(200, {
      'content-type': TYPES[extname(cible)] || 'application/octet-stream',
      'content-length': contenu.length,
      'cache-control': 'no-cache',
    });
    return res.end(contenu);
  } catch {
    const contenu = Buffer.from(
      '<!doctype html><meta charset="utf-8"><title>Introuvable</title>' +
      '<body style="font:16px/1.6 system-ui;max-width:34rem;margin:14vh auto;padding:0 1.5rem;color:#2A2721">' +
      '<p style="font-weight:600;letter-spacing:.14em;font-size:.72rem;color:#8B8375">NODJAL</p>' +
      '<h1 style="font-size:1.4rem;margin:.4rem 0 1rem">Page introuvable</h1>' +
      '<p><a href="/" style="color:#2F6B4F">La page publique</a> · ' +
      '<a href="/console" style="color:#2F6B4F">La console</a> · ' +
      '<a href="/terrain" style="color:#2F6B4F">L\'appli terrain</a></p>',
      'utf8',
    );
    res.writeHead(404, { 'content-type': TYPES['.html'], 'content-length': contenu.length });
    return res.end(contenu);
  }
}

serveur.listen(PORT, HOTE, async () => {
  const composants = (await api.etat(m)).composants;
  const actifs = composants.filter((c) => c.actif).length;
  console.log('');
  console.log('  NODJAL — Rien n\'est paye tant que rien n\'est prouve.');
  console.log('');
  const base = process.env.URL_PUBLIQUE || `http://${HOTE === '0.0.0.0' ? 'localhost' : HOTE}:${PORT}`;
  console.log(`  Page publique   ${base}/`);
  console.log(`  Console         ${base}/console`);
  console.log(`  Appli terrain   ${base}/terrain`);
  if (HOTE === '0.0.0.0') console.log(`  ${'[2m'}Ecoute sur toutes les interfaces (0.0.0.0:${PORT}).${'[0m'}`);
  console.log('');
  console.log(`  ${actifs} composant(s) actif(s) sur ${composants.length} :`);
  for (const c of composants) console.log(`    ${c.actif ? 'oui' : 'non'}  ${c.composant}`);
  console.log('');
  console.log(`  ${m.tous('projets').length} projet, ${m.tous('jalons').length} jalons, ${m.tous('preuves').length} preuves`);
  console.log(`  Audit : ${m.audit().resume}`);
  console.log('');
});

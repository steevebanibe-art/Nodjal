// Affectation des inspecteurs — contre-mesure T5.
//
// Le probleme n'est pas de trouver un inspecteur honnete. C'est de rendre la
// collusion impossible a organiser. Un executant qui sait qui viendra peut le
// convaincre. Un executant qui l'ignore ne le peut pas.
//
// Deux proprietes doivent tenir ensemble, et elles s'opposent :
//   - imprevisible pour l'executant, sinon la rotation ne protege de rien ;
//   - reproductible pour l'auditeur, sinon nous ne pouvons pas prouver que le
//     tirage n'a pas ete arrange apres coup.
//
// La solution est un tirage deterministe a partir d'un sel secret par projet.
// L'executant ne connait pas le sel : le tirage lui est opaque. L'auditeur, a
// qui le sel est communique en cas de litige, rejoue le tirage et verifie
// l'affectation. Un tirage veritablement aleatoire ne se verifie pas ; c'est
// pourquoi nous n'en utilisons pas.

import { hmac } from './hash.js';

/**
 * Tire un inspecteur pour un jalon.
 *
 * inspecteurs : [{ id, nom, zone, projetsDejaVus: [], executantsLies: [], actif }]
 * Rend { inspecteur, motif, candidats, rang } ou leve si aucun candidat.
 */
export function affecter({ projet, jalon, inspecteurs, sel }) {
  if (!sel) throw new Error('sel du projet requis : sans lui le tirage n\'est pas verifiable');

  const journal = [];
  const eligibles = inspecteurs.filter((i) => {
    if (i.actif === false) { journal.push({ id: i.id, exclu: 'inactif' }); return false; }
    if (i.zone && projet.zone && i.zone !== projet.zone) {
      journal.push({ id: i.id, exclu: `zone ${i.zone} hors de ${projet.zone}` });
      return false;
    }
    if ((i.projetsDejaVus || []).includes(projet.id)) {
      journal.push({ id: i.id, exclu: 'a deja visite ce projet' });
      return false;
    }
    if ((i.executantsLies || []).includes(projet.executantId)) {
      journal.push({ id: i.id, exclu: "lien declare avec l'executant" });
      return false;
    }
    return true;
  });

  if (!eligibles.length) {
    const e = new Error('aucun inspecteur eligible pour ce jalon');
    e.journal = journal;
    throw e;
  }

  // Classement par empreinte : imprevisible sans le sel, rejouable avec.
  const classes = eligibles
    .map((i) => ({ inspecteur: i, jeton: hmac(sel, `${projet.id}|${jalon.id}|${i.id}`) }))
    .sort((a, b) => (a.jeton < b.jeton ? -1 : 1));

  const retenu = classes[0].inspecteur;
  return {
    inspecteur: retenu,
    jeton: classes[0].jeton.slice(0, 16),
    rang: 1,
    candidats: eligibles.length,
    exclusions: journal,
    motif:
      `Tirage sur ${eligibles.length} inspecteur(s) eligible(s), ` +
      `${journal.length} ecarte(s). Reproductible a partir du sel du projet.`,
  };
}

/**
 * Rejoue une affectation. C'est la fonction qu'un auditeur execute en cas de
 * contestation, sel en main. Si elle ne rend pas le meme inspecteur, l'affectation
 * a ete forcee.
 */
export function verifierAffectation({ projet, jalon, inspecteurs, sel, inspecteurAttenduId }) {
  try {
    const { inspecteur } = affecter({ projet, jalon, inspecteurs, sel });
    return {
      conforme: inspecteur.id === inspecteurAttenduId,
      attendu: inspecteur.id,
      constate: inspecteurAttenduId,
    };
  } catch (e) {
    return { conforme: false, attendu: null, constate: inspecteurAttenduId, erreur: e.message };
  }
}

/**
 * Etat de rotation d'un projet : combien d'inspecteurs distincts sont deja
 * passes, et combien reste-t-il de tirages possibles. Un projet dont le vivier
 * s'epuise doit etre signale avant que la regle devienne inapplicable.
 */
export function etatRotation({ projet, inspecteurs, jalonsRestants }) {
  const dejaVenus = inspecteurs.filter((i) => (i.projetsDejaVus || []).includes(projet.id));
  const disponibles = inspecteurs.filter(
    (i) =>
      i.actif !== false &&
      (!i.zone || !projet.zone || i.zone === projet.zone) &&
      !(i.projetsDejaVus || []).includes(projet.id) &&
      !(i.executantsLies || []).includes(projet.executantId),
  );
  return {
    dejaVenus: dejaVenus.length,
    disponibles: disponibles.length,
    jalonsRestants,
    suffisant: disponibles.length >= jalonsRestants,
    alerte:
      disponibles.length < jalonsRestants
        ? `Vivier insuffisant : ${disponibles.length} inspecteur(s) disponible(s) pour ${jalonsRestants} jalon(s) restant(s). Recruter dans la zone ${projet.zone} avant le prochain jalon.`
        : null,
  };
}

// Analyse par modele de vision.
//
// Ce que ce module fait : il compare l'avancement DECLARE a l'avancement
// OBSERVE sur les cliches, et rend des observations structurees.
//
// Ce qu'il ne fait pas, et ce qu'il ne faut jamais dire : « notre IA detecte la
// fraude ». Cet enonce se demonte en une question. La formulation exacte est :
// le modele prepare le dossier, l'humain tranche, et le systeme rend la fraude
// plus couteuse que le travail.
//
// Sans cle configuree, ce module est DORMANT. Il ne fabrique pas d'analyse
// plausible : il rend { actif: false } et l'interface l'affiche en toutes
// lettres. Les six contre-mesures deterministes (geofence, cap, position
// simulee, hachage perceptuel, horloge serveur, rapprochement de factures)
// tournent sans lui — elles portent l'essentiel du faisceau. La vision ajoute
// une famille de preuve, elle n'en remplace aucune.

import { request } from 'node:https';

export const MODELE = 'claude-opus-5';
const VERSION_API = '2023-06-01';

/** Etats d'avancement observables, du plus faible au plus avance. */
const AVANCEMENTS = ['absent', 'prepare', 'commence', 'partiel', 'acheve', 'au_dela'];

const SCHEMA = {
  type: 'object',
  properties: {
    ouvrageIdentifie: {
      type: 'string',
      description: "Ce que montre reellement le cliche, en une phrase factuelle, sans interpretation.",
    },
    avancementObserve: {
      type: 'string',
      enum: AVANCEMENTS,
      description: "Etat d'avancement visible de l'ouvrage attendu pour ce jalon.",
    },
    coherenceAvecDeclare: {
      type: 'string',
      enum: ['coherent', 'en_deca', 'au_dela', 'indeterminable'],
      description: "L'avancement observe par rapport a celui que le jalon declare atteindre.",
    },
    elementsAttendusVus: {
      type: 'array',
      items: { type: 'string' },
      description: 'Elements du jalon effectivement visibles sur le cliche.',
    },
    elementsAttendusAbsents: {
      type: 'array',
      items: { type: 'string' },
      description: 'Elements du jalon attendus mais non visibles.',
    },
    indicesDeScenePlate: {
      type: 'array',
      items: { type: 'string' },
      description:
        "Indices que le cliche photographie un ecran ou un tirage plutot qu'une scene : moire, " +
        'reflets rectangulaires, bords d\'ecran, pixellisation reguliere, perspective plane. Liste vide si aucun.',
    },
    conditionsPriseDeVue: {
      type: 'string',
      description: 'Lumiere, meteo, heure apparente, obstacles. Sert a recouper avec l\'horodatage.',
    },
    qualiteExploitable: {
      type: 'boolean',
      description: "Le cliche permet-il de se prononcer ? Faux si flou, sous-expose, ou cadre trop serre.",
    },
    confiance: {
      type: 'number',
      description: 'Confiance dans le jugement porte, de 0 a 1.',
    },
    reserve: {
      type: 'string',
      description:
        "Ce que ce cliche ne permet PAS d'affirmer. Champ obligatoire : une analyse sans reserve " +
        'explicite est une analyse a laquelle on ne doit pas se fier.',
    },
  },
  required: [
    'ouvrageIdentifie', 'avancementObserve', 'coherenceAvecDeclare',
    'elementsAttendusVus', 'elementsAttendusAbsents', 'indicesDeScenePlate',
    'conditionsPriseDeVue', 'qualiteExploitable', 'confiance', 'reserve',
  ],
  additionalProperties: false,
};

const CONSIGNE =
  "Tu analyses un cliche de chantier pour un tiers de confiance qui libere des fonds jalon par jalon.\n\n" +
  "Ton role est d'OBSERVER, pas de conclure. Tu ne dis jamais si le paiement doit etre libere : un humain " +
  "tranche a partir de ton observation et de cinq autres familles de preuve independantes.\n\n" +
  "Regles :\n" +
  "- Decris ce que tu vois. Ne comble pas les manques par ce qui est probable.\n" +
  "- Si le cliche ne permet pas de se prononcer, dis-le : qualiteExploitable a faux, confiance basse.\n" +
  "- Le champ reserve est obligatoire et ne doit jamais etre vide. Un cliche montre toujours moins que " +
  "l'ouvrage entier ; ecris ce qu'il ne permet pas d'affirmer.\n" +
  "- N'accuse personne. Un ecart entre declare et observe a souvent une cause banale : un cadrage, une " +
  "phase intermediaire, une reprise en cours.";

/** La cle est-elle configuree ? */
export function configure() {
  return Boolean(process.env.ANTHROPIC_API_KEY);
}

/**
 * Analyse une prise de vue.
 *
 * @param {Buffer} image
 * @param {object} contexte { jalon, priseDeVue, projet }
 * @returns { actif: boolean, observation?, motif?, cout? }
 */
export async function analyser(image, contexte, options = {}) {
  const cle = options.cle || process.env.ANTHROPIC_API_KEY;
  if (!cle) {
    return {
      actif: false,
      motif: 'ANTHROPIC_API_KEY absent',
      remplacement:
        'Les six contre-mesures deterministes tournent sans le modele de vision. ' +
        'Le faisceau perd une famille de preuve, il ne perd pas sa validite.',
    };
  }

  const { jalon, priseDeVue, projet } = contexte;
  const typeImage = image[0] === 0xff && image[1] === 0xd8 ? 'image/jpeg' : 'image/png';

  const invite =
    `Chantier : ${projet?.libelle || 'non precise'}, ${projet?.ville || ''} ${projet?.pays || ''}.\n` +
    `Jalon declare atteint : « ${jalon.libelle} » (jalon ${jalon.ordre}, type ${jalon.type}).\n` +
    `Description du jalon : ${jalon.description || 'non fournie'}.\n` +
    `Elements attendus a ce stade : ${(jalon.elementsAttendus || []).join(', ') || 'non precises'}.\n` +
    `Prise de vue imposee : « ${priseDeVue?.libelle || 'libre'} »` +
    (typeof priseDeVue?.capAttendu === 'number' ? `, cap ${priseDeVue.capAttendu} degres.` : '.') +
    `\n\nAnalyse ce cliche selon le schema demande.`;

  const corps = {
    model: options.modele || MODELE,
    max_tokens: 2000,
    system: CONSIGNE,
    output_config: { format: { type: 'json_schema', schema: SCHEMA }, effort: 'medium' },
    messages: [
      {
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: typeImage, data: image.toString('base64') } },
          { type: 'text', text: invite },
        ],
      },
    ],
  };

  try {
    const reponse = await appeler(cle, corps, options.delaiMs || 45000);
    if (reponse.stop_reason === 'refusal') {
      return { actif: false, motif: 'le modele a decline la demande', details: reponse.stop_details };
    }
    const bloc = (reponse.content || []).find((b) => b.type === 'text');
    if (!bloc) return { actif: false, motif: 'reponse sans bloc texte' };
    const observation = JSON.parse(bloc.text);
    return {
      actif: true,
      modele: reponse.model,
      observation,
      cout: estimerCout(reponse.usage),
      usage: reponse.usage,
    };
  } catch (e) {
    return { actif: false, motif: `appel echoue : ${e.message}` };
  }
}

function appeler(cle, corps, delaiMs) {
  const charge = Buffer.from(JSON.stringify(corps), 'utf8');
  return new Promise((resoudre, rejeter) => {
    const req = request(
      {
        hostname: 'api.anthropic.com',
        path: '/v1/messages',
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          'x-api-key': cle,
          'anthropic-version': VERSION_API,
          'content-length': charge.length,
        },
        timeout: delaiMs,
      },
      (res) => {
        const morceaux = [];
        res.on('data', (m) => morceaux.push(m));
        res.on('end', () => {
          const texte = Buffer.concat(morceaux).toString('utf8');
          if (res.statusCode !== 200) return rejeter(new Error(`HTTP ${res.statusCode} : ${texte.slice(0, 240)}`));
          try { resoudre(JSON.parse(texte)); } catch (e) { rejeter(new Error('reponse illisible')); }
        });
      },
    );
    req.on('timeout', () => req.destroy(new Error(`delai depasse (${delaiMs} ms)`)));
    req.on('error', rejeter);
    req.end(charge);
  });
}

// Tarif public Claude Opus 5 : 5 USD par million de jetons en entree,
// 25 USD en sortie. Une photo de chantier coute quelques centimes.
const TARIF_ENTREE = 5 / 1e6;
const TARIF_SORTIE = 25 / 1e6;

function estimerCout(usage) {
  if (!usage) return null;
  const entree = (usage.input_tokens || 0) + (usage.cache_read_input_tokens || 0) * 0.1;
  const usd = entree * TARIF_ENTREE + (usage.output_tokens || 0) * TARIF_SORTIE;
  return { usd: Number(usd.toFixed(5)), jetonsEntree: usage.input_tokens, jetonsSortie: usage.output_tokens };
}

/**
 * Traduit une observation en signaux du modele de menace.
 * Separation volontaire : le modele observe, cette fonction qualifie. On peut
 * changer de modele sans toucher a la logique de risque, et relire la logique
 * de risque sans relire un prompt.
 */
export function signauxDepuisObservation(observation, { seuilConfiance = 0.55 } = {}) {
  const signaux = [];
  const familles = [];

  if (!observation.qualiteExploitable) {
    signaux.push({
      code: 'vision_inexploitable', menace: 'T4', gravite: 'attention', famille: 'scene',
      titre: 'Cliche juge inexploitable par le modele',
      detail: `${observation.ouvrageIdentifie} Reserve : ${observation.reserve}`,
      mesure: { confiance: observation.confiance },
    });
    return { signaux, familles };
  }

  if (observation.indicesDeScenePlate?.length) {
    signaux.push({
      code: 'vision_scene_plate', menace: 'T4', gravite: 'alerte', famille: 'scene',
      titre: 'Indices de photographie d\'ecran ou de tirage',
      detail: `${observation.indicesDeScenePlate.join(' ; ')}. A recouper avec le panoramique video.`,
      mesure: { indices: observation.indicesDeScenePlate.length },
    });
  }

  if (observation.confiance < seuilConfiance) {
    signaux.push({
      code: 'vision_peu_sure', menace: null, gravite: 'attention', famille: null,
      titre: 'Analyse peu sure',
      detail: `Confiance de ${(observation.confiance * 100).toFixed(0)} %, sous le seuil de ${(seuilConfiance * 100).toFixed(0)} %. Reserve : ${observation.reserve}`,
      mesure: { confiance: observation.confiance },
    });
    return { signaux, familles };
  }

  switch (observation.coherenceAvecDeclare) {
    case 'coherent':
      familles.push('vision');
      signaux.push({
        code: 'vision_coherente', menace: null, gravite: 'info', famille: 'vision',
        titre: "Avancement observe coherent avec l'avancement declare",
        detail: `${observation.ouvrageIdentifie} Elements vus : ${(observation.elementsAttendusVus || []).join(', ') || 'aucun detaille'}. Reserve : ${observation.reserve}`,
        mesure: { confiance: observation.confiance, avancement: observation.avancementObserve },
      });
      break;
    case 'en_deca':
      signaux.push({
        code: 'vision_en_deca', menace: null, gravite: 'alerte', famille: null,
        titre: "Avancement observe en deca du declare",
        detail: `${observation.ouvrageIdentifie} Manquent : ${(observation.elementsAttendusAbsents || []).join(', ') || 'non detaille'}. Reserve : ${observation.reserve}`,
        mesure: { confiance: observation.confiance, avancement: observation.avancementObserve },
      });
      break;
    case 'au_dela':
      familles.push('vision');
      signaux.push({
        code: 'vision_au_dela', menace: null, gravite: 'info', famille: 'vision',
        titre: "Avancement observe superieur au declare",
        detail: `${observation.ouvrageIdentifie} Le chantier a pris de l'avance sur le jalon en cours. Sans consequence sur la liberation.`,
        mesure: { confiance: observation.confiance },
      });
      break;
    default:
      signaux.push({
        code: 'vision_indeterminee', menace: null, gravite: 'attention', famille: null,
        titre: 'Le cliche ne permet pas de trancher',
        detail: observation.reserve,
        mesure: { confiance: observation.confiance },
      });
  }
  return { signaux, familles };
}

// Recupere les polices et les installe DANS le depot. Le projet affirme
// n'appeler aucune ressource distante : cette regle vaut aussi pour la
// typographie. On telecharge une fois, on sert depuis chez nous, et le site a
// exactement la meme allure sur le Windows de l'utilisateur, sur le Mac d'un
// jure et sur un telephone Android.
//
// On ne garde que les sous-ensembles latin et latin-ext : le francais n'a pas
// besoin du cyrillique ni du vietnamien, et chaque fichier evite pese.

import { writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0 Safari/537.36';
const RACINE = process.argv[2];
const DOSSIER = join(RACINE, 'web', 'shared', 'fonts');
mkdirSync(DOSSIER, { recursive: true });

const FAMILLES = [
  { q: 'Instrument+Serif:ital@0;1', slug: 'instrument-serif' },
  { q: 'Spectral:ital,wght@0,300;0,400;0,600;1,400', slug: 'spectral' },
  { q: 'IBM+Plex+Mono:wght@400;500', slug: 'plex-mono' },
];

const GARDES = new Set(['latin', 'latin-ext']);
const regles = [];
let total = 0;

for (const f of FAMILLES) {
  const css = await (await fetch(
    `https://fonts.googleapis.com/css2?family=${f.q}&display=swap`,
    { headers: { 'User-Agent': UA } },
  )).text();

  // Chaque bloc est precede d'un commentaire nommant son sous-ensemble.
  const blocs = css.split('/*').slice(1);
  for (const bloc of blocs) {
    const sousEnsemble = bloc.slice(0, bloc.indexOf('*/')).trim();
    if (!GARDES.has(sousEnsemble)) continue;

    const famille = /font-family:\s*'([^']+)'/.exec(bloc)?.[1];
    const style   = /font-style:\s*(\w+)/.exec(bloc)?.[1] || 'normal';
    const graisse = /font-weight:\s*(\d+)/.exec(bloc)?.[1] || '400';
    const url     = /src:\s*url\(([^)]+)\)/.exec(bloc)?.[1];
    const plage   = /unicode-range:\s*([^;]+);/.exec(bloc)?.[1]?.trim();
    if (!url) continue;

    const nom = `${f.slug}-${graisse}-${style}-${sousEnsemble}.woff2`;
    const octets = Buffer.from(await (await fetch(url, { headers: { 'User-Agent': UA } })).arrayBuffer());
    writeFileSync(join(DOSSIER, nom), octets);
    total += octets.length;
    console.log(`  ${String(octets.length).padStart(7)} o  ${nom}`);

    regles.push(
      `@font-face {\n` +
      `  font-family: '${famille}';\n` +
      `  font-style: ${style};\n` +
      `  font-weight: ${graisse};\n` +
      `  font-display: swap;\n` +
      `  src: url('/shared/fonts/${nom}') format('woff2');\n` +
      (plage ? `  unicode-range: ${plage};\n` : '') +
      `}`,
    );
  }
}

const entete = `/* ============================================================================
   NODJAL — les polices, servies depuis chez nous
   ----------------------------------------------------------------------------
   Aucune requete vers un tiers. Le projet parle d'argent confie et de photos
   geolocalisees de personnes : appeler un serveur de polices etranger a chaque
   visite serait une contradiction, et une inconstance visuelle de plus.

   Instrument Serif  le titre. Contraste fort, editorial, taille pour les
                     grands corps. C'est le visage de la marque.
   Spectral          le texte. Dessinee par Production Type, fonderie
                     francaise, pour la lecture a l'ecran. Chaleur documentaire.
   IBM Plex Mono     les mentions de registre : chapeaux, codes de menace,
                     empreintes, mesures du plan.

   Genere par outils/polices.js. Ne pas modifier a la main.
   ========================================================================== */

`;

writeFileSync(join(RACINE, 'web', 'shared', 'polices.css'), entete + regles.join('\n\n') + '\n');
console.log(`\n${regles.length} coupes, ${(total / 1024).toFixed(1)} ko au total`);

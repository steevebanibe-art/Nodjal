// Point d'entree du moteur. Tout ce que le serveur, l'appli terrain et les
// tests consomment passe par ici.

export * as hash from './hash.js';
export * as geo from './geo.js';
export * as image from './image.js';
export * as phash from './phash.js';
export * as exif from './exif.js';
export * as menace from './threat.js';
export * as jalon from './milestone.js';
export * as quantitatif from './quantitatif.js';
export * as inspecteur from './inspecteur.js';
export * as certificat from './certificate.js';
export * as tsa from './tsa.js';
export * as vision from './vision.js';
export * as economie from './economics.js';
export * as pdf from './pdf.js';
export * as ids from './ids.js';
export { Magasin, magasin } from './store.js';

/** Etat des composants optionnels. L'interface l'affiche en permanence. */
export async function etatComposants() {
  const { configure: visionConfiguree, MODELE } = await import('./vision.js');
  const { configure: tsaConfigure } = await import('./tsa.js');
  return [
    { composant: 'Moteur de preuve (geofence, cap, position simulee)', actif: true, note: 'deterministe, sans dependance' },
    { composant: 'Hachage perceptuel (T3)', actif: true, note: 'decodeur JPEG et PNG maison' },
    { composant: 'Lecture EXIF', actif: true, note: 'analyseur TIFF maison' },
    { composant: 'Rapprochement factures (T6)', actif: true, note: 'deterministe' },
    { composant: 'Rotation des inspecteurs (T5)', actif: true, note: 'tirage deterministe verifiable' },
    { composant: 'Certificat PDF + journal chaine', actif: true, note: 'generateur PDF maison' },
    { composant: 'Analyse par modele de vision', actif: visionConfiguree(), note: visionConfiguree() ? MODELE : 'ANTHROPIC_API_KEY absent — le module est dormant, il ne simule rien' },
    { composant: 'Horodatage qualifie RFC 3161', actif: tsaConfigure(), note: tsaConfigure() ? process.env.NODJAL_TSA_URL : 'NODJAL_TSA_URL absent — heure serveur seule' },
    { composant: 'Sequestre (palier 1 et 2)', actif: false, note: 'palier 0 en pilote : Nodjal autorise et trace, ne detient pas les fonds' },
  ];
}

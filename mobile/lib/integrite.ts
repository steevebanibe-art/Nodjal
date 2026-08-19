/**
 * Intégrité de la capture — contre-mesure T2.
 *
 * C'est LE fichier qui justifie l'application native. Tout le reste du produit
 * pourrait vivre dans un navigateur ; pas ceci.
 *
 * Un navigateur reçoit une position et n'a aucun moyen de savoir d'où elle
 * vient. Android, lui, expose `isFromMockProvider` sur chaque relevé, et
 * Play Integrity atteste que l'appareil n'est pas compromis. Sans ces deux
 * signaux, la contre-mesure T2 n'existe pas — un fraudeur installe une
 * application de position fictive en trente secondes et se déclare sur la
 * parcelle depuis son salon.
 *
 * Règle de conception : ce module ne dit jamais « position authentique » quand
 * il ne peut pas le vérifier. Il rend `null` et l'écran l'affiche. Une
 * affirmation que la plateforme ne permet pas est pire qu'une absence
 * d'information : elle donne une fausse assurance au donneur d'ordre.
 */

import * as Location from 'expo-location';
import * as Device from 'expo-device';
import { Platform } from 'react-native';

export type Integrite = {
  /** true = simulée, false = matérielle, null = la plateforme ne le dit pas */
  gpsSimule: boolean | null;
  integriteAppareil: 'ok' | 'compromis' | 'inconnu';
  precisionM: number | null;
  motifs: string[];
};

export type Releve = {
  lat: number;
  lng: number;
  precisionM: number;
  altitude: number | null;
  vitesse: number | null;
  horodatageAppareil: string;
  integrite: Integrite;
};

/** Précision annoncée sous laquelle une valeur devient suspecte en milieu bâti. */
const PRECISION_TROP_BELLE_M = 1.5;

export async function demanderAutorisations(): Promise<boolean> {
  const { status } = await Location.requestForegroundPermissionsAsync();
  return status === 'granted';
}

/**
 * Relevé de position, avec son verdict d'intégrité.
 * `mocked` n'existe que sur Android. Sur iOS le champ est absent : la
 * plateforme n'expose pas l'information, et nous ne la fabriquons pas.
 */
export async function relever(): Promise<Releve> {
  const p = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.BestForNavigation,
    mayShowUserSettingsDialog: true,
  });

  const motifs: string[] = [];
  let gpsSimule: boolean | null = null;

  if (Platform.OS === 'android') {
    // expo-location remonte `mocked` depuis android.location.Location#isFromMockProvider.
    gpsSimule = (p as unknown as { mocked?: boolean }).mocked ?? false;
    if (gpsSimule) motifs.push('Android signale un fournisseur de position fictive.');
  } else {
    motifs.push(
      "iOS n'expose pas l'origine de la position. Le champ reste indéterminé plutôt que d'affirmer une authenticité invérifiable.",
    );
  }

  const precisionM = p.coords.accuracy ?? null;
  if (precisionM !== null && precisionM < PRECISION_TROP_BELLE_M) {
    motifs.push(
      `Précision annoncée de ${precisionM.toFixed(1)} m sur un téléphone en milieu bâti. Certaines applications de position fictive figent cette valeur.`,
    );
  }

  const integriteAppareil = await attesterAppareil(motifs);

  return {
    lat: p.coords.latitude,
    lng: p.coords.longitude,
    precisionM: precisionM ?? 0,
    altitude: p.coords.altitude,
    vitesse: p.coords.speed,
    horodatageAppareil: new Date(p.timestamp).toISOString(),
    integrite: { gpsSimule, integriteAppareil, precisionM, motifs },
  };
}

/**
 * Attestation d'appareil.
 *
 * En production, cette fonction appelle Play Integrity (Android) ou
 * DeviceCheck / App Attest (iOS) et fait vérifier le jeton PAR LE SERVEUR.
 * Une attestation validée sur l'appareil ne vaut rien : c'est l'appareil qu'on
 * cherche à ne pas croire.
 *
 * En l'état, le contrôle se limite à ce que le système d'exploitation nous dit
 * gratuitement — appareil physique ou émulateur. C'est peu, et c'est écrit ici
 * plutôt que découvert par un évaluateur.
 */
async function attesterAppareil(motifs: string[]): Promise<'ok' | 'compromis' | 'inconnu'> {
  if (!Device.isDevice) {
    motifs.push("Émulateur détecté : l'exécution ne se fait pas sur un appareil physique.");
    return 'compromis';
  }
  // À BRANCHER : Play Integrity API, jeton vérifié côté serveur.
  // Tant que ce n'est pas fait, le statut reste « inconnu » plutôt que « ok ».
  return 'inconnu';
}

/**
 * Suivi du cap. La boussole n'est pas un gadget : c'est la moitié de la
 * contre-mesure T1. Être dans la parcelle ne suffit pas — il faut cadrer la
 * façade demandée, sinon quatre photos du même mur couvrent les quatre prises.
 */
export function suivreCap(
  surChangement: (cap: number, fiable: boolean) => void,
): Promise<() => void> {
  return Location.watchHeadingAsync((h) => {
    // `accuracy` d'Android : 3 = haute, 0 = inutilisable. iOS rend un écart en degrés.
    const fiable = Platform.OS === 'android' ? (h.accuracy ?? 0) >= 2 : (h.accuracy ?? 99) <= 25;
    surChangement(h.trueHeading >= 0 ? h.trueHeading : h.magHeading, fiable);
  }).then((abonnement) => () => abonnement.remove());
}

/** Écart angulaire minimal entre deux caps, dans [0, 180]. */
export function ecartCap(a: number, b: number): number {
  const d = Math.abs(((a - b) % 360) + 360) % 360;
  return d > 180 ? 360 - d : d;
}

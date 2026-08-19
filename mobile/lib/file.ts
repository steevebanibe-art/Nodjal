/**
 * File d'attente hors ligne.
 *
 * Écrite dès le premier jour, pas à la fin. C'est structurant : une file
 * d'attente s'ajoute mal après coup, parce qu'elle change la façon dont tout le
 * reste traite les erreurs. Et c'est le moment de démonstration qui fait taire
 * la salle — mode avion, photo prise, réseau rétabli, tout se synchronise.
 *
 * Les utilisateurs sont sur des Android d'entrée de gamme, en 3G intermittente,
 * sous le soleil de Douala. Une application qui exige le réseau au moment du
 * déclenchement ne sera pas utilisée.
 *
 * Deux garanties :
 *   — rien ne se perd : le fichier est copié dans le stockage de l'application
 *     avant d'entrer en file, donc vider le cache de l'appareil photo ne casse
 *     rien ;
 *   — rien ne se dédouble : une entrée n'est retirée qu'après acquittement du
 *     serveur, et le serveur reconnaît un fichier déjà reçu à son condensat.
 */

import * as SQLite from 'expo-sqlite';
import * as FileSystem from 'expo-file-system';

const base = SQLite.openDatabaseSync('nodjal.db');

export type EntreeFile = {
  id: number;
  jalonId: string;
  priseDeVue: string | null;
  cheminLocal: string;
  metadonnees: string;
  tentatives: number;
  derniereErreur: string | null;
  empileeLe: string;
};

export function initialiser(): void {
  base.execSync(`
    pragma journal_mode = WAL;
    create table if not exists file (
      id integer primary key autoincrement,
      jalon_id text not null,
      prise_de_vue text,
      chemin_local text not null,
      metadonnees text not null,
      tentatives integer not null default 0,
      derniere_erreur text,
      empilee_le text not null
    );
    create index if not exists file_ordre on file (id);
  `);
}

const DOSSIER = `${FileSystem.documentDirectory}preuves/`;

/**
 * Empile une prise de vue.
 * Le fichier est D'ABORD copié dans le stockage de l'application. Le cache de
 * l'appareil photo est purgé par le système sans prévenir ; s'y référer
 * reviendrait à perdre des preuves.
 */
export async function empiler(
  jalonId: string,
  uriSource: string,
  metadonnees: Record<string, unknown>,
): Promise<number> {
  await FileSystem.makeDirectoryAsync(DOSSIER, { intermediates: true }).catch(() => {});
  const nom = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.jpg`;
  const cheminLocal = DOSSIER + nom;
  await FileSystem.copyAsync({ from: uriSource, to: cheminLocal });

  const r = base.runSync(
    `insert into file (jalon_id, prise_de_vue, chemin_local, metadonnees, empilee_le)
     values (?, ?, ?, ?, ?)`,
    jalonId,
    (metadonnees.priseDeVue as string) ?? null,
    cheminLocal,
    JSON.stringify(metadonnees),
    new Date().toISOString(),
  );
  return r.lastInsertRowId;
}

export function enAttente(): EntreeFile[] {
  return base.getAllSync<EntreeFile>(
    `select id, jalon_id as jalonId, prise_de_vue as priseDeVue, chemin_local as cheminLocal,
            metadonnees, tentatives, derniere_erreur as derniereErreur, empilee_le as empileeLe
     from file order by id`,
  );
}

export function compter(): number {
  return base.getFirstSync<{ n: number }>('select count(*) as n from file')?.n ?? 0;
}

/**
 * Vidange la file dans l'ordre d'empilement.
 *
 * Deux comportements distincts, et la distinction compte :
 *   — panne de réseau  → on s'arrête et on réessaiera plus tard ;
 *   — refus du serveur → on retire l'entrée et on le signale, plutôt que de
 *     boucler indéfiniment sur une preuve qu'il n'acceptera jamais.
 */
export async function vidanger(
  base_url: string,
  jeton: string,
  surEvenement?: (e: { type: 'envoyee' | 'refusee' | 'reportee'; entree: EntreeFile; message?: string }) => void,
): Promise<{ envoyees: number; refusees: number; restantes: number }> {
  let envoyees = 0;
  let refusees = 0;

  for (const entree of enAttente()) {
    let contenuBase64: string;
    try {
      contenuBase64 = await FileSystem.readAsStringAsync(entree.cheminLocal, {
        encoding: FileSystem.EncodingType.Base64,
      });
    } catch {
      // Fichier disparu du stockage : l'entrée n'est plus honorable.
      base.runSync('delete from file where id = ?', entree.id);
      refusees++;
      surEvenement?.({ type: 'refusee', entree, message: 'fichier local introuvable' });
      continue;
    }

    try {
      const reponse = await fetch(`${base_url}/api/jalons/${entree.jalonId}/preuves`, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${jeton}` },
        body: JSON.stringify({ ...JSON.parse(entree.metadonnees), contenuBase64 }),
      });

      if (reponse.ok) {
        base.runSync('delete from file where id = ?', entree.id);
        await FileSystem.deleteAsync(entree.cheminLocal, { idempotent: true });
        envoyees++;
        surEvenement?.({ type: 'envoyee', entree });
        continue;
      }

      if (reponse.status >= 400 && reponse.status < 500 && reponse.status !== 429) {
        const corps = await reponse.text();
        base.runSync('delete from file where id = ?', entree.id);
        refusees++;
        surEvenement?.({ type: 'refusee', entree, message: corps.slice(0, 200) });
        continue;
      }

      throw new Error(`HTTP ${reponse.status}`);
    } catch (e) {
      base.runSync(
        'update file set tentatives = tentatives + 1, derniere_erreur = ? where id = ?',
        String((e as Error).message).slice(0, 200),
        entree.id,
      );
      surEvenement?.({ type: 'reportee', entree, message: (e as Error).message });
      break; // réseau indisponible : inutile d'insister sur les suivantes
    }
  }

  return { envoyees, refusees, restantes: compter() };
}

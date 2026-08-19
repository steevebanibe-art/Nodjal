-- Nodjal — socle de données.
--
-- Le point de ce fichier n'est pas de créer des tables. C'est d'exprimer les
-- invariants du produit DANS LA COUCHE DE DONNÉES, là où aucune interface, aucun
-- correctif pressé et aucun développeur bien intentionné ne peut les contourner.
--
-- Trois invariants, trois mécanismes :
--   1. Une preuve ne se modifie ni ne s'efface  → déclencheur + RLS sans UPDATE/DELETE
--   2. Le journal est chaîné et en ajout seul   → déclencheur qui calcule le maillon
--   3. Un inspecteur ne revient jamais          → contrainte d'unicité, pas une consigne
--
-- Le prototype (core/store.js) applique exactement les mêmes règles sur des
-- fichiers. Le moteur n'est pas le sujet ; l'invariant l'est.

create extension if not exists "pgcrypto";
create extension if not exists "postgis";

-- ============================================================ énumérations

create type nodjal.statut_jalon as enum (
  'a_faire', 'preuves_deposees', 'analyse_a_instruire', 'analyse_rejetee',
  'analyse_conforme', 'conteste', 'valide_donneur_ordre', 'paye', 'annule'
);

create type nodjal.type_preuve as enum ('photo', 'video', 'facture', 'rapport_inspecteur', 'image_sat', 'certificat', 'document');
create type nodjal.verdict as enum ('conforme', 'a_instruire', 'rejete');
create type nodjal.gravite as enum ('info', 'attention', 'alerte', 'blocage');
create type nodjal.nature_poste as enum ('materiau', 'main_oeuvre', 'location', 'etude', 'forfait');

-- ================================================================ acteurs

create table nodjal.donneurs_ordre (
  id            uuid primary key default gen_random_uuid(),
  auth_id       uuid unique references auth.users on delete set null,
  nom           text not null,
  residence     text,
  telephone_hache text,           -- HMAC salé : le clair ne touche jamais la base
  cree_le       timestamptz not null default now()
);

create table nodjal.executants (
  id              uuid primary key default gen_random_uuid(),
  auth_id         uuid unique references auth.users on delete set null,
  raison_sociale  text not null,
  responsable     text,
  ville           text,
  zone            text not null,
  -- Historique de fiabilité : la donnée que personne ne possède aujourd'hui sur
  -- la construction africaine, et l'actif de phase 2.
  jalons_valides  integer not null default 0,
  jalons_rejetes  integer not null default 0,
  litiges         integer not null default 0,
  note_fiabilite  numeric(4,3) generated always as (
    case when jalons_valides + jalons_rejetes = 0 then null
         else jalons_valides::numeric / (jalons_valides + jalons_rejetes) end
  ) stored,
  cree_le         timestamptz not null default now()
);

create table nodjal.inspecteurs (
  id        uuid primary key default gen_random_uuid(),
  auth_id   uuid unique references auth.users on delete set null,
  nom       text not null,
  zone      text not null,
  metier    text,
  actif     boolean not null default true,
  cree_le   timestamptz not null default now()
);

create table nodjal.fournisseurs (
  id            uuid primary key default gen_random_uuid(),
  nom           text not null,
  ville         text,
  bas_carbone   boolean not null default false,
  reference_le  date not null default current_date
);

-- ================================================================ projets

create table nodjal.projets (
  id                 uuid primary key default gen_random_uuid(),
  libelle            text not null,
  adresse            text not null,
  ville              text not null,
  pays               text not null,
  zone               text not null,
  parcelle_geom      geography(polygon, 4326) not null,
  superficie_m2      numeric generated always as (st_area(parcelle_geom)) stored,
  donneur_ordre_id   uuid not null references nodjal.donneurs_ordre,
  executant_id       uuid not null references nodjal.executants,
  devis_total        bigint not null check (devis_total > 0),
  devise             char(3) not null default 'XAF',
  palier_sequestre   smallint not null default 0 check (palier_sequestre between 0 and 2),
  -- Sel du tirage d'inspecteur. Jamais exposé par l'API ; communiqué à un
  -- auditeur en cas de litige, pour qu'il rejoue le tirage et le vérifie.
  sel_tirage         text not null default encode(gen_random_bytes(24), 'hex'),
  ouvert_le          timestamptz not null default now(),
  clos_le            timestamptz
);

create index on nodjal.projets using gist (parcelle_geom);
create index on nodjal.projets (donneur_ordre_id);
create index on nodjal.projets (executant_id);

-- ================================================================= jalons

create table nodjal.jalons (
  id             uuid primary key default gen_random_uuid(),
  projet_id      uuid not null references nodjal.projets on delete cascade,
  ordre          smallint not null,
  type           text not null,
  libelle        text not null,
  description    text,
  montant        bigint not null check (montant > 0),
  statut         nodjal.statut_jalon not null default 'a_faire',
  prises_requises jsonb not null default '[]'::jsonb,
  elements_attendus text[] not null default '{}',
  ouvert_le      timestamptz,
  paye_le        timestamptz,
  unique (projet_id, ordre)
);

create index on nodjal.jalons (projet_id, ordre);

-- Le total des jalons ne peut pas dépasser le devis. Vérifié par déclencheur
-- plutôt que par l'application : une règle d'argent n'a rien à faire dans une
-- couche qu'on peut oublier d'appeler.
create or replace function nodjal.verifier_somme_jalons() returns trigger
language plpgsql as $$
declare total bigint; devis bigint;
begin
  select coalesce(sum(montant), 0) into total from nodjal.jalons
    where projet_id = new.projet_id and id <> coalesce(new.id, gen_random_uuid());
  select devis_total into devis from nodjal.projets where id = new.projet_id;
  if total + new.montant > devis then
    raise exception 'somme des jalons (%) supérieure au devis du projet (%)', total + new.montant, devis;
  end if;
  return new;
end $$;

create trigger jalons_somme before insert or update of montant on nodjal.jalons
  for each row execute function nodjal.verifier_somme_jalons();

-- ================================================== devis quantitatif

create table nodjal.postes_devis (
  id            uuid primary key default gen_random_uuid(),
  jalon_id      uuid not null references nodjal.jalons on delete cascade,
  code          text not null,
  nature        nodjal.nature_poste not null default 'materiau',
  libelle       text not null,
  unite         text,
  quantite      numeric not null check (quantite > 0),
  prix_unitaire bigint not null check (prix_unitaire >= 0),
  montant       bigint generated always as ((quantite * prix_unitaire)::bigint) stored,
  unique (jalon_id, code)
);

comment on column nodjal.postes_devis.nature is
  'Seuls les postes « materiau » entrent dans le rapprochement fournisseur. '
  'La main d''oeuvre n''a pas de facture fournisseur : la comparer aux factures '
  'matériaux produit un écart négatif énorme et sans aucun sens.';

-- ================================================================ preuves

create table nodjal.preuves (
  id                  uuid primary key default gen_random_uuid(),
  jalon_id            uuid not null references nodjal.jalons on delete restrict,
  projet_id           uuid not null references nodjal.projets on delete restrict,
  type                nodjal.type_preuve not null,
  prise_de_vue        text,
  session_id          text,
  -- Empreintes : calculées par la fonction d'ingestion, jamais fournies par le client.
  sha256              char(64) not null,
  phash               char(16),
  octets              integer not null check (octets > 0),
  chemin_stockage     text not null,
  -- Ce que l'appareil déclare. Conservé comme déclaration, pas comme fait.
  position_geom       geography(point, 4326),
  precision_m         numeric,
  gps_simule          boolean,
  integrite_appareil  text,
  cap                 numeric check (cap >= 0 and cap < 360),
  horodatage_appareil timestamptz,
  appareil_modele     text,
  exif                jsonb,
  surface             text not null default 'inconnue',
  -- Ce qui fait foi.
  horodatage_serveur  timestamptz not null default now(),
  annule_par          uuid references nodjal.preuves,   -- annulation, jamais effacement
  motif_annulation    text
);

create index on nodjal.preuves (jalon_id);
create index on nodjal.preuves (projet_id);
create index on nodjal.preuves (phash) where phash is not null;
create unique index preuves_sha_unique on nodjal.preuves (projet_id, sha256);

comment on column nodjal.preuves.horodatage_serveur is
  'L''horodatage qui fait foi. Celui de l''appareil est enregistré uniquement '
  'pour mesurer l''écart : un décalage anormal est en soi un signal.';

comment on column nodjal.preuves.annule_par is
  'Une preuve contestée est ANNULÉE PAR UNE NOUVELLE PREUVE, jamais effacée. '
  'C''est ce qui rend la chaîne vérifiable : un dossier ne peut pas maigrir en silence.';

-- --- Invariant 1 : immuabilité.
create or replace function nodjal.preuve_immuable() returns trigger
language plpgsql as $$
begin
  if tg_op = 'DELETE' then
    raise exception 'une preuve ne s''efface pas. Déposez une preuve corrective : '
                    'l''ancienne reste au dossier, ce qui permet de montrer la correction '
                    'plutôt que de la cacher.';
  end if;
  -- Seul le marquage d'annulation peut évoluer. Tout le reste est figé.
  if row(new.*) is distinct from row(old.*) then
    if new.sha256 is distinct from old.sha256
       or new.phash is distinct from old.phash
       or new.octets is distinct from old.octets
       or new.chemin_stockage is distinct from old.chemin_stockage
       or new.horodatage_serveur is distinct from old.horodatage_serveur
       or new.position_geom is distinct from old.position_geom
       or new.exif is distinct from old.exif
       or new.jalon_id is distinct from old.jalon_id then
      raise exception 'une preuve ne se modifie pas (champ figé altéré sur %)', old.id;
    end if;
  end if;
  return new;
end $$;

create trigger preuves_immuables before update or delete on nodjal.preuves
  for each row execute function nodjal.preuve_immuable();

-- ================================================================ analyses

create table nodjal.analyses (
  id            uuid primary key default gen_random_uuid(),
  jalon_id      uuid not null references nodjal.jalons on delete cascade,
  projet_id     uuid not null references nodjal.projets on delete cascade,
  verdict       nodjal.verdict not null,
  motif         text not null,
  familles      text[] not null default '{}',
  volets        text[] not null default '{}',
  couverture    smallint not null,
  signaux       jsonb not null default '[]'::jsonb,
  rapprochement jsonb,
  inspection    jsonb,
  vision        jsonb,
  fait_le       timestamptz not null default now()
);

create index on nodjal.analyses (jalon_id, fait_le desc);

-- ============================================================ certificats

create table nodjal.certificats (
  id                    uuid primary key default gen_random_uuid(),
  reference             text not null unique,
  projet_id             uuid not null references nodjal.projets on delete restrict,
  jalon_id              uuid not null references nodjal.jalons on delete restrict,
  verdict               nodjal.verdict not null,
  manifeste             jsonb not null,
  empreinte_manifeste   char(64) not null,
  empreinte_pdf         char(64) not null,
  chemin_pdf            text not null,
  jeton_horodatage      text,               -- RFC 3161, null si non configuré
  horodatage_atteste    timestamptz,
  prestataire_horodatage text,
  precedent_id          uuid references nodjal.certificats,  -- chaînage
  emis_le               timestamptz not null default now()
);

create or replace function nodjal.certificat_immuable() returns trigger
language plpgsql as $$
begin
  raise exception 'un certificat émis ne se modifie ni ne s''efface. '
                  'Émettez-en un nouveau, chaîné au précédent.';
end $$;

create trigger certificats_immuables before update or delete on nodjal.certificats
  for each row execute function nodjal.certificat_immuable();

-- ============================================== inspections et rotation

create table nodjal.inspections (
  id            uuid primary key default gen_random_uuid(),
  projet_id     uuid not null references nodjal.projets on delete cascade,
  jalon_id      uuid not null references nodjal.jalons on delete cascade,
  inspecteur_id uuid not null references nodjal.inspecteurs,
  jeton_tirage  text not null,
  candidats     smallint not null,
  affecte_le    timestamptz not null default now(),
  visite_le     timestamptz,
  rapport       jsonb,

  -- Invariant 3 : un inspecteur ne revient JAMAIS sur un chantier.
  -- La règle de rotation est une contrainte d'unicité, pas une consigne. Aucun
  -- correctif pressé ne peut la contourner sans supprimer cette ligne, et
  -- supprimer cette ligne se voit en revue.
  unique (projet_id, inspecteur_id)
);

create table nodjal.liens_inspecteur_executant (
  inspecteur_id uuid not null references nodjal.inspecteurs on delete cascade,
  executant_id  uuid not null references nodjal.executants on delete cascade,
  motif         text not null,
  declare_le    timestamptz not null default now(),
  primary key (inspecteur_id, executant_id)
);

-- ================================================================ factures

create table nodjal.factures (
  id                uuid primary key default gen_random_uuid(),
  jalon_id          uuid not null references nodjal.jalons on delete cascade,
  projet_id         uuid not null references nodjal.projets on delete cascade,
  fournisseur       text not null,
  fournisseur_id    uuid references nodjal.fournisseurs,
  numero            text not null,
  date_facture      date,
  lignes            jsonb not null default '[]'::jsonb,
  total             bigint not null,
  deposee_le        timestamptz not null default now(),
  -- Une même facture ne peut pas être rapprochée deux fois sur un projet.
  unique (projet_id, fournisseur, numero)
);

-- ================================================= journal chaîné

create table nodjal.journal (
  index_maillon bigserial primary key,
  type          text not null,
  projet_id     uuid references nodjal.projets on delete set null,
  jalon_id      uuid references nodjal.jalons on delete set null,
  acteur        text not null default 'systeme',
  charge        jsonb not null,
  precedent     char(64) not null,
  hash          char(64) not null,
  horodatage    timestamptz not null default now()
);

-- Invariant 2 : le maillon est calculé par la base, pas par l'application.
-- Une application peut se tromper ou mentir ; un déclencheur BEFORE INSERT non.
create or replace function nodjal.chainer_journal() returns trigger
language plpgsql as $$
declare dernier char(64);
begin
  select hash into dernier from nodjal.journal order by index_maillon desc limit 1;
  new.precedent := coalesce(dernier, 'genese');
  new.hash := encode(
    digest(new.precedent || E'\n' || encode(digest(new.charge::text, 'sha256'), 'hex'), 'sha256'),
    'hex'
  );
  return new;
end $$;

create trigger journal_chaine before insert on nodjal.journal
  for each row execute function nodjal.chainer_journal();

create or replace function nodjal.journal_immuable() returns trigger
language plpgsql as $$
begin
  raise exception 'le journal est en ajout seul. Retirer ou modifier un maillon '
                  'casserait tous les suivants, et la vérification le montrerait.';
end $$;

create trigger journal_ajout_seul before update or delete on nodjal.journal
  for each row execute function nodjal.journal_immuable();

-- Vérification de la chaîne. C'est la fonction qu'un auditeur exécute.
create or replace function nodjal.verifier_journal()
returns table (premier_maillon_casse bigint, entrees bigint, conforme boolean)
language plpgsql as $$
declare attendu char(64) := 'genese'; ligne record; casse bigint := null; n bigint := 0;
begin
  for ligne in select * from nodjal.journal order by index_maillon loop
    n := n + 1;
    if casse is null then
      if ligne.precedent <> attendu or ligne.hash <> encode(
        digest(ligne.precedent || E'\n' || encode(digest(ligne.charge::text, 'sha256'), 'hex'), 'sha256'), 'hex')
      then
        casse := ligne.index_maillon;
      end if;
      attendu := ligne.hash;
    end if;
  end loop;
  return query select casse, n, casse is null;
end $$;

-- ============================================================ liste d'attente

create table nodjal.liste_attente (
  id          uuid primary key default gen_random_uuid(),
  ville       text not null,
  corridor    text not null,
  motif       text,
  -- Aucune adresse en clair tant qu'aucune politique de conservation n'est écrite.
  courriel_hache text,
  source      text,
  inscrit_le  timestamptz not null default now()
);

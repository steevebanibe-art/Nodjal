-- Nodjal — sécurité au niveau des lignes.
--
-- Le principe : un donneur d'ordre à Cergy ne doit jamais pouvoir lire le
-- chantier d'un autre, et un exécutant à Douala ne doit jamais pouvoir modifier
-- une preuve, même la sienne, même avec un jeton valide.
--
-- Notez ce qui manque volontairement dans tout ce fichier : il n'existe AUCUNE
-- politique `for update` ni `for delete` sur `preuves`, `certificats` et
-- `journal`. Ce n'est pas un oubli. Sans politique, PostgreSQL refuse par
-- défaut — l'immuabilité est donc obtenue par l'absence de règle, doublée du
-- déclencheur de la migration 0001. Deux verrous indépendants, et le second
-- reste actif même si quelqu'un ajoute une politique par mégarde.

alter table nodjal.donneurs_ordre  enable row level security;
alter table nodjal.executants      enable row level security;
alter table nodjal.inspecteurs     enable row level security;
alter table nodjal.projets         enable row level security;
alter table nodjal.jalons          enable row level security;
alter table nodjal.postes_devis    enable row level security;
alter table nodjal.preuves         enable row level security;
alter table nodjal.analyses        enable row level security;
alter table nodjal.certificats     enable row level security;
alter table nodjal.inspections     enable row level security;
alter table nodjal.factures        enable row level security;
alter table nodjal.journal         enable row level security;
alter table nodjal.liste_attente   enable row level security;

-- ============================================================== fonctions

create or replace function nodjal.donneur_ordre_courant() returns uuid
language sql stable security definer set search_path = nodjal, public as $$
  select id from nodjal.donneurs_ordre where auth_id = auth.uid()
$$;

create or replace function nodjal.executant_courant() returns uuid
language sql stable security definer set search_path = nodjal, public as $$
  select id from nodjal.executants where auth_id = auth.uid()
$$;

create or replace function nodjal.inspecteur_courant() returns uuid
language sql stable security definer set search_path = nodjal, public as $$
  select id from nodjal.inspecteurs where auth_id = auth.uid()
$$;

/**
 * Un acteur voit-il ce projet ?
 * Trois portes : le donneur d'ordre, l'exécutant, et l'inspecteur affecté —
 * ce dernier uniquement pour les jalons sur lesquels il a été tiré.
 */
create or replace function nodjal.voit_projet(p uuid) returns boolean
language sql stable security definer set search_path = nodjal, public as $$
  select exists (
    select 1 from nodjal.projets pr
    where pr.id = p and (
      pr.donneur_ordre_id = nodjal.donneur_ordre_courant()
      or pr.executant_id = nodjal.executant_courant()
      or exists (
        select 1 from nodjal.inspections i
        where i.projet_id = p and i.inspecteur_id = nodjal.inspecteur_courant()
      )
    )
  )
$$;

-- ================================================================ lecture

create policy projets_lecture on nodjal.projets
  for select using (nodjal.voit_projet(id));

create policy jalons_lecture on nodjal.jalons
  for select using (nodjal.voit_projet(projet_id));

create policy postes_lecture on nodjal.postes_devis
  for select using (exists (select 1 from nodjal.jalons j where j.id = jalon_id and nodjal.voit_projet(j.projet_id)));

create policy preuves_lecture on nodjal.preuves
  for select using (nodjal.voit_projet(projet_id));

create policy analyses_lecture on nodjal.analyses
  for select using (nodjal.voit_projet(projet_id));

create policy certificats_lecture on nodjal.certificats
  for select using (nodjal.voit_projet(projet_id));

create policy factures_lecture on nodjal.factures
  for select using (nodjal.voit_projet(projet_id));

create policy journal_lecture on nodjal.journal
  for select using (projet_id is null or nodjal.voit_projet(projet_id));

-- L'inspecteur ne voit que ses propres affectations. Il ne peut pas savoir
-- qui d'autre est passé sur le chantier : la rotation perd son intérêt si les
-- inspecteurs peuvent se coordonner.
create policy inspections_lecture on nodjal.inspections
  for select using (
    inspecteur_id = nodjal.inspecteur_courant()
    or exists (
      select 1 from nodjal.projets pr
      where pr.id = projet_id and pr.donneur_ordre_id = nodjal.donneur_ordre_courant()
    )
  );

-- ================================================================ écriture

-- Une preuve s'insère, et c'est tout. L'exécutant dépose sur ses propres
-- chantiers, l'inspecteur sur les jalons où il a été tiré.
create policy preuves_depot on nodjal.preuves
  for insert with check (
    exists (
      select 1 from nodjal.projets pr
      where pr.id = projet_id and pr.executant_id = nodjal.executant_courant()
    )
    or exists (
      select 1 from nodjal.inspections i
      where i.jalon_id = preuves.jalon_id and i.inspecteur_id = nodjal.inspecteur_courant()
    )
  );

-- Aucune politique `for update` ni `for delete` sur nodjal.preuves.
-- Aucune politique `for update` ni `for delete` sur nodjal.certificats.
-- Aucune politique `for update` ni `for delete` sur nodjal.journal.
-- Voir l'en-tête : l'absence est la règle.

create policy factures_depot on nodjal.factures
  for insert with check (
    exists (
      select 1 from nodjal.projets pr
      where pr.id = projet_id and pr.executant_id = nodjal.executant_courant()
    )
  );

-- La transition d'état d'un jalon passe par une fonction, jamais par un UPDATE
-- direct : les gardes de la machine à états doivent s'exécuter.
create or replace function nodjal.liberer_jalon(p_jalon uuid, p_motif text default null)
returns nodjal.jalons
language plpgsql security definer set search_path = nodjal, public as $$
declare j nodjal.jalons; c nodjal.certificats;
begin
  select * into j from nodjal.jalons where id = p_jalon for update;
  if j.id is null then raise exception 'jalon introuvable'; end if;

  if not exists (
    select 1 from nodjal.projets pr
    where pr.id = j.projet_id and pr.donneur_ordre_id = nodjal.donneur_ordre_courant()
  ) then
    raise exception 'seul le donneur d''ordre peut libérer un jalon';
  end if;

  if j.statut <> 'analyse_conforme' then
    raise exception 'le jalon est au statut %, la libération exige « analyse_conforme »', j.statut;
  end if;

  select * into c from nodjal.certificats where jalon_id = p_jalon order by emis_le desc limit 1;
  if c.id is null then raise exception 'aucun certificat d''avancement émis'; end if;
  if c.verdict <> 'conforme' then raise exception 'le dernier certificat conclut « % »', c.verdict; end if;

  update nodjal.jalons set statut = 'valide_donneur_ordre' where id = p_jalon;
  insert into nodjal.journal (type, projet_id, jalon_id, acteur, charge)
    values ('jalon.transition', j.projet_id, p_jalon, 'donneur_ordre',
            jsonb_build_object('depuis', j.statut, 'vers', 'valide_donneur_ordre',
                               'certificat', c.reference, 'motif', p_motif));

  update nodjal.jalons set statut = 'paye', paye_le = now() where id = p_jalon returning * into j;
  insert into nodjal.journal (type, projet_id, jalon_id, acteur, charge)
    values ('paiement.instruit', j.projet_id, p_jalon, 'donneur_ordre',
            jsonb_build_object('montant', j.montant, 'certificat', c.reference,
                               'canal', 'palier 0 : instruction transmise, aucun fonds ne transite par Nodjal'));

  update nodjal.executants set jalons_valides = jalons_valides + 1
    where id = (select executant_id from nodjal.projets where id = j.projet_id);

  return j;
end $$;

revoke all on function nodjal.liberer_jalon(uuid, text) from public;
grant execute on function nodjal.liberer_jalon(uuid, text) to authenticated;

-- La liste d'attente accepte les dépôts anonymes et ne se relit pas.
create policy attente_depot on nodjal.liste_attente for insert to anon, authenticated with check (true);

# Nodjal — reprise de session

**À coller en début de nouvelle conversation Claude Code**, ouverte dans
`C:\Users\STEEVE BNB\Downloads\Nouveau dossier\nodjal`.

---

## Où on en est

Projet **Nodjal** — candidature ANE 2026 (African Next Entrepreneurs, finale le
24 octobre à Paris). Tiers de confiance pour l'argent de la diaspora : séquestre
par jalons + preuve d'exécution, corridor France → Cameroun.

Le moteur, les trois interfaces (page publique, console, appli terrain), le
socle Supabase et les fondations mobiles sont écrits. **72 tests passent.**
10 200+ lignes, zéro dépendance externe (`node --test` suffit).

```bash
node --test "tests/*.test.js"    # doit rendre 72 pass, 0 fail
node tools/demo.js --attaques    # démo complète en terminal
node server/server.js            # les trois interfaces en local
```

## Dernière tâche en cours — NON TERMINÉE

L'utilisateur a demandé si l'app était en ligne. Réponse : non, elle tournait en
`127.0.0.1` uniquement (invisible depuis l'extérieur, y compris son propre
téléphone). C'est **bloquant pour ANE** : le formulaire exige un lien web.

Hébergeur choisi par l'utilisateur : **Render, via un dépôt GitHub.**

Fait, côté code :
- `HOST`/`PORT` lus depuis l'environnement, écoute sur `0.0.0.0` si `PORT` est
  défini (comme le font Render/Railway/Fly), sinon reste sur `127.0.0.1` en
  local par défaut. Vérifié : `node --check server/server.js` passe, et
  `node server/server.js` sans variables d'env écoute toujours sur
  `127.0.0.1:8787` comme avant.
- Log de démarrage qui affiche l'URL publique si `URL_PUBLIQUE` est fournie.
- `.gitignore` ajouté : `data/` est exclu (c'est le magasin régénéré par
  `server/seed.js` → `semer()` à chaque démarrage, pas une source à
  versionner).
- `render.yaml` ajouté (Blueprint Render : `npm install` puis `npm start`,
  plan free, Node 20).
- Dépôt git initialisé en local (`nodjal/`) avec un premier commit. **Pas de
  remote GitHub encore** — la machine n'a ni `gh`, ni `git` configuré au
  départ, ni de CLI d'hébergeur (`flyctl`, `railway`). Créer un compte GitHub
  ou Render dépasse ce que Claude peut faire pour l'utilisateur (création de
  compte = action interdite) : c'est à lui de le faire.

**Ce qui reste à faire, dans l'ordre — à la charge de l'utilisateur, Claude
peut guider pas à pas :**

1. Créer un dépôt GitHub (public ou privé, les deux marchent avec Render) et y
   pousser `nodjal/` :
   ```bash
   git remote add origin https://github.com/<utilisateur>/nodjal.git
   git branch -M main
   git push -u origin main
   ```
2. Créer un compte sur [render.com](https://render.com) (peut se faire avec le
   compte GitHub), puis « New + Blueprint », pointer vers le dépôt : Render
   lit `render.yaml` tout seul et propose `npm install` / `npm start`.
3. Lancer le déploiement. Noter l'URL `https://nodjal-xxxx.onrender.com`
   attribuée par Render (ou un domaine personnalisé si l'utilisateur en met un
   dans les réglages du service).
4. **Rappel stockage** (à redire avant que l'utilisateur ne s'étonne) : sur le
   plan free de Render, le disque n'est pas persistant entre redéploiements —
   chaque redémarrage reseed le jeu de démo de base via `semer()`, mais perd
   les scénarios d'attaque joués en direct. Comportement voulu, pas un bug.
5. Domaine / URL finale à coller dans le formulaire ANE et dans
   `docs/formulaire-ane.md` (champ « lien vers site web »).
6. Mettre à jour `README.md` avec l'URL en ligne une fois confirmée.

## Autres points en attente (non bloquants, notés dans README.md)

- Écrire à `ane@abclub-paris.com` — date limite de candidature inconnue.
- Recherche d'antériorité INPI/OAPI sur « Nodjal », classes 36 et 42.
- Lettre d'intention avec un établissement de paiement agréé (palier 1 du
  séquestre — actuellement palier 0, Nodjal trace mais ne détient pas les
  fonds).
- Play Integrity non branché côté mobile (`mobile/lib/integrite.ts` le dit
  explicitement, rend `'inconnu'` plutôt que `'ok'`).
- Horodatage RFC 3161 dormant sans `NODJAL_TSA_URL`.
- Modèle de vision dormant sans `ANTHROPIC_API_KEY`.

## Repères utiles pour la reprise

- **Fichier à lire en premier** : `core/threat.js` (modèle de menace T1–T6).
- **Deux bugs réels trouvés et corrigés en session précédente** :
  rapprochement facture/devis qui comparait matériaux à un devis
  main-d'œuvre-comprise (`core/quantitatif.js` → `estMateriau`), et échec
  d'affectation d'inspecteur avalé en silence (maintenant bloquant dans
  `core/threat.js`).
- **Six scénarios d'attaque jouables** depuis la console (`server/api.js` →
  `jouerScenario`) — chacun dépose une vraie preuve frauduleuse.
- Détail complet du produit, du pitch et du formulaire : `README.md`,
  `docs/pitch-5-minutes.md`, `docs/formulaire-ane.md`.

---

**Message à envoyer dans la nouvelle conversation :**

> Reprends le projet Nodjal. Lis `docs/REPRISE.md` pour le contexte, puis
> termine le déploiement en ligne du serveur (section « dernière tâche en
> cours »).

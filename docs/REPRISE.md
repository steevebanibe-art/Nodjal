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

J'ai commencé à rendre `server/server.js` déployable :
- `HOST`/`PORT` lus depuis l'environnement, écoute sur `0.0.0.0` si `PORT` est
  défini (comme le font Render/Railway/Fly), sinon reste sur `127.0.0.1` en
  local par défaut.
- Log de démarrage qui affiche l'URL publique si `URL_PUBLIQUE` est fournie.

**Ce qui reste à faire, dans l'ordre :**

1. **Vérifier** que `node --check server/server.js` passe et que le serveur
   démarre toujours correctement en local (`node server/server.js` sans
   variables d'env → doit encore écouter sur 127.0.0.1 comme avant).
2. **Choisir un hébergeur gratuit/simple** et déployer réellement. Le plus
   direct pour un serveur Node stdlib sans dépendance : **Render** (free tier,
   `node server/server.js` comme start command, `PORT` auto-injecté) ou
   **Railway**. Éviter Vercel/Netlify (pensés serverless, pas un process HTTP
   long qui garde un magasin de fichiers en mémoire/disque).
3. **Attention au stockage** : `core/store.js` écrit sur disque
   (`data/journal.jsonl`, `data/preuves/*.bin`, etc.). Sur la plupart des PaaS
   gratuits, le disque n'est **pas persistant** entre redéploiements (parfois
   même entre requêtes sur du serverless). Pour la démo ANE, c'est acceptable
   *si* le jeu de données est reseedé au démarrage (`server/seed.js` le fait
   déjà via `semer()` appelé dans `server.js`) — donc un redémarrage perd les
   scénarios d'attaque joués mais pas le jeu de démo de base. À dire
   explicitement à l'utilisateur avant de déployer, pas à découvrir après.
4. **Domaine / URL finale** à coller dans le formulaire ANE et dans
   `docs/formulaire-ane.md` (champ « lien vers site web »).
5. Mettre à jour `README.md` avec l'URL en ligne une fois confirmée.

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

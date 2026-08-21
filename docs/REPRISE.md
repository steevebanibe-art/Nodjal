# Nodjal — reprise de session

**À coller en début de nouvelle conversation Claude Code**, ouverte dans
`C:\Users\STEEVE BNB\Downloads\Nouveau dossier\nodjal`.

---

## Le site est en ligne

**https://banibe-nodjal.hf.space**

Hébergé sur un Hugging Face Space en image Docker, compte `Banibe`. Le service
reste éveillé 48 heures après chaque visite : un juré qui ouvre le lien tombe
sur le site, pas sur une page de réveil.

**Le déploiement est automatique.** Chaque poussée sur `main` déclenche
`.github/workflows/vers-hugging-face.yml`, qui compose un commit orphelin,
convertit les binaires en Git LFS et pousse vers le Space. Le Space
reconstruit son image et redémarre seul. Il n'y a plus rien à faire à la main,
et plus aucun clic à demander à l'utilisateur.

Réglages déjà posés dans le dépôt GitHub, à ne pas refaire : secret `HF_TOKEN`
et variable `HF_SPACE` valant `Banibe/nodjal`.

### Trois pièges déjà payés, notés pour ne pas les repayer

1. Hugging Face **refuse les fichiers binaires en git ordinaire** et réclame
   Git LFS. Les polices `.woff2` passaient, les photographies `.jpg` non.
2. Convertir en LFS dans un nouveau commit **ne suffit pas** : la poussée
   emporte aussi les commits antérieurs, où les mêmes images figurent encore
   en clair, et le crochet de réception les voit. D'où le commit orphelin, qui
   n'a pas de passé.
3. `git rm --cached` refuse par sécurité les fichiers ayant du contenu indexé.
   Il faut `-f`, qui ne touche que l'index, jamais le disque.

### L'ancienne adresse Render

`https://nodjal.onrender.com` existe encore mais sert **une version périmée** :
elle n'a jamais été rebranchée sur les commits récents, parce que le service a
été créé en mode « dépôt public », qui ne redéploie pas tout seul. Deux options,
au choix de l'utilisateur : la mettre à jour d'un clic (tableau de bord Render,
bouton *Manual Deploy*), ou suspendre le service pour qu'aucun lien périmé ne
traîne. Ce n'est pas urgent, mais ça ne doit pas être oublié.

---

## Où on en est

Projet **Nodjal** — candidature ANE 2026 (African Next Entrepreneurs, finale le
24 octobre 2026 à Paris). Tiers de confiance pour l'argent de la diaspora :
séquestre par jalons et preuve d'exécution, corridor France → Cameroun.

Le moteur, les trois interfaces, le socle Supabase et les fondations mobiles
sont écrits. **72 tests passent.** Zéro dépendance externe.

```bash
npm test                         # doit rendre 72 pass, 0 fail
node tools/demo.js --attaques    # démo complète en terminal
node server/server.js            # les trois interfaces en local
```

La page publique a été entièrement refondue : ouverture défilante avec un plan
de bornage dessiné au trait, trois polices servies depuis le dépôt, deux
bandeaux photographiques, un moment interactif et un vérificateur de certificat
public. Le raisonnement complet est dans `docs/dossier-de-conception.md`.

---

## Ce qui reste avant de déposer la candidature

1. **Le pitch deck n'existe pas en fichier.** C'est le vrai blocage : le
   formulaire ANE exige un téléversement en page 5, et `docs/pitch-5-minutes.md`
   n'est qu'un plan en texte, avec le minutage des dix diapositives. Il faut le
   produire en PDF ou en PowerPoint. **C'est la prochaine tâche.**
2. Une page LinkedIn d'entreprise. Le champ du formulaire accepte « site web ou
   réseaux sociaux », donc le site suffit, mais un évaluateur qui cherche à
   vérifier qu'une organisation existe regarde souvent là.
3. Le texte des 33 champs est déjà rédigé dans `docs/formulaire-ane.md`, avec
   l'adresse du site à jour.

L'utilisateur a tranché sur la date limite : on finit et on dépose, sans
attendre de confirmation de l'African Business Club.

---

## Autres points en attente, non bloquants

- Recherche d'antériorité INPI et OAPI sur « Nodjal », classes 36 et 42.
- Lettre d'intention avec un établissement de paiement agréé. Le séquestre est
  au palier 0 : Nodjal trace et autorise, mais ne détient pas les fonds.
- Play Integrity non branché côté mobile ; `mobile/lib/integrite.ts` le dit
  explicitement et rend `'inconnu'` plutôt que `'ok'`.
- Horodatage RFC 3161 dormant sans `NODJAL_TSA_URL`.
- Modèle de vision dormant sans `ANTHROPIC_API_KEY`.

---

## Repères utiles

- **Fichier à lire en premier** : `core/threat.js`, le modèle de menace T1 à T6.
  Tout le reste du dépôt existe pour l'alimenter.
- **Bugs réels trouvés et corrigés**, à ne pas réintroduire :
  - rapprochement facture/devis qui comparait des matériaux à un devis
    main-d'œuvre comprise (`core/quantitatif.js`, `estMateriau`) ;
  - échec d'affectation d'inspecteur avalé en silence, maintenant bloquant ;
  - les jalons « payé » du jeu de démonstration portaient une référence de
    certificat sans qu'aucun certificat existe. `server/server.js` les certifie
    désormais au démarrage, ce qui donne au vérificateur public quelque chose à
    vérifier ;
  - la classe `pose` du moteur d'entrées entrait en collision avec une classe
    `pose` de `web/shared/nodjal.css` portant une animation en `fill-mode:
    both`, dont la valeur finale `transform: none` écrasait définitivement la
    transformation de chaque bloc animé. La classe du moteur s'appelle
    maintenant `retiree`. **Ne jamais nommer une classe d'état comme une classe
    d'animation déjà existante.**
- **Six scénarios d'attaque jouables** depuis la console (`server/api.js`,
  `jouerScenario`), chacun déposant une vraie preuve frauduleuse.
- Un pilote Chrome sans interface, utile pour vérifier le site, est décrit dans
  `docs/dossier-de-conception.md`.

---

**Message à envoyer dans la nouvelle conversation :**

> Reprends le projet Nodjal. Lis `docs/REPRISE.md` pour le contexte. Le site
> est en ligne et se déploie tout seul ; la prochaine tâche est le pitch deck
> en fichier, à partir de `docs/pitch-5-minutes.md`.

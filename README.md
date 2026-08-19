# Nodjal

### *Rien n'est payé tant que rien n'est prouvé.*

Le tiers de confiance de l'argent de la diaspora. Un compte séquestre couplé à un
système de preuve d'exécution, qui permet de financer un chantier au Cameroun
depuis la France sans jamais payer avant que le travail soit prouvé fait.

**En ligne : [nodjal.onrender.com](https://nodjal.onrender.com)**
(plan gratuit Render — le service se met en veille après inactivité ; la
première requête après une pause peut prendre jusqu'à 50 secondes à répondre.
Le jeu de démonstration est reseedé automatiquement à chaque redémarrage.)

---

## Démarrage — trente secondes, zéro installation

Aucune dépendance externe. Node 20 ou plus, et rien d'autre.

```bash
node --test "tests/*.test.js"    # 72 tests
node tools/demo.js --attaques    # le parcours complet, en terminal
node tools/econ.js               # l'économie, calculée
node server/server.js            # http://127.0.0.1:8787
```

* `/` — la page publique
* `/console` — l'espace du donneur d'ordre
* `/terrain` — l'application de terrain, version navigateur

---

## La thèse, en trois phrases

**On a passé quinze ans à construire les rails pour *transférer* l'argent vers
l'Afrique. Personne n'a construit les rails pour vérifier ce qu'il devient une
fois arrivé.**

Le transfert s'arrête au moment où l'argent atterrit, c'est-à-dire exactement au
moment où le risque commence. Investir à distance n'est donc pas une décision
financière, c'est un pari sur la bonne foi d'un tiers.

> La diaspora camerounaise a transféré **652 milliards de FCFA en 2024, dont 35 %
> depuis la France** (SND30, ministère de l'Économie). À l'échelle du continent,
> 95 milliards de dollars par an, dont **75 % partent en consommation immédiate**
> — la Banque africaine de développement en attribue la cause à un déficit de
> transparence et de redevabilité.

---

## Ce qui est branché, et ce qui ne l'est pas

L'interface affiche en permanence l'état réel des composants. **On ne simule
jamais une analyse** : sans clé configurée, le module de vision est dormant et
l'écran le dit, plutôt que de produire une observation plausible.

| Composant | Sans clé | Avec clé |
|---|---|---|
| Géofence, cap boussole, position simulée (T1, T2) | ✅ déterministe | ✅ |
| Hachage perceptuel (T3) | ✅ décodeur JPEG et PNG maison | ✅ |
| Session de terrain, panoramique (T4) | ✅ | ✅ |
| Rotation des inspecteurs (T5) | ✅ tirage vérifiable | ✅ |
| Rapprochement facture / devis (T6) | ✅ | ✅ |
| Certificat PDF + journal chaîné | ✅ générateur maison | ✅ |
| Analyse par modèle de vision | ⛔ annoncée comme absente | `ANTHROPIC_API_KEY` |
| Horodatage qualifié RFC 3161 | ⛔ dormant | `NODJAL_TSA_URL` |
| Séquestre paliers 1 et 2 | ⛔ palier 0 en pilote | — |

Les six contre-mesures déterministes portent l'essentiel du faisceau. Le modèle
de vision **ajoute** une source, il n'en remplace aucune.

---

## Les cinq décisions de conception qui portent le projet

### 1. Le score n'est pas une somme de pénalités

Un fraudeur qui optimise une somme trouve le sous-ensemble le moins cher à
truquer. Ce qui compte est le nombre de **sources de preuve indépendantes** qui
se recoupent. Truquer une photo coûte peu. Truquer une photo, la position, le
cap, l'horloge serveur, la facture fournisseur et l'inspecteur tiré au sort coûte
plus que de monter le mur.

**Un test a corrigé ce modèle en cours de route.** La première version comptait
position, temps et unicité comme trois sources indépendantes — alors que ce sont
trois contrôles sur *un seul fichier*, issu d'une seule source. Une photo
irréprochable suffisait donc à certifier un jalon. Elles sont désormais des
**volets** de la source « terrain », qui ne compte que pour une, et il faut trois
sources distinctes pour conclure. Le test qui l'a révélé est
`tests/moteur.test.js` → *« une seule photo irréprochable ne suffit pas à
certifier »*.

### 2. Aucune preuve n'est modifiable ni supprimable

Le magasin n'expose ni écriture ni effacement sur les preuves. Une preuve
contestée est **annulée par une nouvelle preuve**, jamais effacée. C'est ce qui
rend la chaîne vérifiable : un dossier ne peut pas maigrir en silence.

Le journal est chaîné — chaque événement scelle le précédent. Retirer une ligne
au milieu casse toutes les suivantes, et la vérification le montre en une
seconde. En production, les mêmes invariants sont exprimés en déclencheurs
PostgreSQL et en RLS (`supabase/migrations/`), pas dans l'interface.

### 3. L'horodatage qui fait foi est celui du serveur

Celui de l'appareil est enregistré, mais uniquement pour mesurer l'écart : un
décalage anormal est en soi un signal. De même, le condensat SHA-256 est calculé
**à la réception, sur les octets reçus**, jamais fourni par le client.

### 4. Le tirage d'inspecteur est déterministe, donc vérifiable

Deux propriétés qui s'opposent doivent tenir ensemble : imprévisible pour
l'exécutant, sinon la rotation ne protège de rien ; reproductible pour
l'auditeur, sinon on ne peut pas prouver que le tirage n'a pas été arrangé après
coup. La solution est un tirage déterministe à partir d'un sel secret par projet.
Un tirage véritablement aléatoire ne se vérifie pas ; c'est pourquoi nous n'en
utilisons pas.

### 5. Le décodeur d'image est écrit à la main, et pour une raison

Le hachage perceptuel est le pivot de la contre-mesure T3. Une bibliothèque de
traitement d'image tire des binaires natifs, complique le déploiement en Edge
Function, et nous rend tributaires d'un tiers sur la brique la plus sensible du
produit.

Le raccourci qui rend l'opération quasi gratuite : **le coefficient DC de chaque
bloc 8×8 d'un JPEG *est* la moyenne du bloc**. Une image JPEG contient donc déjà,
gratuitement, sa propre vignette au huitième de la résolution. On décode le flux
d'entropie, on lit les DC du canal de luminance, on ignore tout le reste. Pas de
transformée inverse, pas de sous-échantillonnage chromatique, pas de conversion
colorimétrique.

---

## Le modèle de menace

C'est le fichier à lire en premier : `core/threat.js`. Tout le reste du dépôt
existe pour l'alimenter.

| # | L'attaque | La contre-mesure | Source |
|---|---|---|---|
| **T1** | Photographier le chantier du voisin | Géofence sur le polygone + cap boussole imposé | terrain |
| **T2** | Falsifier la position GPS | `isFromMockProvider`, attestation d'intégrité, cohérence avec l'EXIF | terrain |
| **T3** | Rejouer une photo ancienne | Hachage perceptuel sur tout l'historique, heure serveur | terrain |
| **T4** | Photographier un écran | Angles imposés dans une même session, panoramique vidéo | scène |
| **T5** | S'entendre avec l'inspecteur | Tirage déterministe, jamais deux fois le même chantier | inspection |
| **T6** | Gonfler une facture | Rapprochement avec le devis quantitatif, fournisseurs référencés | matériaux |

**La phrase à dire au jury :** *aucune de ces preuves ne suffit seule ; prises
ensemble, elles rendent la fraude plus coûteuse que le travail.* Ne promettez
jamais l'infaillibilité — un jury de professionnels sait qu'elle n'existe pas, et
la promettre vous discrédite immédiatement.

Les six scénarios sont jouables depuis la console : chaque bouton dépose une
**vraie** preuve frauduleuse et laisse le moteur la traiter. Rien n'est mis en
scène.

```
T1  interceptée   [blocage] Position hors de la parcelle
T2  interceptée   [blocage] Position simulée détectée sur l'appareil
T3  interceptée   [blocage] Image déjà déposée sur ce projet
T4  interceptée   [alerte]  Prise de vue hors de la session de terrain
T5  interceptée   [blocage] Aucun inspecteur éligible
T6  interceptée   [alerte]  Quantité facturée supérieure au métré
```

---

## Deux corrections que le chantier pilote a révélées

Dites-les au jury avant qu'il ne les trouve. Elles montrent que le produit a été
confronté à un cas réel, pas seulement écrit.

**Le rapprochement comparait des factures matériaux à un devis main-d'œuvre
comprise.** Écart mécanique de −46 %, présenté comme normal. La main-d'œuvre n'a
pas de facture fournisseur : elle est attestée par l'avancement lui-même. Le
budget de référence est désormais le seul sous-ensemble matériaux, et les
forfaits sont rapportés à part (`core/quantitatif.js` → `estMateriau`).

**Un échec d'affectation d'inspecteur était avalé en silence.** Un jalon dont le
vivier d'inspecteurs était épuisé passait « conforme » sur les autres sources.
Aucun inspecteur éligible ne veut pas dire aucun problème d'inspection : c'est un
jalon dont la contre-mesure T5 ne peut pas s'appliquer, donc un jalon non
certifiable. Il est maintenant bloquant.

---

## Sur le vocabulaire

Deux mots à ne jamais employer, et leurs remplaçants exacts.

**« Opposable ».** Un document ne le devient pas parce qu'il est horodaté. Ce que
la technique permet réellement est une preuve d'antériorité non répudiable : un
tiers qualifié atteste qu'un condensat existait à une date donnée. Dites
**« faisceau de preuves horodatées et non répudiables »** — c'est exact, et c'est
plus solide devant un avocat. *(Ceci n'est pas un avis juridique. Faites valider
la formulation avant de l'imprimer sur un contrat.)*

**« Notre IA détecte la fraude ».** Cet énoncé se démonte en une question. Dites
**« le modèle prépare le dossier, l'humain tranche, et le système rend la fraude
plus coûteuse que le travail »**.

---

## Ce qui n'est pas fait, et qui doit l'être

Dit ici plutôt que découvert par un évaluateur.

- **Le séquestre est au palier 0.** Nodjal autorise et trace le paiement jalon par
  jalon, mais ne détient aucun fonds et n'a besoin d'aucune licence. Le
  cantonnement (palier 1) exige une lettre d'intention avec un établissement de
  paiement agréé, qui n'est pas signée. C'est le document qui neutralise
  l'objection réglementaire, et il vaut mille lignes de code.
- **Play Integrity n'est pas branché.** `mobile/lib/integrite.ts` distingue un
  appareil physique d'un émulateur et rend `inconnu` plutôt que `ok`. Le jeton
  devra être vérifié **côté serveur** : une attestation validée sur l'appareil ne
  vaut rien, c'est l'appareil qu'on cherche à ne pas croire.
- **Rien n'a jamais tourné sur un vrai téléphone.** À tester sur un Android à
  60 000 FCFA, 2 Go de RAM, en 3G — pas sur un iPhone.
- **L'horodatage qualifié est écrit mais dormant.** La requête RFC 3161 est
  construite et la réponse parsée, mais la signature n'est pas vérifiée : cela
  demande la chaîne de certification du prestataire. Le module le dit au lieu de
  laisser croire le contraire.
- **Les unit economics sont des hypothèses, pas des mesures.** Le taux de
  séquestre, la part immobilière et le taux de capture n'ont été corrigés par
  aucun chantier pilote. `tools/econ.js` marque chaque ligne : *officiel* ou
  *hypothèse de travail*.
- **Le nom Nodjal n'a pas fait l'objet d'une recherche d'antériorité** à l'INPI et
  à l'OAPI, classes 36 et 42.
- **Les clichés du jeu de démonstration sont synthétiques**, générés à partir
  d'une graine fixe, et l'interface le signale en permanence. Le signal
  « métadonnées absentes » reste levé sur ces pièces : nous ne désactivons pas un
  contrôle parce que la pièce nous arrange.
- **Aucune adresse électronique n'est conservée** par la liste d'attente tant
  qu'une politique de conservation n'est pas écrite.

---

## Arborescence

```
nodjal/
├── core/                le moteur, zéro dépendance
│   ├── threat.js        modèle de menace T1..T6 — à lire en premier
│   ├── milestone.js     machine à états des jalons, gardes comprises
│   ├── quantitatif.js   rapprochement facture / devis (T6)
│   ├── inspecteur.js    tirage déterministe vérifiable (T5)
│   ├── image.js         décodeur JPEG baseline + PNG, luminance seule
│   ├── phash.js         hachage perceptuel dHash (T3)
│   ├── exif.js          analyseur TIFF/EXIF
│   ├── geo.js           géofence, cap, distance signée au polygone
│   ├── certificate.js   manifeste + PDF + vérification
│   ├── pdf.js           générateur PDF (base-14, WinAnsi)
│   ├── tsa.js           RFC 3161 — dormant sans prestataire
│   ├── vision.js        Claude Opus 5, sortie structurée — dormant sans clé
│   ├── hash.js          empreintes, forme canonique, chaînage
│   ├── store.js         persistance en ajout seul, journal chaîné
│   └── economics.js     l'économie, calculée et sourcée
├── server/              serveur stdlib + orchestration + jeu pilote
├── web/                 page publique · console · appli terrain
├── mobile/              Expo / React Native — chemin de production
├── supabase/migrations/ les mêmes invariants en SQL, RLS comprise
├── tests/               72 tests, bibliothèque standard
├── tools/               démonstration · économie · encodeur PNG
└── docs/                deck · formulaire ANE · modèle de menace
```

---

## Coût réel jusqu'à la finale

| Poste | Coût |
|---|---|
| Supabase Pro | 69 € |
| Vercel, EAS Build | 0 € |
| Analyse par modèle de vision | ~12 € (≈600 photos à 0,02 €) |
| Horodatage qualifié | ~3 € |
| Nom de domaine | 15 € |
| **Total** | **99 €** |
| *Drone DJI Mini (optionnel)* | *500 €* |

**Dites-le au jury.** Un MVP fonctionnel à moins de 100 € prouve exactement ce
qu'un investisseur veut savoir : que vous êtes économe et que vous savez ce qui
compte.

---

## Licence et statut

Prototype de candidature — African Next Entrepreneurs 2026, African Business
Club Paris. Finale le 24 octobre 2026, Espace Champerret.

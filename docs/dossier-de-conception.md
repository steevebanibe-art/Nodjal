# Nodjal — dossier de conception de la page publique

Document de référence de la refonte. Écrit avant la construction, consommé par
elle. Toute phrase marquée « texte » se pose **telle quelle** dans la page : ce
document est l'endroit où l'on écrit, la page est l'endroit où l'on câble.

---

## 1. La prémisse

**Une photo ne prouve rien. Une preuve, c'est une photo qu'on a forcée à dire
où, quand, dans quelle direction, et contre quel devis.**

Tout le site enseigne cette phrase et rien d'autre. Chaque section la sert ou
elle ne mérite pas d'être sur la page.

Pourquoi celle là, et pas « le tiers de confiance de l'argent de la diaspora » :
la recherche a établi que l'escroquerie de Cergy, 97 victimes et 1,27 M€,
présentait sa société comme « un intermédiaire de confiance pour guider en toute
sécurité la diaspora dans ses projets immobiliers ». Nodjal ne peut donc pas
vendre la confiance, la sécurité ni le sérieux : ce sont les mots de l'escroc.
Nodjal vend le mécanisme qui rend la confiance inutile.

Corollaire tenu partout : **les photos WhatsApp du chantier existent déjà, et
c'est exactement ce qui a trompé les victimes.** Vendre « des photos de votre
chantier » classerait Nodjal parmi ceux qui les ont déjà déçus.

---

## 2. La direction, et l'écart assumé

Direction retenue : **le registre notarial.** Papier chaud, serif documentaire,
filets réglés, sceau à l'encre. Choix de l'utilisateur, et bon choix : le
positionnement du dossier est « la différence entre un promoteur et un notaire ».

**L'écart assumé.** La recherche sur les repères visuels du secteur conclut
qu'un site financier doit porter une sans-serif neutre et bannir les polices à
personnalité. Cette conclusion est tirée de sites de *paiement* (Escrow.com,
Treezor, Swan, Wave), qui vendent une infrastructure. Nodjal se positionne
délibérément ailleurs : contre un notaire, pas contre une fintech. Le serif est
le différenciateur, pas un caprice.

Ce que la recherche impose en revanche, et qui est tenu :

- **La retenue est un argument.** 54,6 % des jugements de crédibilité sur les
  sites de finance passent par l'apparence, le taux le plus élevé de toutes les
  catégories mesurées (Stanford, 2 684 participants). Donc : mouvement lent et
  motivé, jamais démonstratif. Rien ne rebondit. Rien ne clignote.
- **L'accent ne sert que deux choses** : l'action principale et l'état validé.
- **Aucun chiffre emprunté.** Les 652 milliards FCFA appartiennent au corridor,
  pas à l'entreprise. Les compteurs de Nodjal sont ses propres compteurs,
  petits et vrais.
- **La mention réglementaire monte à côté du bouton d'action.** En pied de page
  elle se lit comme une dissimulation ; en haut, comme une posture assumée.

---

## 3. La palette, en jetons

Héritée de `/shared/nodjal.css`, resserrée. Le fond n'est jamais un noir pur ni
un blanc pur : il est teinté vers l'encre du papier.

```css
--papier:      #F6F3EC;   /* la page */
--papier-vif:  #FBF9F4;   /* les cartes */
--papier-creux:#EFEBE1;   /* les sections en creux */
--encre:       #1A1814;   /* le texte */
--encre-douce: #3C3831;
--encre-pale:  #6B6459;
--nuit:        #14120F;   /* l'ouverture */
--foret:       #2F6B4F;   /* l'accent : action principale et état validé */
--terre:       #A33B2A;   /* le refus, le filet de marge */
--ocre:        #9A6B1E;   /* l'aveu, l'instruction en cours */
```

## 4. Le trio typographique

Piles système uniquement : zéro requête réseau, donc zéro dépendance et un
premier rendu instantané.

| Rôle | Pile | Usage |
|---|---|---|
| Display | Iowan Old Style, Palatino, Book Antiqua, Georgia | titres, chiffres éditoriaux, exergues |
| Texte | Charter, Sitka Text, Cambria, Palatino | corps |
| Machine | Iosevka, JetBrains Mono, Cascadia, Consolas | chapeaux, codes de menace, empreintes, mesures |

Ni Inter ni Roboto nulle part.

---

## 5. L'élément signature

**Le plan de bornage qui se dessine, puis se lève en villa, puis se scelle.**

La parcelle pilote de Bonaberi, aux coordonnées réelles du jeu de démonstration
servi par la console, tracée en axonométrie comme un plan de géomètre. Les
quatre bornes se posent, les cotes s'inscrivent, les six prises de vue plantent
leur point et ouvrent l'arc de leur cap imposé, les liens rejoignent le dossier,
le cadre du certificat se ferme, la villa R+1 se lève du plan, le sceau
s'appose de travers.

Test de l'élément signature : si on l'enlève, la page change t elle vraiment ?
Oui. Il ne reste qu'un texte bien composé, c'est à dire le site d'avant.

Pourquoi ce dessin plutôt qu'une vidéo générée : le produit affirme ne jamais
faire passer une image fabriquée pour une preuve. Son ouverture ne peut donc pas
être une image fabriquée. Un tracé au trait ne prétend à rien : il montre.

---

## 6. La carte des bandes

Cinq bandes. Les bornes sont des points de départ, validés ensuite par le test
de la chiquenaude.

| # | Plage | Ce que le dessin fait | Texte (tel quel) | Entrée |
|---|---|---|---|---|
| 1 | 0,000 – 0,175 | la nuit, le papier millimétré affleure, le sol est vide | **Une photo ne prouve rien.** / *Nodjal découpe votre chantier en jalons. À chaque jalon, une preuve. Sans preuve, l'argent ne bouge pas.* | mise au point |
| 2 | 0,195 – 0,375 | le polygone se trace, les bornes se posent, les cotes s'inscrivent | **Le problème n'a jamais été votre frère.** / *Le problème, c'est que personne ne pouvait le contredire avec des faits.* | descente |
| 3 | 0,395 – 0,575 | les six prises plantent leur point et ouvrent l'arc de leur cap | **Six prises. Six angles imposés.** / *Dans le polygone, tourné dans la direction exigée, à l'heure du serveur. Sinon la preuve est refusée.* | éparpillement |
| 4 | 0,595 – 0,755 | les liens rejoignent le dossier, le cadre du certificat se ferme | **Chaque preuve est scellée à la précédente.** / *Une preuve contestée est annulée par une nouvelle preuve. Jamais effacée.* | frappe |
| 5 | 0,775 – 1,000 | la villa se lève du plan, le sceau s'appose | **Rien n'est payé tant que rien n'est prouvé.** / *Vous ne découvrirez pas votre chantier le jour où vous atterrirez.* | levée |

Le texte de la bande 5 est la promesse de fin que la recherche a trouvée mot
pour mot chez les clients : « I don't want to be old and alone. I want to go
back and have a home. »

---

## 7. L'ouverture figée

Téléphones et mouvement réduit reçoivent l'état final composé, sans parcours :
le plan achevé, la villa levée, le sceau apposé, et le texte de la bande 5. Ce
n'est pas un repli d'excuse, c'est une composition.

Cinq gardes, identiques au caractère près en CSS et en JavaScript :

```
(max-width: 720px)
(orientation: portrait) and (max-width: 1024px)
(orientation: portrait) and (pointer: coarse)
(orientation: landscape) and (pointer: coarse) and (max-height: 560px)
(prefers-reduced-motion: reduce)
```

---

## 8. Le plan de la page, après le repos

Chaque section sert la prémisse et pousse vers **une seule** action : rejoindre
la liste d'attente. Deux sections voisines ne partagent jamais le même gabarit.

1. **La ligne réglementaire**, juste sous l'ouverture, à côté du bouton.
   « Nodjal ne détient jamais vos fonds. Palier 0 aujourd'hui : Nodjal autorise
   et trace le versement, jalon par jalon. Le cantonnement se fera chez un
   établissement de paiement agréé, sous statut d'agent de prestataire de
   services de paiement. Ce statut s'obtient en environ deux mois ; il n'est
   pas encore obtenu, et cette page le dira tant que ce sera vrai. »

2. **Ce qui arrive à l'argent**, en cinq lignes à sujet nommé et verbe actif,
   avec la colonne que personne n'ose montrer : **qui détient l'argent à cette
   seconde précise.**

3. **Le moment interactif** : le visiteur maintient le bouton de libération, et
   l'argent monte au rythme où les six contrôles se posent. Il n'apprend pas la
   règle, il l'exécute.

4. **Les deux affaires**, conservées du site actuel, resserrées.

5. **Le modèle de menace**, six attaques formulées du point de vue du fraudeur
   avant la parade, jamais l'inverse. Nommé et compté, comme un produit.

6. **Le choix que vous avez aujourd'hui** : trois colonnes, envoyer à un proche,
   venir soi même, Nodjal. Coût en argent, en jours de congés, en années. Cette
   section répond à l'objection dominante trouvée en recherche : « I save my
   money and do everything when I arrive. I choose peace over everything. »

7. **Le vérificateur public** : coller une référence de certificat, voir son
   empreinte, sa date et son chaînage. Utilisable sans compte, par le jury, en
   direct. L'API existe déjà.

8. **Ce qui n'est pas fait**, conservé et mis en avant plutôt que caché.

9. **La liste d'attente**, formulaire unique.

10. **Le pied**, avec l'identité de l'éditeur et un contact humain joignable.

---

## 9. La couche vectorielle

Tout est dessiné à la main, en SVG inline, sans image bitmap :

- le plan de bornage de l'ouverture (l'élément signature) ;
- le sceau de certificat, dessiné pour Nodjal plutôt qu'emprunté à un tiers ;
- les filets de séparation qui se tirent à l'entrée ;
- la rose des vents et l'échelle du plan.

Aucune particule, aucune poussière décorative : la retenue est l'argument.

---

## 10. La liste d'ingénierie

Le standard tenu, sans demi mesure : progression du hero lissée avec
normalisation par dt, écriture DOM déltat-gardée, une seule propriété par image,
cinq gardes vivantes branchées sur leurs événements de changement, mouvement
réduit honoré dans les deux sens, entrées chorégraphiées dont les retards sont
retirés après coup, boucles suspendues hors écran et sur onglet caché, débordement
horizontal coupé sur `html` et `body`, cibles tactiles à 44 px, points de repère
sémantiques et lien d'évitement, page entièrement fonctionnelle sans JavaScript.

---

## 11. La porte de sortie

Toute phrase de ce document se pose telle quelle. La page construite doit passer
la relecture : zéro tiret cadratin, zéro mot de la liste noire (leverage,
seamless, empower, unlock, robust, actionable, data-driven, solutions,
testament, landscape, delve, elevate), et zéro tournure « ce n'est pas seulement
X, c'est Y ».

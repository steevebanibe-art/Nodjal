# Image pour Hugging Face Spaces (SDK docker, materiel CPU Basic).
#
# Nodjal n'a aucune dependance : il n'y a donc ni npm install, ni etape de
# construction, ni cache a gerer. L'image se resume a un Node et au depot.
#
# Trois contraintes de la plateforme sont traitees ici :
#
#   1. Le conteneur tourne sous l'utilisateur d'identifiant 1000. Les images
#      officielles de Node fournissent deja cet utilisateur, nomme « node » :
#      on l'utilise plutot que d'en creer un second au meme identifiant, ce
#      qui echouerait.
#
#   2. WORKDIR cree les dossiers manquants au compte de root, meme quand USER
#      a deja bascule. L'application ecrit son magasin dans « data » : sans le
#      mkdir explicite ci-dessous, elle se heurterait a un dossier root et ne
#      demarrerait pas. C'est le piege classique de ce montage.
#
#   3. L'application doit ecouter sur le port 7860. Le serveur lit PORT dans
#      l'environnement et bascule tout seul sur 0.0.0.0 des que PORT est
#      fourni, sans quoi il resterait sur la boucle locale et le conteneur
#      paraitrait muet.
#
# Le disque n'est pas persistant d'un redemarrage a l'autre, ce qui ne gene
# pas : server/seed.js reseme le jeu de demonstration a chaque demarrage, et
# server/server.js emet les certificats des jalons historiques dans la foulee.

FROM node:22-alpine

# En root : on prepare l'arborescence et on la donne a l'utilisateur 1000.
RUN mkdir -p /home/node/app/data && chown -R node:node /home/node/app

USER node
WORKDIR /home/node/app

COPY --chown=node:node . /home/node/app

ENV PORT=7860 \
    HOST=0.0.0.0 \
    NODE_ENV=production

EXPOSE 7860

CMD ["node", "server/server.js"]

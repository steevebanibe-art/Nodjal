# Nodjal Terrain — application native

Ce dossier contient la version de production de l'application de terrain.
La version navigateur (`web/terrain/`) est un repli de demonstration ; elle ne
peut pas remplacer celle-ci, pour une raison precise et une seule.

## Pourquoi le natif est obligatoire

Un navigateur recoit une position et n'a aucun moyen de savoir d'ou elle vient.
Android expose `isFromMockProvider` sur chaque releve. Sans ce drapeau, la
contre-mesure T2 n'existe pas : un fraudeur installe une application de position
fictive en trente secondes et se declare sur la parcelle depuis son salon.

C'est le seul argument, et il suffit. Tout le reste du produit pourrait vivre
dans un navigateur.

## Ce qui est ecrit

| Fichier | Role |
|---|---|
| `lib/integrite.ts` | Releve de position + verdict d'integrite (T2). Ne dit jamais « authentique » quand la plateforme ne permet pas de le verifier. |
| `lib/file.ts` | File d'attente hors ligne sur SQLite. Ecrite le premier jour, pas a la fin. |

## Ce qui n'est pas fait

- **Play Integrity n'est pas branche.** `attesterAppareil()` se limite a
  distinguer un appareil physique d'un emulateur, et rend `inconnu` plutot que
  `ok`. Le jeton devra etre verifie **cote serveur** : une attestation validee
  sur l'appareil ne vaut rien, c'est l'appareil qu'on cherche a ne pas croire.
- **L'ecran de capture n'est pas ecrit** : caméra + visee boussole + declenchement.
  L'ossature (`app/`) est a produire avec `npx create-expo-app`.
- **Rien n'a jamais tourne sur un vrai telephone.** A tester sur un Android a
  60 000 FCFA, 2 Go de RAM, en 3G — pas sur un iPhone.

## Compilation

```
npm install
npx expo run:android          # appareil connecte
eas build -p android --profile preview   # APK a installer directement, sans Play Store
```

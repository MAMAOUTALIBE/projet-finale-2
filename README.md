# Project Tracking

Application Angular 21 avec Firebase Hosting, Firestore, Storage et Cloud Functions.

## Prerequisites

- Node.js `20.19+`
- npm `10+`
- Firebase CLI

Vous pouvez aligner votre runtime local avec :

```bash
nvm use
```

ou en installant la version définie dans `.nvmrc`.

Si `node_modules` a été installé avec une autre version majeure de Node, réinstallez les dépendances avant le build pour régénérer les modules natifs utilisés par Angular (`lmdb`, `esbuild`, `rollup`, etc.).

## Runtime configuration

Avant un build de production ou un déploiement, renseignez les valeurs réelles dans `public/runtime-config.js` :

- configuration Firebase Web
- clé Google Maps si les écrans de cartographie doivent être actifs

Vous pouvez aussi définir votre projet Firebase dans `.firebaserc` à partir de `.firebaserc.example`.

## Local development

```bash
npm install
npm run functions:install
npm start
```

## Validation before deploy

```bash
npm run check:types
npm run functions:build
npm run build:prod
```

Ou en une seule commande :

```bash
npm run prepare:deploy
```

## Firebase secrets

Les Cloud Functions attendent les secrets SMTP décrits dans `functions/README.md`.

## Deploy

Quand la validation est faite et que la configuration runtime est renseignée :

```bash
firebase deploy
```

Le hosting est servi depuis `dist/nowa-angular-21` et les routes SPA sont réécrites vers `index.html`.

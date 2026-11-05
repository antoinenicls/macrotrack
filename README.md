# MacroTrack

Application web (PWA) de suivi nutritionnel pour la musculation : sèche, maintien ou prise de masse.
Tu te pèses, tu coches ce que tu manges, et l'app ajuste toute seule ta cible et ton menu de la semaine.

- **Sans compte, sans serveur.** Toutes les données restent sur ton téléphone (IndexedDB). Rien n'est envoyé nulle part.
- **Hors ligne.** Une fois ouverte, l'app fonctionne sans réseau.
- **Installable** sur iPhone et Android depuis le navigateur.

Version en ligne : **[macrotrack.antwnlifts.fr](https://macrotrack.antwnlifts.fr)**

## Ce que fait l'app

- **Menu de la semaine généré** à partir des aliments que tu acceptes de manger, recalé sur tes cibles (protéines et lipides tenus, les féculents s'ajustent).
- **Coach adaptatif** : mesure ta vraie maintenance à partir de tes pesées et de ce que tu manges, et corrige la cible une fois par semaine si tu avances trop vite ou trop lentement.
- **Tendance de poids** : moyenne sur 7 jours et pente sur 3 semaines, pour ne plus se faire piéger par l'eau.
- **Repas non pesés** : estimation d'un resto ou d'un plat fait par quelqu'un d'autre, avec report du surplus sur les jours suivants.
- **Jours de séance**, pause diète, refeed, récupération après une sèche, mini-cut.
- **Liste de courses** rangée par rayon, régimes et allergies, nombre de repas par jour, conversion cru / cuit.
- **Bilan de la semaine** : micronutriments, protéines par repas.
- Un **guide intégré** explique chaque calcul.

## Lancer le projet

Node 20 ou plus récent.

```bash
npm install
npm run dev      # http://localhost:5173
npm test         # tests unitaires (Vitest)
npm run build    # build de production dans ./dist
```

Aucune variable d'environnement n'est nécessaire.

## Stack

React 18, TypeScript (strict), Vite, Tailwind CSS, Zustand, IndexedDB via `idb`, `vite-plugin-pwa` (Workbox), Recharts, Framer Motion, date-fns, lucide-react. Le routage passe par `HashRouter` : en PWA installée sur iOS, changer de chemin ouvrirait Safari.

## Architecture

Le code est rangé par fonctionnalité.

```
src/
├── features/        # un dossier par fonctionnalité (dashboard, nutrition, plan, weight…)
├── components/      # primitives d'UI et layout
├── services/        # IndexedDB : schéma, repositories, seed, sauvegarde
├── store/           # Zustand, un store par domaine
├── lib/             # logique métier PURE (calculs, coach, menus), testée
├── data/            # aliments, plan type et rotation de départ
└── types/
```

Règles du projet :

- Aucun composant React ne touche `idb` directement : tout passe par `services/repositories/`.
- Les calculs vont dans `src/lib/` et restent purs (pas d'I/O), avec leurs tests dans `src/lib/__tests__/`.
- Cibles tactiles d'au moins 44 px, champs d'au moins 16 px (sinon Safari iOS zoome).

## Calculs (résumé)

- **Métabolisme de base** : Katch-McArdle si le % de masse grasse est renseigné, sinon Mifflin-St Jeor.
- **Maintenance** : métabolisme de base × facteur d'activité, puis remplacée par la maintenance mesurée dès qu'il y a assez de pesées.
- **Macros** : protéines et lipides en g/kg, glucides = le reste des calories.
- **Cru / cuit** : chaque aliment a un facteur de cuisson ; les macros sont stockées dans l'état natif et converties à la volée.

## Sauvegarde

Onglet **Plan → Données** : export JSON complet, import, réinitialisation. Comme tout est local, exporte de temps en temps (changement de téléphone, nettoyage du navigateur).

## Contribuer

Les issues et les pull requests sont les bienvenues : bug, aliment manquant, calcul à discuter, amélioration d'interface.

1. Forke le dépôt et crée une branche.
2. Garde `npm test` et `npm run lint` au vert.
3. Décris le pourquoi du changement dans la PR.

## Avertissement

MacroTrack donne des repères chiffrés pour l'entraînement et la nutrition. Ce n'est pas un dispositif médical et ça ne remplace pas l'avis d'un médecin ou d'un diététicien, en particulier en cas de pathologie, de grossesse ou de troubles du comportement alimentaire.

## Licence

[GNU AGPL-3.0](./LICENSE). Tu peux utiliser, modifier et redistribuer ce code librement. Si tu publies ou héberges une version modifiée, tu dois en partager le code source sous la même licence.

© 2026 Antoine · [@antwnlifts](https://instagram.com/antwnlifts)

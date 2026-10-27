# Biblio-rians

Logiciel de gestion de bibliothèque scolaire pour Windows : livres, élèves, classes et prêts.
Il fonctionne **hors ligne**, sans serveur ni abonnement, et il est pensé pour des personnes peu à l'aise avec l'informatique.

## Pour les écoles

### Installer

1. Téléchargez `Biblio-rians-Installation-x.y.z.exe` depuis la page [Releases](https://github.com/PommeAbricotFraise/Biblio/releases).
2. Double-cliquez dessus. L'installation se fait toute seule et l'application s'ouvre à la fin.
3. Windows peut afficher **« Windows a protégé votre ordinateur »**, car le logiciel n'est pas signé (la signature est payante). Cliquez sur **« Informations complémentaires »**, puis sur **« Exécuter quand même »**.

Les mises à jour se font ensuite automatiquement : elles sont téléchargées en arrière-plan et installées à la fermeture de l'application.

### Au quotidien

- **Prêter** : onglet Emprunts, mode « Prêter un livre ». Choisissez l'élève, scannez le livre, puis validez.
- **Rendre** : onglet Emprunts, mode « Rendre un livre ». Scannez le livre, et c'est tout.
- **Sauvegarder** : bouton en haut à droite, sur une clé USB, environ une fois par semaine.
- Le bouton **Aide**, dans l'application, répond aux questions courantes.

### Les données

- Elles restent sur l'ordinateur, dans `%APPDATA%\biblio-rians`, chiffrées avec le compte Windows de l'utilisateur.
- Une sauvegarde automatique est faite chaque jour (30 jours conservés, puis une par mois pendant un an), plus une copie de sécurité avant chaque opération risquée : import, restauration, clôture d'année.
- La sauvegarde « clé USB » est lisible sur n'importe quel ordinateur : c'est elle qui protège d'une panne ou d'un changement de poste.
- L'application contient des données personnelles d'élèves (nom, prénom, année de naissance). L'école en est responsable au sens du RGPD. Rangez les clés USB et les exports Excel en lieu sûr.

## Pour les développeurs

Il faut Node.js 22 ou une version plus récente.

```bash
npm install
npm start            # lance l'application
npm test             # tests unitaires (base, import, sauvegardes)
npm run test:e2e     # tests de bout en bout dans la vraie application (environ 2 minutes)
npm run dist         # construit l'installeur dans dist/
```

> Sous le terminal de VS Code, la variable `ELECTRON_RUN_AS_NODE` est souvent définie, et `npm start` démarre alors Electron comme un simple Node. Lancez plutôt `env -u ELECTRON_RUN_AS_NODE npm start` (Git Bash). `npm run test:e2e` s'en occupe tout seul.

### Organisation du code

| Fichier | Rôle |
|---|---|
| `electron-main.js` | Processus principal : fenêtre, base, sauvegardes, import/export, mot de passe, garde-fous des échanges avec l'interface |
| `preload.js` | Liste des actions que l'interface a le droit de demander |
| `migrations.js` | Évolutions du schéma de la base (toujours ajouter à la fin) |
| `data-transfer.js` | Lecture, restauration et fusion de données (fichiers JSON et Excel) |
| `backup-policy.js` | Noms et durée de conservation des sauvegardes automatiques |
| `stats.js` | Statistiques |
| `renderer/` | Interface : `app.js` (général), `loan-desk.js` (comptoir de prêt), `welcome.js` (premier démarrage) |
| `test/` | Tests unitaires (`node --test`) |
| `test-e2e/` | Tests de bout en bout (`npm run test:e2e`) |
| `build/` | Icône de l'application (`icon.svg` est la source, `icon.png` est générée à partir d'elle) |

### Sécurité, en bref

- L'interface n'a accès ni à Node ni au disque. Elle passe par `preload.js`, et chaque demande est vérifiée par `handle()` dans `electron-main.js` : origine, verrouillage, nettoyage des données.
- Une politique de sécurité du contenu (CSP) est déclarée dans `renderer/index.html`. Navigation, nouvelles fenêtres et permissions sont bloquées.
- Les fusibles Electron sont activés au moment de la construction (`electronFuses` dans `package.json`).
- Le mot de passe n'est **pas** un chiffrement : il empêche l'accès par l'interface (les enfants), pas la lecture des fichiers par quelqu'un qui a le compte Windows.

### Publier une nouvelle version

1. Augmentez `version` dans `package.json`.
2. Vérifiez que tout passe : `npm test` puis `npm run test:e2e`.
3. Créez un jeton GitHub avec les droits `contents: write`, puis lancez `GH_TOKEN=... npm run release`. Un brouillon de version est créé sur GitHub avec l'installeur et `latest.yml`.
4. Sur GitHub, publiez ce brouillon. Les écoles reçoivent alors la mise à jour automatiquement.

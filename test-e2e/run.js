'use strict';

/*
 * Lance les tests de bout en bout : chaque scenario pilote la vraie
 * application Electron dans un dossier de donnees temporaire (jamais les
 * donnees reelles), puis ecrit ses resultats (lignes "OK" / "ECHEC").
 *
 *   npm run test:e2e
 *
 * Les scenarios utilisent des fenetres de dialogue simulees : aucune action
 * n'est demandee pendant les tests. Comptez environ deux minutes.
 */
const { spawnSync } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const projectDir = path.resolve(__dirname, '..');
const outDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-e2e-resultats-'));
const electronBin = require('electron');

// L'ordre compte : "demarrage" reutilise le dossier de donnees cree par "donnees".
const SCENARIOS = [
  { file: 'donnees.js', results: 'results.txt', title: 'Données, sauvegardes et restauration' },
  { file: 'demarrage.js', results: 'results-startup.txt', title: 'Démarrage avec une base abîmée, instance unique' },
  { file: 'securite.js', results: 'results-security.txt', title: 'Sécurité' },
  { file: 'comptoir.js', results: 'results-desk.txt', title: 'Comptoir de prêt' },
  { file: 'gestion.js', results: 'results-lot3.txt', title: 'Assistant, modèle Excel, suppressions, clôture d\'année' }
];

// Sous VS Code, ELECTRON_RUN_AS_NODE fait demarrer Electron comme un simple Node.
const env = { ...process.env, BIBLIO_DIR: projectDir, BIBLIO_OUT: outDir };
delete env.ELECTRON_RUN_AS_NODE;

let failures = 0;
SCENARIOS.forEach((scenario) => {
  if (scenario.file === 'demarrage.js') {
    const userDataFile = path.join(outDir, 'userdata.txt');
    env.BIBLIO_USERDATA = fs.existsSync(userDataFile) ? fs.readFileSync(userDataFile, 'utf8') : '';
  }
  console.log(`\n=== ${scenario.title}`);
  spawnSync(electronBin, [path.join(__dirname, scenario.file)], { env, stdio: 'ignore', timeout: 5 * 60 * 1000 });
  const resultsPath = path.join(outDir, scenario.results);
  if (!fs.existsSync(resultsPath)) {
    console.log('ECHEC le scénario n\'a produit aucun résultat');
    failures += 1;
    return;
  }
  const lines = fs.readFileSync(resultsPath, 'utf8').split('\n')
    .filter((line) => /^(OK|ECHEC|ERREUR|Erreurs JavaScript)/.test(line));
  lines.forEach((line) => console.log(line));
  failures += lines.filter((line) => /^(ECHEC|ERREUR)/.test(line) || /^Erreurs JavaScript : (?!aucune)/.test(line)).length;
});

console.log(failures ? `\n${failures} problème(s) détecté(s).` : '\nTous les scénarios sont passés.');
process.exitCode = failures ? 1 : 0;

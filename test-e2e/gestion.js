/* Tests fonctionnels complementaires du lot 3. */
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');
const XLSX = require(path.join(process.env.BIBLIO_DIR, 'node_modules', 'xlsx'));

const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-l3-'));
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-l3-files-'));
app.setPath('userData', userData);
let nextSavePath = null;
let nextOpenPath = null;
dialog.showSaveDialog = async () => ({ canceled: !nextSavePath, filePath: nextSavePath });
dialog.showOpenDialog = async () => ({ canceled: !nextOpenPath, filePaths: nextOpenPath ? [nextOpenPath] : [] });
dialog.showMessageBox = async () => ({ response: 1 });
require(path.join(process.env.BIBLIO_DIR, 'electron-main.js'));

const results = [];
const consoleErrors = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail !== undefined ? ' -> ' + detail : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (event) => { if (event.level === 'error' || event.level === 3) consoleErrors.push(event.message); });
  win.webContents.once('did-finish-load', () => run(win)
    .catch((err) => results.push('ERREUR SCENARIO ' + (err && err.stack ? err.stack : err)))
    .finally(() => {
      results.push(`Erreurs JavaScript : ${consoleErrors.length ? consoleErrors.join(' | ') : 'aucune'}`);
      fs.writeFileSync(path.join(process.env.BIBLIO_OUT, 'results-lot3.txt'), results.join('\n'));
      app.exit(0);
    }));
});

async function run(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  await wait(1200);

  check('assistant affiché sur une bibliothèque vide', await js("return !document.getElementById('welcomeModal').classList.contains('hidden');"));
  check('année scolaire pré-remplie', /^\d{4}-\d{4}$/.test(await js("return document.getElementById('welcomeYear').value;")));
  await js(`
    const rows = document.querySelectorAll('.welcome-class-row');
    rows[0].querySelector('[name=level]').value = 'CE1'; rows[0].querySelector('[name=teacher]').value = 'Mme Dupont';
    rows[1].querySelector('[name=level]').value = 'CM2'; rows[1].querySelector('[name=teacher]').value = 'M. Bernard';
    document.getElementById('welcomeCreate').click();`);
  await wait(900);
  const classes = await js('return window.api.classesList();');
  check('assistant : 2 classes créées', classes.length === 2, classes.map((c) => c.name).join(', '));

  // Modele Excel puis import d'une liste remplie
  nextSavePath = path.join(tmp, 'modele.xlsx');
  await js('return window.api.dataTemplate();');
  const wb = XLSX.readFile(nextSavePath);
  check('modèle Excel : feuilles Élèves et Livres', wb.SheetNames.includes('Élèves') && wb.SheetNames.includes('Livres'), wb.SheetNames.join(', '));
  const year = (await js('return window.api.yearsList();'))[0].name;
  XLSX.utils.sheet_add_aoa(wb.Sheets['Élèves'], [
    ['Martin', 'Léa', 'CE1', 'Mme Dupont', '', year, 2018],
    ['Durand', 'Noah', 'CE1', 'Mme Dupont', '', year, ''],
    ['Petit', 'Jules', 'CM2', 'M. Bernard', '', year, '']
  ], { origin: 'A2' });
  XLSX.utils.sheet_add_aoa(wb.Sheets.Livres, [['Matilda', 'Roald Dahl', '9780141365466', 1988, 2, 'R-01', 'Bac 3']], { origin: 'A2' });
  XLSX.writeFile(wb, nextSavePath);
  nextOpenPath = nextSavePath;
  const imported = await js('return window.api.importPick();');
  const counts = (await js('return window.api.libraryInfo();')).counts;
  check('modèle rempli importé dans les classes existantes', counts.students === 3 && counts.classes === 2 && counts.books === 1, `${imported.message} ${JSON.stringify(counts)}`);

  // Suppression d'une classe qui contient des eleves : refusee
  await js("await refreshAll(); setActiveTab('students');");
  await js("document.querySelector('.delete-entity[data-kind=class]').click();");
  await wait(300);
  await js("document.getElementById('confirmDialogConfirm').click();");
  await wait(600);
  check('classe avec élèves : suppression refusée avec explication', /contient encore/.test(await js("return document.getElementById('statusBar').textContent;")), await js("return document.getElementById('statusBar').textContent;"));

  // Suppression d'un eleve depuis la liste
  await js("Array.from(document.querySelectorAll('.delete-entity[data-kind=student]')).find((b) => b.dataset.name.includes('Noah')).click();");
  await wait(300);
  await js("document.getElementById('confirmDialogConfirm').click();");
  await wait(700);
  const students = await js('return window.api.studentsList();');
  check('élève supprimé depuis la liste', students.length === 2 && !students.some((s) => s.first_name === 'Noah'), students.map((s) => s.first_name).join(', '));

  // Cloture d'annee : CE1 -> CE2, les CM2 quittent l'ecole
  await js("document.getElementById('closeYearBtn').click(); document.getElementById('closeYearConfirmYes').click();");
  await wait(700);
  await js("document.querySelector('#closeYearForm button[type=submit]').click();");
  await wait(900);
  const after = await js('return window.api.studentsList();');
  const lea = after.find((s) => s.first_name === 'Léa');
  const jules = after.find((s) => s.first_name === 'Jules');
  const allClasses = await js('return window.api.classesList();');
  check('clôture : Léa passe en CE2 dans la nouvelle année', lea && /CE2/.test(lea.class_name) && lea.school_year !== year, lea && `${lea.class_name} ${lea.school_year}`);
  check('clôture : Jules (CM2) reste dans son ancienne classe', jules && /CM2/.test(jules.class_name) && jules.school_year === year, jules && `${jules.class_name} ${jules.school_year}`);
  check('clôture : aucune classe vide créée pour les CM2', allClasses.length === 3, allClasses.map((c) => `${c.name} (${c.school_year})`).join(', '));

  // Fiche livre : s'ouvre tout de suite meme sans couverture memorisee
  await js("setActiveTab('books');");
  const started = Date.now();
  await js("document.querySelector('#booksTable tr td').click();");
  await wait(150);
  check('fiche livre ouverte immédiatement', await js("return !document.getElementById('bookPreviewModal').classList.contains('hidden');"), `${Date.now() - started} ms`);
}

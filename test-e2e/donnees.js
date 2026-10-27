/* Donnees, sauvegardes cle USB, import et restauration (voir run.js). */
const { app, dialog, BrowserWindow } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

const projectDir = process.env.BIBLIO_DIR;
const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-e2e-'));
const usbDir = fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-usb-'));
app.setPath('userData', userData);
fs.writeFileSync(path.join(process.env.BIBLIO_OUT, 'userdata.txt'), userData);

// Reponses automatiques aux boites de dialogue (file d'attente pilotee par le scenario).
const answers = [];
const seenDialogs = [];
const answer = () => (answers.length ? answers.shift() : 0);
dialog.showMessageBox = async (...args) => {
  const opts = args.find((a) => a && typeof a === 'object' && a.message) || {};
  seenDialogs.push(opts.message + ' | ' + (opts.buttons || []).join(' / '));
  return { response: answer() };
};
let nextOpenPath = null;
let nextSavePath = null;
dialog.showOpenDialog = async () => ({ canceled: !nextOpenPath, filePaths: nextOpenPath ? [nextOpenPath] : [] });
dialog.showSaveDialog = async () => ({ canceled: !nextSavePath, filePath: nextSavePath });

require(path.join(projectDir, 'electron-main.js'));

const results = [];
function check(name, ok, detail) {
  results.push(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail ? ' -> ' + detail : ''}`);
}

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () => run(win).catch((err) => {
    results.push('ERREUR SCENARIO ' + (err && err.stack ? err.stack : err));
  }).finally(() => {
    fs.writeFileSync(path.join(process.env.BIBLIO_OUT, 'results.txt'), results.join('\n') + '\n\nDialogues vus :\n' + seenDialogs.join('\n'));
    app.exit(0);
  }));
});

async function run(win) {
  const api = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const dbFile = (key) => path.join(userData, `biblio-${key}.sqlite3`);

  // 1. Donnees de depart
  await api(`
    await window.api.yearsAdd({ name: '2025-2026' });
    const years = await window.api.yearsList();
    await window.api.classesAdd({ school_year_id: years[0].id, teacher_name: 'Mme Dupont', level: 'CE1' });
    const classes = await window.api.classesList();
    await window.api.studentsAdd({ class_id: classes[0].id, last_name: 'Martin', first_name: 'Lea' });
    await window.api.booksAdd({ title: 'Le Petit Prince', author: 'Saint-Exupery', copies: 2, numero: 'L-001' });
    await window.api.booksAdd({ title: 'Matilda', author: 'Roald Dahl', copies: 1 });
    const students = await window.api.studentsList();
    const books = await window.api.booksList();
    await window.api.loansAdd({ book_id: books[0].id, student_id: students[0].id });
  `);
  const info = await api('return window.api.libraryInfo();');
  check('donnees de depart', info.counts.books === 2 && info.counts.loans === 1, JSON.stringify(info.counts));

  // 2a. Une annee qui contient encore une classe ne peut pas etre supprimee
  let refusal = '';
  try {
    await api(`
      await window.api.yearsAdd({ name: 'Annee test' });
      const y = (await window.api.yearsList()).find((r) => r.name === 'Annee test');
      await window.api.classesAdd({ school_year_id: y.id, teacher_name: 'M. Test', level: 'CP' });
      await window.api.yearsDelete(y.id);
    `);
  } catch (e) { refusal = String(e.message); }
  check('annee encore utilisee : suppression refusee', /contient encore 1 classe/.test(refusal), refusal.slice(-70));

  // 2b. Les cles etrangeres restent actives apres un enregistrement (bug sql.js export) :
  // supprimer un eleve efface en cascade ses anciens prets.
  const before = (await api('return window.api.statsGet();')).totalLoans;
  await api(`
    const c = (await window.api.classesList())[0];
    await window.api.studentsAdd({ class_id: c.id, last_name: 'Temporaire', first_name: 'Eleve' });
    await window.api.booksAdd({ title: 'Livre temporaire', copies: 1 });
    const s = (await window.api.studentsList()).find((x) => x.last_name === 'Temporaire');
    const b = (await window.api.booksList()).find((x) => x.title === 'Livre temporaire');
    const loans = await window.api.loansAdd({ book_id: b.id, student_id: s.id });
    await window.api.loansReturn(loans.find((l) => l.student_id === s.id).id);
    await window.api.studentsDelete(s.id);
    await window.api.booksDelete(b.id);
  `);
  const after = (await api('return window.api.statsGet();')).totalLoans;
  check('cles etrangeres actives : prets de l\'eleve supprime effaces en cascade', after === before, `${before} -> ${after}`);

  // 3. Sauvegarde cle USB en clair, verifiee
  nextSavePath = path.join(usbDir, 'Sauvegarde.json');
  const saved = await api('return window.api.backupSave();');
  const usbContent = JSON.parse(fs.readFileSync(nextSavePath, 'utf-8'));
  check('sauvegarde USB lisible en clair', usbContent.meta.format === 'biblio-rians-sauvegarde' && usbContent.libraries.length >= 1, saved.message);
  const status = await api('return window.api.backupStatus();');
  check('date de derniere sauvegarde memorisee', status.days === 0, JSON.stringify(status));

  // 4. Reimporter son propre fichier chiffre .sqlite3 (avant : bloquait l'application)
  const ownCopy = path.join(usbDir, 'copie.sqlite3');
  fs.copyFileSync(dbFile('primaire'), ownCopy);
  nextOpenPath = ownCopy;
  answers.push(1);
  const reimport = await api('return window.api.importPick();');
  const afterReimport = await api('return window.api.libraryInfo();');
  check('reimport de son propre fichier chiffre', !reimport.canceled && afterReimport.counts.books === 2, reimport.message);

  // 5. Fichier .db qui n'est pas une bibliotheque : refuse, rien ne change
  const garbage = path.join(usbDir, 'pas-une-base.db');
  fs.writeFileSync(garbage, 'ceci n\'est pas une base de donnees '.repeat(50));
  nextOpenPath = garbage;
  let garbageError = '';
  try { await api('return window.api.importPick();'); } catch (e) { garbageError = String(e.message); }
  const afterGarbage = await api('return window.api.libraryInfo();');
  check('fichier invalide refuse sans rien abimer', /valide/.test(garbageError) && afterGarbage.counts.books === 2, garbageError.slice(-80));

  // 6. Annuler une confirmation ne change rien
  nextOpenPath = ownCopy;
  answers.push(0);
  const canceled = await api('return window.api.importPick();');
  check('annulation respectee', canceled.canceled === true);

  // 7. Restauration depuis la cle USB apres une erreur de manipulation
  await api(`const b = (await window.api.booksList()).find((x) => x.title === 'Matilda'); await window.api.booksDelete(b.id);`);
  nextOpenPath = path.join(usbDir, 'Sauvegarde.json');
  answers.push(1);
  const restored = await api('return window.api.importPick();');
  const titles = await api("return (await window.api.booksList()).map((b) => b.title + ':' + (b.numero || ''));");
  check('restauration USB : livre supprime retrouve, numero conserve', titles.includes('Matilda:') && titles.includes('Le Petit Prince:L-001'), restored.message + ' ' + JSON.stringify(titles));
  const loansAfter = await api("return (await window.api.loansList()).map((l) => l.book_title + '/' + l.student_name);");
  check('restauration USB : pret toujours relie au bon livre et au bon eleve', loansAfter.length === 1 && loansAfter[0] === 'Le Petit Prince/Martin Lea', JSON.stringify(loansAfter));

  // 8. Copies de securite faites avant les operations risquees
  const backupDir = path.join(userData, 'backups', 'primaire');
  const backupFiles = fs.readdirSync(backupDir);
  check('copies de securite et sauvegarde du jour presentes',
    backupFiles.some((n) => n.startsWith('jour-')) && backupFiles.some((n) => n.includes('avant-remplacement')) && backupFiles.some((n) => n.includes('avant-restauration')),
    backupFiles.join(', '));

  // 9. Bibliotheque abimee : secours au lieu d'un plantage
  await api(`await window.api.librarySet('maternelle'); await window.api.booksAdd({ title: 'Petit Ours Brun', copies: 1 });`);
  await api(`await window.api.librarySet('primaire');`); // la bascule ecrit la sauvegarde du jour de Maternelle
  fs.writeFileSync(dbFile('maternelle'), Buffer.from('fichier completement abime'));
  answers.push(0); // "Restaurer la sauvegarde automatique du ..."
  const active = await api(`return window.api.librarySet('maternelle');`);
  const matBooks = await api('return (await window.api.booksList()).map((b) => b.title);');
  const setAside = fs.readdirSync(userData).filter((n) => n.startsWith('biblio-maternelle.sqlite3.endommage-'));
  check('bibliotheque abimee restauree depuis la sauvegarde automatique', active === 'maternelle' && matBooks.includes('Petit Ours Brun'), JSON.stringify(matBooks));
  check('fichier abime mis de cote, pas efface', setAside.length === 1, setAside.join(','));

  // 10. Import Excel de l'export de l'application (une seule feuille) dans une autre bibliotheque
  await api(`await window.api.librarySet('primaire');`);
  const xlsx = await api(`return window.api.dataExportCustom({ format: 'xlsx', datasets: ['books','students','classes','school_years','loans'], fields: {} });`);
  const xlsxPath = path.join(usbDir, 'export.xlsx');
  fs.writeFileSync(xlsxPath, Buffer.from(xlsx.base64, 'base64'));
  await api(`await window.api.libraryCreate('Essai Excel'); await window.api.librarySet('essai-excel');`);
  nextOpenPath = xlsxPath;
  answers.push(1);
  const merged = await api('return window.api.importPick();');
  const essai = await api('return window.api.libraryInfo();');
  check('import Excel de l\'export : livres, eleves et pret repris', essai.counts.books === 2 && essai.counts.students === 1 && essai.counts.loans === 1, merged.message + ' ' + JSON.stringify(essai.counts));

  // 11. Suppression d'une bibliotheque : fichier range, pas efface
  await api(`await window.api.libraryDelete('essai-excel');`);
  const trash = path.join(userData, 'bibliotheques-supprimees');
  check('bibliotheque supprimee rangee dans un dossier a part', fs.existsSync(trash) && fs.readdirSync(trash).length === 1);
}

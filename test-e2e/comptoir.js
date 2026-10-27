/* Test du comptoir de pret (lot 3) en pilotant l'interface comme un utilisateur. */
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-desk-')));
dialog.showMessageBox = async () => ({ response: 1 });
require(path.join(process.env.BIBLIO_DIR, 'electron-main.js'));

const results = [];
const consoleErrors = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail !== undefined ? ' -> ' + detail : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.on('console-message', (event) => {
    if (event.level === 'error' || event.level === 3) consoleErrors.push(event.message);
  });
  win.webContents.once('did-finish-load', () => run(win)
    .catch((err) => results.push('ERREUR SCENARIO ' + (err && err.stack ? err.stack : err)))
    .finally(() => {
      results.push(`Erreurs JavaScript : ${consoleErrors.length ? consoleErrors.join(' | ') : 'aucune'}`);
      fs.writeFileSync(path.join(process.env.BIBLIO_OUT, 'results-desk.txt'), results.join('\n'));
      app.exit(0);
    }));
});

async function run(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const type = (id, value) => js(`const el = document.getElementById('${id}'); el.value = ${JSON.stringify(value)}; el.dispatchEvent(new Event('input', { bubbles: true }));`);
  const click = (selector) => js(`document.querySelector(${JSON.stringify(selector)}).click();`);
  const text = (selector) => js(`const el = document.querySelector(${JSON.stringify(selector)}); return el ? el.textContent.replace(/\\s+/g, ' ').trim() : null;`);

  await wait(500);
  await js(`
    await window.api.yearsAdd({ name: '2026-2027' });
    const y = (await window.api.yearsList())[0];
    await window.api.classesAdd({ school_year_id: y.id, teacher_name: 'Mme Dupont', level: 'CE1' });
    const c = (await window.api.classesList())[0];
    await window.api.studentsAdd({ class_id: c.id, last_name: 'Martin', first_name: 'Léa' });
    await window.api.studentsAdd({ class_id: c.id, last_name: 'Durand', first_name: 'Noah' });
    await window.api.booksAdd({ title: 'Le Petit Prince', author: 'Saint-Exupéry', isbn: '9782070612758', copies: 2 });
    await window.api.booksAdd({ title: 'Matilda', author: 'Roald Dahl', isbn: '9780141365466', copies: 1 });
    await refreshAll();
    setActiveTab('loans');
  `);
  await wait(300);

  // Pret 1 : recherche de l'eleve sans accent, puis scan du livre
  await type('deskStudentSearch', 'lea');
  check('recherche sans accent trouve Léa', /Martin Léa/.test(await text('#deskStudentResults')), await text('#deskStudentResults'));
  await click('#deskStudentResults .pick-item');
  await type('deskBookSearch', '9782070612758');
  check('scan : livre choisi automatiquement', /Le Petit Prince/.test(await text('#deskBookChosen')), await text('#deskBookChosen'));
  check('bouton Valider actif', (await js("return document.getElementById('deskLendBtn').disabled;")) === false);
  await click('#deskLendBtn');
  await wait(600);

  // Pret 2 : meme livre, eleve choisi dans la liste de la classe
  await js(`const sel = document.getElementById('deskClassFilter'); sel.value = sel.options[1].value; sel.dispatchEvent(new Event('change'));`);
  const classList = await text('#deskStudentResults');
  check('liste de la classe affichee sans rien taper', /Durand Noah/.test(classList) && /Martin Léa/.test(classList), classList);
  await js(`Array.from(document.querySelectorAll('#deskStudentResults .pick-item')).find((b) => b.textContent.includes('Durand')).click();`);
  await type('deskBookSearch', 'petit prin');
  await click('#deskBookResults .pick-item');
  await click('#deskLendBtn');
  await wait(600);

  // Pret 3 : Matilda a Lea, a rendre hier (en retard) ; puis livre plus disponible
  await js(`document.getElementById('deskClassFilter').value = ''; document.getElementById('deskClassFilter').dispatchEvent(new Event('change'));`);
  await type('deskStudentSearch', 'martin');
  await click('#deskStudentResults .pick-item');
  check('fiche élève : livre déjà emprunté affiché', /Le Petit Prince/.test(await text('#deskStudentChosen')), await text('#deskStudentChosen'));
  await type('deskBookSearch', '9780141365466');
  const yesterday = await js("const d = new Date(); d.setDate(d.getDate() - 1); return localDateString(d);");
  await js(`document.getElementById('deskDueDate').value = '${yesterday}';`);
  await click('#deskLendBtn');
  await wait(600);
  let loans = await js('return window.api.loansList();');
  check('3 prêts enregistrés', loans.length === 3, loans.map((l) => `${l.book_title}/${l.student_name}/${l.class_name}`).join(', '));

  await type('deskStudentSearch', 'noah');
  await click('#deskStudentResults .pick-item');
  await type('deskBookSearch', 'matilda');
  check('livre plus disponible : impossible de valider', /tous les exemplaires sont prêtés/.test(await text('#deskBookResults')) || (await js("return document.getElementById('deskLendBtn').disabled;")), await text('#deskBookResults'));
  await js("document.querySelector('[data-desk-clear=\"student\"]').click();");

  // Retards : seul le pret d'hier est en retard
  await click('.loan-filter-btn[data-filter="overdue"]');
  await wait(300);
  const overdueRows = await js("return Array.from(document.querySelectorAll('#loansTable tr')).map((tr) => tr.textContent.replace(/\\s+/g, ' ').trim());");
  check('filtre En retard : seul Matilda', overdueRows.length === 1 && overdueRows[0].includes('Matilda'), JSON.stringify(overdueRows));
  check('bouton Imprimer les retards visible', (await js("return !document.getElementById('printOverdueBtn').classList.contains('hidden');")));

  // Retour : 2 eleves ont Le Petit Prince -> il faut choisir
  await click('.mode-btn[data-mode="return"]');
  await type('deskReturnSearch', '9782070612758');
  await wait(300);
  const choices = await js("return document.querySelectorAll('#deskReturnResults .pick-item').length;");
  check('livre prêté 2 fois : l\'application demande qui le rend', choices === 2, `${choices} choix`);
  await js(`Array.from(document.querySelectorAll('#deskReturnResults .pick-item')).find((b) => b.textContent.includes('Durand')).click();`);
  await wait(600);
  loans = await js('return window.api.loansList();');
  check('le bon prêt est rendu (Noah), celui de Léa reste', loans.length === 2 && loans.some((l) => l.book_title === 'Le Petit Prince' && l.student_name === 'Martin Léa'), loans.map((l) => `${l.book_title}/${l.student_name}`).join(', '));

  // Retour direct : un seul pret pour Matilda -> rendu au scan
  await type('deskReturnSearch', '9780141365466');
  await wait(700);
  loans = await js('return window.api.loansList();');
  check('scan d\'un livre prêté une seule fois : rendu immédiat', loans.length === 1 && loans[0].book_title === 'Le Petit Prince', loans.map((l) => l.book_title).join(', '));

  // Scanner un livre non emprunte en mode Rendre ne fait rien de mal
  await type('deskReturnSearch', '9780141365466');
  await wait(300);
  check('livre non emprunté : message clair', /n'est noté comme emprunté par personne/.test(await text('#deskReturnResults')), await text('#deskReturnResults'));

  // Historique
  await click('.loan-filter-btn[data-filter="history"]');
  await wait(400);
  const history = await js("return document.querySelectorAll('#loansTable tr').length;");
  check('historique : 2 livres rendus', history === 2, history);

  // Accueil : compteur de retards a jour
  check('accueil : plus aucun retard', /Aucun/.test(await text('#homeTileOverdueText')), await text('#homeTileOverdueText'));
}

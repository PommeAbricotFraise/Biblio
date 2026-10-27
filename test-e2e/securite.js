/* Tests de securite de bout en bout (lot 2). */
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const os = require('os');

app.setPath('userData', fs.mkdtempSync(path.join(os.tmpdir(), 'biblio-sec-')));
dialog.showMessageBox = async () => ({ response: 0 });
require(path.join(process.env.BIBLIO_DIR, 'electron-main.js'));

const results = [];
const check = (name, ok, detail) => results.push(`${ok ? 'OK  ' : 'ECHEC'} ${name}${detail !== undefined ? ' -> ' + detail : ''}`);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

app.on('browser-window-created', (_e, win) => {
  win.webContents.once('did-finish-load', () => run(win)
    .catch((err) => results.push('ERREUR SCENARIO ' + (err && err.stack ? err.stack : err)))
    .finally(() => {
      fs.writeFileSync(path.join(process.env.BIBLIO_OUT, 'results-security.txt'), results.join('\n'));
      app.exit(0);
    }));
});

async function run(win) {
  const js = (code) => win.webContents.executeJavaScript(`(async () => { ${code} })()`);
  const rejects = async (code) => {
    try { await js(code); return '(accepte !)'; } catch (e) { return String(e.message).replace(/^.*?Error: /, ''); }
  };

  // Validation des donnees
  let msg = await rejects("await window.api.booksAdd({ title: '   ' });");
  check('livre sans titre refuse', /titre est obligatoire/.test(msg), msg);
  msg = await rejects("await window.api.booksAdd({ title: 'X', copies: 5000 });");
  check('nombre d\'exemplaires absurde refuse', /entre 1 et 999/.test(msg), msg);
  msg = await rejects("await window.api.booksDelete('1; DROP TABLE books');");
  check('identifiant invalide refuse', /introuvable/.test(msg), msg);
  msg = await rejects("await window.api.loansAdd({ book_id: 1, student_id: 'abc' });");
  check('pret avec eleve invalide refuse', /introuvable/.test(msg), msg);
  await js("await window.api.yearsAdd({ name: '2025-2026' });");
  msg = await rejects("await window.api.yearsAdd({ name: '2025-2026' });");
  check('annee en double : message clair', msg === 'Cette année scolaire existe déjà.', msg);

  // Faille XSS : nom d'annee piege, puis ouverture de l'assistant de cloture
  await js(`await window.api.yearsAdd({ name: '<img src=x onerror="window.__pwned=1">' });`);
  await js("document.getElementById('closeYearBtn').click(); document.getElementById('closeYearConfirmYes').click();");
  await wait(800);
  const xss = await js("return { pwned: window.__pwned === 1, text: Array.from(document.querySelectorAll('#closeYearCurrent option')).map((o) => o.textContent).join(' | ') };");
  check('nom d\'annee piege affiche comme du texte, non execute', !xss.pwned && xss.text.includes('<img'), xss.text);
  await js("document.getElementById('closeYearClose').click();");

  // CSP : un gestionnaire inline injecte ne s'execute pas
  await js(`document.body.insertAdjacentHTML('beforeend', '<img src="x" onerror="window.__pwned2=1">');`);
  await wait(500);
  check('CSP : code injecte bloque', !(await js('return window.__pwned2 === 1;')));
  msg = await rejects("const s = document.createElement('script'); s.textContent = 'window.__pwned3 = 1'; document.body.appendChild(s); await new Promise((r) => setTimeout(r, 200)); if (window.__pwned3) throw new Error('script inline execute');");
  check('CSP : script inline bloque', msg === '(accepte !)' && !(await js('return window.__pwned3 === 1;')));

  // Navigation et fenetres
  const before = win.webContents.getURL();
  await js("location.href = 'https://example.com/';");
  await wait(1000);
  check('navigation vers un site externe bloquee', win.webContents.getURL() === before, win.webContents.getURL());
  check('ouverture de nouvelle fenetre bloquee', (await js("return window.open('https://example.com') === null;")) === true);

  // Mot de passe et verrou
  await js("await window.api.authSet('1234', '');");
  const locked = await js('return window.api.authLock();');
  check('verrouillage', locked === true);
  msg = await rejects('await window.api.booksList();');
  check('donnees refusees tant que verrouille', /verrouillée/.test(msg), msg);
  msg = await rejects("await window.api.authSet('', 'nimportequoi');");
  check('impossible de retirer le mot de passe quand verrouille', /verrouillée|incorrect/.test(msg), msg);

  const attempts = [];
  for (let i = 0; i < 5; i += 1) attempts.push(await js("return window.api.authVerify('mauvais');"));
  check('5 essais rates : pause imposee', attempts[4].waitSeconds === 30, JSON.stringify(attempts[4]));
  const duringLockout = await js("return window.api.authVerify('1234');");
  check('meme le bon mot de passe attend la fin de la pause', !duringLockout.ok, JSON.stringify(duringLockout));

  // Rechargement de la page verrouillee : rien n'est charge, la page est inactive
  win.webContents.reload();
  await new Promise((r) => win.webContents.once('did-finish-load', r));
  await wait(800);
  const lockedUi = await js("return { lock: !document.getElementById('lockScreen').classList.contains('hidden'), inert: document.querySelector('main').inert, rows: document.querySelectorAll('#yearsTable tr').length };");
  check('au lancement : ecran de verrouillage, page inactive, aucune donnee', lockedUi.lock && lockedUi.inert && lockedUi.rows === 0, JSON.stringify(lockedUi));

  // Fin de la pause (simulee en attendant 30 s), puis deverrouillage par le formulaire
  await wait(30500);
  await js("document.getElementById('lockPassword').value = '1234'; document.getElementById('lockForm').requestSubmit();");
  await wait(1500);
  const unlockedUi = await js("return { lock: !document.getElementById('lockScreen').classList.contains('hidden'), inert: document.querySelector('main').inert, rows: document.querySelectorAll('#yearsTable tr').length, lockBtn: !document.getElementById('lockAppBtn').classList.contains('hidden') };");
  check('deverrouillage : donnees chargees, bouton Verrouiller visible', !unlockedUi.lock && !unlockedUi.inert && unlockedUi.rows === 2 && unlockedUi.lockBtn, JSON.stringify(unlockedUi));

  msg = await rejects("await window.api.authSet('', 'faux');");
  check('retirer le mot de passe exige le mot de passe actuel', /incorrect/.test(msg), msg);
  await js("await window.api.authSet('', '1234');");
  check('retrait avec le bon mot de passe', (await js('return window.api.authIsSet();')) === false);
}

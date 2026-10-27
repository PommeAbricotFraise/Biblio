/* Demarrage avec une base abimee, puis tentative de second lancement. */
const { app, dialog } = require('electron');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

const projectDir = process.env.BIBLIO_DIR;
const out = process.env.BIBLIO_OUT;
const userData = process.env.BIBLIO_USERDATA;
app.setPath('userData', userData);

const isSecond = process.env.BIBLIO_SECOND === '1';
const seen = [];
dialog.showMessageBox = async (...args) => {
  const opts = args.find((a) => a && typeof a === 'object' && a.message) || {};
  seen.push(opts.message);
  return { response: 0 };
};

if (!isSecond) {
  // On abime la bibliotheque active (Primaire) avant le demarrage.
  fs.writeFileSync(path.join(userData, 'biblio-primaire.sqlite3'), Buffer.from('panne de disque simulee'));
}

require(path.join(projectDir, 'electron-main.js'));

if (!isSecond) {
  app.on('browser-window-created', (_e, win) => {
    win.webContents.once('did-finish-load', async () => {
      const lines = [];
      try {
        const info = await win.webContents.executeJavaScript('window.api.libraryInfo()');
        lines.push(`${info.counts.books === 2 ? 'OK  ' : 'ECHEC'} demarrage avec base abimee : secours propose puis restauration -> ${JSON.stringify(info.counts)}`);
        lines.push(`     dialogue vu : ${seen[0] || '(aucun)'}`);

        const started = Date.now();
        const second = spawn(process.execPath, [__filename], {
          env: { ...process.env, BIBLIO_SECOND: '1' },
          stdio: 'ignore'
        });
        const code = await new Promise((resolve) => {
          const timer = setTimeout(() => { second.kill(); resolve('toujours ouvert apres 15 s'); }, 15000);
          second.on('exit', (c) => { clearTimeout(timer); resolve(c); });
        });
        const elapsed = Date.now() - started;
        lines.push(`${code === 0 && elapsed < 15000 ? 'OK  ' : 'ECHEC'} second lancement refuse (une seule fenetre) -> code ${code} en ${elapsed} ms`);
      } catch (err) {
        lines.push('ERREUR ' + (err && err.stack ? err.stack : err));
      }
      fs.writeFileSync(path.join(out, 'results-startup.txt'), lines.join('\n'));
      app.exit(0);
    });
  });
}

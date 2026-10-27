'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  dailyBackupName,
  safetyBackupName,
  isAutoBackupName,
  selectBackupsToDelete
} = require('../backup-policy');

function dayName(date) {
  return dailyBackupName(date);
}

test('les noms de sauvegarde utilisent la date locale', () => {
  assert.equal(dailyBackupName(new Date(2026, 0, 5, 23, 45)), 'jour-2026-01-05.json');
  assert.equal(safetyBackupName('Avant clôture année', new Date(2026, 0, 5, 8, 3, 9)), 'securite-2026-01-05-08-03-09-avant-cloture-annee.json');
  assert.ok(isAutoBackupName(safetyBackupName('avant-import')));
  assert.ok(!isAutoBackupName('backup-2025-01-01.json'));
});

test('on garde 30 jours, puis une sauvegarde par mois, et jamais les autres fichiers', () => {
  const names = [];
  for (let i = 0; i < 120; i += 1) {
    names.push(dayName(new Date(2026, 0, 1 + i)));
  }
  names.push('notes-personnelles.json');

  const toDelete = selectBackupsToDelete(names);
  const kept = names.filter((name) => !toDelete.includes(name));

  const newest30 = names.slice(90, 120);
  newest30.forEach((name) => assert.ok(kept.includes(name), `${name} doit etre garde`));
  assert.ok(kept.includes('jour-2026-01-31.json'), 'derniere sauvegarde de janvier gardee');
  assert.ok(kept.includes('jour-2026-02-28.json'), 'derniere sauvegarde de fevrier gardee');
  assert.ok(!kept.includes('jour-2026-01-15.json'), 'milieu de mois ancien supprime');
  assert.ok(kept.includes('notes-personnelles.json'));
  assert.ok(!toDelete.includes('notes-personnelles.json'));
});

test('on garde les 20 copies de securite les plus recentes', () => {
  const names = [];
  for (let i = 0; i < 25; i += 1) {
    names.push(safetyBackupName('avant-import', new Date(2026, 2, 1, 8, i, 0)));
  }
  const toDelete = selectBackupsToDelete(names);
  assert.equal(toDelete.length, 5);
  assert.ok(toDelete.every((name) => name < names[5]));
});

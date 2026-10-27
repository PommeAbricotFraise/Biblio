'use strict';

/*
 * Politique des sauvegardes automatiques (une par bibliotheque, dans
 * backups/<cle-bibliotheque>/) :
 *  - "jour-AAAA-MM-JJ.json" : etat de la bibliotheque en fin de journee
 *    (reecrit au fil de la journee, les jours precedents ne bougent plus) ;
 *    on garde les 30 derniers jours, puis la derniere sauvegarde de chacun
 *    des 12 derniers mois.
 *  - "securite-AAAA-MM-JJ-HH-MM-SS-<raison>.json" : copie faite juste avant
 *    une operation risquee (import, restauration, cloture d'annee...) ;
 *    on garde les 20 plus recentes.
 *
 * Module independant d'Electron, pour pouvoir etre teste simplement.
 */

const DAILY_PATTERN = /^jour-(\d{4})-(\d{2})-(\d{2})\.json$/;
const SAFETY_PATTERN = /^securite-\d{4}-\d{2}-\d{2}-\d{2}-\d{2}-\d{2}(-[a-z0-9-]+)?\.json$/;

function pad(n) {
  return String(n).padStart(2, '0');
}

/* Date locale (et non UTC) : une sauvegarde faite a 23h30 reste sur le bon jour. */
function localDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

function localTimeStamp(date = new Date()) {
  return `${localDateStamp(date)}-${pad(date.getHours())}-${pad(date.getMinutes())}-${pad(date.getSeconds())}`;
}

function dailyBackupName(date = new Date()) {
  return `jour-${localDateStamp(date)}.json`;
}

function safetyBackupName(reason, date = new Date()) {
  const slug = String(reason || '')
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
  return `securite-${localTimeStamp(date)}${slug ? `-${slug}` : ''}.json`;
}

function isAutoBackupName(name) {
  return DAILY_PATTERN.test(name) || SAFETY_PATTERN.test(name);
}

/* Retourne les noms de fichiers a supprimer. Les autres fichiers ne sont jamais touches. */
function selectBackupsToDelete(names, { keepDaily = 30, keepMonthly = 12, keepSafety = 20 } = {}) {
  const daily = names.filter((name) => DAILY_PATTERN.test(name)).sort().reverse();
  const safety = names.filter((name) => SAFETY_PATTERN.test(name)).sort().reverse();
  const keep = new Set(daily.slice(0, keepDaily));

  const newestPerMonth = new Map();
  daily.forEach((name) => {
    const month = name.slice('jour-'.length, 'jour-AAAA-MM'.length);
    if (!newestPerMonth.has(month)) newestPerMonth.set(month, name);
  });
  Array.from(newestPerMonth.values()).slice(0, keepMonthly).forEach((name) => keep.add(name));

  safety.slice(0, keepSafety).forEach((name) => keep.add(name));
  return [...daily, ...safety].filter((name) => !keep.has(name));
}

module.exports = {
  localDateStamp,
  localTimeStamp,
  dailyBackupName,
  safetyBackupName,
  isAutoBackupName,
  selectBackupsToDelete
};

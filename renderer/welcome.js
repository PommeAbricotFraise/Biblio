/*
 * Assistant de premier demarrage : propose de creer l'annee scolaire et les
 * classes quand une bibliotheque est totalement vide, puis indique comment
 * ajouter eleves et livres. Charge apres app.js (utilise ses outils).
 */

const welcomeEls = {
  modal: document.getElementById('welcomeModal'),
  step1: document.getElementById('welcomeStep1'),
  step2: document.getElementById('welcomeStep2'),
  year: document.getElementById('welcomeYear'),
  classes: document.getElementById('welcomeClasses'),
  addClass: document.getElementById('welcomeAddClass'),
  create: document.getElementById('welcomeCreate'),
  restore: document.getElementById('welcomeRestore'),
  skip: document.getElementById('welcomeSkip'),
  oneByOne: document.getElementById('welcomeOneByOne'),
  excel: document.getElementById('welcomeExcel'),
  finish: document.getElementById('welcomeFinish'),
  doneText: document.getElementById('welcomeDoneText')
};

function welcomeStorageKey() {
  return `biblio_welcome_done_${librarySelect ? librarySelect.value : ''}`;
}

function currentSchoolYearName(date = new Date()) {
  // A partir d'aout, on prepare l'annee qui commence a la rentree.
  const year = date.getFullYear();
  return date.getMonth() >= 7 ? `${year}-${year + 1}` : `${year - 1}-${year}`;
}

function addWelcomeClassRow() {
  const row = document.createElement('div');
  row.className = 'welcome-class-row';
  row.innerHTML = `
    <input name="level" list="levelOptions" placeholder="Niveau (ex : CE1)" aria-label="Niveau" />
    <input name="teacher" placeholder="Enseignant(e) (ex : Mme Dupont)" aria-label="Enseignant(e)" />`;
  welcomeEls.classes.appendChild(row);
  return row;
}

function closeWelcome() {
  try { localStorage.setItem(welcomeStorageKey(), '1'); } catch (e) { /* stockage indisponible */ }
  welcomeEls.modal.classList.add('hidden');
}

async function maybeShowWelcome() {
  if (!welcomeEls.modal) return;
  let done = false;
  try { done = localStorage.getItem(welcomeStorageKey()) === '1'; } catch (e) { done = false; }
  if (done) return;
  const years = await window.api.yearsList();
  const empty = !years.length && !cachedClasses.length && !cachedStudents.length && !cachedBooks.length;
  if (!empty) return;
  welcomeEls.step1.classList.remove('hidden');
  welcomeEls.step2.classList.add('hidden');
  welcomeEls.year.value = currentSchoolYearName();
  welcomeEls.classes.innerHTML = '';
  addWelcomeClassRow();
  addWelcomeClassRow();
  welcomeEls.modal.classList.remove('hidden');
}

welcomeEls.addClass.addEventListener('click', () => addWelcomeClassRow().querySelector('input').focus());
welcomeEls.skip.addEventListener('click', closeWelcome);

welcomeEls.restore.addEventListener('click', async () => {
  closeWelcome();
  await runImportPick();
});

welcomeEls.create.addEventListener('click', async () => {
  const yearName = welcomeEls.year.value.trim();
  if (!yearName) {
    setStatus('Indiquez l\'année scolaire (par exemple 2026-2027).', true);
    welcomeEls.year.focus();
    return;
  }
  welcomeEls.create.disabled = true;
  try {
    let years = await window.api.yearsList();
    let year = years.find((y) => y.name === yearName);
    if (!year) {
      years = await window.api.yearsAdd({ name: yearName });
      year = years.find((y) => y.name === yearName);
    }
    let created = 0;
    const rows = Array.from(welcomeEls.classes.querySelectorAll('.welcome-class-row'));
    for (const row of rows) {
      const level = row.querySelector('input[name="level"]').value.trim();
      const teacher = row.querySelector('input[name="teacher"]').value.trim();
      if (!level && !teacher) continue;
      await window.api.classesAdd({ school_year_id: year.id, level, teacher_name: teacher });
      created += 1;
    }
    await refreshAll();
    welcomeEls.doneText.textContent = created
      ? `C'est prêt : l'année ${yearName} et ${created} classe(s) sont créées. Ajoutez maintenant vos élèves et vos livres.`
      : `C'est prêt : l'année ${yearName} est créée. Ajoutez maintenant vos classes, vos élèves et vos livres.`;
    welcomeEls.step1.classList.add('hidden');
    welcomeEls.step2.classList.remove('hidden');
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    welcomeEls.create.disabled = false;
  }
});

welcomeEls.oneByOne.addEventListener('click', () => {
  closeWelcome();
  setActiveTab('students');
  openAddModalFor(cachedClasses.length ? 'student' : 'class', { showChoices: false });
});

welcomeEls.excel.addEventListener('click', async () => {
  try {
    const res = await window.api.dataTemplate();
    if (res && !res.canceled) setStatus(res.message);
  } catch (err) {
    setStatus(err.message, true);
  }
});

welcomeEls.finish.addEventListener('click', closeWelcome);

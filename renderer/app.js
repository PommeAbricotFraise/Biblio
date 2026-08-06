function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

const lockScreen = document.getElementById('lockScreen');
const lockForm = document.getElementById('lockForm');
const lockPassword = document.getElementById('lockPassword');
const lockError = document.getElementById('lockError');

async function initAuthLock() {
  if (!window.api || !window.api.authIsSet || !lockScreen) return;
  try {
    const isSet = await window.api.authIsSet();
    if (isSet) {
      lockScreen.classList.remove('hidden');
      if (lockPassword) setTimeout(() => lockPassword.focus(), 50);
    }
  } catch (e) {
    // si la verification echoue, ne pas bloquer l'acces a l'application
  }
}

if (lockForm) {
  lockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = lockPassword ? lockPassword.value : '';
    try {
      const ok = await window.api.authVerify(value);
      if (ok) {
        lockScreen.classList.add('hidden');
        if (lockError) lockError.classList.add('hidden');
        if (lockPassword) lockPassword.value = '';
      } else {
        if (lockError) lockError.classList.remove('hidden');
        if (lockPassword) { lockPassword.value = ''; lockPassword.focus(); }
      }
    } catch (e) {
      if (lockError) lockError.classList.remove('hidden');
    }
  });
}

initAuthLock();

const statusBar = document.getElementById('statusBar');
const librarySelect = document.getElementById('librarySelect');
const libraryBadge = document.getElementById('libraryBadge');
const openExport = document.getElementById('openExport');
const openImport = document.getElementById('openImport');
const exportModal = document.getElementById('exportModal');
const exportClose = document.getElementById('exportClose');
const exportForm = document.getElementById('exportForm');
const exportFormat = document.getElementById('exportFormat');
const importModal = document.getElementById('importModal');
const importClose = document.getElementById('importClose');
const importForm = document.getElementById('importForm');
const importFormat = document.getElementById('importFormat');
const importFile = document.getElementById('importFile');
const importQuickInput = document.getElementById('importQuickInput');

const tabs = document.querySelectorAll('.tabs button');
const tabSections = {
  books: document.getElementById('tab-books'),
  students: document.getElementById('tab-students'),
  loans: document.getElementById('tab-loans')
};

function focusBookIsbnInput() {
  const booksTab = tabSections.books;
  const addModalVisible = addModal && !addModal.classList.contains('hidden');
  if (!booksTab || !booksTab.classList.contains('active') || addModalVisible) return;
  ensureBookFormEditable();
  const isbnField = document.querySelector('#bookForm input[name="isbn"]');
  if (!isbnField) return;
  isbnField.disabled = false;
  isbnField.readOnly = false;
  isbnField.style.pointerEvents = 'auto';
  setTimeout(() => isbnField.focus(), 50);
}

function ensureBookFormEditable() {
  const fields = document.querySelectorAll('#bookForm input, #bookForm select, #bookForm button');
  fields.forEach((field) => {
    if (field && field.type !== 'button' && field.type !== 'submit') {
      field.disabled = false;
      field.readOnly = false;
      field.style.pointerEvents = 'auto';
    }
  });
  const isbnField = document.querySelector('#bookForm input[name="isbn"]');
  if (isbnField) {
    isbnField.disabled = false;
    isbnField.readOnly = false;
    isbnField.style.pointerEvents = 'auto';
  }
}

function setActiveTab(tabKey) {
  tabs.forEach((b) => b.classList.remove('active'));
  Object.values(tabSections).forEach((sec) => sec.classList.remove('active'));
  const btn = document.querySelector(`.tabs button[data-tab="${tabKey}"]`);
  if (btn) btn.classList.add('active');
  tabSections[tabKey].classList.add('active');
  if (tabKey === 'loans') {
    setTimeout(() => loanIsbn && loanIsbn.focus(), 50);
  } else if (tabKey === 'books') {
    focusBookIsbnInput();
  }
}

tabs.forEach((btn) => {
  btn.addEventListener('click', () => {
    setActiveTab(btn.dataset.tab);
  });
});

const openAddTab = document.getElementById('openAddTab');
const manageLibraryBtn = document.getElementById('manageLibraryBtn');
const manageLibraryModal = document.getElementById('manageLibraryModal');
const manageLibraryClose = document.getElementById('manageLibraryClose');
const libraryActionCreate = document.getElementById('libraryActionCreate');
const libraryActionRename = document.getElementById('libraryActionRename');
const libraryActionDelete = document.getElementById('libraryActionDelete');
const addClassBtn = document.getElementById('addClassBtn');
const addStudentBtn = document.getElementById('addStudentBtn');
const addSchoolYearBtn = document.getElementById('addSchoolYearBtn');
const addModal = document.getElementById('addModal');
const addModalTitle = document.getElementById('addModalTitle');
const addSelector = document.getElementById('addSelector');
const closeAddModal = document.getElementById('closeAddModal');
const addChoiceButtons = document.querySelectorAll('.add-choice-btn');
const closeYearBtn = document.getElementById('closeYearBtn');
const closeYearModal = document.getElementById('closeYearModal');
const closeYearClose = document.getElementById('closeYearClose');
const closeYearConfirmModal = document.getElementById('closeYearConfirmModal');
const closeYearConfirmClose = document.getElementById('closeYearConfirmClose');
const closeYearConfirmYes = document.getElementById('closeYearConfirmYes');
const closeYearConfirmNo = document.getElementById('closeYearConfirmNo');
const closeYearForm = document.getElementById('closeYearForm');
const closeYearCurrent = document.getElementById('closeYearCurrent');
const closeYearNext = document.getElementById('closeYearNext');
const closeYearClasses = document.getElementById('closeYearClasses');
const historyModal = document.getElementById('historyModal');
const historyClose = document.getElementById('historyClose');
const historyTable = document.getElementById('historyTable');
const bookPreviewModal = document.getElementById('bookPreviewModal');
const bookPreviewClose = document.getElementById('bookPreviewClose');
const bookPreviewTitle = document.getElementById('bookPreviewTitle');
const bookPreviewMeta = document.getElementById('bookPreviewMeta');
const bookPreviewImg = document.getElementById('bookPreviewImg');
const bookPreviewCoverPlaceholder = document.getElementById('bookPreviewCoverPlaceholder');
const bookPreviewCoverLoader = document.getElementById('bookPreviewCoverLoader');
const bookPreviewCopies = document.getElementById('bookPreviewCopies');
const bookPreviewAvailable = document.getElementById('bookPreviewAvailable');
const bookPreviewOnLoan = document.getElementById('bookPreviewOnLoan');
const loanForm = document.getElementById('loanForm');
const loanClass = document.getElementById('loanClass');
const loanStudent = document.getElementById('loanStudent');
const loanIsbn = document.getElementById('loanIsbn');
const loanBook = document.getElementById('loanBook');
const loanDueDate = document.getElementById('loanDueDate');
const loanSubmitBtn = document.getElementById('loanSubmitBtn');
const loanModeButtons = document.querySelectorAll('.loan-mode');
const loanSelectedBook = document.getElementById('loanSelectedBook');
const loanClassBadge = document.getElementById('loanClassBadge');
const loanStudentBadge = document.getElementById('loanStudentBadge');
const bookSortButtons = document.querySelectorAll('.book-sort');

let cachedBooks = [];
let cachedStudents = [];
let cachedClasses = [];
let currentLoanMode = 'loan';
let currentBookSort = { key: 'title', dir: 'asc' };
let suppressIsbnEnterUntil = 0;
let librariesCache = [
  { key: 'primaire', name: 'Primaire' },
  { key: 'maternelle', name: 'Maternelle' }
];

const schoolYearForm = document.getElementById('schoolYearForm');
const classForm = document.getElementById('classForm');
const studentForm = document.getElementById('studentForm');

const classYearSelect = document.getElementById('classYearSelect');
const studentClassSelect = document.getElementById('studentClassSelect');

function setAddModalContext(formType, options = {}) {
  const showChoices = options.showChoices !== false;
  const type = formType || 'school_year';
  const titles = {
    school_year: 'Ajouter une annee scolaire',
    class: 'Ajouter une classe',
    student: 'Ajouter un eleve'
  };

  if (addSelector) {
    addSelector.classList.toggle('hidden', !showChoices);
  }

  if (addModalTitle) {
    addModalTitle.textContent = showChoices ? 'Ajouter' : (titles[type] || 'Ajouter');
  }
}

function openAddModalFor(formType, options = {}) {
  const targetType = formType || 'school_year';
  resetEditModes();
  setAddModalContext(targetType, options);
  addModal.classList.remove('hidden');
  showAddForm(targetType);
  if (targetType === 'school_year') {
    const schoolYearNameInput = schoolYearForm.querySelector('input[name="name"]');
    if (schoolYearNameInput) {
      setTimeout(() => schoolYearNameInput.focus(), 50);
    }
  }
}

openAddTab.addEventListener('click', () => {
  const active = document.querySelector('.add-choice-btn.active');
  openAddModalFor(active ? active.dataset.add : 'school_year', { showChoices: true });
});

if (addClassBtn) {
  addClassBtn.addEventListener('click', () => openAddModalFor('class', { showChoices: false }));
}

if (addStudentBtn) {
  addStudentBtn.addEventListener('click', () => openAddModalFor('student', { showChoices: false }));
}

if (addSchoolYearBtn) {
  addSchoolYearBtn.addEventListener('click', () => openAddModalFor('school_year', { showChoices: false }));
}

closeAddModal.addEventListener('click', () => {
  addModal.classList.add('hidden');
  resetEditModes();
  setAddModalContext('school_year', { showChoices: true });
});

function showModal(modal) {
  if (!modal) return;
  modal.classList.remove('hidden');
  modal.style.display = 'flex';
  modal.style.zIndex = '1200';
}

function hideModal(modal) {
  if (!modal) return;
  modal.classList.add('hidden');
  modal.style.display = '';
  modal.style.zIndex = '';
}

if (openExport && exportModal && exportClose) {
  openExport.addEventListener('click', () => showModal(exportModal));
  exportClose.addEventListener('click', () => hideModal(exportModal));
}

console.log('openImport element:', openImport);
if (openImport) {
  console.log('Attaching click listener to openImport button');
  openImport.addEventListener('click', () => {
    console.log('openImport clicked!');
    setStatus('Ouverture de la fenetre d\'import...', false);
    if (window.api && window.api.importPick) {
      window.api.importPick().then((res) => {
        if (!res || res.canceled) {
          setStatus('Import annule.', false);
          return;
        }
        setStatus('Import ' + (res.type || 'fichier') + ' termine.', false);
        refreshAll();
      }).catch((err) => setStatus('Import impossible: ' + err.message, true));
      return;
    }
    if (importQuickInput) {
      setStatus('Ouverture du selecteur de fichier...', false);
      importQuickInput.value = '';
      importQuickInput.click();
      return;
    }
    if (importModal && importClose) {
      setStatus('Ouverture de la fenetre d\'import...', false);
      showModal(importModal);
    }
  });
}

if (importClose && importModal) {
  importClose.addEventListener('click', () => hideModal(importModal));
}

document.querySelectorAll('.export-toggle').forEach((btn) => {
  btn.addEventListener('click', () => {
    const target = document.querySelector(btn.dataset.target || '');
    if (!target) return;
    const checks = target.querySelectorAll('input[type="checkbox"]');
    const check = btn.dataset.action === 'all';
    checks.forEach((el) => {
      el.checked = check;
    });
  });
});

if (importQuickInput) {
  importQuickInput.addEventListener('change', async (event) => {
    const file = event.target.files && event.target.files[0];
    if (!file) return;
    if (!window.api) {
      setStatus('Import indisponible. Relancez l\'app.', true);
      return;
    }
    const name = file.name.toLowerCase();
    const datasets = ['books', 'students', 'classes', 'school_years', 'loans', 'student_history'];
    try {
      if (name.endsWith('.sqlite3') || name.endsWith('.db')) {
        if (!window.api.dataImportDb) {
          setStatus('Import BDD indisponible. Relancez l\'app.', true);
          return;
        }
        const buffer = new Uint8Array(await file.arrayBuffer());
        await window.api.dataImportDb({ buffer: Array.from(buffer) });
        setStatus('Import BDD termine.');
        refreshAll();
        return;
      }
      if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
        const buffer = new Uint8Array(await file.arrayBuffer());
        await window.api.dataImportCustom({ format: 'xlsx', datasets, buffer: Array.from(buffer) });
        setStatus('Import Excel termine.');
        refreshAll();
        return;
      }
      if (name.endsWith('.json')) {
        const content = await file.text();
        const payload = JSON.parse(content);
        await window.api.dataImportCustom({ format: 'json', datasets, data: payload });
        setStatus('Import JSON termine.');
        refreshAll();
        return;
      }
      setStatus('Format non supporte.', true);
    } catch (err) {
      setStatus('Import impossible: ' + err.message, true);
    }
  });
}

function resetEditModes() {
  delete schoolYearForm.dataset.mode;
  delete schoolYearForm.dataset.id;
  delete classForm.dataset.mode;
  delete classForm.dataset.id;
  delete studentForm.dataset.mode;
  delete studentForm.dataset.id;
  schoolYearForm.reset();
  classForm.reset();
  studentForm.reset();
}

closeYearBtn.addEventListener('click', () => {
  if (closeYearConfirmModal) closeYearConfirmModal.classList.remove('hidden');
});

if (closeYearConfirmClose) {
  closeYearConfirmClose.addEventListener('click', () => {
    closeYearConfirmModal.classList.add('hidden');
  });
}

if (closeYearConfirmNo) {
  closeYearConfirmNo.addEventListener('click', () => {
    closeYearConfirmModal.classList.add('hidden');
  });
}

if (closeYearConfirmYes) {
  closeYearConfirmYes.addEventListener('click', async () => {
    closeYearConfirmModal.classList.add('hidden');
    closeYearModal.classList.remove('hidden');
    await buildCloseYearWizard();
  });
}

closeYearClose.addEventListener('click', () => {
  closeYearModal.classList.add('hidden');
});

historyClose.addEventListener('click', () => {
  historyModal.classList.add('hidden');
});

bookPreviewClose.addEventListener('click', () => {
  bookPreviewModal.classList.add('hidden');
});
function getCheckedValues(selector) {
  return Array.from(document.querySelectorAll(selector))
    .filter((el) => el.checked)
    .map((el) => el.value);
}

function buildExportFields() {
  const fields = {};
  document.querySelectorAll('#exportForm input[data-field]').forEach((el) => {
    if (!el.checked) return;
    const raw = el.dataset.field || '';
    const parts = raw.split('.');
    if (parts.length !== 2) return;
    const [dataset, field] = parts;
    if (!fields[dataset]) fields[dataset] = [];
    fields[dataset].push(field);
  });
  return fields;
}

async function runExport(options) {
  const result = await window.api.dataExportCustom(options);
  const stamp = new Date().toISOString().slice(0, 10);
  if (options.format === 'xlsx') {
    const binary = atob(result.base64 || '');
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const blob = new Blob([bytes], {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `biblio-export-${stamp}.xlsx`;
    a.click();
    URL.revokeObjectURL(url);
    setStatus('Export Excel termine.');
    return;
  }

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `biblio-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Export JSON termine.');
}

if (exportForm) {
  exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const datasets = getCheckedValues('#exportForm input[name="dataset"]');
    const fields = buildExportFields();
    const format = exportFormat ? exportFormat.value : 'json';
    if (!datasets.length) {
      setStatus('Choisissez au moins un jeu de donnees.', true);
      return;
    }
    exportModal.classList.add('hidden');
    await runExport({ format, datasets, fields });
  });
}

if (importForm) {
  importForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    try {
      const file = importFile && importFile.files ? importFile.files[0] : null;
      const datasets = getCheckedValues('#importForm input[name="importDataset"]');
      const format = importFormat ? importFormat.value : 'json';
      if (!window.api || !window.api.dataImportCustom) {
        setStatus('Import indisponible. Relancez l\'app.', true);
        return;
      }
      if (!file) {
        setStatus('Choisissez un fichier a importer.', true);
        return;
      }
      if (!datasets.length) {
        setStatus('Choisissez au moins un jeu de donnees.', true);
        return;
      }
      importModal.classList.add('hidden');
      if (format === 'xlsx') {
        const buffer = new Uint8Array(await file.arrayBuffer());
        await window.api.dataImportCustom({ format, datasets, buffer: Array.from(buffer) });
        setStatus('Import Excel termine.');
        refreshAll();
        return;
      }
      const content = await file.text();
      const payload = JSON.parse(content);
      await window.api.dataImportCustom({ format, datasets, data: payload });
      setStatus('Import JSON termine.');
      refreshAll();
    } catch (err) {
      setStatus('Import impossible: ' + err.message, true);
    }
  });
}

function updateLibraryBadge(value) {
  if (!libraryBadge) return;
  const found = librariesCache.find((item) => item.key === value);
  libraryBadge.textContent = found ? found.name : (value || 'Primaire');
}

function renderLibraryOptions(activeKey) {
  if (!librarySelect) return;
  librarySelect.innerHTML = librariesCache
    .map((item) => `<option value="${escapeHtml(item.key)}">${escapeHtml(item.name)}</option>`)
    .join('');
  if (activeKey && librariesCache.some((item) => item.key === activeKey)) {
    librarySelect.value = activeKey;
  }
}

function isCoreLibraryKey(key) {
  return key === 'primaire' || key === 'maternelle';
}

async function refreshLibraries(activeKey) {
  if (window.api && window.api.libraryList) {
    try {
      const list = await window.api.libraryList();
      if (Array.isArray(list) && list.length) {
        librariesCache = list;
      }
    } catch (e) {
      // ignore and keep fallback list
    }
  }
  renderLibraryOptions(activeKey);
}

async function updateLibraryStatus() {
  if (!window.api || !window.api.libraryInfo) return;
  try {
    const info = await window.api.libraryInfo();
    if (!info) return;
    const label = info.library || 'primaire';
    updateLibraryBadge(label);
    const displayName = (librariesCache.find((item) => item.key === label) || {}).name || label;
    setStatus(
      `Bibliotheque active: ${displayName} (livres: ${info.counts.books}, eleves: ${info.counts.students}).`,
      false
    );
  } catch (e) {
    // ignore status errors
  }
}

async function switchLibrary(next) {
  if (!next) return;
  if (!window.api || !window.api.librarySet) {
    setStatus('API indisponible. Relancez l\'app.', true);
    return;
  }
  updateLibraryBadge(next);
  setStatus('Changement de bibliotheque...', false);
  try {
    const active = await window.api.librarySet(next);
    await refreshLibraries(active || next);
    resetEditModes();
    bookForm.reset();
    await refreshAll();
    updateLibraryBadge(active || next);
    await updateLibraryStatus();
  } catch (err) {
    setStatus('Changement impossible: ' + err.message, true);
  }
}

if (librarySelect) {
  if (window.api && window.api.libraryGet) {
    window.api.libraryGet().then(async (current) => {
      await refreshLibraries(current || 'primaire');
      updateLibraryBadge(current || librarySelect.value);
    });
  } else {
    renderLibraryOptions(librarySelect.value);
    updateLibraryBadge(librarySelect.value);
  }
  librarySelect.addEventListener('change', () => switchLibrary(librarySelect.value));
}

async function createLibraryFlow() {
  if (!window.api || !window.api.libraryCreate) {
    setStatus('Creation de base indisponible. Relancez l\'app.', true);
    return;
  }
  const name = window.prompt('Nom de la nouvelle base de livres (ex: Prive) :', '');
  if (!name || !name.trim()) return;
  try {
    const created = await window.api.libraryCreate(name.trim());
    await refreshLibraries(created && created.key ? created.key : null);
    if (created && created.key) {
      await switchLibrary(created.key);
    }
  } catch (err) {
    setStatus('Creation impossible: ' + err.message, true);
  }
}

async function renameLibraryFlow() {
  const key = librarySelect ? librarySelect.value : '';
  if (!key) return;
  if (isCoreLibraryKey(key)) {
    setStatus('Primaire et Maternelle ne peuvent pas etre renommees.', true);
    return;
  }
  if (!window.api || !window.api.libraryRename) {
    setStatus('Renommage indisponible. Relancez l\'app.', true);
    return;
  }
  const current = librariesCache.find((item) => item.key === key);
  const nextName = window.prompt('Nouveau nom de la base :', current ? current.name : '');
  if (!nextName || !nextName.trim()) return;
  try {
    const renamed = await window.api.libraryRename(key, nextName.trim());
    await refreshLibraries(renamed && renamed.key ? renamed.key : key);
    updateLibraryBadge(key);
    await updateLibraryStatus();
  } catch (err) {
    setStatus('Renommage impossible: ' + err.message, true);
  }
}

async function deleteLibraryFlow() {
  const key = librarySelect ? librarySelect.value : '';
  if (!key) return;
  if (isCoreLibraryKey(key)) {
    setStatus('Primaire et Maternelle ne peuvent pas etre supprimees.', true);
    return;
  }
  if (!window.api || !window.api.libraryDelete) {
    setStatus('Suppression indisponible. Relancez l\'app.', true);
    return;
  }
  const current = librariesCache.find((item) => item.key === key);
  const typed = window.prompt(`Pour supprimer la base "${current ? current.name : key}", tapez SUPPRIMER :`, '');
  if ((typed || '').trim().toUpperCase() !== 'SUPPRIMER') return;
  try {
    const result = await window.api.libraryDelete(key);
    const active = result && result.active ? result.active : 'primaire';
    await refreshLibraries(active);
    resetEditModes();
    bookForm.reset();
    await refreshAll();
    updateLibraryBadge(active);
    await updateLibraryStatus();
  } catch (err) {
    setStatus('Suppression impossible: ' + err.message, true);
  }
}

if (manageLibraryBtn) {
  manageLibraryBtn.addEventListener('click', async () => {
    if (manageLibraryModal) {
      manageLibraryModal.classList.remove('hidden');
    }
  });
}

if (manageLibraryClose) {
  manageLibraryClose.addEventListener('click', () => {
    if (manageLibraryModal) {
      manageLibraryModal.classList.add('hidden');
    }
  });
}

if (libraryActionCreate) {
  libraryActionCreate.addEventListener('click', async () => {
    await createLibraryFlow();
  });
}

if (libraryActionRename) {
  libraryActionRename.addEventListener('click', async () => {
    await renameLibraryFlow();
  });
}

if (libraryActionDelete) {
  libraryActionDelete.addEventListener('click', async () => {
    await deleteLibraryFlow();
  });
}

const authSetBtn = document.getElementById('authSetBtn');
const authRemoveBtn = document.getElementById('authRemoveBtn');

if (authSetBtn) {
  authSetBtn.addEventListener('click', async () => {
    if (!window.api || !window.api.authSet) return;
    const pwd = window.prompt('Nouveau mot de passe pour proteger Biblio-rians :', '');
    if (pwd === null) return;
    if (!pwd.trim()) {
      setStatus('Mot de passe vide, aucune modification.', true);
      return;
    }
    const confirmPwd = window.prompt('Confirmez le mot de passe :', '');
    if (confirmPwd !== pwd) {
      setStatus('Les deux mots de passe ne correspondent pas.', true);
      return;
    }
    await window.api.authSet(pwd);
    setStatus('Mot de passe defini. Il sera demande au prochain lancement.');
  });
}

if (authRemoveBtn) {
  authRemoveBtn.addEventListener('click', async () => {
    if (!window.api || !window.api.authSet) return;
    if (!window.confirm('Retirer le mot de passe de protection de cette application ?')) return;
    await window.api.authSet('');
    setStatus('Mot de passe retire.');
  });
}
function showAddForm(type) {
  const forms = document.querySelectorAll('#addModal [data-form]');
  forms.forEach((form) => form.classList.add('hidden'));

  if (type === 'school_year') {
    schoolYearForm.classList.remove('hidden');
  } else if (type === 'class') {
    classForm.classList.remove('hidden');
  } else {
    studentForm.classList.remove('hidden');
  }
}

addChoiceButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    addChoiceButtons.forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    showAddForm(btn.dataset.add);
  });
});

async function buildCloseYearWizard() {
  const years = await window.api.yearsList();
  closeYearCurrent.innerHTML = '<option value="">Choisir une annee a cloturer</option>'
    + years.map((y) => `<option value="${y.id}">${y.name}</option>`).join('');

  if (years[0]) {
    closeYearCurrent.value = years[0].id;
  }

  await renderCloseYearClasses();
}

async function renderCloseYearClasses() {
  const yearId = closeYearCurrent.value;
  if (!yearId) {
    closeYearClasses.innerHTML = '';
    return;
  }
  const yearLabel = closeYearCurrent.options[closeYearCurrent.selectedIndex]
    ? closeYearCurrent.options[closeYearCurrent.selectedIndex].textContent
    : '';
  const classes = await window.api.classesList();
  const filtered = classes.filter((c) => String(c.school_year_id || '') === yearId);

  closeYearClasses.innerHTML = filtered.map((c) => {
    const teacher = c.teacher_name || '';
    const level = c.level || '';
    return `
      <div class="class-row" data-class-id="${c.id}">
        <input name="current_year" value="${escapeHtml(yearLabel)}" placeholder="Annee" disabled />
        <input name="new_teacher" value="${escapeHtml(teacher)}" placeholder="Nouveau professeur" />
        <input name="new_level" value="${escapeHtml(level)}" placeholder="Nouveau niveau" />
        <input name="new_name" value="${escapeHtml(c.name)}" placeholder="Nouvelle classe" />
        <label class="checkbox"><input type="checkbox" name="carry" checked /> Passer eleves</label>
      </div>
    `;
  }).join('');
}

closeYearCurrent.addEventListener('change', renderCloseYearClasses);

closeYearForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentYearId = closeYearCurrent.value;
  const nextYearName = closeYearNext.value.trim();
  if (!currentYearId || !nextYearName) {
    setStatus('Choisissez l\'annee a cloturer et la nouvelle annee.', true);
    return;
  }

  const rows = Array.from(closeYearClasses.querySelectorAll('.class-row'));
  const classes = rows.map((row) => {
    const classId = Number(row.dataset.classId);
    const newTeacher = row.querySelector('input[name="new_teacher"]').value.trim();
    const newLevel = row.querySelector('input[name="new_level"]').value.trim();
    const newName = row.querySelector('input[name="new_name"]').value.trim();
    const carry = row.querySelector('input[name="carry"]').checked;
    return {
      class_id: classId,
      new_teacher_name: newTeacher,
      new_level: newLevel,
      new_name: newName,
      carry_students: carry
    };
  });

  try {
    await window.api.yearsClose({
      current_year_id: Number(currentYearId),
      next_year_name: nextYearName,
      classes
    });
    setStatus('Annee cloturee et nouvelle annee creee.');
    closeYearModal.classList.add('hidden');
    closeYearForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

function setStatus(message, isError) {
  statusBar.textContent = message;
  statusBar.style.background = isError ? '#7a1d1d' : '#1f2a2e';
  if (isError) playErrorSound();
}

function playSuccessSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.value = 740;
    gain.gain.value = 0.08;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.12);
    osc.onended = () => ctx.close();
  } catch (e) {
    // ignore audio errors
  }
}

function playErrorSound() {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.value = 220;
    gain.gain.value = 0.06;
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => ctx.close();
  } catch (e) {
    // ignore audio errors
  }
}

function normalizeIsbnInput(value) {
  return String(value || '').replace(/[^0-9Xx]/g, '').toUpperCase();
}

function updateLoanMode(mode) {
  currentLoanMode = mode;
  loanModeButtons.forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.mode === mode);
  });
  loanStudent.required = false;
  loanSubmitBtn.textContent = "Valider l'emprunt";
}

function defaultDueDateValue() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return d.toISOString().slice(0, 10);
}

function resetLoanInputs(keepClass) {
  const classValue = loanClass.value;
  loanForm.reset();
  if (keepClass) {
    loanClass.value = classValue;
    renderLoanStudents();
  }
  if (loanDueDate) {
    loanDueDate.value = defaultDueDateValue();
  }
  updateLoanStudentBadge();
  updateSelectedBook(null);
}

function renderLoanClasses() {
  const current = loanClass.value;
  const options = cachedClasses.map((c) => {
    const year = c.school_year ? `${c.school_year} - ` : '';
    const teacher = c.teacher_name ? ` (${c.teacher_name})` : '';
    return `<option value="${c.id}">${escapeHtml(`${year}${c.name}${teacher}`)}</option>`;
  }).join('');
  loanClass.innerHTML = '<option value="">Toutes les classes</option>' + options;
  if (current) loanClass.value = current;
  updateLoanClassBadge();
}

function renderLoanStudents() {
  const classId = loanClass.value;
  const list = classId
    ? cachedStudents.filter((s) => String(s.class_id || '') === classId)
    : cachedStudents;
  const current = loanStudent.value;
  loanStudent.innerHTML = '<option value="">Choisir un eleve</option>' + list.map((s) => {
    const fullName = `${s.last_name || ''} ${s.first_name || ''}`.trim();
    const meta = `${s.class_name || ''}${s.school_year ? ' - ' + s.school_year : ''}`.trim();
    return `<option value="${s.id}">${escapeHtml(`${fullName}${meta ? ' (' + meta + ')' : ''}`)}</option>`;
  }).join('');
  if (current && list.some((s) => String(s.id) === String(current))) {
    loanStudent.value = current;
  }
  updateLoanStudentBadge();
}

function updateLoanClassBadge() {
  const classId = loanClass.value;
  if (!classId) {
    loanClassBadge.textContent = 'Classe: Toutes';
    return;
  }
  const selected = cachedClasses.find((c) => String(c.id) === String(classId));
  if (!selected) {
    loanClassBadge.textContent = 'Classe: -';
    return;
  }
  const year = selected.school_year ? `${selected.school_year} - ` : '';
  const teacher = selected.teacher_name ? ` (${selected.teacher_name})` : '';
  loanClassBadge.textContent = `Classe: ${year}${selected.name}${teacher}`;
}

function updateLoanStudentBadge() {
  const studentId = loanStudent.value;
  if (!studentId) {
    loanStudentBadge.textContent = 'Eleve: Aucun';
    return;
  }
  const selected = cachedStudents.find((s) => String(s.id) === String(studentId));
  if (!selected) {
    loanStudentBadge.textContent = 'Eleve: -';
    return;
  }
  const fullName = `${selected.last_name || ''} ${selected.first_name || ''}`.trim();
  const classLabel = selected.class_name ? ` (${selected.class_name})` : '';
  loanStudentBadge.textContent = `Eleve: ${fullName}${classLabel}`;
}

function selectBookByIsbn(rawIsbn) {
  const clean = normalizeIsbnInput(rawIsbn);
  if (!clean || (clean.length !== 10 && clean.length !== 13)) return;
  const match = cachedBooks.find((b) => normalizeIsbnInput(b.isbn) === clean);
  if (!match) {
    setStatus('Livre introuvable pour cet ISBN.', true);
    return;
  }
  loanBook.value = String(match.id);
  updateSelectedBook(match);
  attemptAutoReturn(match, clean);
}

let lastReturnAttempt = { isbn: '', at: 0 };
async function attemptAutoReturn(book, cleanIsbn) {
  if (!book) return;
  if (loanStudent.value) return;
  const classId = loanClass.value ? Number(loanClass.value) : null;
  if (!classId) {
    setStatus('Selectionnez une classe pour le retour.', true);
    return;
  }
  const now = Date.now();
  if (lastReturnAttempt.isbn === cleanIsbn && now - lastReturnAttempt.at < 1200) {
    return;
  }
  lastReturnAttempt = { isbn: cleanIsbn, at: now };
  try {
    await window.api.loansReturnByBook({
      book_id: Number(book.id),
      student_id: null
    });
    setStatus('Retour enregistre.', false);
    playSuccessSound();
    resetLoanInputs(true);
    updateLoanMode(currentLoanMode);
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
}

function updateSelectedBook(book) {
  if (!book) {
    loanSelectedBook.textContent = '📘 Aucun livre selectionne';
    loanSelectedBook.classList.remove('loan-selected--ok');
    loanSelectedBook.classList.add('loan-selected--none');
    return;
  }
  const available = Math.max(0, Number(book.copies || 0) - Number(book.on_loan || 0));
  const title = book.title || 'Livre sans titre';
  loanSelectedBook.textContent = `${title} - ${available} dispo`;
}

async function openBookPreview(book) {
  if (!book) return;
  const available = Math.max(0, Number(book.copies || 0) - Number(book.on_loan || 0));
  bookPreviewTitle.textContent = book.title || 'Livre sans titre';
  bookPreviewCopies.textContent = String(book.copies || 0);
  bookPreviewAvailable.textContent = String(available);
  bookPreviewOnLoan.textContent = String(book.on_loan || 0);

  const metaLines = [
    book.author ? `Auteur: ${book.author}` : 'Auteur: -',
    book.year ? `Annee: ${book.year}` : 'Annee: -',
    book.isbn ? `ISBN: ${book.isbn}` : 'ISBN: -',
    book.numero ? `Numero: ${book.numero}` : 'Numero: -',
    book.location ? `Emplacement: ${book.location}` : 'Emplacement: -'
  ];
  bookPreviewMeta.innerHTML = metaLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  bookPreviewImg.classList.remove('show');
  bookPreviewCoverPlaceholder.style.display = 'block';
  bookPreviewCoverLoader.classList.add('hidden');

  const isbn = book.isbn || '';
  if (isbn.trim()) {
    bookPreviewCoverLoader.classList.remove('hidden');
    try {
      const data = await window.api.booksLookup(isbn);
      if (data && data.coverUrl) {
        bookPreviewImg.src = data.coverUrl;
        bookPreviewImg.classList.add('show');
        bookPreviewCoverPlaceholder.style.display = 'none';
      }
    } catch (e) {
      // ignore lookup errors
    }
    bookPreviewCoverLoader.classList.add('hidden');
  }

  bookPreviewModal.classList.remove('hidden');
}

function setBookFormMode(mode, book) {
  const submitBtn = bookForm.querySelector('button[type="submit"]');
  if (mode === 'edit' && book) {
    bookForm.dataset.mode = 'edit';
    bookForm.dataset.id = String(book.id);
    bookForm.querySelector('input[name="isbn"]').value = book.isbn || '';
    bookForm.querySelector('input[name="title"]').value = book.title || '';
    bookForm.querySelector('input[name="author"]').value = book.author || '';
    bookForm.querySelector('input[name="year"]').value = book.year || '';
    bookForm.querySelector('input[name="copies"]').value = book.copies || 1;
    bookForm.querySelector('input[name="numero"]').value = book.numero || '';
    bookForm.querySelector('input[name="location"]').value = book.location || '';
    if (submitBtn) submitBtn.textContent = 'Modifier le livre';
  } else {
    delete bookForm.dataset.mode;
    delete bookForm.dataset.id;
    bookForm.reset();
    ensureBookFormEditable();
    if (typeof lastLookupIsbn !== 'undefined') {
      lastLookupIsbn = '';
    }
    if (submitBtn) submitBtn.textContent = 'Ajouter';
  }
}

function updateBookSortIndicators() {
  bookSortButtons.forEach((btn) => {
    const indicator = btn.querySelector('.sort-indicator');
    if (!indicator) return;
    indicator.classList.remove('sort-indicator--up', 'sort-indicator--down', 'sort-indicator--inactive');
    if (btn.dataset.sort === currentBookSort.key) {
      indicator.classList.add(currentBookSort.dir === 'asc' ? 'sort-indicator--up' : 'sort-indicator--down');
    } else {
      indicator.classList.add('sort-indicator--inactive');
    }
  });
}

function sortBooks(books) {
  const key = currentBookSort.key;
  const dir = currentBookSort.dir === 'desc' ? -1 : 1;
  const locale = 'fr';
  const textValue = (value) => String(value || '').trim();
  const numberValue = (value) => Number(value || 0);

  return books.sort((a, b) => {
    let av;
    let bv;
    if (key === 'available') {
      av = Math.max(0, numberValue(a.copies) - numberValue(a.on_loan));
      bv = Math.max(0, numberValue(b.copies) - numberValue(b.on_loan));
      return (av - bv) * dir;
    }
    if (key === 'year' || key === 'copies' || key === 'on_loan') {
      av = numberValue(a[key]);
      bv = numberValue(b[key]);
      return (av - bv) * dir;
    }
    av = textValue(a[key]);
    bv = textValue(b[key]);
    return av.localeCompare(bv, locale, { sensitivity: 'base' }) * dir;
  });
}

async function refreshAll() {
  await Promise.all([refreshBooks(), refreshYears(), refreshClasses(), refreshStudents(), refreshLoans()]);
}

async function refreshYears() {
  const years = await window.api.yearsList();
  const filterYear = document.getElementById('filterYear');
  const yearsTable = document.getElementById('yearsTable');

  if (filterYear) {
    const currentYear = filterYear.value;
    filterYear.innerHTML = '<option value="">Toutes</option>' + years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('');
    if (currentYear) filterYear.value = currentYear;
  }

  classYearSelect.innerHTML = '<option value="">Choisir une annee scolaire</option>'
    + years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('');

  yearsTable.innerHTML = '';
  years.forEach((y) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(y.name)}</td>
      <td><button data-id="${y.id}" class="edit-year">Modifier</button></td>
    `;
    yearsTable.appendChild(row);
  });

  document.querySelectorAll('.edit-year').forEach((btn) => {
    btn.addEventListener('click', async () => {
      resetEditModes();
      const year = years.find((y) => y.id === Number(btn.dataset.id));
      if (!year) return;
      openAddModalFor('school_year', { showChoices: false });
      schoolYearForm.dataset.mode = 'edit';
      schoolYearForm.dataset.id = String(year.id);
      schoolYearForm.querySelector('input[name="name"]').value = year.name || '';
    });
  });
}

async function refreshClasses() {
  const classes = await window.api.classesList();
  cachedClasses = classes;
  renderLoanClasses();
  const filterYear = document.getElementById('filterYear');
  const filterClass = document.getElementById('filterClass');
  const classesTable = document.getElementById('classesTable');

  const yearId = filterYear ? filterYear.value : '';
  const filteredClasses = yearId ? classes.filter((c) => String(c.school_year_id || '') === yearId) : classes;

  if (filterClass) {
    const currentClass = filterClass.value;
    filterClass.innerHTML = '<option value="">Toutes</option>' + filteredClasses.map((c) => `<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('');
    if (currentClass) filterClass.value = currentClass;
  }

  studentClassSelect.innerHTML = '<option value="">Choisir un professeur</option>'
    + filteredClasses.map((c) => {
      const label = c.teacher_name || c.name || 'Professeur';
      return `<option value="${c.id}">${escapeHtml(label)}</option>`;
    }).join('');

  classesTable.innerHTML = '';
  filteredClasses.forEach((c) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(c.school_year || '-')}</td>
      <td>${escapeHtml(c.teacher_name || '-')}</td>
      <td>${escapeHtml(c.level || '-')}</td>
      <td>${escapeHtml(c.name)}</td>
      <td><button data-id="${c.id}" class="edit-class">Modifier</button></td>
    `;
    classesTable.appendChild(row);
  });

  document.querySelectorAll('.edit-class').forEach((btn) => {
    btn.addEventListener('click', async () => {
      resetEditModes();
      const item = classes.find((c) => c.id === Number(btn.dataset.id));
      if (!item) return;
      openAddModalFor('class', { showChoices: false });
      classForm.dataset.mode = 'edit';
      classForm.dataset.id = String(item.id);
      classYearSelect.value = item.school_year_id || '';
      classForm.querySelector('input[name="teacher_name"]').value = item.teacher_name || '';
      classForm.querySelector('input[name="level"]').value = item.level || '';
    });
  });
}

function filterBooksBySearch(books) {
  const term = (bookSearchInput ? bookSearchInput.value : '').trim().toLowerCase();
  if (!term) return books;
  return books.filter((b) => {
    return String(b.title || '').toLowerCase().includes(term)
      || String(b.author || '').toLowerCase().includes(term)
      || String(b.isbn || '').toLowerCase().includes(term);
  });
}

async function refreshBooks() {
  const books = await window.api.booksList();
  cachedBooks = books;
  const table = document.getElementById('booksTable');
  table.innerHTML = '';
  updateBookSortIndicators();
  const sortedBooks = sortBooks(filterBooksBySearch([...books]));
  sortedBooks.forEach((b) => {
    const available = Math.max(0, Number(b.copies || 0) - Number(b.on_loan || 0));
      const row = document.createElement('tr');
      row.classList.add('book-row');
      const availabilityClass = available > 0 ? 'status-pill status-pill--ok' : 'status-pill status-pill--out';
      const availabilityLabel = available > 0 ? `🟢 ${available} dispo` : '🔴 0 dispo';
      row.innerHTML = `
        <td>${escapeHtml(b.title)}</td>
        <td>${escapeHtml(b.author || '-')}</td>
        <td>${escapeHtml(b.year || '-')}</td>
        <td>${escapeHtml(b.isbn || '-')}</td>
        <td>${escapeHtml(b.copies)}</td>
        <td><span class="${availabilityClass}">${availabilityLabel}</span></td>
        <td><span class="status-pill">${escapeHtml(b.on_loan)}</span></td>
        <td>${escapeHtml(b.numero || '-')}</td>
        <td>
          <button type="button" data-id="${b.id}" class="edit-book">Modifier</button>
          <button type="button" data-id="${b.id}" class="delete-book" style="background: #ff6b6b; margin-left: 4px;">Supprimer</button>
        </td>
      `;
      row.addEventListener('click', (event) => {
        if (event.target.closest('button')) return;
        openBookPreview(b);
      });
    table.appendChild(row);
  });

  document.querySelectorAll('.edit-book').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const book = books.find((b) => b.id === Number(btn.dataset.id));
      if (!book) return;
      setActiveTab('books');
      setBookFormMode('edit', book);
    });
  });

  document.querySelectorAll('.delete-book').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const book = books.find((b) => b.id === Number(btn.dataset.id));
      if (!book) return;
      if (!window.confirm(`Supprimer definitivement le livre "${book.title}" ? Cette action est irreversible.`)) return;
      try {
        setStatus('Suppression en cours...', false);
        await window.api.booksDelete(book.id);
        setBookFormMode('add');
        ensureBookFormEditable();
        lastLookupIsbn = '';
        setStatus(`Livre "${book.title}" supprime.`, false);
        await refreshBooks();
        focusBookIsbnInput();
      } catch (err) {
        setStatus('Erreur: ' + err.message, true);
      }
    });
  });

  loanBook.innerHTML = '<option value="">Choisir un livre</option>' + books.map((b) => {
    const available = Math.max(0, Number(b.copies || 0) - Number(b.on_loan || 0));
    return `<option value="${b.id}">${escapeHtml(`${b.title} (${available} dispo)`)}</option>`;
  }).join('');
  const selected = books.find((b) => String(b.id) === String(loanBook.value));
  updateSelectedBook(selected || null);
}

async function refreshStudents() {
  const students = await window.api.studentsList();
  cachedStudents = students;
  const table = document.getElementById('studentsTable');
  const filterYear = document.getElementById('filterYear');
  const filterClass = document.getElementById('filterClass');

  const currentYear = filterYear ? filterYear.value : '';
  const currentClass = filterClass ? filterClass.value : '';
  const searchTerm = (studentSearchInput ? studentSearchInput.value : '').trim().toLowerCase();
  const filtered = students.filter((s) => {
    if (currentYear && String(s.school_year_id || '') !== currentYear) return false;
    if (currentClass && String(s.class_id || '') !== currentClass) return false;
    if (searchTerm) {
      const haystack = `${s.last_name || ''} ${s.first_name || ''}`.toLowerCase();
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  table.innerHTML = '';
  filtered.forEach((s) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(s.school_year || '-')}</td>
      <td>${escapeHtml(s.class_name || '-')}</td>
      <td>${escapeHtml(s.last_name || '-')}</td>
      <td>${escapeHtml(s.first_name || '-')}</td>
      <td>${escapeHtml(s.birth_year || '-')}</td>
      <td>
        <button data-id="${s.id}" class="history-student">Historique</button>
        <button data-id="${s.id}" class="edit-student">Modifier</button>
      </td>
    `;
    table.appendChild(row);
  });

  document.querySelectorAll('.edit-student').forEach((btn) => {
    btn.addEventListener('click', async () => {
      resetEditModes();
      const item = students.find((s) => s.id === Number(btn.dataset.id));
      if (!item) return;
      openAddModalFor('student', { showChoices: false });
      studentForm.dataset.mode = 'edit';
      studentForm.dataset.id = String(item.id);
      studentClassSelect.value = item.class_id || '';
      studentForm.querySelector('input[name="last_name"]').value = item.last_name || '';
      studentForm.querySelector('input[name="first_name"]').value = item.first_name || '';
      studentForm.querySelector('input[name="birth_year"]').value = item.birth_year || '';
    });
  });

  document.querySelectorAll('.history-student').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const history = await window.api.studentsHistory(Number(btn.dataset.id));
      historyTable.innerHTML = history.map((h) => {
        const start = h.start_date ? new Date(h.start_date).toLocaleDateString('fr-FR') : '-';
        const end = h.end_date ? new Date(h.end_date).toLocaleDateString('fr-FR') : '-';
        return `
          <tr>
            <td>${escapeHtml(h.school_year || '-')}</td>
            <td>${escapeHtml(h.class_name || '-')}</td>
            <td>${escapeHtml(h.teacher_name || '-')}</td>
            <td>${escapeHtml(h.level || '-')}</td>
            <td>${escapeHtml(start)}</td>
            <td>${escapeHtml(end)}</td>
          </tr>
        `;
      }).join('');
      historyModal.classList.remove('hidden');
    });
  });

  renderLoanStudents();
}

const filterYearSelect = document.getElementById('filterYear');
const filterClassSelect = document.getElementById('filterClass');
if (filterYearSelect) {
  filterYearSelect.addEventListener('change', () => {
    refreshClasses();
    refreshStudents();
  });
}
if (filterClassSelect) {
  filterClassSelect.addEventListener('change', refreshStudents);
}

const bookSearchInput = document.getElementById('bookSearch');
if (bookSearchInput) {
  bookSearchInput.addEventListener('input', refreshBooks);
}
const studentSearchInput = document.getElementById('studentSearch');
if (studentSearchInput) {
  studentSearchInput.addEventListener('input', refreshStudents);
}

bookSortButtons.forEach((btn) => {
  btn.addEventListener('click', () => {
    const key = btn.dataset.sort;
    if (!key) return;
    if (currentBookSort.key === key) {
      currentBookSort.dir = currentBookSort.dir === 'asc' ? 'desc' : 'asc';
    } else {
      currentBookSort.key = key;
      currentBookSort.dir = 'asc';
    }
    refreshBooks();
  });
});

loanClass.addEventListener('change', () => {
  loanStudent.value = '';
  renderLoanStudents();
  updateLoanClassBadge();
  updateLoanStudentBadge();
  if (loanIsbn) loanIsbn.focus();
});
loanStudent.addEventListener('change', updateLoanStudentBadge);
loanStudent.addEventListener('change', () => {
  const selected = cachedStudents.find((s) => String(s.id) === String(loanStudent.value));
  if (selected && selected.class_id && String(loanClass.value) !== String(selected.class_id)) {
    loanClass.value = String(selected.class_id);
    renderLoanStudents();
    loanStudent.value = String(selected.id);
  }
  if (loanIsbn) loanIsbn.focus();
});
loanBook.addEventListener('change', () => {
  const book = cachedBooks.find((b) => String(b.id) === String(loanBook.value));
  if (book && !loanIsbn.value) loanIsbn.value = book.isbn || '';
  updateSelectedBook(book || null);
});
loanIsbn.addEventListener('keydown', (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    selectBookByIsbn(loanIsbn.value);
    if (loanStudent.value) {
      loanForm.requestSubmit();
    }
  }
});
loanIsbn.addEventListener('input', () => {
  const clean = normalizeIsbnInput(loanIsbn.value);
  if (clean.length === 10 || clean.length === 13) {
    selectBookByIsbn(clean);
  }
});
loanModeButtons.forEach((btn) => {
  btn.addEventListener('click', () => updateLoanMode(btn.dataset.mode));
});

async function refreshLoans() {
  const loans = await window.api.loansList();
  const table = document.getElementById('loansTable');
  table.innerHTML = '';
  const today = new Date();
  loans.forEach((l) => {
    const row = document.createElement('tr');
    const isOverdue = l.due_date && !l.return_date && new Date(l.due_date) < today;
    const dueCell = l.due_date
      ? `${escapeHtml(new Date(l.due_date).toLocaleDateString('fr-FR'))}${isOverdue ? ' <span class="status-pill status-pill--out">⏰ en retard</span>' : ''}`
      : '-';
    row.innerHTML = `
      <td>${escapeHtml(l.book_title)}</td>
      <td>${escapeHtml(l.student_name)}</td>
      <td>${escapeHtml(new Date(l.loan_date).toLocaleDateString('fr-FR'))}</td>
      <td>${dueCell}</td>
      <td>${l.return_date ? escapeHtml(new Date(l.return_date).toLocaleDateString('fr-FR')) : '-'}</td>
      <td>
        <button data-id="${l.id}" class="return-loan">Retour</button>
        <button data-id="${l.id}" class="delete-loan">Supprimer</button>
      </td>
    `;
    table.appendChild(row);
  });

  document.querySelectorAll('.return-loan').forEach((btn) => {
    btn.addEventListener('click', async () => {
      await window.api.loansReturn(Number(btn.dataset.id));
      setStatus('Emprunt retourne.');
      refreshAll();
    });
  });

  document.querySelectorAll('.delete-loan').forEach((btn) => {
    btn.addEventListener('click', async () => {
      if (!window.confirm('Supprimer definitivement cet emprunt ? Cette action est irreversible.')) return;
      await window.api.loansDelete(Number(btn.dataset.id));
      setStatus('Emprunt supprime.');
      refreshAll();
    });
  });
}

const bookForm = document.getElementById('bookForm');
bookForm.addEventListener('click', ensureBookFormEditable, true);
bookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(bookForm);
  const payload = Object.fromEntries(formData.entries());
  payload.year = payload.year ? Number(payload.year) : null;
  payload.copies = payload.copies ? Number(payload.copies) : 1;
  try {
    if (bookForm.dataset.mode === 'edit') {
      payload.id = Number(bookForm.dataset.id);
      await window.api.booksUpdate(payload);
      setStatus('Livre modifie.');
      setBookFormMode('add');
    } else {
      await window.api.booksAdd(payload);
      setStatus('Livre ajoute.');
      bookForm.reset();
    }
    await refreshAll();
    lastLookupIsbn = '';
    focusBookIsbnInput();
  } catch (err) {
    setStatus(err.message, true);
  }
});

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(studentForm);
  const payload = Object.fromEntries(formData.entries());
  payload.birth_year = payload.birth_year ? Number(payload.birth_year) : null;
  try {
    if (studentForm.dataset.mode === 'edit') {
      payload.id = Number(studentForm.dataset.id);
      await window.api.studentsUpdate(payload);
      setStatus('Eleve modifie.');
      delete studentForm.dataset.mode;
      delete studentForm.dataset.id;
    } else {
      await window.api.studentsAdd(payload);
      setStatus('Eleve ajoute.');
    }
    studentForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

schoolYearForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(schoolYearForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    if (schoolYearForm.dataset.mode === 'edit') {
      payload.id = Number(schoolYearForm.dataset.id);
      await window.api.yearsUpdate(payload);
      setStatus('Annee modifiee.');
      delete schoolYearForm.dataset.mode;
      delete schoolYearForm.dataset.id;
    } else {
      await window.api.yearsAdd(payload);
      setStatus('Annee scolaire ajoutee.');
    }
    schoolYearForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

classForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(classForm);
  const payload = Object.fromEntries(formData.entries());
  payload.school_year_id = payload.school_year_id ? Number(payload.school_year_id) : null;
  delete payload.name;
  try {
    if (classForm.dataset.mode === 'edit') {
      payload.id = Number(classForm.dataset.id);
      await window.api.classesUpdate(payload);
      setStatus('Classe modifiee.');
      delete classForm.dataset.mode;
      delete classForm.dataset.id;
    } else {
      await window.api.classesAdd(payload);
      setStatus('Classe ajoutee.');
    }
    classForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

loanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(loanForm);
  const payload = Object.fromEntries(formData.entries());
  try {
    const bookId = payload.book_id ? Number(payload.book_id) : null;
    const studentId = payload.student_id ? Number(payload.student_id) : null;
    const classId = loanClass.value ? Number(loanClass.value) : null;
    if (!bookId) {
      setStatus('Selectionnez un livre.', true);
      return;
    }
    if (studentId) {
      await window.api.loansAdd({
        book_id: bookId,
        student_id: studentId,
        due_date: payload.due_date || null
      });
      setStatus('Emprunt enregistre (date du jour).');
      playSuccessSound();
    } else {
      if (!classId) {
        setStatus('Selectionnez une classe pour le retour.', true);
        return;
      }
      await window.api.loansReturnByBook({
        book_id: bookId,
        student_id: null
      });
      setStatus('Retour enregistre.');
      playSuccessSound();
    }
    resetLoanInputs(true);
    updateLoanMode(currentLoanMode);
    await refreshAll();
    if (loanIsbn) {
      loanIsbn.focus();
    }
  } catch (err) {
    setStatus(err.message, true);
  }
});

// Export/import handled by dedicated modals.

refreshAll()
  .then(() => updateLibraryStatus())
  .catch((err) => setStatus(err.message, true));
showAddForm('school_year');
updateLoanMode('loan');
if (loanDueDate) {
  loanDueDate.value = defaultDueDateValue();
}

const lookupIsbnBtn = document.getElementById('lookupIsbnBtn');
const isbnInput = document.querySelector('#bookForm input[name="isbn"]');
const titleInput = document.querySelector('#bookForm input[name="title"]');
const authorInput = document.querySelector('#bookForm input[name="author"]');
const yearInput = document.querySelector('#bookForm input[name="year"]');
const coverImg = document.getElementById('bookCover');
const coverPlaceholder = document.getElementById('coverPlaceholder');
const coverLoader = document.getElementById('coverLoader');
const coverEmpty = document.getElementById('coverEmpty');
let lastLookupIsbn = '';
let lookupTimer = null;

async function runIsbnLookup() {
  const isbn = isbnInput.value.trim();
  if (!isbn) {
    setStatus('Saisissez un ISBN.', true);
    return;
  }
  const clean = isbn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (clean.length !== 10 && clean.length !== 13) {
    return;
  }
  if (clean === lastLookupIsbn) return;
  lastLookupIsbn = clean;
  setStatus('Recherche ISBN en cours...');
  coverLoader.classList.remove('hidden');
  coverEmpty.classList.add('hidden');
  const data = await window.api.booksLookup(clean);
  if (!data) {
    setStatus('Aucune information trouvee pour cet ISBN.', true);
    coverLoader.classList.add('hidden');
    coverImg.classList.remove('show');
    coverPlaceholder.style.display = 'block';
    coverEmpty.classList.remove('hidden');
    return;
  }
  if (!titleInput.value && data.title) titleInput.value = data.title;
  if (!authorInput.value && data.author) authorInput.value = data.author;
  if (!yearInput.value && data.year) yearInput.value = data.year;
  if (data.coverUrl) {
    coverImg.src = data.coverUrl;
    coverImg.classList.add('show');
    coverPlaceholder.style.display = 'none';
    coverEmpty.classList.add('hidden');
  } else {
    coverImg.classList.remove('show');
    coverPlaceholder.style.display = 'block';
    coverEmpty.classList.remove('hidden');
  }
  coverLoader.classList.add('hidden');
  setStatus('Infos trouvees pour l\'ISBN.');
}

lookupIsbnBtn.addEventListener('click', runIsbnLookup);
isbnInput.addEventListener('focus', ensureBookFormEditable);
isbnInput.addEventListener('click', ensureBookFormEditable);
isbnInput.addEventListener('keydown', async (event) => {
  if (event.key === 'Enter') {
    event.preventDefault();
    if (Date.now() < suppressIsbnEnterUntil) {
      return;
    }
    if (!titleInput.value.trim()) {
      await runIsbnLookup();
      if (!titleInput.value.trim()) {
        titleInput.focus();
        return;
      }
    }
    bookForm.requestSubmit();
  }
});
isbnInput.addEventListener('input', () => {
  if (lookupTimer) clearTimeout(lookupTimer);
  lookupTimer = setTimeout(runIsbnLookup, 500);
});

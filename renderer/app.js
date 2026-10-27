function escapeHtml(value) {
  return String(value === undefined || value === null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

/* Texte de recherche : minuscules, sans accents (« eleve » trouve « Élève »). */
function normalizeSearch(value) {
  return String(value === undefined || value === null ? '' : value)
    .toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim();
}

/* Libelle d'une classe sans ambiguite : « 2025-2026 · Classe CE1 Mme Dupont ». */
function classLabel(c) {
  if (!c) return '';
  const name = c.name || 'Classe';
  const teacher = c.teacher_name && !name.includes(c.teacher_name) ? ` (${c.teacher_name})` : '';
  return `${c.school_year ? `${c.school_year} · ` : ''}${name}${teacher}`;
}

/* Date locale AAAA-MM-JJ (et non UTC, qui decale d'un jour le soir). */
function localDateString(date = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/* Imprime un contenu precis (liste des retards...) au lieu de la page entiere. */
function printHtml(html) {
  const area = document.getElementById('printArea');
  if (!area) return;
  area.innerHTML = html;
  document.body.classList.add('print-custom');
  window.print();
  setTimeout(() => {
    document.body.classList.remove('print-custom');
    area.innerHTML = '';
  }, 500);
}

const lockScreen = document.getElementById('lockScreen');
const lockForm = document.getElementById('lockForm');
const lockPassword = document.getElementById('lockPassword');
const lockError = document.getElementById('lockError');

/*
 * Le verrou est garanti par le processus principal (qui refuse toute donnee
 * tant qu'il n'est pas leve). Ici on se contente d'afficher l'ecran de
 * verrouillage, de rendre le reste de la page inactif (inert : ni clic ni
 * touche Tab) et d'attendre le deverrouillage avant de charger les donnees.
 */
let resolveAppUnlocked;
const appUnlocked = new Promise((resolve) => { resolveAppUnlocked = resolve; });

function setPageInert(isInert) {
  document.querySelectorAll('.app-topbar, main, #statusBar').forEach((el) => {
    if (isInert) el.setAttribute('inert', '');
    else el.removeAttribute('inert');
  });
}

function showLockScreen() {
  document.querySelectorAll('.modal:not(.hidden)').forEach((modal) => modal.classList.add('hidden'));
  lockScreen.classList.remove('hidden');
  setPageInert(true);
  if (lockPassword) setTimeout(() => lockPassword.focus(), 50);
}

function hideLockScreen() {
  lockScreen.classList.add('hidden');
  setPageInert(false);
  if (lockError) lockError.classList.add('hidden');
  if (lockPassword) lockPassword.value = '';
}

async function initAuthLock() {
  if (!window.api || !window.api.authIsSet || !lockScreen) {
    resolveAppUnlocked();
    return;
  }
  let isSet = false;
  try {
    isSet = await window.api.authIsSet();
  } catch (e) {
    isSet = false;
  }
  if (isSet) {
    showLockScreen();
  } else {
    resolveAppUnlocked();
  }
}

if (lockForm) {
  lockForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const value = lockPassword ? lockPassword.value : '';
    let result = null;
    try {
      result = await window.api.authVerify(value);
    } catch (e) {
      result = null;
    }
    if (result && result.ok) {
      hideLockScreen();
      resolveAppUnlocked();
      return;
    }
    if (lockError) {
      lockError.textContent = result && result.waitSeconds
        ? `Trop d'essais. Patientez ${result.waitSeconds} secondes avant de réessayer.`
        : 'Mot de passe incorrect.';
      lockError.classList.remove('hidden');
    }
    if (lockPassword) { lockPassword.value = ''; lockPassword.focus(); }
  });
}

const lockAppBtn = document.getElementById('lockAppBtn');
async function refreshLockButton() {
  if (!lockAppBtn || !window.api || !window.api.authIsSet) return;
  try {
    lockAppBtn.classList.toggle('hidden', !(await window.api.authIsSet()));
  } catch (e) {
    lockAppBtn.classList.add('hidden');
  }
}
if (lockAppBtn) {
  lockAppBtn.addEventListener('click', async () => {
    if (await window.api.authLock()) showLockScreen();
  });
}

initAuthLock();
appUnlocked.then(refreshLockButton);

/* ---------- Toasts ---------- */
const toastStack = document.getElementById('toastStack');
function showToast(type, title, message) {
  if (!toastStack) return;
  const toast = document.createElement('div');
  toast.className = 'toast' + (type === 'err' ? ' err' : '');
  const iconRef = type === 'err' ? '#i-alert' : '#i-check';
  toast.innerHTML = `
    <span class="t-icon"><svg class="icon"><use href="${iconRef}"/></svg></span>
    <div><strong>${escapeHtml(title)}</strong><span class="t-msg">${escapeHtml(message || '')}</span></div>
  `;
  toastStack.appendChild(toast);
  setTimeout(() => {
    toast.style.transition = 'opacity .2s ease';
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 220);
  }, 4500);
}

/* ---------- Confirm dialog (replaces window.confirm) ---------- */
const confirmDialogOverlay = document.getElementById('confirmDialogOverlay');
const confirmDialogTitle = document.getElementById('confirmDialogTitle');
const confirmDialogMessage = document.getElementById('confirmDialogMessage');
const confirmDialogCancel = document.getElementById('confirmDialogCancel');
const confirmDialogConfirm = document.getElementById('confirmDialogConfirm');

function confirmDialog(options) {
  const opts = options || {};
  return new Promise((resolve) => {
    if (!confirmDialogOverlay) {
      resolve(window.confirm(opts.message || 'Confirmer ?'));
      return;
    }
    confirmDialogTitle.textContent = opts.title || 'Confirmer';
    confirmDialogMessage.textContent = opts.message || '';
    confirmDialogConfirm.innerHTML = `<svg class="icon"><use href="#i-check"/></svg>${escapeHtml(opts.confirmLabel || 'Confirmer')}`;
    confirmDialogOverlay.classList.remove('hidden');

    function cleanup(result) {
      confirmDialogOverlay.classList.add('hidden');
      confirmDialogConfirm.removeEventListener('click', onConfirm);
      confirmDialogCancel.removeEventListener('click', onCancel);
      confirmDialogOverlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onConfirm() { cleanup(true); }
    function onCancel() { cleanup(false); }
    function onOverlay(event) { if (event.target === confirmDialogOverlay) cleanup(false); }
    function onKey(event) { if (event.key === 'Escape') cleanup(false); }

    confirmDialogConfirm.addEventListener('click', onConfirm);
    confirmDialogCancel.addEventListener('click', onCancel);
    confirmDialogOverlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
    setTimeout(() => confirmDialogCancel.focus(), 50);
  });
}

/* ---------- Prompt dialog (replaces window.prompt) ---------- */
const promptDialogOverlay = document.getElementById('promptDialogOverlay');
const promptDialogTitle = document.getElementById('promptDialogTitle');
const promptDialogMessage = document.getElementById('promptDialogMessage');
const promptDialogForm = document.getElementById('promptDialogForm');
const promptDialogField1 = document.getElementById('promptDialogField1');
const promptDialogLabel1 = document.getElementById('promptDialogLabel1');
const promptDialogInput1 = document.getElementById('promptDialogInput1');
const promptDialogField2 = document.getElementById('promptDialogField2');
const promptDialogLabel2 = document.getElementById('promptDialogLabel2');
const promptDialogInput2 = document.getElementById('promptDialogInput2');
const promptDialogCancel = document.getElementById('promptDialogCancel');
const promptDialogConfirm = document.getElementById('promptDialogConfirm');

function promptDialog(options) {
  const opts = options || {};
  const fields = opts.fields && opts.fields.length ? opts.fields : [{ label: 'Valeur' }];
  return new Promise((resolve) => {
    if (!promptDialogOverlay) {
      const value = window.prompt(opts.title || '', fields[0].value || '');
      resolve(value === null ? null : [value]);
      return;
    }
    promptDialogTitle.textContent = opts.title || 'Saisir';
    if (opts.message) {
      promptDialogMessage.textContent = opts.message;
      promptDialogMessage.classList.remove('hidden');
    } else {
      promptDialogMessage.classList.add('hidden');
    }
    promptDialogLabel1.textContent = fields[0].label || 'Valeur';
    promptDialogInput1.type = fields[0].type || 'text';
    promptDialogInput1.placeholder = fields[0].placeholder || '';
    promptDialogInput1.value = fields[0].value || '';
    if (fields[1]) {
      promptDialogField2.classList.remove('hidden');
      promptDialogLabel2.textContent = fields[1].label || 'Valeur';
      promptDialogInput2.type = fields[1].type || 'text';
      promptDialogInput2.placeholder = fields[1].placeholder || '';
      promptDialogInput2.value = '';
    } else {
      promptDialogField2.classList.add('hidden');
    }
    promptDialogConfirm.innerHTML = `<svg class="icon"><use href="#i-check"/></svg>${escapeHtml(opts.confirmLabel || 'Valider')}`;
    promptDialogOverlay.classList.remove('hidden');
    setTimeout(() => promptDialogInput1.focus(), 50);

    function cleanup(result) {
      promptDialogOverlay.classList.add('hidden');
      promptDialogForm.removeEventListener('submit', onSubmit);
      promptDialogCancel.removeEventListener('click', onCancel);
      promptDialogOverlay.removeEventListener('click', onOverlay);
      document.removeEventListener('keydown', onKey);
      resolve(result);
    }
    function onSubmit(event) {
      event.preventDefault();
      const v1 = promptDialogInput1.value;
      const v2 = fields[1] ? promptDialogInput2.value : undefined;
      cleanup(fields[1] ? [v1, v2] : [v1]);
    }
    function onCancel() { cleanup(null); }
    function onOverlay(event) { if (event.target === promptDialogOverlay) cleanup(null); }
    function onKey(event) { if (event.key === 'Escape') cleanup(null); }

    promptDialogForm.addEventListener('submit', onSubmit);
    promptDialogCancel.addEventListener('click', onCancel);
    promptDialogOverlay.addEventListener('click', onOverlay);
    document.addEventListener('keydown', onKey);
  });
}

/* ---------- Echap ferme la fenetre modale actuellement ouverte ---------- */
document.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  const openModal = document.querySelector('.modal:not(.hidden)');
  if (!openModal) return;
  const closeBtn = openModal.querySelector('.panel-header button.ghost');
  if (closeBtn) {
    closeBtn.click();
  } else {
    openModal.classList.add('hidden');
  }
});

/* ---------- Font size & contrast ---------- */
const FONT_SCALES = [0.9, 1, 1.15, 1.3];
let fontStep = Number(localStorage.getItem('biblio_font_step') || '1');
if (!FONT_SCALES[fontStep]) fontStep = 1;
function applyFontScale() {
  document.documentElement.style.setProperty('--font-scale', FONT_SCALES[fontStep]);
  localStorage.setItem('biblio_font_step', String(fontStep));
}
applyFontScale();
const fontDecBtn = document.getElementById('fontDecBtn');
const fontResetBtn = document.getElementById('fontResetBtn');
const fontIncBtn = document.getElementById('fontIncBtn');
if (fontDecBtn) fontDecBtn.addEventListener('click', () => { fontStep = Math.max(0, fontStep - 1); applyFontScale(); });
if (fontResetBtn) fontResetBtn.addEventListener('click', () => { fontStep = 1; applyFontScale(); });
if (fontIncBtn) fontIncBtn.addEventListener('click', () => { fontStep = Math.min(FONT_SCALES.length - 1, fontStep + 1); applyFontScale(); });

let highContrast = localStorage.getItem('biblio_contrast') === 'high';
function applyContrast() {
  document.documentElement.setAttribute('data-contrast', highContrast ? 'high' : 'normal');
  localStorage.setItem('biblio_contrast', highContrast ? 'high' : 'normal');
}
applyContrast();
const contrastToggleBtn = document.getElementById('contrastToggleBtn');
if (contrastToggleBtn) {
  contrastToggleBtn.addEventListener('click', () => {
    highContrast = !highContrast;
    applyContrast();
  });
}

const statusBar = document.getElementById('statusBar');
const librarySelect = document.getElementById('librarySelect');
const libraryBadge = document.getElementById('libraryBadge');
const openExport = document.getElementById('openExport');
const openImport = document.getElementById('openImport');
const exportModal = document.getElementById('exportModal');
const exportClose = document.getElementById('exportClose');
const exportForm = document.getElementById('exportForm');
const exportFormat = document.getElementById('exportFormat');

const tabs = document.querySelectorAll('.tabs button');
const tabSections = {
  home: document.getElementById('tab-home'),
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
  window.scrollTo(0, 0);
  if (tabKey === 'loans') {
    if (typeof focusDesk === 'function') focusDesk();
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
const bookSortButtons = document.querySelectorAll('.book-sort');

let cachedBooks = [];
let cachedStudents = [];
let cachedClasses = [];
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
    school_year: 'Ajouter une année scolaire',
    class: 'Ajouter une classe',
    student: 'Ajouter un élève'
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

if (openAddTab) {
  openAddTab.addEventListener('click', () => {
    const active = document.querySelector('.add-choice-btn.active');
    openAddModalFor(active ? active.dataset.add : 'school_year', { showChoices: true });
  });
}

if (addClassBtn) {
  addClassBtn.addEventListener('click', () => openAddModalFor('class', { showChoices: false }));
}

if (addStudentBtn) {
  addStudentBtn.addEventListener('click', () => openAddModalFor('student', { showChoices: false }));
}

const emptyAddStudentBtn = document.getElementById('emptyAddStudentBtn');
if (emptyAddStudentBtn) {
  emptyAddStudentBtn.addEventListener('click', () => openAddModalFor('student', { showChoices: false }));
}
const emptyAddClassBtn = document.getElementById('emptyAddClassBtn');
if (emptyAddClassBtn) {
  emptyAddClassBtn.addEventListener('click', () => openAddModalFor('class', { showChoices: false }));
}
const emptyAddYearBtn = document.getElementById('emptyAddYearBtn');
if (emptyAddYearBtn) {
  emptyAddYearBtn.addEventListener('click', () => openAddModalFor('school_year', { showChoices: false }));
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

/*
 * Import et restauration : le fichier est analyse par l'application, qui
 * affiche ce qu'elle va faire et demande confirmation avant de toucher aux
 * donnees (une copie de securite est toujours faite avant).
 */
async function runImportPick(options) {
  if (!window.api || !window.api.importPick) return;
  setStatus('Choix du fichier...', false);
  try {
    const res = await window.api.importPick(options || {});
    if (!res || res.canceled) {
      setStatus('Aucune modification.', false);
      return;
    }
    await refreshLibraries(librarySelect ? librarySelect.value : null);
    await refreshAll();
    await updateLibraryStatus();
    setStatus(res.message || 'Import terminé.', false);
  } catch (err) {
    setStatus('Import impossible : ' + err.message, true);
  }
}

if (openImport) {
  openImport.addEventListener('click', () => runImportPick());
}

/* ---------- Sauvegarde sur cle USB ---------- */
const BACKUP_REMINDER_DAYS = 7;
const backupReminder = document.getElementById('backupReminder');
const backupReminderTitle = document.getElementById('backupReminderTitle');
const backupReminderText = document.getElementById('backupReminderText');

async function refreshBackupReminder() {
  if (!backupReminder || !window.api || !window.api.backupStatus) return;
  try {
    const status = await window.api.backupStatus();
    const days = status ? status.days : null;
    const neverSaved = days === null || days === undefined;
    if (!neverSaved && days < BACKUP_REMINDER_DAYS) {
      backupReminder.classList.add('hidden');
      return;
    }
    backupReminderTitle.textContent = neverSaved
      ? 'Vous n\'avez encore jamais sauvegardé vos données'
      : `Dernière sauvegarde il y a ${days} jours`;
    backupReminderText.textContent = 'Si l\'ordinateur tombe en panne, une sauvegarde sur clé USB permet de tout retrouver. Branchez une clé, cliquez sur le bouton, puis choisissez la clé.';
    backupReminder.classList.remove('hidden');
  } catch (e) {
    // le rappel est facultatif
  }
}

async function runBackupSave() {
  if (!window.api || !window.api.backupSave) return;
  setStatus('Sauvegarde en cours...', false);
  try {
    const res = await window.api.backupSave();
    if (!res || res.canceled) {
      setStatus('Sauvegarde annulée.', false);
      return;
    }
    setStatus(res.message || 'Sauvegarde enregistrée.', false);
    playSuccessSound();
  } catch (err) {
    setStatus('Sauvegarde impossible : ' + err.message, true);
  }
  refreshBackupReminder();
}

['openBackupSave', 'backupReminderBtn', 'backupSaveBtn'].forEach((id) => {
  const btn = document.getElementById(id);
  if (btn) btn.addEventListener('click', runBackupSave);
});
const backupRestoreBtn = document.getElementById('backupRestoreBtn');
if (backupRestoreBtn) backupRestoreBtn.addEventListener('click', () => runImportPick());
const backupAutoRestoreBtn = document.getElementById('backupAutoRestoreBtn');
if (backupAutoRestoreBtn) backupAutoRestoreBtn.addEventListener('click', () => runImportPick({ fromAutoBackups: true }));

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
    setStatus('Export Excel terminé.');
    return;
  }

  const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `biblio-export-${stamp}.json`;
  a.click();
  URL.revokeObjectURL(url);
  setStatus('Export JSON terminé.');
}

if (exportForm) {
  exportForm.addEventListener('submit', async (event) => {
    event.preventDefault();
    const datasets = getCheckedValues('#exportForm input[name="dataset"]');
    const fields = buildExportFields();
    const format = exportFormat ? exportFormat.value : 'json';
    if (!datasets.length) {
      setStatus('Choisissez au moins un jeu de données.', true);
      return;
    }
    exportModal.classList.add('hidden');
    await runExport({ format, datasets, fields });
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
    // Simple information dans la barre du bas : pas de notification a chaque ouverture.
    statusBar.textContent = `Bibliothèque active: ${displayName} (livres: ${info.counts.books}, élèves: ${info.counts.students}).`;
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
  setStatus('Changement de bibliothèque...', false);
  try {
    const active = await window.api.librarySet(next);
    await refreshLibraries(active || next);
    resetEditModes();
    bookForm.reset();
    await refreshAll();
    updateLibraryBadge(active || next);
    await updateLibraryStatus();
    const opened = librariesCache.find((item) => item.key === (active || next));
    showToast('ok', 'Bibliothèque ouverte', opened ? opened.name : '');
    maybeShowWelcome();
  } catch (err) {
    setStatus('Changement impossible: ' + err.message, true);
  }
}

if (librarySelect) {
  if (window.api && window.api.libraryGet) {
    appUnlocked.then(() => window.api.libraryGet()).then(async (current) => {
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
    setStatus('Création de base indisponible. Relancez l\'app.', true);
    return;
  }
  const result = await promptDialog({
    title: 'Créer une base',
    fields: [{ label: 'Nom de la nouvelle base de livres', placeholder: 'Ex : Privée' }],
    confirmLabel: 'Créer'
  });
  const name = result ? result[0] : null;
  if (!name || !name.trim()) return;
  try {
    const created = await window.api.libraryCreate(name.trim());
    await refreshLibraries(created && created.key ? created.key : null);
    if (created && created.key) {
      await switchLibrary(created.key);
    }
  } catch (err) {
    setStatus('Création impossible: ' + err.message, true);
  }
}

async function renameLibraryFlow() {
  const key = librarySelect ? librarySelect.value : '';
  if (!key) return;
  if (isCoreLibraryKey(key)) {
    setStatus('Primaire et Maternelle ne peuvent pas être renommées.', true);
    return;
  }
  if (!window.api || !window.api.libraryRename) {
    setStatus('Renommage indisponible. Relancez l\'app.', true);
    return;
  }
  const current = librariesCache.find((item) => item.key === key);
  const result = await promptDialog({
    title: 'Renommer la base',
    fields: [{ label: 'Nouveau nom de la base', value: current ? current.name : '' }],
    confirmLabel: 'Renommer'
  });
  const nextName = result ? result[0] : null;
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
    setStatus('Primaire et Maternelle ne peuvent pas être supprimées.', true);
    return;
  }
  if (!window.api || !window.api.libraryDelete) {
    setStatus('Suppression indisponible. Relancez l\'app.', true);
    return;
  }
  const current = librariesCache.find((item) => item.key === key);
  const result = await promptDialog({
    title: 'Supprimer cette base ?',
    message: `Cette action supprime définitivement "${current ? current.name : key}" et tout son contenu (livres, élèves, emprunts). Tapez SUPPRIMER pour confirmer.`,
    fields: [{ label: 'Tapez SUPPRIMER pour confirmer', placeholder: 'SUPPRIMER' }],
    confirmLabel: 'Supprimer définitivement'
  });
  const typed = result ? result[0] : null;
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
      const nameEl = document.getElementById('settingsLibraryName');
      const active = librariesCache.find((item) => item.key === (librarySelect ? librarySelect.value : ''));
      if (nameEl) nameEl.textContent = active ? active.name : '';
      manageLibraryModal.classList.remove('hidden');
    }
  });
}

const templateBtn = document.getElementById('templateBtn');
if (templateBtn) {
  templateBtn.addEventListener('click', async () => {
    try {
      const res = await window.api.dataTemplate();
      if (res && !res.canceled) setStatus(res.message);
    } catch (err) {
      setStatus('Modèle impossible à enregistrer : ' + err.message, true);
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

/* Si un mot de passe existe deja, il faut le saisir avant de le changer ou de le retirer. */
async function askCurrentPassword(title) {
  if (!(await window.api.authIsSet())) return '';
  const result = await promptDialog({
    title,
    message: 'Saisissez d\'abord le mot de passe actuel.',
    fields: [{ label: 'Mot de passe actuel', type: 'password' }],
    confirmLabel: 'Continuer'
  });
  return result ? result[0] : null;
}

if (authSetBtn) {
  authSetBtn.addEventListener('click', async () => {
    if (!window.api || !window.api.authSet) return;
    const current = await askCurrentPassword('Changer le mot de passe');
    if (current === null) return;
    const result = await promptDialog({
      title: 'Définir un mot de passe',
      message: 'Ce mot de passe sera demandé à chaque lancement de l\'application. Notez-le en lieu sur : sans lui, il faudra l\'aide d\'une personne qui sait modifier les réglages de l\'ordinateur.',
      fields: [
        { label: 'Nouveau mot de passe (4 caractères minimum)', type: 'password' },
        { label: 'Confirmer le mot de passe', type: 'password' }
      ],
      confirmLabel: 'Définir'
    });
    if (!result) return;
    const [pwd, confirmPwd] = result;
    if (!pwd || !pwd.trim()) {
      setStatus('Mot de passe vide, aucune modification.', true);
      return;
    }
    if (confirmPwd !== pwd) {
      setStatus('Les deux mots de passe ne correspondent pas.', true);
      return;
    }
    try {
      await window.api.authSet(pwd, current);
      setStatus('Mot de passe défini. Il sera demandé au prochain lancement.');
      refreshLockButton();
    } catch (err) {
      setStatus(err.message, true);
    }
  });
}

if (authRemoveBtn) {
  authRemoveBtn.addEventListener('click', async () => {
    if (!window.api || !window.api.authSet) return;
    const current = await askCurrentPassword('Retirer le mot de passe');
    if (current === null) return;
    const ok = await confirmDialog({
      title: 'Retirer le mot de passe ?',
      message: 'L\'application ne demandera plus de mot de passe au lancement.',
      confirmLabel: 'Retirer'
    });
    if (!ok) return;
    try {
      await window.api.authSet('', current);
      setStatus('Mot de passe retiré.');
      refreshLockButton();
    } catch (err) {
      setStatus(err.message, true);
    }
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
  closeYearCurrent.innerHTML = '<option value="">Choisir une année à clôturer</option>'
    + years.map((y) => `<option value="${escapeHtml(y.id)}">${escapeHtml(y.name)}</option>`).join('');

  if (years[0]) {
    closeYearCurrent.value = years[0].id;
    if (!closeYearNext.value) closeYearNext.value = nextSchoolYearName(years[0].name);
  }

  await renderCloseYearClasses();
}

/* Passage au niveau suivant : PS -> MS -> GS -> CP -> ... -> CM2 (puis depart de l'ecole). */
const LEVEL_SEQUENCE = ['TPS', 'PS', 'MS', 'GS', 'CP', 'CE1', 'CE2', 'CM1', 'CM2'];

function nextLevel(level) {
  const clean = String(level || '').trim().toUpperCase();
  const index = LEVEL_SEQUENCE.indexOf(clean);
  if (index < 0) return { level: String(level || ''), leaving: false };
  if (index === LEVEL_SEQUENCE.length - 1) return { level: '', leaving: true };
  return { level: LEVEL_SEQUENCE[index + 1], leaving: false };
}

function nextSchoolYearName(name) {
  const match = /^(\d{4})\s*[-/]\s*(\d{4})$/.exec(String(name || '').trim());
  return match ? `${Number(match[1]) + 1}-${Number(match[2]) + 1}` : '';
}

function autoClassName(level, teacher) {
  return `Classe ${level || ''} ${teacher || ''}`.replace(/\s+/g, ' ').trim();
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

  if (!filtered.length) {
    closeYearClasses.innerHTML = '<p class="hint">Aucune classe dans cette année.</p>';
    return;
  }
  const header = `
    <div class="class-row class-row-head">
      <span>Classe de cette année</span>
      <span>Niveau l'an prochain</span>
      <span>Enseignant(e) l'an prochain</span>
      <span>Nom de la nouvelle classe</span>
      <span>Faire passer les élèves</span>
    </div>`;
  closeYearClasses.innerHTML = header + filtered.map((c) => {
    const teacher = c.teacher_name || '';
    const next = nextLevel(c.level);
    const proposedName = next.leaving ? '' : (c.level ? autoClassName(next.level, teacher) : c.name);
    return `
      <div class="class-row${next.leaving ? ' class-row--leaving' : ''}" data-class-id="${escapeHtml(c.id)}">
        <span class="class-row-current"><strong>${escapeHtml(c.name)}</strong>${c.level ? ` · ${escapeHtml(c.level)}` : ''}</span>
        <input name="new_level" value="${escapeHtml(next.level)}" placeholder="Ex : CE2" aria-label="Niveau l'an prochain" />
        <input name="new_teacher" value="${escapeHtml(teacher)}" placeholder="Ex : Mme Dupont" aria-label="Enseignant(e) l'an prochain" />
        <input name="new_name" value="${escapeHtml(proposedName)}" placeholder="Nom de la classe" aria-label="Nom de la nouvelle classe" />
        <label class="checkbox"><input type="checkbox" name="carry" ${next.leaving ? '' : 'checked'} /> ${next.leaving ? 'Quittent l\'école' : 'Oui'}</label>
      </div>
    `;
  }).join('');
}

// Le nom propose suit le niveau et l'enseignant, tant que l'utilisateur ne l'a pas modifie lui-meme.
closeYearClasses.addEventListener('input', (event) => {
  const row = event.target.closest('.class-row');
  if (!row) return;
  const nameInput = row.querySelector('input[name="new_name"]');
  if (event.target === nameInput) {
    nameInput.dataset.touched = '1';
    return;
  }
  if (nameInput.dataset.touched) return;
  nameInput.value = autoClassName(row.querySelector('input[name="new_level"]').value, row.querySelector('input[name="new_teacher"]').value);
});

closeYearCurrent.addEventListener('change', renderCloseYearClasses);

closeYearForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const currentYearId = closeYearCurrent.value;
  const nextYearName = closeYearNext.value.trim();
  if (!currentYearId || !nextYearName) {
    setStatus('Choisissez l\'année à clôturer et la nouvelle année.', true);
    return;
  }

  const rows = Array.from(closeYearClasses.querySelectorAll('.class-row[data-class-id]'));
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
      new_name: newName || autoClassName(newLevel, newTeacher) || 'Classe',
      carry_students: carry,
      leaving: !carry && !newName && !newLevel
    };
  }).filter((c) => !c.leaving);

  const submitBtn = closeYearForm.querySelector('button[type="submit"]');
  if (submitBtn && submitBtn.disabled) return;
  if (submitBtn) submitBtn.disabled = true;
  try {
    await window.api.yearsClose({
      current_year_id: Number(currentYearId),
      next_year_name: nextYearName,
      classes
    });
    setStatus('Année clôturée et nouvelle année créée.');
    closeYearModal.classList.add('hidden');
    closeYearForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  } finally {
    if (submitBtn) submitBtn.disabled = false;
  }
});

function setStatus(rawMessage, isError) {
  // Electron prefixe les erreurs transmises par le processus principal d'un texte technique en anglais.
  const message = String(rawMessage || '').replace(/Error invoking remote method '[^']+': (Error: )?/g, '');
  statusBar.textContent = message;
  const inProgress = /\.\.\.$/.test(String(message || '').trim());
  if (isError) {
    playErrorSound();
    showToast('err', 'Un problème est survenu', message);
  } else if (!inProgress) {
    showToast('ok', 'Terminé', message);
  }
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

async function openBookPreview(book) {
  if (!book) return;
  const available = Math.max(0, Number(book.copies || 0) - Number(book.on_loan || 0));
  bookPreviewTitle.textContent = book.title || 'Livre sans titre';
  bookPreviewCopies.textContent = String(book.copies || 0);
  bookPreviewAvailable.textContent = String(available);
  bookPreviewOnLoan.textContent = String(book.on_loan || 0);

  const metaLines = [
    book.author ? `Auteur: ${book.author}` : 'Auteur: -',
    book.year ? `Année: ${book.year}` : 'Année: -',
    book.isbn ? `ISBN: ${book.isbn}` : 'ISBN: -',
    book.numero ? `Numéro: ${book.numero}` : 'Numéro: -',
    book.location ? `Emplacement: ${book.location}` : 'Emplacement: -'
  ];
  bookPreviewMeta.innerHTML = metaLines.map((line) => `<div>${escapeHtml(line)}</div>`).join('');

  bookPreviewImg.classList.remove('show');
  bookPreviewCoverPlaceholder.style.display = 'block';
  bookPreviewCoverLoader.classList.add('hidden');

  // La fiche s'ouvre tout de suite ; la couverture memorisee s'affiche sans internet.
  bookPreviewModal.classList.remove('hidden');
  const showCover = (url) => {
    bookPreviewImg.src = url;
    bookPreviewImg.classList.add('show');
    bookPreviewCoverPlaceholder.style.display = 'none';
  };
  if (book.cover_url) {
    showCover(book.cover_url);
    return;
  }
  const isbn = book.isbn || '';
  if (!isbn.trim()) return;
  bookPreviewCoverLoader.classList.remove('hidden');
  try {
    const data = await window.api.booksLookup(isbn);
    if (data && data.coverUrl) {
      showCover(data.coverUrl);
      book.cover_url = data.coverUrl;
      window.api.booksSetCover(book.id, data.coverUrl).catch(() => {});
    }
  } catch (e) {
    // pas de couverture : la fiche reste utilisable
  }
  bookPreviewCoverLoader.classList.add('hidden');
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
  loanDeskRefresh();
  updateLibraryStatus();
}

function updateHomeDashboard() {
  const statBooks = document.getElementById('homeStatBooks');
  const statStudents = document.getElementById('homeStatStudents');
  const statOverdue = document.getElementById('homeStatOverdue');
  const statOverdueCard = document.getElementById('homeStatOverdueCard');
  const tileOverdueText = document.getElementById('homeTileOverdueText');
  if (statBooks) statBooks.textContent = String(cachedBooks.length);
  if (statStudents) statStudents.textContent = String(cachedStudents.length);
  const overdueCount = cachedLoans.filter(isLoanOverdue).length;
  if (statOverdue) statOverdue.textContent = String(overdueCount);
  if (statOverdueCard) statOverdueCard.classList.toggle('hidden', overdueCount === 0);
  if (tileOverdueText) {
    tileOverdueText.textContent = overdueCount === 0
      ? 'Aucun prêt en retard actuellement.'
      : `${overdueCount} livre${overdueCount > 1 ? 's' : ''} à réclamer.`;
  }
}

const homeTileLoan = document.getElementById('homeTileLoan');
const homeTileAddBook = document.getElementById('homeTileAddBook');
const homeTileAddStudent = document.getElementById('homeTileAddStudent');
const homeTileCatalogue = document.getElementById('homeTileCatalogue');
const homeTileOverdue = document.getElementById('homeTileOverdue');
const homeTileStats = document.getElementById('homeTileStats');

if (homeTileLoan) homeTileLoan.addEventListener('click', () => setActiveTab('loans'));
if (homeTileAddBook) homeTileAddBook.addEventListener('click', () => setActiveTab('books'));
if (homeTileAddStudent) homeTileAddStudent.addEventListener('click', () => {
  setActiveTab('students');
  openAddModalFor('student', { showChoices: false });
});
if (homeTileCatalogue) homeTileCatalogue.addEventListener('click', () => setActiveTab('books'));
if (homeTileOverdue) homeTileOverdue.addEventListener('click', () => {
  setActiveTab('loans');
  showLoanFilter('overdue');
});
const statsModal = document.getElementById('statsModal');
const statsClose = document.getElementById('statsClose');
const statsSummary = document.getElementById('statsSummary');
const statsTopBooks = document.getElementById('statsTopBooks');
const statsTopClasses = document.getElementById('statsTopClasses');

async function openStatsModal() {
  if (!statsModal || !window.api || !window.api.statsGet) return;
  statsModal.classList.remove('hidden');
  statsSummary.innerHTML = '<p class="hint">Calcul en cours...</p>';
  try {
    const stats = await window.api.statsGet();
    statsSummary.innerHTML = `
      <div class="stat-card">
        <div class="icon-badge"><svg class="icon"><use href="#i-swap"/></svg></div>
        <div><div class="n">${escapeHtml(stats.totalLoans)}</div><div class="l">emprunts au total</div></div>
      </div>
      <div class="stat-card">
        <div class="icon-badge"><svg class="icon"><use href="#i-clock"/></svg></div>
        <div><div class="n">${escapeHtml(stats.activeLoans)}</div><div class="l">emprunts en cours</div></div>
      </div>
      <div class="stat-card">
        <div class="icon-badge"><svg class="icon"><use href="#i-book"/></svg></div>
        <div><div class="n">${escapeHtml(stats.booksNeverBorrowed)}</div><div class="l">livres jamais empruntés</div></div>
      </div>
    `;
    statsTopBooks.innerHTML = stats.topBooks.map((b) => `
      <tr><td>${escapeHtml(b.title)}${b.author ? ' <span class="hint" style="display:inline;">(' + escapeHtml(b.author) + ')</span>' : ''}</td><td>${escapeHtml(b.loan_count)}</td></tr>
    `).join('');
    document.getElementById('statsTopBooksEmpty').classList.toggle('hidden', stats.topBooks.length > 0);
    statsTopClasses.innerHTML = stats.topClasses.map((c) => `
      <tr><td>${escapeHtml(c.name)}${c.teacher_name ? ' <span class="hint" style="display:inline;">(' + escapeHtml(c.teacher_name) + ')</span>' : ''}</td><td>${escapeHtml(c.loan_count)}</td></tr>
    `).join('');
    document.getElementById('statsTopClassesEmpty').classList.toggle('hidden', stats.topClasses.length > 0);
  } catch (err) {
    statsSummary.innerHTML = '';
    setStatus('Impossible de calculer les statistiques: ' + err.message, true);
  }
}

if (homeTileStats) homeTileStats.addEventListener('click', openStatsModal);
if (statsClose) statsClose.addEventListener('click', () => statsModal.classList.add('hidden'));

const DELETE_ACTIONS = {
  year: {
    call: (id) => window.api.yearsDelete(id),
    title: 'Supprimer cette année scolaire ?',
    message: (name) => `L'année « ${name} » sera supprimée. Une année qui contient encore des classes ne peut pas être supprimée.`,
    done: 'Année scolaire supprimée.'
  },
  class: {
    call: (id) => window.api.classesDelete(id),
    title: 'Supprimer cette classe ?',
    message: (name) => `La classe « ${name} » sera supprimée. Une classe qui contient encore des élèves ne peut pas être supprimée.`,
    done: 'Classe supprimée.'
  },
  student: {
    call: (id) => window.api.studentsDelete(id),
    title: 'Supprimer cet élève ?',
    message: (name) => `${name} sera supprimé(e) de la bibliothèque, avec l'historique de ses prêts. Un élève qui a encore un livre ne peut pas être supprimé.`,
    done: 'Élève supprimé.'
  }
};

document.addEventListener('click', async (event) => {
  const btn = event.target.closest('.delete-entity');
  if (!btn) return;
  const action = DELETE_ACTIONS[btn.dataset.kind];
  if (!action) return;
  const ok = await confirmDialog({
    title: action.title,
    message: action.message(btn.dataset.name || ''),
    confirmLabel: 'Oui, supprimer'
  });
  if (!ok) return;
  try {
    await action.call(Number(btn.dataset.id));
    setStatus(action.done);
    await refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

async function refreshYears() {
  const years = await window.api.yearsList();
  const filterYear = document.getElementById('filterYear');
  const yearsTable = document.getElementById('yearsTable');

  if (filterYear) {
    const currentYear = filterYear.value;
    filterYear.innerHTML = '<option value="">Toutes</option>' + years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('');
    if (currentYear) filterYear.value = currentYear;
  }

  classYearSelect.innerHTML = '<option value="">Choisir une année scolaire</option>'
    + years.map((y) => `<option value="${y.id}">${escapeHtml(y.name)}</option>`).join('');

  const yearsEmptyState = document.getElementById('yearsEmptyState');
  if (yearsEmptyState) {
    if (years.length === 0) {
      yearsTable.parentElement.classList.add('hidden');
      yearsEmptyState.classList.remove('hidden');
    } else {
      yearsTable.parentElement.classList.remove('hidden');
      yearsEmptyState.classList.add('hidden');
    }
  }

  yearsTable.innerHTML = '';
  years.forEach((y) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(y.name)}</td>
      <td><button data-id="${y.id}" class="edit-year">Modifier</button> <button type="button" class="ghost delete-entity" data-kind="year" data-id="${y.id}" data-name="${escapeHtml(y.name)}">Supprimer</button></td>
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

  studentClassSelect.innerHTML = '<option value="">Choisir la classe</option>'
    + filteredClasses.map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(classLabel(c))}</option>`).join('');

  const classesEmptyState = document.getElementById('classesEmptyState');
  if (classesEmptyState) {
    if (filteredClasses.length === 0) {
      classesTable.parentElement.classList.add('hidden');
      classesEmptyState.classList.remove('hidden');
    } else {
      classesTable.parentElement.classList.remove('hidden');
      classesEmptyState.classList.add('hidden');
    }
  }

  classesTable.innerHTML = '';
  filteredClasses.forEach((c) => {
    const row = document.createElement('tr');
    row.innerHTML = `
      <td>${escapeHtml(c.school_year || '-')}</td>
      <td>${escapeHtml(c.teacher_name || '-')}</td>
      <td>${escapeHtml(c.level || '-')}</td>
      <td>${escapeHtml(c.name)}</td>
      <td><button data-id="${c.id}" class="edit-class">Modifier</button> <button type="button" class="ghost delete-entity" data-kind="class" data-id="${c.id}" data-name="${escapeHtml(classLabel(c))}">Supprimer</button></td>
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
  const term = normalizeSearch(bookSearchInput ? bookSearchInput.value : '');
  if (!term) return books;
  return books.filter((b) => normalizeSearch(`${b.title || ''} ${b.author || ''} ${b.isbn || ''} ${b.numero || ''} ${b.location || ''}`).includes(term));
}

/*
 * Catalogue : les livres sont charges une fois, puis la recherche et le tri se
 * font sur la liste en memoire (rapide meme avec des milliers de livres).
 * Au-dela de BOOKS_DISPLAY_LIMIT resultats, on invite a affiner la recherche.
 */
const BOOKS_DISPLAY_LIMIT = 300;
const booksTableBody = document.getElementById('booksTable');

async function refreshBooks() {
  cachedBooks = await window.api.booksList();
  renderBooksTable();
}

function renderBooksTable() {
  const books = cachedBooks;
  const tableEl = document.getElementById('booksTableEl');
  const emptyState = document.getElementById('booksEmptyState');
  const limitNote = document.getElementById('booksLimitNote');
  updateBookSortIndicators();
  const sortedBooks = sortBooks(filterBooksBySearch([...books]));
  if (tableEl && emptyState) {
    const isSearching = bookSearchInput && bookSearchInput.value.trim();
    const emptyBtn = document.getElementById('emptyAddBookBtn');
    if (books.length === 0) {
      tableEl.classList.add('hidden');
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Aucun livre pour l\'instant';
      emptyState.querySelector('p').textContent = 'Cette bibliothèque n\'a pas encore de livre enregistré. Ajoutez le premier pour commencer.';
      if (emptyBtn) emptyBtn.classList.remove('hidden');
    } else if (sortedBooks.length === 0 && isSearching) {
      tableEl.classList.add('hidden');
      emptyState.classList.remove('hidden');
      emptyState.querySelector('h3').textContent = 'Aucun résultat';
      emptyState.querySelector('p').textContent = 'Aucun livre ne correspond à votre recherche.';
      if (emptyBtn) emptyBtn.classList.add('hidden');
    } else {
      tableEl.classList.remove('hidden');
      emptyState.classList.add('hidden');
    }
  }
  if (limitNote) {
    limitNote.classList.toggle('hidden', sortedBooks.length <= BOOKS_DISPLAY_LIMIT);
    limitNote.textContent = `Les ${BOOKS_DISPLAY_LIMIT} premiers livres sont affichés sur ${sortedBooks.length}. Utilisez la recherche pour trouver les autres.`;
  }
  booksTableBody.innerHTML = sortedBooks.slice(0, BOOKS_DISPLAY_LIMIT).map((b) => {
    const available = Math.max(0, Number(b.copies || 0) - Number(b.on_loan || 0));
    const availabilityClass = available > 0 ? 'status-pill status-pill--ok' : 'status-pill status-pill--out';
    return `<tr class="book-row" data-book-id="${escapeHtml(b.id)}">
      <td>${escapeHtml(b.title)}</td>
      <td>${escapeHtml(b.author || '-')}</td>
      <td>${escapeHtml(b.year || '-')}</td>
      <td>${escapeHtml(b.isbn || '-')}</td>
      <td>${escapeHtml(b.copies)}</td>
      <td><span class="${availabilityClass}">${available} dispo</span></td>
      <td><span class="status-pill">${escapeHtml(b.on_loan)}</span></td>
      <td>${escapeHtml(b.numero || '-')}</td>
      <td>
        <button type="button" class="edit-book">Modifier</button>
        <button type="button" class="ghost delete-book">Supprimer</button>
      </td>
    </tr>`;
  }).join('');
}

booksTableBody.addEventListener('click', async (event) => {
  const row = event.target.closest('tr[data-book-id]');
  if (!row) return;
  const book = cachedBooks.find((b) => String(b.id) === row.dataset.bookId);
  if (!book) return;
  const btn = event.target.closest('button');
  if (!btn) {
    openBookPreview(book);
    return;
  }
  if (btn.classList.contains('edit-book')) {
    setActiveTab('books');
    setBookFormMode('edit', book);
    return;
  }
  if (!btn.classList.contains('delete-book')) return;
  const ok = await confirmDialog({
    title: 'Supprimer ce livre ?',
    message: `"${book.title}" sera définitivement supprimé du catalogue, avec l'historique de ses prêts. Cette action ne peut pas être annulée.`,
    confirmLabel: 'Oui, supprimer'
  });
  if (!ok) return;
  try {
    setStatus('Suppression en cours...', false);
    await window.api.booksDelete(book.id);
    setBookFormMode('add');
    ensureBookFormEditable();
    lastLookupIsbn = '';
    setStatus(`Livre "${book.title}" supprimé.`, false);
    await refreshAll();
    focusBookIsbnInput();
  } catch (err) {
    setStatus('Erreur: ' + err.message, true);
  }
});

async function refreshStudents() {
  cachedStudents = await window.api.studentsList();
  renderStudents();
}

function renderStudents() {
  const students = cachedStudents;
  const table = document.getElementById('studentsTable');
  const filterYear = document.getElementById('filterYear');
  const filterClass = document.getElementById('filterClass');

  const currentYear = filterYear ? filterYear.value : '';
  const currentClass = filterClass ? filterClass.value : '';
  const searchTerm = normalizeSearch(studentSearchInput ? studentSearchInput.value : '');
  const filtered = students.filter((s) => {
    if (currentYear && String(s.school_year_id || '') !== currentYear) return false;
    if (currentClass && String(s.class_id || '') !== currentClass) return false;
    if (searchTerm) {
      const haystack = normalizeSearch(`${s.last_name || ''} ${s.first_name || ''} ${s.first_name || ''} ${s.last_name || ''}`);
      if (!haystack.includes(searchTerm)) return false;
    }
    return true;
  });

  const studentsEmptyState = document.getElementById('studentsEmptyState');
  if (studentsEmptyState) {
    if (students.length === 0) {
      table.parentElement.classList.add('hidden');
      studentsEmptyState.classList.remove('hidden');
      studentsEmptyState.querySelector('h3').textContent = 'Aucun élève pour l\'instant';
      studentsEmptyState.querySelector('p').textContent = 'Ajoutez le premier élève de cette bibliothèque.';
    } else if (filtered.length === 0) {
      table.parentElement.classList.add('hidden');
      studentsEmptyState.classList.remove('hidden');
      studentsEmptyState.querySelector('h3').textContent = 'Aucun résultat';
      studentsEmptyState.querySelector('p').textContent = 'Aucun élève ne correspond à ces filtres.';
    } else {
      table.parentElement.classList.remove('hidden');
      studentsEmptyState.classList.add('hidden');
    }
  }

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
        <button type="button" class="ghost delete-entity" data-kind="student" data-id="${s.id}" data-name="${escapeHtml(`${s.first_name || ''} ${s.last_name || ''}`.trim())}">Supprimer</button>
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
  let bookSearchTimer = null;
  bookSearchInput.addEventListener('input', () => {
    clearTimeout(bookSearchTimer);
    bookSearchTimer = setTimeout(renderBooksTable, 150);
  });
}
const studentSearchInput = document.getElementById('studentSearch');
if (studentSearchInput) {
  let studentSearchTimer = null;
  studentSearchInput.addEventListener('input', () => {
    clearTimeout(studentSearchTimer);
    studentSearchTimer = setTimeout(renderStudents, 150);
  });
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
    renderBooksTable();
  });
});

const bookForm = document.getElementById('bookForm');
bookForm.addEventListener('click', ensureBookFormEditable, true);
function findSimilarBook(title, author) {
  const t = String(title || '').trim().toLowerCase();
  const a = String(author || '').trim().toLowerCase();
  if (!t) return null;
  return cachedBooks.find((b) => String(b.title || '').trim().toLowerCase() === t
    && String(b.author || '').trim().toLowerCase() === a) || null;
}

bookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(bookForm);
  const payload = Object.fromEntries(formData.entries());
  ['isbn', 'title', 'author', 'numero', 'location'].forEach((field) => {
    if (typeof payload[field] === 'string') payload[field] = payload[field].trim();
  });
  payload.year = payload.year ? Number(payload.year) : null;
  payload.copies = payload.copies ? Number(payload.copies) : 1;
  if (payload.copies < 1 || payload.copies > 999) {
    setStatus('Le nombre d\'exemplaires doit être entre 1 et 999.', true);
    return;
  }
  // Couverture trouvee par la recherche ISBN : memorisee avec le livre.
  if (lastLookupCover && normalizeIsbnInput(payload.isbn) === lastLookupCover.isbn) {
    payload.cover_url = lastLookupCover.url;
  }
  if (bookForm.dataset.mode !== 'edit') {
    const similar = findSimilarBook(payload.title, payload.author);
    if (similar) {
      const proceed = await confirmDialog({
        title: 'Ce livre existe peut-être déjà',
        message: `"${similar.title}"${similar.author ? ' - ' + similar.author : ''} est déjà dans le catalogue avec ${similar.copies || 1} exemplaire(s). Pour ajouter des exemplaires, fermez cette fenêtre et modifiez plutôt la fiche existante. Continuer créera une fiche séparée (disponibilité et historique comptés à part).`,
        confirmLabel: 'Créer une fiche séparée'
      });
      if (!proceed) return;
    }
  }
  try {
    if (bookForm.dataset.mode === 'edit') {
      payload.id = Number(bookForm.dataset.id);
      await window.api.booksUpdate(payload);
      setStatus('Livre modifié.');
      setBookFormMode('add');
    } else {
      await window.api.booksAdd(payload);
      setStatus('Livre ajouté.');
      bookForm.reset();
    }
    await refreshAll();
    lastLookupIsbn = '';
    focusBookIsbnInput();
  } catch (err) {
    setStatus(err.message, true);
  }
});

const cancelBookEditBtn = document.getElementById('cancelBookEditBtn');
if (cancelBookEditBtn) {
  cancelBookEditBtn.addEventListener('click', () => {
    setBookFormMode('add');
    focusBookIsbnInput();
  });
}

const emptyAddBookBtn = document.getElementById('emptyAddBookBtn');
if (emptyAddBookBtn) {
  emptyAddBookBtn.addEventListener('click', () => {
    setActiveTab('books');
    focusBookIsbnInput();
  });
}

const printBooksBtn = document.getElementById('printBooksBtn');
if (printBooksBtn) {
  printBooksBtn.addEventListener('click', () => {
    const booksTab = document.getElementById('tab-books');
    if (booksTab) booksTab.classList.add('printing');
    window.print();
    setTimeout(() => { if (booksTab) booksTab.classList.remove('printing'); }, 500);
  });
}

function findSimilarStudent(lastName, firstName, classId) {
  const l = String(lastName || '').trim().toLowerCase();
  const f = String(firstName || '').trim().toLowerCase();
  if (!l && !f) return null;
  return cachedStudents.find((s) => String(s.last_name || '').trim().toLowerCase() === l
    && String(s.first_name || '').trim().toLowerCase() === f
    && String(s.class_id || '') === String(classId || '')) || null;
}

studentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  const formData = new FormData(studentForm);
  const payload = Object.fromEntries(formData.entries());
  ['last_name', 'first_name'].forEach((field) => {
    if (typeof payload[field] === 'string') payload[field] = payload[field].trim();
  });
  payload.birth_year = payload.birth_year ? Number(payload.birth_year) : null;
  if (studentForm.dataset.mode !== 'edit') {
    const similar = findSimilarStudent(payload.last_name, payload.first_name, payload.class_id);
    if (similar) {
      const proceed = await confirmDialog({
        title: 'Cet élève existe peut-être déjà',
        message: `${similar.last_name || ''} ${similar.first_name || ''} est déjà inscrit dans cette classe. Ajouter quand même un doublon ?`,
        confirmLabel: 'Ajouter quand même'
      });
      if (!proceed) return;
    }
  }
  try {
    if (studentForm.dataset.mode === 'edit') {
      payload.id = Number(studentForm.dataset.id);
      await window.api.studentsUpdate(payload);
      setStatus('Élève modifié.');
      delete studentForm.dataset.mode;
      delete studentForm.dataset.id;
    } else {
      await window.api.studentsAdd(payload);
      setStatus('Élève ajouté.');
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
      setStatus('Année modifiée.');
      delete schoolYearForm.dataset.mode;
      delete schoolYearForm.dataset.id;
    } else {
      await window.api.yearsAdd(payload);
      setStatus('Année scolaire ajoutée.');
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
      setStatus('Classe modifiée.');
      delete classForm.dataset.mode;
      delete classForm.dataset.id;
    } else {
      await window.api.classesAdd(payload);
      setStatus('Classe ajoutée.');
    }
    classForm.reset();
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

// Export/import handled by dedicated modals.

// On attend aussi que tous les scripts de la page soient charges (loan-desk.js, welcome.js) :
// sinon le premier chargement peut partir avant eux.
const pageScriptsReady = new Promise((resolve) => {
  if (document.readyState !== 'loading') resolve();
  else document.addEventListener('DOMContentLoaded', resolve, { once: true });
});

Promise.all([appUnlocked, pageScriptsReady]).then(() => {
  refreshAll()
    .then(() => updateLibraryStatus())
    .then(() => maybeShowWelcome())
    .catch((err) => setStatus(err.message, true));
  refreshBackupReminder();
});
showAddForm('school_year');

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
let lastLookupCover = null;
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
    setStatus('Aucune information trouvée pour cet ISBN.', true);
    coverLoader.classList.add('hidden');
    coverImg.classList.remove('show');
    coverPlaceholder.style.display = 'block';
    coverEmpty.classList.remove('hidden');
    return;
  }
  if (!titleInput.value && data.title) titleInput.value = data.title;
  if (!authorInput.value && data.author) authorInput.value = data.author;
  if (!yearInput.value && data.year) yearInput.value = data.year;
  lastLookupCover = data.coverUrl ? { isbn: clean, url: data.coverUrl } : null;
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
  setStatus('Infos trouvées pour l\'ISBN.');
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

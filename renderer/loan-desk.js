/*
 * Comptoir de pret : deux modes bien separes, "Preter" et "Rendre", pour
 * qu'un livre ne soit jamais rendu par erreur au lieu d'etre prete.
 * Ce fichier est charge apres app.js et utilise ses donnees en cache
 * (cachedBooks, cachedStudents, cachedClasses) et ses outils (setStatus,
 * escapeHtml, normalizeSearch, classLabel...).
 */

let cachedLoans = [];
let loanFilter = 'active';
let returnedLoansCache = [];

const DESK_RESULTS_MAX = 12;
const DESK_CLASS_LIST_MAX = 80;

const deskEls = {
  modeButtons: document.querySelectorAll('.mode-btn'),
  lendPanel: document.getElementById('lendPanel'),
  returnPanel: document.getElementById('returnPanel'),
  classFilter: document.getElementById('deskClassFilter'),
  studentSearch: document.getElementById('deskStudentSearch'),
  studentResults: document.getElementById('deskStudentResults'),
  studentChosen: document.getElementById('deskStudentChosen'),
  bookSearch: document.getElementById('deskBookSearch'),
  bookResults: document.getElementById('deskBookResults'),
  bookChosen: document.getElementById('deskBookChosen'),
  dueDate: document.getElementById('deskDueDate'),
  lendBtn: document.getElementById('deskLendBtn'),
  lendHint: document.getElementById('deskLendHint'),
  returnSearch: document.getElementById('deskReturnSearch'),
  returnResults: document.getElementById('deskReturnResults'),
  loansTable: document.getElementById('loansTable'),
  loansTableEl: document.getElementById('loansTableEl'),
  loansEmpty: document.getElementById('loansEmptyState'),
  loansEmptyTitle: document.getElementById('loansEmptyTitle'),
  loansEmptyText: document.getElementById('loansEmptyText'),
  loanSearch: document.getElementById('loanTableSearch'),
  filterButtons: document.querySelectorAll('.loan-filter-btn'),
  overdueCount: document.getElementById('loanFilterOverdueCount'),
  printOverdueBtn: document.getElementById('printOverdueBtn')
};

const desk = {
  mode: 'lend',
  student: null,
  book: null
};

function isLoanOverdue(loan) {
  return !!(loan && loan.due_date && !loan.return_date && String(loan.due_date).slice(0, 10) < localDateString());
}

function studentDisplayName(s) {
  return `${s.last_name || ''} ${s.first_name || ''}`.trim() || 'Élève sans nom';
}

function bookAvailability(book) {
  return Math.max(0, Number(book.copies || 0) - Number(book.on_loan || 0));
}

function formatShortDate(value) {
  if (!value) return '-';
  const text = String(value);
  // Une date seule (AAAA-MM-JJ) est une date locale : ne pas la decaler par le fuseau horaire.
  const d = /^\d{4}-\d{2}-\d{2}$/.test(text) ? new Date(`${text}T12:00:00`) : new Date(text);
  return Number.isNaN(d.getTime()) ? '-' : d.toLocaleDateString('fr-FR');
}

/* ---------- Mode Preter / Rendre ---------- */
function setDeskMode(mode) {
  desk.mode = mode === 'return' ? 'return' : 'lend';
  deskEls.modeButtons.forEach((btn) => {
    const active = btn.dataset.mode === desk.mode;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  deskEls.lendPanel.classList.toggle('hidden', desk.mode !== 'lend');
  deskEls.returnPanel.classList.toggle('hidden', desk.mode !== 'return');
  focusDesk();
}

function focusDesk() {
  setTimeout(() => {
    if (desk.mode === 'return') {
      deskEls.returnSearch.focus();
    } else if (!desk.student) {
      deskEls.studentSearch.focus();
    } else {
      deskEls.bookSearch.focus();
    }
  }, 50);
}

deskEls.modeButtons.forEach((btn) => {
  btn.addEventListener('click', () => setDeskMode(btn.dataset.mode));
});

/* ---------- Etape 1 : l'eleve ---------- */
function renderDeskClassFilter() {
  const current = deskEls.classFilter.value;
  deskEls.classFilter.innerHTML = '<option value="">Toutes les classes</option>' + cachedClasses
    .map((c) => `<option value="${escapeHtml(c.id)}">${escapeHtml(classLabel(c))}</option>`)
    .join('');
  if (current && cachedClasses.some((c) => String(c.id) === current)) {
    deskEls.classFilter.value = current;
  }
}

function renderStudentResults() {
  const query = normalizeSearch(deskEls.studentSearch.value);
  const classId = deskEls.classFilter.value;
  if (desk.student || (!query && !classId)) {
    deskEls.studentResults.innerHTML = '';
    return;
  }
  let list = cachedStudents;
  if (classId) list = list.filter((s) => String(s.class_id || '') === classId);
  if (query) {
    list = list.filter((s) => normalizeSearch(`${s.last_name || ''} ${s.first_name || ''} ${s.first_name || ''} ${s.last_name || ''}`).includes(query));
  }
  const max = query ? DESK_RESULTS_MAX : DESK_CLASS_LIST_MAX;
  if (!list.length) {
    deskEls.studentResults.innerHTML = '<p class="pick-empty">Aucun élève trouvé.</p>';
    return;
  }
  deskEls.studentResults.innerHTML = list.slice(0, max).map((s) => {
    const activeLoans = cachedLoans.filter((l) => l.student_id === s.id).length;
    const meta = [s.class_name, s.school_year].filter(Boolean).join(' · ');
    return `<button type="button" class="pick-item" data-student-id="${escapeHtml(s.id)}">
      <strong>${escapeHtml(studentDisplayName(s))}</strong>
      <span>${escapeHtml(meta || 'Sans classe')}${activeLoans ? ` · ${activeLoans} livre(s) en cours` : ''}</span>
    </button>`;
  }).join('') + (list.length > max ? `<p class="pick-empty">${list.length - max} autre(s) : précisez la recherche.</p>` : '');
}

function chooseStudent(student, { focus = true } = {}) {
  desk.student = student;
  if (!student) {
    deskEls.studentChosen.classList.add('hidden');
    deskEls.studentSearch.classList.remove('hidden');
    deskEls.studentSearch.value = '';
    renderStudentResults();
    updateLendState();
    return;
  }
  const loans = cachedLoans.filter((l) => l.student_id === student.id);
  const loansText = loans.length
    ? `A déjà ${loans.length} livre(s) : ${loans.map((l) => `${l.book_title}${isLoanOverdue(l) ? ' (en retard)' : ''}`).join(', ')}`
    : 'Aucun livre en cours.';
  deskEls.studentChosen.innerHTML = `
    <div><strong>${escapeHtml(studentDisplayName(student))}</strong>
    <span>${escapeHtml([student.class_name, student.school_year].filter(Boolean).join(' · ') || 'Sans classe')}</span>
    <span class="${loans.some(isLoanOverdue) ? 'chosen-warn' : ''}">${escapeHtml(loansText)}</span></div>
    <button type="button" class="btn ghost" data-desk-clear="student">Changer</button>`;
  deskEls.studentChosen.classList.remove('hidden');
  deskEls.studentSearch.classList.add('hidden');
  deskEls.studentResults.innerHTML = '';
  updateLendState(focus);
  if (focus) focusDesk();
}

deskEls.studentSearch.addEventListener('input', renderStudentResults);
deskEls.classFilter.addEventListener('change', () => {
  chooseStudent(null);
  deskEls.studentSearch.focus();
});
deskEls.studentSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const first = deskEls.studentResults.querySelector('.pick-item');
  if (first) first.click();
});
deskEls.studentResults.addEventListener('click', (event) => {
  const item = event.target.closest('[data-student-id]');
  if (!item) return;
  chooseStudent(cachedStudents.find((s) => String(s.id) === item.dataset.studentId) || null);
});

/* ---------- Etape 2 : le livre ---------- */
function findBooks(rawQuery) {
  const query = normalizeSearch(rawQuery);
  const isbn = normalizeIsbnInput(rawQuery);
  if (!query) return { exact: null, list: [] };
  const exact = isbn.length >= 10
    ? cachedBooks.find((b) => normalizeIsbnInput(b.isbn) === isbn) || null
    : null;
  const list = cachedBooks.filter((b) => normalizeSearch(`${b.title || ''} ${b.author || ''} ${b.isbn || ''} ${b.numero || ''}`).includes(query));
  return { exact, list };
}

function renderBookResults() {
  if (desk.book) {
    deskEls.bookResults.innerHTML = '';
    return;
  }
  const { exact, list } = findBooks(deskEls.bookSearch.value);
  const shown = exact ? [exact] : list;
  if (!deskEls.bookSearch.value.trim()) {
    deskEls.bookResults.innerHTML = '';
    return;
  }
  if (!shown.length) {
    deskEls.bookResults.innerHTML = '<p class="pick-empty">Aucun livre trouvé. Vérifiez le code ou ajoutez le livre dans l\'onglet Livres.</p>';
    return;
  }
  deskEls.bookResults.innerHTML = shown.slice(0, DESK_RESULTS_MAX).map((b) => {
    const available = bookAvailability(b);
    return `<button type="button" class="pick-item${available ? '' : ' pick-item--off'}" data-book-id="${escapeHtml(b.id)}">
      <strong>${escapeHtml(b.title || 'Livre sans titre')}</strong>
      <span>${escapeHtml(b.author || '')}${b.author ? ' · ' : ''}${available ? `${available} disponible(s)` : 'tous les exemplaires sont prêtés'}</span>
    </button>`;
  }).join('');
}

function chooseBook(book) {
  desk.book = book;
  if (!book) {
    deskEls.bookChosen.classList.add('hidden');
    deskEls.bookSearch.classList.remove('hidden');
    deskEls.bookSearch.value = '';
    renderBookResults();
    updateLendState();
    return;
  }
  const available = bookAvailability(book);
  deskEls.bookChosen.innerHTML = `
    <div><strong>${escapeHtml(book.title || 'Livre sans titre')}</strong>
    <span>${escapeHtml(book.author || '')}</span>
    <span class="${available ? '' : 'chosen-warn'}">${available ? `${available} exemplaire(s) disponible(s)` : 'Tous les exemplaires sont déjà prêtés.'}</span></div>
    <button type="button" class="btn ghost" data-desk-clear="book">Changer</button>`;
  deskEls.bookChosen.classList.remove('hidden');
  deskEls.bookSearch.classList.add('hidden');
  deskEls.bookResults.innerHTML = '';
  updateLendState(true);
}

deskEls.bookSearch.addEventListener('input', () => {
  const { exact } = findBooks(deskEls.bookSearch.value);
  // Un code-barres scanne correspond exactement a un livre : on le choisit tout de suite.
  if (exact) {
    chooseBook(exact);
    return;
  }
  renderBookResults();
});
deskEls.bookSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const first = deskEls.bookResults.querySelector('.pick-item:not(.pick-item--off)');
  if (first) first.click();
});
deskEls.bookResults.addEventListener('click', (event) => {
  const item = event.target.closest('[data-book-id]');
  if (!item) return;
  chooseBook(cachedBooks.find((b) => String(b.id) === item.dataset.bookId) || null);
});

[deskEls.studentChosen, deskEls.bookChosen].forEach((el) => {
  el.addEventListener('click', (event) => {
    const btn = event.target.closest('[data-desk-clear]');
    if (!btn) return;
    if (btn.dataset.deskClear === 'student') chooseStudent(null);
    else chooseBook(null);
    focusDesk();
  });
});

/* ---------- Etape 3 : valider ---------- */
function updateLendState(focusWhenReady = false) {
  const available = desk.book ? bookAvailability(desk.book) : 0;
  const ready = !!(desk.student && desk.book && available > 0);
  deskEls.lendBtn.disabled = !ready;
  if (!desk.student && !desk.book) deskEls.lendHint.textContent = 'Choisissez un élève et un livre.';
  else if (!desk.student) deskEls.lendHint.textContent = 'Choisissez maintenant l\'élève.';
  else if (!desk.book) deskEls.lendHint.textContent = 'Scannez ou cherchez maintenant le livre.';
  else if (!available) deskEls.lendHint.textContent = 'Ce livre n\'est plus disponible.';
  else deskEls.lendHint.textContent = 'Tout est prêt : cliquez sur « Valider le prêt » (ou appuyez sur Entrée).';
  if (ready && focusWhenReady) setTimeout(() => deskEls.lendBtn.focus(), 30);
}

function defaultDueDate() {
  const d = new Date();
  d.setDate(d.getDate() + 14);
  return localDateString(d);
}

async function validateLend() {
  if (deskEls.lendBtn.disabled || !desk.student || !desk.book) return;
  deskEls.lendBtn.disabled = true;
  const student = desk.student;
  const book = desk.book;
  try {
    await window.api.loansAdd({
      book_id: book.id,
      student_id: student.id,
      due_date: deskEls.dueDate.value || null
    });
    playSuccessSound();
    setStatus(`Prêt enregistré : « ${book.title} » pour ${studentDisplayName(student)}.`);
    desk.student = null;
    desk.book = null;
    await refreshAll();
    chooseBook(null);
    chooseStudent(null);
    focusDesk();
  } catch (err) {
    setStatus(err.message, true);
    updateLendState();
  }
}

deskEls.lendBtn.addEventListener('click', validateLend);

/* ---------- Mode Rendre ---------- */
function findActiveLoans(rawQuery) {
  const query = normalizeSearch(rawQuery);
  const isbn = normalizeIsbnInput(rawQuery);
  if (!query) return { byIsbn: false, list: [] };
  if (isbn.length >= 10) {
    const byIsbn = cachedLoans.filter((l) => normalizeIsbnInput(l.book_isbn) === isbn);
    if (byIsbn.length) return { byIsbn: true, list: byIsbn };
  }
  return {
    byIsbn: false,
    list: cachedLoans.filter((l) => normalizeSearch(`${l.book_title || ''} ${l.student_name || ''} ${l.class_name || ''}`).includes(query))
  };
}

function renderReturnResults() {
  const raw = deskEls.returnSearch.value;
  if (!raw.trim()) {
    deskEls.returnResults.innerHTML = '';
    return;
  }
  const { list } = findActiveLoans(raw);
  if (!list.length) {
    const isbn = normalizeIsbnInput(raw);
    const known = isbn.length >= 10 && cachedBooks.some((b) => normalizeIsbnInput(b.isbn) === isbn);
    deskEls.returnResults.innerHTML = `<p class="pick-empty">${known
      ? 'Ce livre n\'est noté comme emprunté par personne. Il est peut-être déjà rendu.'
      : 'Aucun prêt en cours ne correspond.'}</p>`;
    return;
  }
  deskEls.returnResults.innerHTML = (list.length > 1 ? '<p class="pick-empty">Plusieurs prêts correspondent : cliquez sur l\'élève qui rend le livre.</p>' : '')
    + list.slice(0, DESK_RESULTS_MAX).map((l) => `
      <button type="button" class="pick-item" data-loan-id="${escapeHtml(l.id)}">
        <strong>${escapeHtml(l.book_title)}</strong>
        <span>${escapeHtml(l.student_name)}${l.class_name ? ` · ${escapeHtml(l.class_name)}` : ''} · prêté le ${escapeHtml(formatShortDate(l.loan_date))}${isLoanOverdue(l) ? ' · <em class="chosen-warn">en retard</em>' : ''}</span>
      </button>`).join('');
}

async function returnLoan(loan) {
  if (!loan) return;
  try {
    await window.api.loansReturn(loan.id);
    playSuccessSound();
    setStatus(`Retour enregistré : « ${loan.book_title} » rendu par ${loan.student_name}.`);
    deskEls.returnSearch.value = '';
    deskEls.returnResults.innerHTML = '';
    await refreshAll();
    focusDesk();
  } catch (err) {
    setStatus(err.message, true);
  }
}

deskEls.returnSearch.addEventListener('input', () => {
  const { byIsbn, list } = findActiveLoans(deskEls.returnSearch.value);
  // Livre scanne et un seul pret en cours pour ce livre : le retour est enregistre directement.
  if (byIsbn && list.length === 1) {
    returnLoan(list[0]);
    return;
  }
  renderReturnResults();
});
deskEls.returnSearch.addEventListener('keydown', (event) => {
  if (event.key !== 'Enter') return;
  event.preventDefault();
  const items = deskEls.returnResults.querySelectorAll('.pick-item');
  if (items.length === 1) items[0].click();
});
deskEls.returnResults.addEventListener('click', (event) => {
  const item = event.target.closest('[data-loan-id]');
  if (!item) return;
  returnLoan(cachedLoans.find((l) => String(l.id) === item.dataset.loanId));
});

/* ---------- Tableau des prets ---------- */
function showLoanFilter(filter) {
  loanFilter = ['active', 'overdue', 'history'].includes(filter) ? filter : 'active';
  deskEls.filterButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.filter === loanFilter));
  refreshLoans();
}

deskEls.filterButtons.forEach((btn) => {
  btn.addEventListener('click', () => showLoanFilter(btn.dataset.filter));
});
deskEls.loanSearch.addEventListener('input', () => renderLoansTable());

async function refreshLoans() {
  cachedLoans = await window.api.loansList();
  if (loanFilter === 'history') {
    returnedLoansCache = await window.api.loansHistory();
  }
  updateHomeDashboard();
  const overdue = cachedLoans.filter(isLoanOverdue).length;
  deskEls.overdueCount.textContent = overdue ? ` (${overdue})` : '';
  deskEls.printOverdueBtn.classList.toggle('hidden', overdue === 0);
  renderLoansTable();
  if (desk.student) chooseStudent(cachedStudents.find((s) => s.id === desk.student.id) || null, { focus: false });
}

function renderLoansTable() {
  let rows = loanFilter === 'history' ? returnedLoansCache : cachedLoans;
  if (loanFilter === 'overdue') rows = rows.filter(isLoanOverdue);
  const query = normalizeSearch(deskEls.loanSearch.value);
  if (query) {
    rows = rows.filter((l) => normalizeSearch(`${l.book_title || ''} ${l.student_name || ''} ${l.class_name || ''}`).includes(query));
  }

  const empty = rows.length === 0;
  deskEls.loansTableEl.classList.toggle('hidden', empty);
  deskEls.loansEmpty.classList.toggle('hidden', !empty);
  if (empty) {
    const texts = {
      active: ['Aucun prêt en cours', 'Choisissez « Prêter un livre » ci-dessus pour enregistrer un prêt.'],
      overdue: ['Aucun prêt en retard', 'Tous les livres empruntés sont dans les temps.'],
      history: ['Aucun livre rendu pour l\'instant', 'Les livres rendus apparaîtront ici.']
    };
    const [title, text] = query ? ['Aucun résultat', 'Aucun prêt ne correspond à votre recherche.'] : texts[loanFilter];
    deskEls.loansEmptyTitle.textContent = title;
    deskEls.loansEmptyText.textContent = text;
  }

  deskEls.loansTable.innerHTML = rows.map((l) => {
    const overdue = isLoanOverdue(l);
    const actions = l.return_date
      ? ''
      : `<button type="button" data-loan-action="return" data-id="${escapeHtml(l.id)}">Rendu</button>
         <button type="button" class="ghost" data-loan-action="cancel" data-id="${escapeHtml(l.id)}">Annuler le prêt</button>`;
    return `<tr>
      <td>${escapeHtml(l.book_title)}</td>
      <td>${escapeHtml(l.student_name)}</td>
      <td>${escapeHtml(l.class_name || '-')}</td>
      <td>${escapeHtml(formatShortDate(l.loan_date))}</td>
      <td>${escapeHtml(formatShortDate(l.due_date))}${overdue ? ' <span class="status-pill status-pill--out">en retard</span>' : ''}</td>
      <td>${escapeHtml(formatShortDate(l.return_date))}</td>
      <td>${actions}</td>
    </tr>`;
  }).join('');
}

deskEls.loansTable.addEventListener('click', async (event) => {
  const btn = event.target.closest('[data-loan-action]');
  if (!btn) return;
  const loan = cachedLoans.find((l) => String(l.id) === btn.dataset.id);
  if (!loan) return;
  if (btn.dataset.loanAction === 'return') {
    await returnLoan(loan);
    return;
  }
  const ok = await confirmDialog({
    title: 'Annuler ce prêt ?',
    message: `Le prêt de « ${loan.book_title} » à ${loan.student_name} sera effacé, comme s'il n'avait jamais eu lieu. Pour un livre rapporté, utilisez plutôt « Rendu ».`,
    confirmLabel: 'Oui, annuler le prêt'
  });
  if (!ok) return;
  try {
    await window.api.loansDelete(loan.id);
    setStatus('Prêt annulé.');
    refreshAll();
  } catch (err) {
    setStatus(err.message, true);
  }
});

/* ---------- Impression de la liste des retards, classe par classe ---------- */
function printOverdueList() {
  const overdue = cachedLoans.filter(isLoanOverdue);
  if (!overdue.length) {
    setStatus('Aucun prêt en retard à imprimer.');
    return;
  }
  const groups = new Map();
  overdue.forEach((l) => {
    const key = l.class_name ? `${l.class_name}${l.teacher_name && !l.class_name.includes(l.teacher_name) ? ` (${l.teacher_name})` : ''}` : 'Sans classe';
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(l);
  });
  const sections = Array.from(groups.entries())
    .sort(([a], [b]) => a.localeCompare(b, 'fr'))
    .map(([label, loans]) => `
      <section class="print-group">
        <h2>${escapeHtml(label)}</h2>
        <table>
          <thead><tr><th>Élève</th><th>Livre à rapporter</th><th>À rendre le</th></tr></thead>
          <tbody>${loans
            .sort((a, b) => String(a.student_name).localeCompare(String(b.student_name), 'fr'))
            .map((l) => `<tr><td>${escapeHtml(l.student_name)}</td><td>${escapeHtml(l.book_title)}</td><td>${escapeHtml(formatShortDate(l.due_date))}</td></tr>`)
            .join('')}</tbody>
        </table>
      </section>`).join('');
  printHtml(`<h1>Livres à rapporter à la bibliothèque</h1><p>Liste du ${escapeHtml(new Date().toLocaleDateString('fr-FR'))}</p>${sections}`);
}

deskEls.printOverdueBtn.addEventListener('click', printOverdueList);

/* Appele par app.js apres chaque rechargement des donnees. */
function loanDeskRefresh() {
  renderDeskClassFilter();
  if (desk.book) desk.book = cachedBooks.find((b) => b.id === desk.book.id) || null;
  renderStudentResults();
  renderBookResults();
  if (desk.mode === 'return') renderReturnResults();
  updateLendState();
}

deskEls.dueDate.value = defaultDueDate();
setDeskMode('lend');

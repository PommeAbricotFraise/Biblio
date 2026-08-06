const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  authIsSet: () => ipcRenderer.invoke('auth:isSet'),
  authSet: (password) => ipcRenderer.invoke('auth:set', password),
  authVerify: (password) => ipcRenderer.invoke('auth:verify', password),

  booksList: () => ipcRenderer.invoke('books:list'),
  booksAdd: (payload) => ipcRenderer.invoke('books:add', payload),
  booksUpdate: (payload) => ipcRenderer.invoke('books:update', payload),
  booksDelete: (id) => ipcRenderer.invoke('books:delete', id),
  booksLookup: (isbn) => ipcRenderer.invoke('books:lookup', isbn),

  studentsList: () => ipcRenderer.invoke('students:list'),
  studentsAdd: (payload) => ipcRenderer.invoke('students:add', payload),
  studentsUpdate: (payload) => ipcRenderer.invoke('students:update', payload),
  studentsDelete: (id) => ipcRenderer.invoke('students:delete', id),
  studentsHistory: (id) => ipcRenderer.invoke('students:history', id),

  yearsList: () => ipcRenderer.invoke('years:list'),
  yearsAdd: (payload) => ipcRenderer.invoke('years:add', payload),
  yearsUpdate: (payload) => ipcRenderer.invoke('years:update', payload),
  yearsDelete: (id) => ipcRenderer.invoke('years:delete', id),
  yearsClose: (payload) => ipcRenderer.invoke('years:close', payload),

  classesList: () => ipcRenderer.invoke('classes:list'),
  classesAdd: (payload) => ipcRenderer.invoke('classes:add', payload),
  classesUpdate: (payload) => ipcRenderer.invoke('classes:update', payload),
  classesDelete: (id) => ipcRenderer.invoke('classes:delete', id),

  loansList: () => ipcRenderer.invoke('loans:list'),
  loansAdd: (payload) => ipcRenderer.invoke('loans:add', payload),
  loansReturn: (id) => ipcRenderer.invoke('loans:return', id),
  loansReturnByBook: (payload) => ipcRenderer.invoke('loans:returnByBook', payload),
  loansDelete: (id) => ipcRenderer.invoke('loans:delete', id),

  libraryGet: () => ipcRenderer.invoke('library:get'),
  libraryList: () => ipcRenderer.invoke('library:list'),
  libraryCreate: (name) => ipcRenderer.invoke('library:create', name),
  libraryRename: (libraryKey, nextName) => ipcRenderer.invoke('library:rename', libraryKey, nextName),
  libraryDelete: (libraryKey) => ipcRenderer.invoke('library:delete', libraryKey),
  librarySet: (libraryKey) => ipcRenderer.invoke('library:set', libraryKey),
  libraryInfo: () => ipcRenderer.invoke('library:info'),

  dataExport: () => ipcRenderer.invoke('data:export'),
  dataImport: (payload) => ipcRenderer.invoke('data:import', payload),
  dataExportCustom: (payload) => ipcRenderer.invoke('data:exportCustom', payload),
  dataImportCustom: (payload) => ipcRenderer.invoke('data:importCustom', payload),
  dataImportDb: (payload) => ipcRenderer.invoke('data:importDb', payload),
  importPick: () => ipcRenderer.invoke('import:pick')
});

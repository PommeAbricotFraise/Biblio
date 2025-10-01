const { contextBridge, ipcRenderer } = require('electron');

// Exposer des APIs sécurisées au processus de rendu
contextBridge.exposeInMainWorld('electronAPI', {
  // Navigation depuis les menus
  onNavigate: (callback) => {
    ipcRenderer.on('navigate', callback);
  },
  
  // Informations système
  getVersion: () => {
    return process.versions.electron;
  },
  
  // Platform info
  getPlatform: () => {
    return process.platform;
  }
});

// Empêcher l'ouverture de nouvelles fenêtres
window.addEventListener('DOMContentLoaded', () => {
  // Intercepter les liens externes
  document.addEventListener('click', (e) => {
    if (e.target.tagName === 'A' && e.target.href.startsWith('http')) {
      e.preventDefault();
      // Les liens externes sont gérés par le processus principal
    }
  });
});
import { useEffect } from 'react';

// Hook pour les raccourcis clavier globaux
export const useKeyboardShortcuts = (shortcuts) => {
  useEffect(() => {
    const handleKeyDown = (event) => {
      // Ignorer si on est dans un input/textarea
      if (['INPUT', 'TEXTAREA'].includes(event.target.tagName)) {
        return;
      }

      const key = event.key.toLowerCase();
      const ctrl = event.ctrlKey || event.metaKey;
      const shift = event.shiftKey;
      const alt = event.altKey;

      // Construire la combinaison
      let combination = '';
      if (ctrl) combination += 'ctrl+';
      if (shift) combination += 'shift+';
      if (alt) combination += 'alt+';
      combination += key;

      // Chercher et exécuter le raccourci
      const shortcut = shortcuts[combination];
      if (shortcut) {
        event.preventDefault();
        shortcut();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [shortcuts]);
};

// Raccourcis prédéfinis pour l'application
export const getAppShortcuts = (navigate, openNewBook, openSearch, exportExcel, refreshData) => ({
  // Navigation
  'ctrl+1': () => navigate('/'),
  'ctrl+2': () => navigate('/books'),
  'ctrl+3': () => navigate('/storage'),
  'ctrl+4': () => navigate('/visualization'),
  
  // Actions
  'ctrl+n': () => openNewBook?.(),
  'ctrl+f': () => openSearch?.(),
  'ctrl+e': () => exportExcel?.(),
  'f5': () => refreshData?.(),
  'ctrl+r': () => refreshData?.(),
  
  // Aide
  'f1': () => {
    alert(`
🔥 RACCOURCIS CLAVIER

📍 Navigation:
Ctrl+1 - Tableau de bord  
Ctrl+2 - Mes livres
Ctrl+3 - Rangements
Ctrl+4 - Visualisation 3D

⚡ Actions:
Ctrl+N - Nouveau livre
Ctrl+F - Rechercher
Ctrl+E - Exporter Excel
F5 / Ctrl+R - Actualiser

❓ Aide:
F1 - Afficher cette aide
    `);
  }
});
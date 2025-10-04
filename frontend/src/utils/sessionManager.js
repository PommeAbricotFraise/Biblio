// Gestionnaire de session pour éviter les problèmes de cache

export const clearAllSessions = () => {
  // Nettoyer localStorage
  localStorage.removeItem('current_school');
  localStorage.removeItem('school_code');
  
  // Nettoyer sessionStorage
  sessionStorage.clear();
  
  // Forcer rechargement
  window.location.href = window.location.origin;
};

export const validateSession = () => {
  const currentSchool = localStorage.getItem('current_school');
  const schoolCode = localStorage.getItem('school_code');
  
  // Si données incohérentes, nettoyer
  if (currentSchool && !schoolCode) {
    console.log('Session incohérente détectée, nettoyage...');
    clearAllSessions();
    return false;
  }
  
  if (schoolCode && !currentSchool) {
    console.log('Code école sans données école, nettoyage...');
    clearAllSessions();
    return false;
  }
  
  return true;
};

export const addResetButton = () => {
  // Ajouter un bouton de reset d'urgence (pour debug)
  if (window.location.search.includes('debug=reset')) {
    clearAllSessions();
  }
};

// Auto-exécution
addResetButton();
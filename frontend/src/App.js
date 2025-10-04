import { useState, useEffect } from "react";
import "@/App.css";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import axios from "axios";
import { toast, Toaster } from "sonner";
import { validateSession, clearAllSessions } from "@/utils/sessionManager";
import { useCache } from "@/hooks/useCache";
import DataService from "@/services/DataService";

// Components
import Dashboard from "@/components/Dashboard";
import BookList from "@/components/BookList";
import StorageManager from "@/components/StorageManager";
import LibraryVisualization from "@/components/LibraryVisualization";
import Navigation from "@/components/Navigation";
import InstallPrompt from "@/components/InstallPrompt";
import SchoolSelector from "@/components/SchoolSelector";

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
const API = `${BACKEND_URL}/api`;

// Main App Component
function App() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState(null);
  const [books, setBooks] = useState([]);
  const [placards, setPlacards] = useState([]);
  const [shelves, setShelves] = useState([]);
  const [currentSchool, setCurrentSchool] = useState(null);
  
  // Fonction de chargement optimisée avec cache
  const fetchSchoolData = async () => {
    if (!currentSchool) return null;
    return await DataService.getAllSchoolData();
  };

  // Hook de cache pour les données de l'école
  const {
    data: schoolData,
    loading,
    error,
    refetch,
    invalidateCache
  } = useCache(
    'school_data',
    fetchSchoolData,
    [currentSchool?.school_id],
    300000 // 5 minutes
  );

  // Mettre à jour les états quand les données arrivent
  useEffect(() => {
    if (schoolData) {
      setStats(schoolData.stats || null);
      setBooks(schoolData.books || []);
      setPlacards(schoolData.placards || []);
      setShelves(schoolData.shelves || []);
    }
  }, [schoolData]);
  
  // Gérer la sélection d'école
  const handleSchoolSelected = (schoolData) => {
    console.log("École sélectionnée:", schoolData);
    setCurrentSchool(schoolData);
    setLoading(true); // Force le chargement
    fetchData(); // Charger les données de l'école
  };

  // Gérer la déconnexion
  const handleLogout = () => {
    localStorage.removeItem("current_school");
    localStorage.removeItem("school_code");
    setCurrentSchool(null);
    setBooks([]);
    setPlacards([]);
    setShelves([]);
  };

  // Fonction refresh avec invalidation du cache
  const refreshData = async () => {
    invalidateCache();
    await refetch();
  };

  // Load data when school changes
  useEffect(() => {
    if (currentSchool) {
      refetch();
    }
  }, [currentSchool, refetch]);

  // Vérifier la session au chargement
  useEffect(() => {
    // Validation des données de session
    if (!validateSession()) {
      return; // clearAllSessions() déjà appelé dans validateSession
    }
    
    const savedSchool = localStorage.getItem("current_school");
    if (savedSchool) {
      try {
        const school = JSON.parse(savedSchool);
        setCurrentSchool(school);
      } catch (e) {
        console.log('Erreur parsing session, nettoyage...');
        clearAllSessions();
      }
    }
  }, []);

  // Si aucune école n'est sélectionnée, afficher le sélecteur
  if (!currentSchool) {
    return <SchoolSelector onSchoolSelected={handleSchoolSelected} />;
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-32 w-32 border-b-2 border-blue-600 mx-auto"></div>
          <h2 className="text-xl font-semibold text-gray-700 mt-4">
            Chargement des données de {currentSchool.school_name}...
          </h2>
          <div className="flex gap-4 mt-6">
            <button
              onClick={handleLogout}
              className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white rounded-lg text-sm transition-colors"
            >
              🔄 Changer d'école
            </button>
            <button
              onClick={() => {
                localStorage.clear();
                window.location.reload();
              }}
              className="px-4 py-2 bg-gray-500 hover:bg-gray-600 text-white rounded-lg text-sm transition-colors"
            >
              🧹 Réinitialiser complètement
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100">
      <BrowserRouter>
        <div className="flex flex-col min-h-screen">
          <Navigation 
            currentSchool={currentSchool}
            onLogout={handleLogout}
          />
          
          <main className="flex-1 container mx-auto px-4 py-8">
            <Routes>
              <Route 
                path="/" 
                element={
                  <Dashboard 
                    stats={stats} 
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/books" 
                element={
                  <BookList 
                    books={books}
                    placards={placards}
                    shelves={shelves}
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/storage" 
                element={
                  <StorageManager 
                    placards={placards}
                    shelves={shelves}
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
              <Route 
                path="/visualization" 
                element={
                  <LibraryVisualization 
                    refreshData={refreshData}
                    currentSchool={currentSchool}
                  />
                } 
              />
            </Routes>
          </main>
        </div>
      </BrowserRouter>
      
      <Toaster position="top-right" />
      <InstallPrompt />
    </div>
  );
}

export default App;
